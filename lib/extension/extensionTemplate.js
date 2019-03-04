/**
 * This extensions is for documentation purposes only.
 * It describes all methods that are called by the controller.
 */
class ExtensionTemplate {
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
    onZigbeeStarted() {}

    /**
     * This method is called by the controller once connected to the MQTT server.
     */
    onMQTTConnected() {}

    /**
     * Is called when a Zigbee message from a device is received.
     * @param {Object?} message The received message (can be null)
     * @param {Object?} device The device of the message (can be null)
     * @param {Object?} mappedDevice The mapped device (can be null)
     */
    onZigbeeMessage(message, device, mappedDevice) {}

    /**
     * Is called when a MQTT message is received
     * @param {string} topic Topic on which the message was received
     * @param {Object} message The received message
     * @return {boolean} if the message was handled
     */
    onMQTTMessage(topic, message) {
        return false;
    }

    /**
     * Is called once the extension has to stop
     */
    stop() {}
}

module.exports = ExtensionTemplate;
