import Extension from "./extension";
export default class Groups extends Extension {
    #private;
    private lastOptimisticState;
    start(): Promise<void>;
    onStateChange(data: eventdata.StateChange): Promise<void>;
    private shouldPublishPayloadForGroup;
    private areAllMembersOffOrClosed;
    private parseMQTTMessage;
    private onMQTTMessage;
    private publishResponse;
}
//# sourceMappingURL=groups.d.ts.map