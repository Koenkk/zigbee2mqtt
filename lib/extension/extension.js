class Extension {
    /**
     * Besides intializing variables, the constructor should do nothing!
     *
     * @param {Zigbee} zigbee Zigbee controller
     * @param {MQTT} mqtt MQTT controller
     * @param {State} state State controller
     * @param {Function} publishEntityState Method to publish device state to MQTT.
     * @param {EventBus} eventBus The event bus
     */
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
        this.eventBus = eventBus;
    }

    /**
     * This method is called by the controller once Zigbee has been started.
     */
    // onZigbeeStarted() {}

    /**
     * This method is called by the controller once connected to the MQTT server.
     */
    // onMQTTConnected() {}

    /**
     * Is called when a Zigbee message from a device is received.
     * @param {string} type Type of the message
     * @param {Object} data Data of the message
     * @param {Object?} resolvedEntity Resolved entity returned from this.zigbee.resolveEntity()
     * @param {Object?} settingsDevice Device settings
     */
    // onZigbeeEvent(type, data, resolvedEntity) {}

    /**
     * Is called when a MQTT message is received
     * @param {string} topic Topic on which the message was received
     * @param {Object} message The received message
     * @return {boolean} if the message was handled
     */
    // onMQTTMessage(topic, message) {}

    /**
     * Is called once the extension has to stop
     */
    stop() {
        this.eventBus.removeListenersExtension(this.constructor.name);
    }
}

module.exports = Extension;
