
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
        };
    }

    handleMQTTMessage(topic, message) {
        message = message.toString();

        if (topic === this.topic && this.supportedFormats.hasOwnProperty(message)) {
            this.zigbee.networkScan((result)=> {
                const converted = this.supportedFormats[message](result);
                this.mqtt.publish(`bridge/networkmap/${message}`, converted, {});
            });

            return true;
        }
    }

    raw(topology) {
        return JSON.stringify(topology);
    }
}

module.exports = NetworkMap;
