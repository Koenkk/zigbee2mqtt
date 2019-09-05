const settings = require('../util/settings');
const utils = require('../util/utils');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');

class NetworkMap {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.lastSeenMap = {};

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

    onZigbeeMessage(message, device, mappedDevice) {
        if (device) {
            this.lastSeenMap[device.ieeeAddr] = Date.now();
        }
    }

    onMQTTConnected() {
        this.mqtt.subscribe(this.topic);
        this.mqtt.subscribe(this.topicRoutes);
    }

    onMQTTMessage(topic, message) {
        message = message.toString();
        const includeRoutes = (topic === this.topicRoutes) ? 1: 0;
        if ((topic === this.topic || topic === this.topicRoutes)
            && this.supportedFormats.hasOwnProperty(message)) {
            this.zigbee.networkScan(includeRoutes, (result)=> {
                const converted = this.supportedFormats[message](this.zigbee, result);
                this.mqtt.publish(`bridge/networkmap/${message}`, converted, {});
            });

            return true;
        }

        return false;
    }

    raw(zigbee, topology) {
        return JSON.stringify(topology);
    }

    graphviz(zigbee, topology) {
        const colors = settings.get().map_options.graphviz.colors;

        let text = 'digraph G {\nnode[shape=record];\n';
        let devStyle = '';

        topology.nodes.forEach((device) => {
            const labels = [];

            // Add friendly name
            labels.push(`${device.friendlyName}`);

            // Add the device short network address and scan note (if any)
            let scanNote = '';
            if (device.scanfailed.includes('lqi')) {
                scanNote += ' no lqi';
            }
            if (device.scanfailed.includes('rtg')) {
                scanNote += ' no routes';
            }
            labels.push(`0x${device.nwkAddr.toString(16)} ${scanNote}`);

            // Add the device model
            const mappedModel = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
            if (mappedModel) {
                labels.push(`${mappedModel.vendor} ${mappedModel.description} (${mappedModel.model})`);
            } else {
                // This model is not supported by zigbee-shepherd-converters, add zigbee model information, if available
                const zigbeeModel = [device.manufName, device.modelId].filter((a) => a).join(' ');
                labels.push(zigbeeModel ? zigbeeModel : 'No model information available');
            }

            // Add the device status (online/offline) and last_seen timestamp
            let lastSeen = 'unknown';
            if (device.type == 'Coordinator') {
                lastSeen = utils.formatDate(Date.now(), settings.get().advanced.last_seen,
                    utils.toLocalISOString(new Date(Date.now())));
            } else {
                if (this.lastSeenMap[device.ieeeAddr]) {
                    const lastSeenAgo =
                        `${new Date(Date.now() - this.lastSeenMap[device.ieeeAddr]).toISOString().substr(11, 8)}s ago`;
                    lastSeen = utils.formatDate(this.lastSeenMap[device.ieeeAddr],
                        settings.get().advanced.last_seen, lastSeenAgo);
                }
            }
            labels.push(`${device.status} (${lastSeen})`);

            // Shape the record according to device type
            if (device.type == 'Coordinator') {
                devStyle = `style="bold, filled", fillcolor="${colors.fill.coordinator}", ` +
                    `fontcolor="${colors.font.coordinator}"`;
            } else if (device.type == 'Router') {
                devStyle = `style="rounded, filled", fillcolor="${colors.fill.router}", ` +
                    `fontcolor="${colors.font.router}"`;
            } else {
                devStyle = `style="rounded, dashed, filled", fillcolor="${colors.fill.enddevice}", `
                    + `fontcolor="${colors.font.enddevice}"`;
            }

            // Add the device with its labels to the graph as a node.
            text += `  "${device.ieeeAddr}" [`+devStyle+`, label="{${labels.join('|')}}"];\n`;

            /**
             * Add an edge between the device and its child to the graph
             * NOTE: There are situations where a device is NOT in the topology, this can be e.g.
             * due to not responded to the lqi scan. In that case we do not add an edge for this device.
             */
            topology.links.filter((e) => (e.sourceIeeeAddr === device.ieeeAddr) || (e.SourceNwkAddr === device.nwkAddr))
                .forEach((e) => {
                    const lineStyle = (device.type=='EndDevice') ? 'penwidth=1, '
                        : (!e.routes.length) ? 'penwidth=0.5, ' : 'penwidth=2, ';
                    const lineWeight = (!e.routes.length) ? `weight=0, color="${colors.line.inactive}", `
                        : `weight=1, color="${colors.line.active}", `;
                    const textRoutes = e.routes.map((r) => `0x${r.toString(16)}`);
                    const lineLabels = (!e.routes.length) ? `label="${e.lqi}"`
                        : `label="${e.lqi}\\n[${textRoutes.join(']\\n[')}]"`;
                    text += `  "${device.ieeeAddr}" -> "${e.targetIeeeAddr}"`;
                    text += ` [${lineStyle}${lineWeight}${lineLabels}]\n`;
                });
        });

        text += '}';

        return text.replace(/\0/g, '');
    }
}

module.exports = NetworkMap;
