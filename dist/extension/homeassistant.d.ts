import Extension from "./extension";
interface MockProperty {
    property: string;
    value: KeyValue | string | null;
}
interface DiscoveryEntry {
    mockProperties: MockProperty[];
    type: string;
    object_id: string;
    discovery_payload: KeyValue;
}
interface ActionData {
    action: string;
    button?: string;
    scene?: string;
    region?: string;
}
/**
 * This class handles the bridge entity configuration for Home Assistant Discovery.
 */
declare class Bridge {
    private coordinatorIeeeAddress;
    private coordinatorType;
    private coordinatorFirmwareVersion;
    private discoveryEntries;
    readonly options: {
        ID?: string;
        homeassistant?: KeyValue;
    };
    get ID(): string;
    get name(): string;
    get hardwareVersion(): string;
    get firmwareVersion(): string;
    get configs(): DiscoveryEntry[];
    constructor(ieeeAdress: string, version: zh.CoordinatorVersion, discovery: DiscoveryEntry[]);
    isDevice(): this is Device;
    isGroup(): this is Group;
}
/**
 * This extensions handles integration with HomeAssistant
 */
export declare class HomeAssistant extends Extension {
    private discovered;
    private discoveryTopic;
    private discoveryRegex;
    private discoveryRegexWoTopic;
    private statusTopic;
    private legacyActionSensor;
    private experimentalEventEntities;
    private zigbee2MQTTVersion;
    private discoveryOrigin;
    private bridge;
    private bridgeIdentifier;
    private actionValueTemplate;
    constructor(zigbee: Zigbee, mqtt: Mqtt, state: State, publishEntityState: PublishEntityState, eventBus: EventBus, enableDisableExtension: (enable: boolean, name: string) => Promise<void>, restartCallback: () => Promise<void>, addExtension: (extension: Extension) => Promise<void>);
    start(): Promise<void>;
    private getDiscovered;
    private exposeToConfig;
    onEntityRemoved(data: eventdata.EntityRemoved): Promise<void>;
    onGroupMembersChanged(data: eventdata.GroupMembersChanged): Promise<void>;
    onPublishEntityState(data: eventdata.PublishEntityState): Promise<void>;
    onEntityRenamed(data: eventdata.EntityRenamed): Promise<void>;
    private getConfigs;
    private discover;
    private onMQTTMessage;
    onZigbeeEvent(data: {
        device: Device;
    }): Promise<void>;
    onScenesChanged(data: eventdata.ScenesChanged): Promise<void>;
    private getDevicePayload;
    adjustMessageBeforePublish(entity: Device | Group | Bridge, message: KeyValue): void;
    private getEncodedBaseTopic;
    private getDiscoveryTopic;
    private publishDeviceTriggerDiscover;
    private getBridgeEntity;
    parseActionValue(action: string): ActionData;
    private buildAction;
    private prepareActionEventTypes;
    private parseGroupsFromRegex;
    private getActionValueTemplate;
}
export default HomeAssistant;
//# sourceMappingURL=homeassistant.d.ts.map