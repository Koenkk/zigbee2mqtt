import type Extension from "./extension";
import ExternalJSExtension from "./externalJS";
type TModule = new (...args: ConstructorParameters<typeof Extension>) => Extension;
export default class ExternalExtensions extends ExternalJSExtension<TModule> {
    constructor(zigbee: Zigbee, mqtt: Mqtt, state: State, publishEntityState: PublishEntityState, eventBus: EventBus, enableDisableExtension: (enable: boolean, name: string) => Promise<void>, restartCallback: () => Promise<void>, addExtension: (extension: Extension) => Promise<void>);
    protected removeJS(_name: string, mod: TModule): Promise<void>;
    protected loadJS(name: string, mod: TModule, newName?: string): Promise<void>;
}
export {};
//# sourceMappingURL=externalExtensions.d.ts.map