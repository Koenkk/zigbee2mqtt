import Extension from "./extension";
export default class Receive extends Extension {
    private elapsed;
    private debouncers;
    private throttlers;
    start(): Promise<void>;
    /**
     * Frames that zigbee-herdsman does not emit as a message (e.g. default responses) only fire a
     * lastSeenChanged event. For devices with debounce or throttle set, publish those through the same
     * per-device debounce/throttle as regular messages instead of publishing the full state right away.
     * See `utils.publishLastSeen()`, which skips them for these devices.
     */
    onLastSeenChanged(data: eventdata.LastSeenChanged): Promise<void>;
    onPublishEntityState(data: eventdata.PublishEntityState): void;
    publishDebounce(device: Device, payload: KeyValue, time: number, debounceIgnore: string[] | undefined): void;
    publishThrottle(device: Device, payload: KeyValue, time: number): Promise<void>;
    isPayloadConflicted(newPayload: KeyValue, oldPayload: KeyValue, debounceIgnore: string[] | undefined): boolean;
    onDeviceMessage(data: eventdata.DeviceMessage): Promise<void>;
}
//# sourceMappingURL=receive.d.ts.map