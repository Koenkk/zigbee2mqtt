const settings = require('../util/settings');
const utils = require('../util/utils');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const logger = require('../util/logger');
const BaseExtension = require('./baseExtension');

class NetworkMap extends BaseExtension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);

        // Subscribe to topic.
        this.topic = `${settings.get().mqtt.base_topic}/bridge/networkmap`;
        this.topicRoutes = `${settings.get().mqtt.base_topic}/bridge/networkmap/routes`;

        // Bind
        this.raw = this.raw.bind(this);
        this.graphviz = this.graphviz.bind(this);

        // Set supported formats
        this.supportedFormats = {
            'raw': this.raw,
            'graphviz': this.graphviz,
        };
    }

    onMQTTConnected() {
        this.mqtt.subscribe(this.topic);
        this.mqtt.subscribe(this.topicRoutes);
    }

    async onMQTTMessage(topic, message) {
        if ((topic === this.topic || topic === this.topicRoutes) && this.supportedFormats.hasOwnProperty(message)) {
            const includeRoutes = topic === this.topicRoutes;
            const topology = await this.networkScan(includeRoutes);
            const converted = this.supportedFormats[message](topology);
            this.mqtt.publish(`bridge/networkmap/${message}`, converted, {});
        }
    }

    raw(topology) {
        return JSON.stringify(topology);
    }

    graphviz(topology) {
        const colors = settings.get().map_options.graphviz.colors;

        let text = 'digraph G {\nnode[shape=record];\n';
        let style = '';

        topology.nodes.forEach((device) => {
            const labels = [];

            // Add friendly name
            labels.push(`${device.friendlyName}`);

            // Add the device short network address, ieeaddr and scan note (if any)
            labels.push(
                `${device.ieeeAddr} (${device.networkAddress})` +
                ((device.failed && device.failed.length) ? `failed: ${device.failed.join(',')}` : ''),
            );

            // Add the device model
            if (device.type !== 'Coordinator') {
                const mappedModel = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
                if (mappedModel) {
                    labels.push(`${mappedModel.vendor} ${mappedModel.description} (${mappedModel.model})`);
                } else {
                    // This model is not supported by zigbee-herdsman-converters, add zigbee model information
                    labels.push(`${device.manufacturerName} ${device.modelID}`);
                }
            }

            // Add the device last_seen timestamp
            let lastSeen = 'unknown';
            const date = device.type === 'Coordinator' ? Date.now() : device.lastSeen;
            if (date) {
                lastSeen = utils.formatDate(date, 'ISO_8601_local');
            }

            labels.push(lastSeen);

            // Shape the record according to device type
            if (device.type == 'Coordinator') {
                style = `style="bold, filled", fillcolor="${colors.fill.coordinator}", ` +
                    `fontcolor="${colors.font.coordinator}"`;
            } else if (device.type == 'Router') {
                style = `style="rounded, filled", fillcolor="${colors.fill.router}", ` +
                    `fontcolor="${colors.font.router}"`;
            } else {
                style = `style="rounded, dashed, filled", fillcolor="${colors.fill.enddevice}", ` +
                    `fontcolor="${colors.font.enddevice}"`;
            }

            // Add the device with its labels to the graph as a node.
            text += `  "${device.ieeeAddr}" [`+style+`, label="{${labels.join('|')}}"];\n`;

            /**
             * Add an edge between the device and its child to the graph
             * NOTE: There are situations where a device is NOT in the topology, this can be e.g.
             * due to not responded to the lqi scan. In that case we do not add an edge for this device.
             */
            topology.links.filter((e) => (e.source.ieeeAddr === device.ieeeAddr)).forEach((e) => {
                const lineStyle = (device.type=='EndDevice') ? 'penwidth=1, ' :
                    (!e.routes.length) ? 'penwidth=0.5, ' : 'penwidth=2, ';
                const lineWeight = (!e.routes.length) ? `weight=0, color="${colors.line.inactive}", ` :
                    `weight=1, color="${colors.line.active}", `;
                const textRoutes = e.routes.map((r) => r.destinationAddress);
                const lineLabels = (!e.routes.length) ? `label="${e.linkquality}"` :
                    `label="${e.linkquality} (routes: ${textRoutes.join(',')})"`;
                text += `  "${device.ieeeAddr}" -> "${e.target.ieeeAddr}"`;
                text += ` [${lineStyle}${lineWeight}${lineLabels}]\n`;
            });
        });

        text += '}';

        return text.replace(/\0/g, '');
    }

    async networkScan(includeRoutes) {
        logger.info(`Starting network scan (includeRoutes '${includeRoutes}')`);
        const devices = this.zigbee.getDevices();
        const lqis = new Map();
        const routingTables = new Map();
        const failed = new Map();

        for (const device of devices.filter((d) => d.type != 'EndDevice')) {
            failed.set(device, []);
            const resolved = this.zigbee.resolveEntity(device);
            try {
                const result = await device.lqi();
                lqis.set(device, result);
                logger.debug(`LQI succeeded for '${resolved.name}'`);
            } catch (error) {
                failed.get(device).push('lqi');
                logger.error(`Failed to execute LQI for '${resolved.name}'`);
            }

            if (includeRoutes) {
                try {
                    const result = await device.routingTable();
                    routingTables.set(device, result);
                    logger.debug(`Routing table succeeded for '${resolved.name}'`);
                } catch (error) {
                    failed.get(device).push('routingTable');
                    logger.error(`Failed to execute routing table for '${resolved.name}'`);
                }
            }
        }

        logger.info(`Network scan finished`);

        const networkMap = {nodes: [], links: []};
        // Add nodes
        for (const device of devices) {
            const resolved = this.zigbee.resolveEntity(device);
            networkMap.nodes.push({
                ieeeAddr: device.ieeeAddr, friendlyName: resolved.name, type: device.type,
                networkAddress: device.networkAddress, manufacturerName: device.manufacturerName,
                modelID: device.modelID, failed: failed.get(device), lastSeen: device.lastSeen,
            });
        }

        // Add links
        lqis.forEach((lqi, device) => {
            for (const neighbor of lqi.neighbors) {
                if (neighbor.relationship > 3) {
                    // Relationship is not active, skip it
                    continue;
                }

                const link = {
                    source: {ieeeAddr: neighbor.ieeeAddr, networkAddress: neighbor.networkAddress},
                    target: {ieeeAddr: device.ieeeAddr, networkAddress: device.networkAddress},
                    linkquality: neighbor.linkquality, depth: neighbor.depth, routes: [],
                    // DEPRECATED:
                    sourceIeeeAddr: neighbor.ieeeAddr, targetIeeeAddr: device.ieeeAddr,
                    sourceNwkAddr: neighbor.networkAddress, lqi: neighbor.linkquality,
                    relationship: neighbor.relationship,
                };

                const routingTable = routingTables.get(device);
                if (routingTable) {
                    link.routes = routingTable.table
                        .filter((t) => t.status === 'ACTIVE' && t.nextHop === neighbor.networkAddress);
                }

                networkMap.links.push(link);
            }
        });

        return networkMap;
    }
}

module.exports = NetworkMap;
