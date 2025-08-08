import Extension from "./extension";
export default abstract class ExternalJSExtension<M> extends Extension {
    protected folderName: string;
    protected mqttTopic: string;
    protected requestRegex: RegExp;
    protected basePath: string;
    protected nodeModulesSymlinked: boolean;
    constructor(zigbee: Zigbee, mqtt: Mqtt, state: State, publishEntityState: PublishEntityState, eventBus: EventBus, enableDisableExtension: (enable: boolean, name: string) => Promise<void>, restartCallback: () => Promise<void>, addExtension: (extension: Extension) => Promise<void>, mqttTopic: string, folderName: string);
    /**
     * In case the external JS is not in the Z2M install dir (e.g. when `ZIGBEE2MQTT_DATA` is used), the external
     * JS cannot import from `node_modules`.
     * To workaround this create a symlink to `node_modules` in the external JS dir.
     * https://nodejs.org/api/esm.html#no-node_path
     */
    private symlinkNodeModulesIfNecessary;
    start(): Promise<void>;
    stop(): Promise<void>;
    private getFilePath;
    protected getFileCode(name: string): string;
    protected getFiles(): Generator<{
        name: string;
        code: string;
    }>;
    onMQTTMessage(data: eventdata.MQTTMessage): Promise<void>;
    protected abstract removeJS(name: string, mod: M): Promise<void>;
    protected abstract loadJS(name: string, mod: M, newName?: string): Promise<void>;
    private remove;
    private save;
    private loadFiles;
    private publishExternalJS;
    private importFile;
}
//# sourceMappingURL=externalJS.d.ts.map