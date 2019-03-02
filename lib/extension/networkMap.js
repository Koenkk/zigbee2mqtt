const settings = require('../util/settings');
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
            labels.push(friendlyName);

            // Add the device type
            labels.push(device.type);

            // Add the device model
            const mappedModel = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
            if (mappedModel) {
                labels.push(`${mappedModel.vendor} ${mappedModel.description} (${mappedModel.model})`);
            } else {
                // This model is not supported by zigbee-shepherd-converters, add zigbee model information, if available
                const zigbeeModel = [device.manufName, device.modelId].filter((a) => a).join(' ');
                labels.push(zigbeeModel ? zigbeeModel : 'No model information available');
            }

            // Add the device status (online/offline)
            labels.push(device.status);

            // Shape the record according to device type
            if (device.type == 'Coordinator') {
                devStyle = 'style="bold"';
            } else if (device.type == 'Router') {
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
            topology.filter((e) => e.ieeeAddr === device.ieeeAddr).forEach((e) => {
                const lineStyle = (e.lqi==0) ? `style="dashed", ` : ``;
                text += `  "${device.ieeeAddr}" -> "${e.parent}" [`+lineStyle+`label="${e.lqi}"]\n`;
            });
        });

        text += '}';

        return text.replace(/\0/g, '');
    }
}

module.exports = NetworkMap;
