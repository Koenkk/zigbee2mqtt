/* eslint-disable brace-style */
import * as settings from '../util/settings';
import * as zhc from 'zigbee-herdsman-converters';
import {CustomClusters} from 'zigbee-herdsman/dist/zspec/zcl/definition/tstype';

export default class Device {
    public zh: zh.Device;
    public definition: zhc.Definition;
    private _definitionModelID: string;

    get ieeeAddr(): string {return this.zh.ieeeAddr;}
    get ID(): string {return this.zh.ieeeAddr;}
    get options(): DeviceOptions {return {...settings.get().device_options, ...settings.getDevice(this.ieeeAddr)};}
    get name(): string {
        return this.zh.type === 'Coordinator' ? 'Coordinator' : this.options?.friendly_name || this.ieeeAddr;
    }
    get isSupported(): boolean {
        return this.zh.type === 'Coordinator' || (this.definition && !this.definition.generated);
    }
    get customClusters(): CustomClusters {
        return this.zh.customClusters;
    }

    constructor(device: zh.Device) {
        this.zh = device;
    }

    exposes(): zhc.Expose[] {
        /* istanbul ignore if */
        if (typeof this.definition.exposes == 'function') {
            const options: KeyValue = this.options;
            return this.definition.exposes(this.zh, options);
        } else {
            return this.definition.exposes;
        }
    }

    async resolveDefinition(): Promise<void> {
        if (!this.zh.interviewing && (!this.definition || this._definitionModelID !== this.zh.modelID)) {
            this.definition = await zhc.findByDevice(this.zh, true);
            this._definitionModelID = this.zh.modelID;
        }
    }

    ensureInSettings(): void {
        if (this.zh.type !== 'Coordinator' && !settings.getDevice(this.zh.ieeeAddr)) {
            settings.addDevice(this.zh.ieeeAddr);
        }
    }

    endpoint(key?: string | number): zh.Endpoint {
        let endpoint: zh.Endpoint;
        if (key == null || key == '') key = 'default';

        if (!isNaN(Number(key))) {
            endpoint = this.zh.getEndpoint(Number(key));
        } else if (this.definition?.endpoint) {
            const ID = this.definition?.endpoint?.(this.zh)[key];
            if (ID) endpoint = this.zh.getEndpoint(ID);
            else if (key === 'default') endpoint = this.zh.endpoints[0];
            else return null;
        } else {
            /* istanbul ignore next */
            if (key !== 'default') return null;
            endpoint = this.zh.endpoints[0];
        }

        return endpoint;
    }

    endpointName(endpoint: zh.Endpoint): string {
        let epName = null;
        if (this.definition?.endpoint) {
            const mapping = this.definition?.endpoint(this.zh);
            for (const [name, id] of Object.entries(mapping)) {
                if (id == endpoint.ID) {
                    epName = name;
                }
            }
        }
        /* istanbul ignore next */
        return epName === 'default' ? null : epName;
    }

    getEndpointNames(): string[] {
        return Object.keys(this.definition?.endpoint?.(this.zh) ?? {}).filter((name) => name !== 'default');
    }

    isIkeaTradfri(): boolean {return this.zh.manufacturerID === 4476;}

    isDevice(): this is Device {return true;}
    /* istanbul ignore next */
    isGroup(): this is Group {return false;}
}
