import Extension from "./extension";
export default class Receive extends Extension {
    private elapsed;
    private debouncers;
    private throttlers;
    start(): Promise<void>;
    onPublishEntityState(data: eventdata.PublishEntityState): void;
    publishDebounce(device: Device, payload: KeyValue, time: number, debounceIgnore: string[] | undefined): void;
    publishThrottle(device: Device, payload: KeyValue, time: number): Promise<void>;
    isPayloadConflicted(newPayload: KeyValue, oldPayload: KeyValue, debounceIgnore: string[] | undefined): boolean;
    onDeviceMessage(data: eventdata.DeviceMessage): Promise<void>;
}
//# sourceMappingURL=receive.d.ts.map