type ListenerKey = object;
type Stats = {
    devices: Map<string, // IEEE address
    {
        lastSeenChanges?: {
            messages: number;
            first: number;
        };
        leaveCounts: number;
        networkAddressChanges: number;
    }>;
    mqtt: {
        published: number;
        received: number;
    };
};
export default class EventBus {
    private callbacksByExtension;
    private emitter;
    readonly stats: Stats;
    constructor();
    emitAdapterDisconnected(): void;
    onAdapterDisconnected(key: ListenerKey, callback: () => void): void;
    emitPermitJoinChanged(data: eventdata.PermitJoinChanged): void;
    onPermitJoinChanged(key: ListenerKey, callback: (data: eventdata.PermitJoinChanged) => void): void;
    emitEntityRenamed(data: eventdata.EntityRenamed): void;
    onEntityRenamed(key: ListenerKey, callback: (data: eventdata.EntityRenamed) => void): void;
    emitEntityRemoved(data: eventdata.EntityRemoved): void;
    onEntityRemoved(key: ListenerKey, callback: (data: eventdata.EntityRemoved) => void): void;
    emitLastSeenChanged(data: eventdata.LastSeenChanged): void;
    onLastSeenChanged(key: ListenerKey, callback: (data: eventdata.LastSeenChanged) => void): void;
    emitDeviceNetworkAddressChanged(data: eventdata.DeviceNetworkAddressChanged): void;
    onDeviceNetworkAddressChanged(key: ListenerKey, callback: (data: eventdata.DeviceNetworkAddressChanged) => void): void;
    emitDeviceAnnounce(data: eventdata.DeviceAnnounce): void;
    onDeviceAnnounce(key: ListenerKey, callback: (data: eventdata.DeviceAnnounce) => void): void;
    emitDeviceInterview(data: eventdata.DeviceInterview): void;
    onDeviceInterview(key: ListenerKey, callback: (data: eventdata.DeviceInterview) => void): void;
    emitDeviceJoined(data: eventdata.DeviceJoined): void;
    onDeviceJoined(key: ListenerKey, callback: (data: eventdata.DeviceJoined) => void): void;
    emitEntityOptionsChanged(data: eventdata.EntityOptionsChanged): void;
    onEntityOptionsChanged(key: ListenerKey, callback: (data: eventdata.EntityOptionsChanged) => void): void;
    emitExposesChanged(data: eventdata.ExposesChanged): void;
    onExposesChanged(key: ListenerKey, callback: (data: eventdata.ExposesChanged) => void): void;
    emitDeviceLeave(data: eventdata.DeviceLeave): void;
    onDeviceLeave(key: ListenerKey, callback: (data: eventdata.DeviceLeave) => void): void;
    emitDeviceMessage(data: eventdata.DeviceMessage): void;
    onDeviceMessage(key: ListenerKey, callback: (data: eventdata.DeviceMessage) => void): void;
    emitMQTTMessage(data: eventdata.MQTTMessage): void;
    onMQTTMessage(key: ListenerKey, callback: (data: eventdata.MQTTMessage) => void): void;
    emitMQTTMessagePublished(data: eventdata.MQTTMessagePublished): void;
    onMQTTMessagePublished(key: ListenerKey, callback: (data: eventdata.MQTTMessagePublished) => void): void;
    emitPublishEntityState(data: eventdata.PublishEntityState): void;
    onPublishEntityState(key: ListenerKey, callback: (data: eventdata.PublishEntityState) => void): void;
    emitGroupMembersChanged(data: eventdata.GroupMembersChanged): void;
    onGroupMembersChanged(key: ListenerKey, callback: (data: eventdata.GroupMembersChanged) => void): void;
    emitDevicesChanged(): void;
    onDevicesChanged(key: ListenerKey, callback: () => void): void;
    emitScenesChanged(data: eventdata.ScenesChanged): void;
    onScenesChanged(key: ListenerKey, callback: (data: eventdata.ScenesChanged) => void): void;
    emitReconfigure(data: eventdata.Reconfigure): void;
    onReconfigure(key: ListenerKey, callback: (data: eventdata.Reconfigure) => void): void;
    emitStateChange(data: eventdata.StateChange): void;
    onStateChange(key: ListenerKey, callback: (data: eventdata.StateChange) => void): void;
    emitExposesAndDevicesChanged(device: Device): void;
    private on;
    removeListeners(key: ListenerKey): void;
}
export {};
//# sourceMappingURL=eventBus.d.ts.map