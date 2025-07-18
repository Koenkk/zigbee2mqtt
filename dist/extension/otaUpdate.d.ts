import Extension from "./extension";
type UpdateState = "updating" | "idle" | "available" | "scheduled";
export interface UpdatePayload {
    update: {
        progress?: number;
        remaining?: number;
        state: UpdateState;
        installed_version: number | null;
        latest_version: number | null;
    };
}
export default class OTAUpdate extends Extension {
    #private;
    private inProgress;
    private lastChecked;
    private scheduledUpgrades;
    private scheduledDowngrades;
    start(): Promise<void>;
    private removeProgressAndRemainingFromState;
    private onZigbeeEvent;
    private readSoftwareBuildIDAndDateCode;
    private getEntityPublishPayload;
    onMQTTMessage(data: eventdata.MQTTMessage): Promise<void>;
}
export {};
//# sourceMappingURL=otaUpdate.d.ts.map