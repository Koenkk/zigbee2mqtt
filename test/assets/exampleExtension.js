class Example {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        this.mqtt = mqtt;
    }

    onMQTTConnected() {
        this.mqtt.publish('example/extension', 'test')
    }
}

module.exports = Example;
