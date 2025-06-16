declare abstract class Extension {
    protected zigbee: Zigbee;
    protected mqtt: Mqtt;
    protected state: State;
    protected publishEntityState: PublishEntityState;
    protected eventBus: EventBus;
    protected enableDisableExtension: (enable: boolean, name: string) => Promise<void>;
    protected restartCallback: () => Promise<void>;
    protected addExtension: (extension: Extension) => Promise<void>;
    /**
     * Besides initializing variables, the constructor should do nothing!
     *
     * @param {Zigbee} zigbee Zigbee controller
     * @param {Mqtt} mqtt MQTT controller
     * @param {State} state State controller
     * @param {Function} publishEntityState Method to publish device state to MQTT.
     * @param {EventBus} eventBus The event bus
     * @param {enableDisableExtension} enableDisableExtension Enable/disable extension method
     * @param {restartCallback} restartCallback Restart Zigbee2MQTT
     * @param {addExtension} addExtension Add an extension
     */
    constructor(zigbee: Zigbee, mqtt: Mqtt, state: State, publishEntityState: PublishEntityState, eventBus: EventBus, enableDisableExtension: (enable: boolean, name: string) => Promise<void>, restartCallback: () => Promise<void>, addExtension: (extension: Extension) => Promise<void>);
    /**
     * Is called once the extension has to start
     */
    start(): Promise<void>;
    /**
     * Is called once the extension has to stop
     */
    stop(): Promise<void>;
    adjustMessageBeforePublish(_entity: Group | Device, _message: KeyValue): void;
}
export default Extension;
//# sourceMappingURL=extension.d.ts.map