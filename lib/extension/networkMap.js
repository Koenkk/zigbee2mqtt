
const settings = require('../util/settings');

class NetworkMap {
    constructor(zigbee, mqtt, state) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;

        // Subscribe to topic.
        this.topic = `${settings.get().mqtt.base_topic}/bridge/networkmap`;
        this.mqtt.subscribe(this.topic);

        // Set supported formats
        this.supportedFormats = {
            'raw': this.raw,
            'graphviz': this.graphviz,
        };
    }

    handleMQTTMessage(topic, message) {
        message = message.toString();

        if (topic === this.topic && this.supportedFormats.hasOwnProperty(message)) {
            this.zigbee.networkScan((result)=> {
                const converted = this.supportedFormats[message](this.zigbee, result);
                this.mqtt.publish(`bridge/networkmap/${message}`, converted, {});
            });

            return true;
        }
    }

    raw(zigbee, topology) {
        return JSON.stringify(topology);
    }

    graphviz(zigbee, topology) {
        let text = 'digraph G {\nnode[shape=record];\n';
        const lqiDevices = new Map(topology.map((d) => [d.ieeeAddr, d]));

        zigbee.getDevices().forEach((device) => {
            const labels = [];
            const friendlyDevice = settings.getDevice(device.ieeeAddr);
            const friendlyName = friendlyDevice ? friendlyDevice.friendly_name : device.ieeeAddr;

            labels.push(`${friendlyName} (${device.status})`);

            if ( device.nwkAddr == 0 ) {
                labels.push('Coordinator');
            } else if ( device.type == 'Router' ) {
                labels.push(device.type);
            }

            const model = [];
            if ( device.manufName ) {
                model.push(device.manufName);
            }
            if ( device.modelId ) {
                model.push(device.modelId);
            }
            if ( model.length > 0 ) {
                labels.push(model.join('/'));
            }
            text += `  "${device.ieeeAddr}" [label="{${labels.join('|')}}"];\n`;

            const lqiDevice = lqiDevices.get(device.ieeeAddr);
            if (lqiDevice != undefined) {
                text += `  "${device.ieeeAddr}" -> "${lqiDevice.parent}" [label="${lqiDevice.lqi}"]\n`;
            }
        });

        text += '}';

        return text;
    }
}

module.exports = NetworkMap;
