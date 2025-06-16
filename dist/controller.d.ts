import type Extension from "./extension/extension";
import { type MqttPublishOptions } from "./mqtt";
export declare class Controller {
    private eventBus;
    private zigbee;
    private state;
    private mqtt;
    private restartCallback;
    private exitCallback;
    readonly extensions: Set<Extension>;
    readonly extensionArgs: ConstructorParameters<typeof Extension>;
    private sdNotify;
    constructor(restartCallback: () => Promise<void>, exitCallback: (code: number, restart: boolean) => Promise<void>);
    start(): Promise<void>;
    enableDisableExtension(enable: boolean, name: string): Promise<void>;
    getExtension(name: string): Extension | undefined;
    addExtension(extension: Extension): Promise<void>;
    removeExtension(extension: Extension): Promise<void>;
    private startExtension;
    private stopExtension;
    stop(restart?: boolean): Promise<void>;
    exit(code: number, restart?: boolean): Promise<void>;
    onZigbeeAdapterDisconnected(): Promise<void>;
    publishEntityState(entity: Group | Device, payload: KeyValue, stateChangeReason?: StateChangeReason): Promise<void>;
    iteratePayloadAttributeOutput(topicRoot: string, payload: KeyValue, options: Partial<MqttPublishOptions>): Promise<void>;
}
//# sourceMappingURL=controller.d.ts.map