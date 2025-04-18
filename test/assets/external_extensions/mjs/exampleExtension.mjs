export default class Example {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        this.mqtt = mqtt;
        this.mqtt.publish("example/extension", "call from constructor");
        this.counter = 0;
    }

    start() {
        this.mqtt.publish("example/extension", "call from start");
        this.mqtt.publish("example/extension/counter", `start ${this.counter++}`);
    }

    stop() {
        this.mqtt.publish("example/extension", "call from stop");
        this.mqtt.publish("example/extension/counter", `stop ${--this.counter}`);
    }
}
