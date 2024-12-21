import type {Zigbee2MQTTAPI, Zigbee2MQTTNetworkMap} from 'lib/types/api';

import bind from 'bind-decorator';
import stringify from 'json-stable-stringify-without-jsonify';

import logger from '../util/logger';
import * as settings from '../util/settings';
import utils from '../util/utils';
import Extension from './extension';

const SUPPORTED_FORMATS = ['raw', 'graphviz', 'plantuml'];

/**
 * This extension creates a network map
 */
export default class NetworkMap extends Extension {
    private topic = `${settings.get().mqtt.base_topic}/bridge/request/networkmap`;

    override async start(): Promise<void> {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        if (data.topic === this.topic) {
            const message = utils.parseJSON(data.message, data.message) as Zigbee2MQTTAPI['bridge/request/networkmap'];

            try {
                const type = typeof message === 'object' ? message.type : message;

                if (!SUPPORTED_FORMATS.includes(type)) {
                    throw new Error(`Type '${type}' not supported, allowed are: ${SUPPORTED_FORMATS.join(',')}`);
                }

                const routes = typeof message === 'object' && message.routes;
                const topology = await this.networkScan(routes);
                let responseData: Zigbee2MQTTAPI['bridge/response/networkmap'];

                switch (type) {
                    case 'raw': {
                        responseData = {type, routes, value: this.raw(topology)};
                        break;
                    }
                    case 'graphviz': {
                        responseData = {type, routes, value: this.graphviz(topology)};
                        break;
                    }
                    case 'plantuml': {
                        responseData = {type, routes, value: this.plantuml(topology)};
                        break;
                    }
                }

                await this.mqtt.publish('bridge/response/networkmap', stringify(utils.getResponse(message, responseData)));
            } catch (error) {
                await this.mqtt.publish('bridge/response/networkmap', stringify(utils.getResponse(message, {}, (error as Error).message)));
            }
        }
    }

    raw(topology: Zigbee2MQTTNetworkMap): Zigbee2MQTTNetworkMap {
        return topology;
    }

    graphviz(topology: Zigbee2MQTTNetworkMap): string {
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
                    (node.failed && node.failed.length ? `failed: ${node.failed.join(',')}` : ''),
            );

            // Add the device model
            if (node.type !== 'Coordinator') {
                labels.push(`${node.definition?.vendor} ${node.definition?.description} (${node.definition?.model})`);
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
                style = `style="bold, filled", fillcolor="${colors.fill.coordinator}", fontcolor="${colors.font.coordinator}"`;
            } else if (node.type == 'Router') {
                style = `style="rounded, filled", fillcolor="${colors.fill.router}", fontcolor="${colors.font.router}"`;
            } else {
                style = `style="rounded, dashed, filled", fillcolor="${colors.fill.enddevice}", fontcolor="${colors.font.enddevice}"`;
            }

            // Add the device with its labels to the graph as a node.
            text += `  "${node.ieeeAddr}" [${style}, label="{${labels.join('|')}}"];\n`;

