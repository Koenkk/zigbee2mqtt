import Extension from "./extension";
/**
 * This extension calls the zigbee-herdsman-converters onEvent.
 */
export default class OnEvent extends Extension {
    #private;
    start(): Promise<void>;
    stop(): Promise<void>;
    private callOnEvent;
}
//# sourceMappingURL=onEvent.d.ts.map