const settings = require('../util/settings');
const utils = require('../util/utils');
const logger = require('../util/logger');
const Extension = require('./extension');
const stringify = require('json-stable-stringify-without-jsonify');

/**
 * This extension creates a network map
 */
class NetworkMap extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);

        this.legacyApi = settings.get().advanced.legacy_api;
        this.legacyTopic = `${settings.get().mqtt.base_topic}/bridge/networkmap`;
        this.legacyTopicRoutes = `${settings.get().mqtt.base_topic}/bridge/networkmap/routes`;
        this.topic = `${settings.get().mqtt.base_topic}/bridge/request/networkmap`;

        // Bind
        this.raw = this.raw.bind(this);
        this.graphviz = this.graphviz.bind(this);
        this.plantuml = this.plantuml.bind(this);

        // Set supported formats
        this.supportedFormats = {
            'raw': this.raw,
            'graphviz': this.graphviz,
            'plantuml': this.plantuml,
        };
    }

    async onMQTTMessage(topic, message) {
        /* istanbul ignore else */
        if (this.legacyApi) {
            if ((topic === this.legacyTopic || topic === this.legacyTopicRoutes) &&
                this.supportedFormats.hasOwnProperty(message)) {
                const includeRoutes = topic === this.legacyTopicRoutes;
                const topology = await this.networkScan(includeRoutes);
                let converted = this.supportedFormats[message](topology);
                converted = message === 'raw' ? stringify(converted) : converted;
                this.mqtt.publish(`bridge/networkmap/${message}`, converted, {});
            }
        }

        if (topic === this.topic) {
            try {
                message = utils.parseJSON(message, message);
                const type = typeof message === 'object' ? message.type : message;
                if (!this.supportedFormats.hasOwnProperty(type)) {
                    throw new Error(`Type '${type}' not supported, allowed are: ${Object.keys(this.supportedFormats)}`);
                }

                const routes = typeof message === 'object' && message.routes;
                const topology = await this.networkScan(routes);
                const value = this.supportedFormats[type](topology);
                await this.mqtt.publish(
                    'bridge/response/networkmap',
                    stringify(utils.getResponse(message, {routes, type, value}, null)),
                );
            } catch (error) {
                await this.mqtt.publish(
                    'bridge/response/networkmap',
                    stringify(utils.getResponse(message, {}, error.message)),
                );
            }
        }
    }

    raw(topology) {
        return topology;
    }

    graphviz(topology) {
        const colors = settings.get().map_options.graphviz.colors;

        let text = 'digraph G {\nnode[shape=record];\n';
        let style = '';

        topology.nodes.forEach((node) => {
            const labels = [];

            // Add friendly name
            labels.push(`${node.friendlyName}`);

            // Add the device short network address, ieeaddr and scan note (if any)
            labels.push(
                `${node.ieeeAddr} (${utils.toNetworkAddressHex(node.networkAddress)})` +
                ((node.failed && node.failed.length) ? `failed: ${node.failed.join(',')}` : ''),
            );

            // Add the device model
            if (node.type !== 'Coordinator') {
                if (node.definition) {
                    labels.push(`${node.definition.vendor} ${node.definition.description} (${node.definition.model})`);
                } else {
                    // This model is not supported by zigbee-herdsman-converters, add zigbee model information
                    labels.push(`${node.manufacturerName} ${node.modelID}`);
                }
            }

            // Add the device last_seen timestamp
            let lastSeen = 'unknown';
            const date = node.type === 'Coordinator' ? Date.now() : node.lastSeen;
            if (date) {
                lastSeen = utils.formatDate(date, 'relative');
            }

            labels.push(lastSeen);

            // Shape the record according to device type
            if (node.type == 'Coordinator') {
                style = `style="bold, filled", fillcolor="${colors.fill.coordinator}", ` +
                    `fontcolor="${colors.font.coordinator}"`;
            } else if (node.type == 'Router') {
                style = `style="rounded, filled", fillcolor="${colors.fill.router}", ` +
                    `fontcolor="${colors.font.router}"`;
            } else {
                style = `style="rounded, dashed, filled", fillcolor="${colors.fill.enddevice}", ` +
                    `fontcolor="${colors.font.enddevice}"`;
            }

            // Add the device with its labels to the graph as a node.
            text += `  "${node.ieeeAddr}" [`+style+`, label="{${labels.join('|')}}"];\n`;

            /**
             * Add an edge between the device and its child to the graph
             * NOTE: There are situations where a device is NOT in the topology, this can be e.g.
             * due to not responded to the lqi scan. In that case we do not add an edge for this device.
             */
            topology.links.filter((e) => (e.source.ieeeAddr === node.ieeeAddr)).forEach((e) => {
                const lineStyle = (node.type=='EndDevice') ? 'penwidth=1, ' :
                    (!e.routes.length) ? 'penwidth=0.5, ' : 'penwidth=2, ';
                const lineWeight = (!e.routes.length) ? `weight=0, color="${colors.line.inactive}", ` :
                    `weight=1, color="${colors.line.active}", `;
                const textRoutes = e.routes.map((r) => utils.toNetworkAddressHex(r.destinationAddress));
                const lineLabels = (!e.routes.length) ? `label="${e.linkquality}"` :
                    `label="${e.linkquality} (routes: ${textRoutes.join(',')})"`;
                text += `  "${node.ieeeAddr}" -> "${e.target.ieeeAddr}"`;
                text += ` [${lineStyle}${lineWeight}${lineLabels}]\n`;
            });
        });

        text += '}';

        return text.replace(/\0/g, '');
    }

    plantuml(topology) {
        const text = [];

        text.push(`' paste into: https://www.planttext.com/`);
        text.push(``);
        text.push('@startuml');

        topology.nodes.sort((a, b) => a.friendlyName.localeCompare(b.friendlyName)).forEach((node) => {
            // Add friendly name
            text.push(`card ${node.ieeeAddr} [`);
            text.push(`${node.friendlyName}`);
            text.push(`---`);

            // Add the device short network address, ieeaddr and scan note (if any)
            text.push(
                `${node.ieeeAddr} (${utils.toNetworkAddressHex(node.networkAddress)})` +
                ((node.failed && node.failed.length) ? ` failed: ${node.failed.join(',')}` : ''),
            );

            // Add the device model
            if (node.type !== 'Coordinator') {
                text.push(`---`);
                const definition = this.zigbee.resolveEntity(node.ieeeAddr).definition;
                if (definition) {
                    text.push(`${definition.vendor} ${definition.description} (${definition.model})`);
                } else {
                    // This model is not supported by zigbee-herdsman-converters, add zigbee model information
                    text.push(`${node.manufacturerName} ${node.modelID}`);
                }
            }

            // Add the device last_seen timestamp
            let lastSeen = 'unknown';
            const date = node.type === 'Coordinator' ? Date.now() : node.lastSeen;
            if (date) {
                lastSeen = utils.formatDate(date, 'relative');
            }
            text.push(`---`);
            text.push(lastSeen);
            text.push(`]`);
            text.push(``);
        });

        /**
         * Add edges between the devices
         * NOTE: There are situations where a device is NOT in the topology, this can be e.g.
         * due to not responded to the lqi scan. In that case we do not add an edge for this device.
         */
        topology.links.forEach((link) => {
            text.push(`${link.sourceIeeeAddr} --> ${link.targetIeeeAddr}: ${link.lqi}`);
        });
        text.push('');

        text.push(`@enduml`);

        return text.join(`\n`);
    }

    async networkScan(includeRoutes) {
        logger.info(`Starting network scan (includeRoutes '${includeRoutes}')`);
        const devices = this.zigbee.getDevices().filter((d) => d.type !== 'GreenPower');
        const lqis = new Map();
        const routingTables = new Map();
        const failed = new Map();

        for (const device of devices.filter((d) => d.type != 'EndDevice')) {
            failed.set(device, []);
            await utils.sleep(1); // sleep 1 second between each scan to reduce stress on network.
            const resolvedEntity = this.zigbee.resolveEntity(device);

            const doRequest = async (request, firstAttempt = true) => {
                try {
                    return await request();
                } catch (error) {
                    if (!firstAttempt) {
                        throw error;
                    } else {
                        // Network is possibly congested, sleep 5 seconds to let the network settle.
                        await utils.sleep(5);
                        return await doRequest(request, false);
                    }
                }
            };

            try {
                const result = await doRequest(async () => await device.lqi());
                lqis.set(device, result);
                logger.debug(`LQI succeeded for '${resolvedEntity.name}'`);
            } catch (error) {
                failed.get(device).push('lqi');
                logger.error(`Failed to execute LQI for '${resolvedEntity.name}'`);
            }

            if (includeRoutes) {
                try {
                    const result = await doRequest(async () => await device.routingTable());
                    routingTables.set(device, result);
                    logger.debug(`Routing table succeeded for '${resolvedEntity.name}'`);
                } catch (error) {
                    failed.get(device).push('routingTable');
                    logger.error(`Failed to execute routing table for '${resolvedEntity.name}'`);
                }
            }
        }

        logger.info(`Network scan finished`);

        const networkMap = {nodes: [], links: []};
        // Add nodes
        for (const device of devices) {
            const resolvedEntity = this.zigbee.resolveEntity(device);
            const definition = resolvedEntity.definition ? {
                model: resolvedEntity.definition.model,
                vendor: resolvedEntity.definition.vendor,
                description: resolvedEntity.definition.description,
                supports: Array.from(new Set((resolvedEntity.definition.exposes).map((e) => {
                    return e.hasOwnProperty('name') ?
                        e.name :
                        `${e.type} (${e.features.map((f) => f.name).join(', ')})`;
                }))).join(', '),
            } : null;

            networkMap.nodes.push({
                ieeeAddr: device.ieeeAddr, friendlyName: resolvedEntity.name, type: device.type,
                networkAddress: device.networkAddress, manufacturerName: device.manufacturerName,
                modelID: device.modelID, failed: failed.get(device), lastSeen: device.lastSeen,
                definition,
            });
        }

        // Add links
        lqis.forEach((lqi, device) => {
            for (const neighbor of lqi.neighbors) {
                if (neighbor.relationship > 3) {
                    // Relationship is not active, skip it
                    continue;
                }

                // Some Xiaomi devices return 0x00 as the neighbor ieeeAddr (obviously not correct).
                // Determine the correct ieeeAddr based on the networkAddress.
                const neighborDevice = this.zigbee.getDeviceByNetworkAddress(neighbor.networkAddress);
                if (neighbor.ieeeAddr === '0x0000000000000000' && neighborDevice) {
                    neighbor.ieeeAddr = neighborDevice.ieeeAddr;
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
