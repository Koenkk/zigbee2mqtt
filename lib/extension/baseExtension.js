class BaseExtension {
    /**
     * Besides intializing variables, the constructor should do nothing!
     *
     * @param {Zigbee} zigbee Zigbee controller
     * @param {MQTT} mqtt MQTT controller
     * @param {State} state State controller
     * @param {Function} publishEntityState Method to publish device state to MQTT.
     */
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
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
     * @param {Object?} mappedDevice The mapped device
     * @param {Object?} settingsDevice Device settings
     */
    // onZigbeeEvent(type, data, mappedDevice, settingsDevice) {}

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
    // stop() {}
}

module.exports = BaseExtension;
