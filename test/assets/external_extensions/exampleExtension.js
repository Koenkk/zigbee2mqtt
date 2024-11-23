class Example {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        this.mqtt = mqtt;
        this.mqtt.publish('example/extension', 'call from constructor');
    }

    start() {
        this.mqtt.publish('example/extension', 'call from start');
    }

    stop() {
        this.mqtt.publish('example/extension', 'call from stop');
    }
}

module.exports = Example;
