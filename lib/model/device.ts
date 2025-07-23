import assert from "node:assert";
import {InterviewState} from "zigbee-herdsman/dist/controller/model/device";
import type {CustomClusters} from "zigbee-herdsman/dist/zspec/zcl/definition/tstype";
import * as zhc from "zigbee-herdsman-converters";
import {access, Numeric} from "zigbee-herdsman-converters";

import * as settings from "../util/settings";

const LINKQUALITY = new Numeric("linkquality", access.STATE)
    .withUnit("lqi")
    .withDescription("Link quality (signal strength)")
    .withValueMin(0)
    .withValueMax(255)
    .withCategory("diagnostic");

export default class Device {
    public zh: zh.Device;
    public definition?: zhc.Definition;
    private _definitionModelID?: string;

    get ieeeAddr(): string {
        return this.zh.ieeeAddr;
    }
    // biome-ignore lint/style/useNamingConvention: API
    get ID(): string {
        return this.zh.ieeeAddr;
    }
    get options(): DeviceOptionsWithId {
        const deviceOptions = settings.getDevice(this.ieeeAddr) ?? {friendly_name: this.ieeeAddr, ID: this.ieeeAddr};
        return {...settings.get().device_options, ...deviceOptions};
    }
    get name(): string {
        return this.zh.type === "Coordinator" ? "Coordinator" : this.options?.friendly_name;
    }
    get isSupported(): boolean {
        return this.zh.type === "Coordinator" || Boolean(this.definition && !this.definition.generated);
    }
    get customClusters(): CustomClusters {
        return this.zh.customClusters;
    }
    get otaExtraMetas(): zhc.Ota.ExtraMetas {
        return typeof this.definition?.ota === "object" ? this.definition.ota : {};
    }
    get interviewed(): boolean {
        return this.zh.interviewState === InterviewState.Successful || this.zh.interviewState === InterviewState.Failed;
    }

    constructor(device: zh.Device) {
        this.zh = device;
    }

    exposes(): zhc.Expose[] {
        const exposes: zhc.Expose[] = [];
        assert(this.definition, "Cannot retreive exposes before definition is resolved");
        if (typeof this.definition.exposes === "function") {
            const options: KeyValue = this.options;
            exposes.push(...this.definition.exposes(this.zh, options));
        } else {
            exposes.push(...this.definition.exposes);
        }
        exposes.push(LINKQUALITY);
        return exposes;
    }

    async resolveDefinition(ignoreCache = false): Promise<void> {
        if (this.interviewed && (!this.definition || this._definitionModelID !== this.zh.modelID || ignoreCache)) {
            this.definition = await zhc.findByDevice(this.zh, true);
            this._definitionModelID = this.zh.modelID;
        }
    }

    ensureInSettings(): void {
        if (this.zh.type !== "Coordinator" && !settings.getDevice(this.zh.ieeeAddr)) {
            settings.addDevice(this.zh.ieeeAddr);
        }
    }

    endpoint(key?: string | number): zh.Endpoint | undefined {
        if (!key) {
            key = "default";
        } else if (!Number.isNaN(Number(key))) {
            return this.zh.getEndpoint(Number(key));
        }

        if (this.definition?.endpoint) {
            const ID = this.definition.endpoint(this.zh)[key];

            if (ID) {
                return this.zh.getEndpoint(ID);
            }
        }

        return key === "default" ? this.zh.endpoints[0] : undefined;
    }

    endpointName(endpoint: zh.Endpoint): string | undefined {
        let epName: string | undefined;

        if (this.definition?.endpoint) {
            const mapping = this.definition.endpoint(this.zh);

            for (const name in mapping) {
                if (mapping[name] === endpoint.ID) {
                    epName = name;
                    break;
                }
            }
        }

        /* v8 ignore next */
        return epName === "default" ? undefined : epName;
    }

    getEndpointNames(): string[] {
        const names: string[] = [];

        if (this.definition?.endpoint) {
            for (const name in this.definition.endpoint(this.zh)) {
                if (name !== "default") {
                    names.push(name);
                }
            }
        }

        return names;
    }

    isDevice(): this is Device {
        return true;
    }

    isGroup(): this is Group {
        return false;
    }
}
