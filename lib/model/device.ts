import assert from 'assert';

import * as zhc from 'zigbee-herdsman-converters';
import {CustomClusters} from 'zigbee-herdsman/dist/zspec/zcl/definition/tstype';

import * as settings from '../util/settings';

export default class Device {
    public zh: zh.Device;
    public definition?: zhc.Definition;
    private _definitionModelID?: string;

    get ieeeAddr(): string {
        return this.zh.ieeeAddr;
    }
    get ID(): string {
        return this.zh.ieeeAddr;
    }
    get options(): DeviceOptionsWithId {
        const deviceOptions = settings.getDevice(this.ieeeAddr) ?? {friendly_name: this.ieeeAddr, ID: this.ieeeAddr};
        return {...settings.get().device_options, ...deviceOptions};
    }
    get name(): string {
        return this.zh.type === 'Coordinator' ? 'Coordinator' : this.options?.friendly_name;
    }
    get isSupported(): boolean {
        return this.zh.type === 'Coordinator' || Boolean(this.definition && !this.definition.generated);
    }
    get customClusters(): CustomClusters {
        return this.zh.customClusters;
    }

    constructor(device: zh.Device) {
        this.zh = device;
    }

    exposes(): zhc.Expose[] {
        assert(this.definition, 'Cannot retreive exposes before definition is resolved');
        /* istanbul ignore if */
        if (typeof this.definition.exposes == 'function') {
            const options: KeyValue = this.options;
            return this.definition.exposes(this.zh, options);
        } else {
            return this.definition.exposes;
        }
    }

    async resolveDefinition(ignoreCache = false): Promise<void> {
        if (!this.zh.interviewing && (!this.definition || this._definitionModelID !== this.zh.modelID || ignoreCache)) {
            this.definition = await zhc.findByDevice(this.zh, true);
            this._definitionModelID = this.zh.modelID;
        }
    }

    ensureInSettings(): void {
        if (this.zh.type !== 'Coordinator' && !settings.getDevice(this.zh.ieeeAddr)) {
            settings.addDevice(this.zh.ieeeAddr);
        }
    }

    endpoint(key?: string | number): zh.Endpoint | undefined {
        let endpoint: zh.Endpoint | undefined;

        if (key == null || key == '') {
            key = 'default';
        }

        if (!isNaN(Number(key))) {
            endpoint = this.zh.getEndpoint(Number(key));
        } else if (this.definition?.endpoint) {
            const ID = this.definition?.endpoint?.(this.zh)[key];

            if (ID) {
                endpoint = this.zh.getEndpoint(ID);
            } else if (key === 'default') {
                endpoint = this.zh.endpoints[0];
            } else {
                return undefined;
            }
        } else {
            /* istanbul ignore next */
            if (key !== 'default') {
                return undefined;
            }

            endpoint = this.zh.endpoints[0];
        }

        return endpoint;
    }

    endpointName(endpoint: zh.Endpoint): string | undefined {
        let epName = undefined;

        if (this.definition?.endpoint) {
            const mapping = this.definition?.endpoint(this.zh);
            for (const [name, id] of Object.entries(mapping)) {
                if (id == endpoint.ID) {
                    epName = name;
                }
            }
        }

        /* istanbul ignore next */
        return epName === 'default' ? undefined : epName;
    }

    getEndpointNames(): string[] {
        const names: string[] = [];

        for (const name in this.definition?.endpoint?.(this.zh) ?? {}) {
            if (name !== 'default') {
                names.push(name);
            }
        }

        return names;
    }

    isIkeaTradfri(): boolean {
        return this.zh.manufacturerID === 4476;
    }

    isDevice(): this is Device {
        return true;
    }
    /* istanbul ignore next */
    isGroup(): this is Group {
        return false;
    }
}
