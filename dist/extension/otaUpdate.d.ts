import Extension from "./extension";
type UpdateState = "updating" | "idle" | "available" | "scheduled";
export interface UpdatePayload {
    update: {
        progress?: number;
        remaining?: number;
        state: UpdateState;
        installed_version: number | null;
        latest_version: number | null;
        latest_source: string | null;
        latest_release_notes: string | null;
    };
}
export default class OTAUpdate extends Extension {
    #private;
    start(): Promise<void>;
    clearState(): void;
    private onZigbeeEvent;
    onMQTTMessage(data: eventdata.MQTTMessage): Promise<void>;
}
export {};
//# sourceMappingURL=otaUpdate.d.ts.map