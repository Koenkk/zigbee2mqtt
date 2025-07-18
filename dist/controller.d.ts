import EventBus from "./eventBus";
import type Extension from "./extension/extension";
import Mqtt, { type MqttPublishOptions } from "./mqtt";
import State from "./state";
import Zigbee from "./zigbee";
export declare class Controller {
    readonly eventBus: EventBus;
    readonly zigbee: Zigbee;
    readonly state: State;
    readonly mqtt: Mqtt;
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
    stop(restart?: boolean, code?: number): Promise<void>;
    exit(code: number, restart?: boolean): Promise<void>;
    onZigbeeAdapterDisconnected(): Promise<void>;
    publishEntityState(entity: Group | Device, payload: KeyValue, stateChangeReason?: StateChangeReason): Promise<void>;
    iteratePayloadAttributeOutput(topicRoot: string, payload: KeyValue, options: Partial<MqttPublishOptions>): Promise<void>;
}
//# sourceMappingURL=controller.d.ts.map