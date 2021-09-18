// TODO: tempState -> State, rename to extension
abstract class ExtensionTS {
    protected zigbee: Zigbee;
    protected mqtt: MQTT;
    protected state: TempState;
    protected publishEntityState: PublishEntityState;
    protected eventBus: EventBus;
    protected enableDisableExtension: (enable: boolean, name: string) => void;
    protected restartCallback: () => void;
    protected addExtension: (extension: ExtensionTS) => void;

    /**
     * Besides intializing variables, the constructor should do nothing!
     *
     * @param {Zigbee} zigbee Zigbee controller
     * @param {MQTT} mqtt MQTT controller
     * @param {State} state State controller
     * @param {Function} publishEntityState Method to publish device state to MQTT.
     * @param {EventBus} eventBus The event bus
     * @param {enableDisableExtension} enableDisableExtension Enable/disable extension method
     * @param {restartCallback} restartCallback Restart Zigbee2MQTT
     * @param {addExtension} addExtension Add an extension
     */
    constructor(zigbee: Zigbee, mqtt: MQTT, state: TempState, publishEntityState: PublishEntityState,
        eventBus: EventBus, enableDisableExtension: (enable: boolean, name: string) => void,
        restartCallback: () => void, addExtension: (extension: ExtensionTS) => void) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
        this.eventBus = eventBus;
        this.enableDisableExtension = enableDisableExtension;
        this.restartCallback = restartCallback;
        this.addExtension = addExtension;
    }

    /**
     * Is called once the extension has to start
     */
    /* istanbul ignore next */
    async start(): Promise<void> {}

    /**
     * Is called once the extension has to stop
     */
    async stop(): Promise<void> {
        this.eventBus.removeListeners(this);
    }
}

export default ExtensionTS;
