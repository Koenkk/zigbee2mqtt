const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');

class NetworkMap {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;

        // Subscribe to topic.
        this.topic = `${settings.get().mqtt.base_topic}/bridge/networkmap`;

        // Set supported formats
        this.supportedFormats = {
            'raw': this.raw,
            'graphviz': this.graphviz,
        };
    }

    onMQTTConnected() {
        this.mqtt.subscribe(this.topic);
    }

    onMQTTMessage(topic, message) {
        message = message.toString();

        if (topic === this.topic && this.supportedFormats.hasOwnProperty(message)) {
            this.zigbee.networkScan((result)=> {
                const converted = this.supportedFormats[message](this.zigbee, this.state, result);
                this.mqtt.publish(`bridge/networkmap/${message}`, converted, {});
            });

            return true;
        }

        return false;
    }

    raw(zigbee, state, topology) {
        return JSON.stringify(topology);
    }

    graphviz(zigbee, state, topology) {
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
            let last_seen = 'unknown';
            const dev_state = state.get(device.ieeeAddr);
            if (device.type == 'Coordinator' || (dev_state && dev_state.last_seen)) {
                let now = Date.now();
                let then = now;
                if (dev_state && dev_state.last_seen) {
                    then = dev_state.last_seen;
                }
                switch (settings.get().advanced.last_seen) {
                case 'ISO_8601':
                    last_seen = new Date(then).toISOString();
                    break;
                case 'ISO_8601_local':
                    last_seen = utils.toLocalISOString(new Date(then));
                    break;
                case 'epoch':
                    last_seen = then;
                    break;
                default:
                    if (device.type == 'Coordinator') {
                        last_seen = utils.toLocalISOString(new Date(then));
                    } else {
                        last_seen = new Date(now - then).toISOString().substr(11, 8) + 's ago';
                    }
                    break;
                }
            }
            labels.push(device.status + ' ' + last_seen);

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
                const lineStyle = (e.lqi==0) ? `style="dashed", ` : ``;
                const textRoutes = e.routes.map((r) => `0x${r.toString(16)}`);
                const lineLabels = e.lqi + '\\n[' + textRoutes.join(']\\n[') + ']';
                text += `  "${e.parent}" -> "${device.ieeeAddr}" [`+lineStyle+`label="${lineLabels}"]\n`;
            });
        });

        text += '}';

        return text.replace(/\0/g, '');
    }
}

module.exports = NetworkMap;
