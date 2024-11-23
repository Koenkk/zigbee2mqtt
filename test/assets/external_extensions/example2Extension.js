class Example2 {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        this.mqtt = mqtt;
        this.mqtt.publish('example2/extension', 'call2 from constructor');
    }

    start() {
        this.mqtt.publish('example2/extension', 'call2 from start');
    }

    stop() {
        this.mqtt.publish('example/extension', 'call2 from stop');
    }
}

module.exports = Example2;
