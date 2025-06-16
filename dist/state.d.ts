declare class State {
    private readonly eventBus;
    private readonly zigbee;
    private readonly state;
    private readonly file;
    private timer?;
    constructor(eventBus: EventBus, zigbee: Zigbee);
    start(): void;
    stop(): void;
    clear(): void;
    private load;
    private save;
    exists(entity: Device | Group): boolean;
    get(entity: Group | Device): KeyValue;
    set(entity: Group | Device, update: KeyValue, reason?: string): KeyValue;
    remove(id: string | number): boolean;
}
export default State;
//# sourceMappingURL=state.d.ts.map