/* eslint-disable brace-style */
import * as settings from '../util/settings';
import zigbeeHerdsmanConverters from 'zigbee-herdsman-converters';

export default class Device {
    public zh: zh.Device;
    private _definition: zhc.Definition;

    get ieeeAddr(): string {return this.zh.ieeeAddr;}
    get ID(): string {return this.zh.ieeeAddr;}
    get options(): DeviceOptions {return {...settings.get().device_options, ...settings.getDevice(this.ieeeAddr)};}
    get name(): string {
        return this.zh.type === 'Coordinator' ? 'Coordinator' : this.options?.friendly_name || this.ieeeAddr;
    }
    get definition(): zhc.Definition {
        if (!this._definition && !this.zh.interviewing) {
            this._definition = zigbeeHerdsmanConverters.findByDevice(this.zh);
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

    isXiaomi(): boolean {
        const xiaomiManufacturerID = [4151, 4447];
        /* istanbul ignore next */
        return this.zh.modelID !== 'lumi.router' && xiaomiManufacturerID.includes(this.zh.manufacturerID) &&
            (!this.zh.manufacturerName || !this.zh.manufacturerName.startsWith('Trust'));
    }

    isIkeaTradfri(): boolean {return this.zh.manufacturerID === 4476;}

    isDevice(): this is Device {return true;}
    /* istanbul ignore next */
    isGroup(): this is Group {return false;}
}
