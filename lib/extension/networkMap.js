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
    }

    onMQTTMessage(topic, message) {
        message = message.toString();

        if (topic === this.topic && this.supportedFormats.hasOwnProperty(message)) {
            this.zigbee.networkScan((result)=> {
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
        let text = 'digraph G {\nnode[shape=record];\n';
        let devStyle = '';

        zigbee.getDevices().forEach((device) => {
            const labels = [];
            const friendlyDevice = settings.getDevice(device.ieeeAddr);
            const friendlyName = friendlyDevice ? friendlyDevice.friendly_name : device.ieeeAddr;

            // Add friendly name
            labels.push(`${friendlyName}:${`0x${device.nwkAddr.toString(16)}`}`);

            // Add the device type
            const deviceType = utils.correctDeviceType(device);
            labels.push(deviceType);

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
            if (deviceType == 'Coordinator') {
                devStyle = 'style="bold"';
            } else if (deviceType == 'Router') {
                devStyle = 'style="rounded"';
            } else {
                devStyle = 'style="rounded, dashed"';
            }

            // Add the device with its labels to the graph as a node.
            text += `  "${device.ieeeAddr}" [`+devStyle+`, label="{${labels.join('|')}}"];\n`;

            /**
             * Add an edge between the device and its parent to the graph
             * NOTE: There are situations where a device is NOT in the topology, this can be e.g.
             * due to not responded to the lqi scan. In that case we do not add an edge for this device.
             */
            topology.filter((e) => (e.ieeeAddr === device.ieeeAddr) || (e.nwkAddr === device.nwkAddr)).forEach((e) => {
                const lineStyle = (device.type=='EndDevice') ? 'style="dashed", '
                    : (!e.routes.length) ? 'style="dotted", ' : '';
                const lineWeight = (!e.routes.length) ? 'weight=0, ' : '';
                const textRoutes = e.routes.map((r) => `0x${r.toString(16)}`);
                const lineLabels = `label="${e.lqi}\\n[${textRoutes.join(']\\n[')}]"`;
                text += `  "${e.parent}" -> "${device.ieeeAddr}" [${lineStyle}${lineWeight}${lineLabels}]\n`;
            });
        });

        text += '}';

        return text.replace(/\0/g, '');
    }
}

module.exports = NetworkMap;
