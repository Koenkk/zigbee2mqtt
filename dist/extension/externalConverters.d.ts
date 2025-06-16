import type { ExternalDefinitionWithExtend } from "zigbee-herdsman-converters";
import ExternalJSExtension from "./externalJS";
type TModule = ExternalDefinitionWithExtend | ExternalDefinitionWithExtend[];
export default class ExternalConverters extends ExternalJSExtension<TModule> {
    constructor(zigbee: Zigbee, mqtt: Mqtt, state: State, publishEntityState: PublishEntityState, eventBus: EventBus, enableDisableExtension: (enable: boolean, name: string) => Promise<void>, restartCallback: () => Promise<void>, addExtension: (extension: Extension) => Promise<void>);
    protected removeJS(name: string, _mod: TModule): Promise<void>;
    protected loadJS(name: string, mod: TModule, newName?: string): Promise<void>;
}
export {};
//# sourceMappingURL=externalConverters.d.ts.map