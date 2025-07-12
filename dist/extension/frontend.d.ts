import Extension from "./extension";
/**
 * This extension servers the frontend
 */
export declare class Frontend extends Extension {
    private mqttBaseTopic;
    private server;
    private wss;
    private baseUrl;
    constructor(zigbee: Zigbee, mqtt: Mqtt, state: State, publishEntityState: PublishEntityState, eventBus: EventBus, enableDisableExtension: (enable: boolean, name: string) => Promise<void>, restartCallback: () => Promise<void>, addExtension: (extension: Extension) => Promise<void>);
    start(): Promise<void>;
    stop(): Promise<void>;
    private onUpgrade;
    private onWebSocketConnection;
    private onMQTTPublishMessageOrEntityState;
}
export default Frontend;
//# sourceMappingURL=frontend.d.ts.map