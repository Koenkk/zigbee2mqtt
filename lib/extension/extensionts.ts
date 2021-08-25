abstract class ExtensionTS {
    protected zigbee: TempZigbee;
    protected mqtt: TempMQTT;
    protected state: TempState;
    protected publishEntityState: TempPublishEntityState;
    protected eventBus: TempEventBus;

    /**
     * Besides intializing variables, the constructor should do nothing!
     *
     * @param {Zigbee} zigbee Zigbee controller
     * @param {MQTT} mqtt MQTT controller
     * @param {State} state State controller
     * @param {Function} publishEntityState Method to publish device state to MQTT.
     * @param {EventBus} eventBus The event bus
     */
    constructor(zigbee: TempZigbee, mqtt: TempMQTT, state: TempState,
        publishEntityState: TempPublishEntityState, eventBus: TempEventBus) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
        this.eventBus = eventBus;
    }

    /**
     * This method is called by the controller once Zigbee has been started.
     */
    /* istanbul ignore next */
    onZigbeeStarted(): void {}

    /**
     * This method is called by the controller once connected to the MQTT server.
     */
    /* istanbul ignore next */
    onMQTTConnected(): void {}

    /**
     * Is called when a Zigbee message from a device is received.
     * @param {string} type Type of the message
     * @param {Object} data Data of the message
     * @param {Object?} resolvedEntity Resolved entity returned from this.zigbee.resolveEntity()
     * @param {Object?} settingsDevice Device settings
     */
    /* istanbul ignore next */
    /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
    onZigbeeEvent(type: ZigbeeEventType, data: ZigbeeEventData, resolvedEntity: ResolvedEntity): void {}

    /**
     * Is called when a MQTT message is received
     * @param {string} topic Topic on which the message was received
     * @param {Object} message The received message
     * @return {boolean} if the message was handled
     */
    /* istanbul ignore next */
    /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
    onMQTTMessage(topic: string, message: string): boolean {
        return false;
    }

    /**
     * Is called once the extension has to stop
     */
    stop(): void {
        this.eventBus.removeListenersExtension(this.constructor.name);
    }
}

export default ExtensionTS;
