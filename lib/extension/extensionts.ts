// TODO: tempState -> State, rename to extension
abstract class ExtensionTS {
    protected zigbee: Zigbee;
    protected mqtt: MQTT;
    protected state: TempState;
    protected publishEntityState: PublishEntityState;
    protected eventBus: EventBus;

    /**
     * Besides intializing variables, the constructor should do nothing!
     *
     * @param {Zigbee} zigbee Zigbee controller
     * @param {MQTT} mqtt MQTT controller
     * @param {State} state State controller
     * @param {Function} publishEntityState Method to publish device state to MQTT.
     * @param {EventBus} eventBus The event bus
     */
    constructor(zigbee: Zigbee, mqtt: MQTT, state: TempState,
        publishEntityState: PublishEntityState, eventBus: EventBus) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
        this.eventBus = eventBus;
    }

    /**
     * Is called once the extension has to start
     */
    start(): void {}

    /**
     * Is called once the extension has to stop
     */
    stop(): void {
        this.eventBus.removeListeners(this.constructor.name);
    }
}

export default ExtensionTS;
