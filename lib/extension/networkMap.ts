import * as settings from '../util/settings';
import utils from '../util/utils';
import logger from '../util/logger';
import stringify from 'json-stable-stringify-without-jsonify';
import Extension from './extension';
import bind from 'bind-decorator';

interface Link {
    source: {ieeeAddr: string, networkAddress: number}, target: {ieeeAddr: string, networkAddress: number},
    linkquality: number, depth: number, routes: zh.RoutingTableEntry[],
    sourceIeeeAddr: string, targetIeeeAddr: string, sourceNwkAddr: number, lqi: number, relationship: number,
}

interface Topology {
    nodes: {
        ieeeAddr: string, friendlyName: string, type: string, networkAddress: number, manufacturerName: string,
        modelID: string, failed: string[], lastSeen: number,
        definition: {model: string, vendor: string, supports: string, description: string}}[],
    links: Link[],
}

/**
 * This extension creates a network map
 */
export default class NetworkMap extends Extension {
    private legacyApi = settings.get().advanced.legacy_api;
    private legacyTopic = `${settings.get().mqtt.base_topic}/bridge/networkmap`;
    private legacyTopicRoutes = `${settings.get().mqtt.base_topic}/bridge/networkmap/routes`;
    private topic = `${settings.get().mqtt.base_topic}/bridge/request/networkmap`;
    private supportedFormats: {[s: string]: (topology: Topology) => KeyValue | string};

    override async start(): Promise<void> {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.supportedFormats = {
            'raw': this.raw,
            'graphviz': this.graphviz,
            'plantuml': this.plantuml,
        };
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        /* istanbul ignore else */
        if (this.legacyApi) {
            if ((data.topic === this.legacyTopic || data.topic === this.legacyTopicRoutes) &&
                this.supportedFormats.hasOwnProperty(data.message)) {
                const includeRoutes = data.topic === this.legacyTopicRoutes;
                const topology = await this.networkScan(includeRoutes);
                let converted = this.supportedFormats[data.message](topology);
                converted = data.message === 'raw' ? stringify(converted) : converted;
                this.mqtt.publish(`bridge/networkmap/${data.message}`, converted as string, {});
            }
        }

        if (data.topic === this.topic) {
            const message = utils.parseJSON(data.message, data.message);
            try {
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

    @bind raw(topology: Topology): KeyValue {
        return topology;
    }

    @bind graphviz(topology: Topology): string {
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
                lastSeen = utils.formatDate(date, 'relative') as string;
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

    @bind plantuml(topology: Topology): string {
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
                const definition = (this.zigbee.resolveEntity(node.ieeeAddr) as Device).definition;
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
                lastSeen = utils.formatDate(date, 'relative') as string;
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

    async networkScan(includeRoutes: boolean): Promise<Topology> {
        logger.info(`Starting network scan (includeRoutes '${includeRoutes}')`);
        const devices = this.zigbee.devices().filter((d) => d.zh.type !== 'GreenPower');
        const lqis: Map<Device, zh.LQI> = new Map();
        const routingTables: Map<Device, zh.RoutingTable> = new Map();
        const failed: Map<Device, string[]> = new Map();

        for (const device of devices.filter((d) => d.zh.type != 'EndDevice')) {
            failed.set(device, []);
            await utils.sleep(1); // sleep 1 second between each scan to reduce stress on network.

            const doRequest = async <T>(request: () => Promise<T>, firstAttempt = true): Promise<T> => {
                try {
                    return await request();
                } catch (error) {
                    if (!firstAttempt) {
                        throw error;
                    } else {
                        // Network is possibly congested, sleep 5 seconds to let the network settle.
                        await utils.sleep(5);
                        return doRequest(request, false);
                    }
                }
            };

            try {
                const result = await doRequest<zh.LQI>(async () => device.zh.lqi());
                lqis.set(device, result);
                logger.debug(`LQI succeeded for '${device.name}'`);
            } catch (error) {
                failed.get(device).push('lqi');
                logger.error(`Failed to execute LQI for '${device.name}'`);
                logger.debug(error.stack);
            }

            if (includeRoutes) {
                try {
                    const result = await doRequest(async () => device.zh.routingTable());
                    routingTables.set(device, result);
                    logger.debug(`Routing table succeeded for '${device.name}'`);
                } catch (error) {
                    failed.get(device).push('routingTable');
                    logger.error(`Failed to execute routing table for '${device.name}'`);
                }
            }
        }

        logger.info(`Network scan finished`);

        const topology: Topology = {nodes: [], links: []};
        // Add nodes
        for (const device of devices) {
            const definition = device.definition ? {
                model: device.definition.model,
                vendor: device.definition.vendor,
                description: device.definition.description,
                supports: Array.from(new Set((device.exposes()).map((e) => {
                    return e.hasOwnProperty('name') ? e.name :
                        `${e.type} (${e.features.map((f) => f.name).join(', ')})`;
                }))).join(', '),
            } : null;

            topology.nodes.push({
                ieeeAddr: device.ieeeAddr, friendlyName: device.name, type: device.zh.type,
                networkAddress: device.zh.networkAddress, manufacturerName: device.zh.manufacturerName,
                modelID: device.zh.modelID, failed: failed.get(device), lastSeen: device.zh.lastSeen,
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
                const neighborDevice = this.zigbee.deviceByNetworkAddress(neighbor.networkAddress);
                if (neighbor.ieeeAddr === '0x0000000000000000' && neighborDevice) {
                    neighbor.ieeeAddr = neighborDevice.ieeeAddr;
                }

                const link: Link = {
                    source: {ieeeAddr: neighbor.ieeeAddr, networkAddress: neighbor.networkAddress},
                    target: {ieeeAddr: device.ieeeAddr, networkAddress: device.zh.networkAddress},
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

                topology.links.push(link);
            }
        });

        return topology;
    }
}