            /**
             * Add an edge between the device and its child to the graph
             * NOTE: There are situations where a device is NOT in the topology, this can be e.g.
             * due to not responded to the lqi scan. In that case we do not add an edge for this device.
             */
            topology.links
                .filter((e) => e.source.ieeeAddr === node.ieeeAddr)
                .forEach((e) => {
                    const lineStyle = node.type == 'EndDevice' ? 'penwidth=1, ' : !e.routes.length ? 'penwidth=0.5, ' : 'penwidth=2, ';
                    const lineWeight = !e.routes.length ? `weight=0, color="${colors.line.inactive}", ` : `weight=1, color="${colors.line.active}", `;
                    const textRoutes = e.routes.map((r) => utils.toNetworkAddressHex(r.destinationAddress));
                    const lineLabels = !e.routes.length ? `label="${e.linkquality}"` : `label="${e.linkquality} (routes: ${textRoutes.join(',')})"`;
                    text += `  "${node.ieeeAddr}" -> "${e.target.ieeeAddr}"`;
                    text += ` [${lineStyle}${lineWeight}${lineLabels}]\n`;
                });
        });

        text += '}';

        return text.replace(/\0/g, '');
    }

    plantuml(topology: Zigbee2MQTTNetworkMap): string {
        const text = [];

        text.push(`' paste into: https://www.planttext.com/`);
        text.push(``);
        text.push('@startuml');

        topology.nodes
            .sort((a, b) => a.friendlyName.localeCompare(b.friendlyName))
            .forEach((node) => {
                // Add friendly name
                text.push(`card ${node.ieeeAddr} [`);
                text.push(`${node.friendlyName}`);
                text.push(`---`);

                // Add the device short network address, ieeaddr and scan note (if any)
                text.push(
                    `${node.ieeeAddr} (${utils.toNetworkAddressHex(node.networkAddress)})` +
                        (node.failed && node.failed.length ? ` failed: ${node.failed.join(',')}` : ''),
                );

                // Add the device model
                if (node.type !== 'Coordinator') {
                    text.push(`---`);
                    const definition = (this.zigbee.resolveEntity(node.ieeeAddr) as Device).definition;
                    text.push(`${definition?.vendor} ${definition?.description} (${definition?.model})`);
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

    async networkScan(includeRoutes: boolean): Promise<Zigbee2MQTTNetworkMap> {
        logger.info(`Starting network scan (includeRoutes '${includeRoutes}')`);
        const lqis: Map<Device, zh.LQI> = new Map();
        const routingTables: Map<Device, zh.RoutingTable> = new Map();
        const failed: Map<Device, string[]> = new Map();
        const requestWithRetry = async <T>(request: () => Promise<T>): Promise<T> => {
            try {
                const result = await request();

                return result;
            } catch {
                // Network is possibly congested, sleep 5 seconds to let the network settle.
                await utils.sleep(5);
                return await request();
            }
        };

        for (const device of this.zigbee.devicesIterator((d) => d.type !== 'GreenPower' && d.type !== 'EndDevice')) {
            if (device.options.disabled) {
                continue;
            }

            failed.set(device, []);
            await utils.sleep(1); // sleep 1 second between each scan to reduce stress on network.

            try {
                const result = await requestWithRetry<zh.LQI>(async () => await device.zh.lqi());
                lqis.set(device, result);
                logger.debug(`LQI succeeded for '${device.name}'`);
            } catch (error) {
                failed.get(device)!.push('lqi'); // set above
                logger.error(`Failed to execute LQI for '${device.name}'`);
                logger.debug((error as Error).stack!);
            }

            if (includeRoutes) {
                try {
                    const result = await requestWithRetry<zh.RoutingTable>(async () => await device.zh.routingTable());
                    routingTables.set(device, result);
                    logger.debug(`Routing table succeeded for '${device.name}'`);
                } catch (error) {
                    failed.get(device)!.push('routingTable'); // set above
                    logger.error(`Failed to execute routing table for '${device.name}'`);
                    logger.debug((error as Error).stack!);
                }
            }
        }

        logger.info(`Network scan finished`);

        const topology: Zigbee2MQTTNetworkMap = {nodes: [], links: []};

        // XXX: display GP/disabled devices in the map, better feedback than just hiding them?
        for (const device of this.zigbee.devicesIterator((d) => d.type !== 'GreenPower')) {
            if (device.options.disabled) {
                continue;
            }

            // Add nodes
            const definition = device.definition
                ? {
                      model: device.definition.model,
                      vendor: device.definition.vendor,
                      description: device.definition.description,
                      supports: Array.from(
                          new Set(
                              device.exposes().map((e) => {
                                  return e.name ?? `${e.type} (${e.features?.map((f) => f.name).join(', ')})`;
                              }),
                          ),
                      ).join(', '),
                  }
                : undefined;

            topology.nodes.push({
                ieeeAddr: device.ieeeAddr,
                friendlyName: device.name,
                type: device.zh.type,
                networkAddress: device.zh.networkAddress,
                manufacturerName: device.zh.manufacturerName,
                modelID: device.zh.modelID,
                failed: failed.get(device)!,
                lastSeen: device.zh.lastSeen,
                definition,
            });
        }

        // Add links
        for (const [device, lqi] of lqis) {
            for (const neighbor of lqi.neighbors) {
                if (neighbor.relationship > 3) {
                    // Relationship is not active, skip it
                    continue;
                }

                // Some Xiaomi devices return 0x00 as the neighbor ieeeAddr (obviously not correct).
                // Determine the correct ieeeAddr based on the networkAddress.
                if (neighbor.ieeeAddr === '0x0000000000000000') {
                    const neighborDevice = this.zigbee.deviceByNetworkAddress(neighbor.networkAddress);

                    if (neighborDevice) {
                        neighbor.ieeeAddr = neighborDevice.ieeeAddr;
                    }
                }

                const link: Zigbee2MQTTNetworkMap['links'][number] = {
                    source: {ieeeAddr: neighbor.ieeeAddr, networkAddress: neighbor.networkAddress},
                    target: {ieeeAddr: device.ieeeAddr, networkAddress: device.zh.networkAddress},
                    linkquality: neighbor.linkquality,
                    depth: neighbor.depth,
                    routes: [],
                    // DEPRECATED:
                    sourceIeeeAddr: neighbor.ieeeAddr,
                    targetIeeeAddr: device.ieeeAddr,
                    sourceNwkAddr: neighbor.networkAddress,
                    lqi: neighbor.linkquality,
                    relationship: neighbor.relationship,
                };

                const routingTable = routingTables.get(device);

                if (routingTable) {
                    for (const entry of routingTable.table) {
                        if (entry.status === 'ACTIVE' && entry.nextHop === neighbor.networkAddress) {
                            link.routes.push(entry);
                        }
                    }
                }

                topology.links.push(link);
            }
        }

        return topology;
    }
}
