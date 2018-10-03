
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
        topology.forEach((item) => {
            const labels = [];
            const friendlyDevice = settings.getDevice(item.ieeeAddr);
            const friendlyName = friendlyDevice ? friendlyDevice.friendly_name : item.ieeeAddr;
            labels.push(`${friendlyName} (${item.status})`);
            const device = zigbee.getDevice(item.ieeeAddr);
            if ( device.nwkAddr == 0 ) {
                labels.push("Coordinator");
            } else if ( device.type == "Router" ) {
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
            text += `  "${item.ieeeAddr}" [label="{${labels.join('|')}}"];\n`;
            text += `  "${item.ieeeAddr}" -> "${item.parent}" [label="${item.lqi}"]\n`;
        });

        text += '}';

        return text;
    }
}

module.exports = NetworkMap;
