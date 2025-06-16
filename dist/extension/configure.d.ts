import Extension from "./extension";
/**
 * This extension calls the zigbee-herdsman-converters definition configure() method
 */
export default class Configure extends Extension {
    private configuring;
    private attempts;
    private topic;
    private onReconfigure;
    private onMQTTMessage;
    start(): Promise<void>;
    private configure;
}
//# sourceMappingURL=configure.d.ts.map