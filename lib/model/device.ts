/* eslint-disable brace-style */
import * as settings from '../util/settings';
import zigbeeHerdsmanConverters from 'zigbee-herdsman-converters';

export default class Device {
    public zh: zh.Device;
    private _definition: zhc.Definition;
    private _definitionModelID: string;

    get ieeeAddr(): string {return this.zh.ieeeAddr;}
    get ID(): string {return this.zh.ieeeAddr;}
    get options(): DeviceOptions {return {...settings.get().device_options, ...settings.getDevice(this.ieeeAddr)};}
    get name(): string {
        return this.zh.type === 'Coordinator' ? 'Coordinator' : this.options?.friendly_name || this.ieeeAddr;
    }
    get definition(): zhc.Definition {
        // Some devices can change modelID, reconsider the definition in that case.
        // https://github.com/Koenkk/zigbee-herdsman-converters/issues/3016
        if (!this.zh.interviewing && (!this._definition || this._definitionModelID !== this.zh.modelID)) {
            this._definition = zigbeeHerdsmanConverters.findByDevice(this.zh);
            this._definitionModelID = this.zh.modelID;
        }
        return this._definition;
    }

    constructor(device: zh.Device) {
        this.zh = device;
    }

    exposes(): zhc.DefinitionExpose[] {
        /* istanbul ignore if */
        if (typeof this.definition.exposes == 'function') {
            return this.definition.exposes(this.zh, this.options);
        } else {
            return this.definition.exposes;
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
        let name = null;
        if (this.definition?.endpoint) {
            name = Object.entries(this.definition?.endpoint(this.zh)).find((e) => e[1] == endpoint.ID)[0];
        }
        /* istanbul ignore next */
        return name === 'default' ? null : name;
    }

    isIkeaTradfri(): boolean {return this.zh.manufacturerID === 4476;}

    isDevice(): this is Device {return true;}
    /* istanbul ignore next */
    isGroup(): this is Group {return false;}
}
