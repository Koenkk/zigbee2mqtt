/* eslint-disable brace-style */
import * as settings from '../util/settings';
// @ts-ignore
import zhc from 'zigbee-herdsman-converters';

export default class Device {
    private device: zh.Device;
    private _definition: Definition;

    get endpoints(): zh.Endpoint[] {return this.device.endpoints;}
    get zhDevice(): zh.Device {return this.device;}
    get zh(): zh.Device {return this.device;}
    get ieeeAddr(): string {return this.device.ieeeAddr;}
    get ID(): string {return this.device.ieeeAddr;}
    get settings(): DeviceSettings {return {...settings.get().device_options, ...settings.getDevice(this.ieeeAddr)};}
    get name(): string {
        return this.type === 'Coordinator' ? 'Coordinator' : this.settings?.friendlyName || this.ieeeAddr;}
    get lastSeen(): number {return this.device.lastSeen;}
    get modelID(): string {return this.device.modelID;}
    get softwareBuildID(): string {return this.device.softwareBuildID;}
    get dateCode(): string {return this.device.dateCode;}
    get interviewCompleted(): boolean {return this.device.interviewCompleted;}
    get networkAddress(): number {return this.device.networkAddress;}
    get manufacturerName(): string {return this.device.manufacturerName;}
    get interviewing(): boolean {return this.device.interviewing;}
    get type(): 'Coordinator' | 'Router' | 'EndDevice' | 'Unknown' | 'GreenPower' {return this.device.type;}
    get powerSource(): string {return this.device.powerSource;}
    get definition(): Definition | undefined {
        if (!this._definition && !this.device.interviewing) {
            this._definition = zhc.findByDevice(this.device);
        }
        return this._definition;
    }

    constructor(device: zh.Device) {
        this.device = device;

        if (device.type !== 'Coordinator' && !settings.getDevice(device.ieeeAddr)) {
            settings.addDevice(device.ieeeAddr);
        }
    }

    async ping(disableRecovery: boolean): Promise<void> {await this.device.ping(disableRecovery);}
    async removeFromNetwork(): Promise<void> {await this.device.removeFromNetwork();}

    endpoint(key?: string | number): zh.Endpoint {
        let endpoint: zh.Endpoint;
        if (key == null || key == '') key = 'default';

        if (!isNaN(Number(key))) {
            endpoint = this.zhDevice.getEndpoint(Number(key));
        } else if (this.definition?.endpoint) {
            const ID = this.definition?.endpoint?.(this.device)[key];
            if (ID) endpoint = this.device.getEndpoint(ID);
            else if (key === 'default') endpoint = this.device.endpoints[0];
            else return null;
        } else {
            /* istanbul ignore next */
            if (key !== 'default') return null;
            endpoint = this.device.endpoints[0];
        }

        return endpoint;
    }

    endpointName(endpoint: zh.Endpoint): string {
        let name = null;
        if (this.definition?.endpoint) {
            name = Object.entries(this.definition?.endpoint(this.device)).find((e) => e[1] == endpoint.ID)[0];
        }
        /* istanbul ignore next */
        return name === 'default' ? null : name;
    }

    isXiaomiDevice(): boolean {
        const xiaomiManufacturerID = [4151, 4447];
        /* istanbul ignore next */
        return this.zhDevice.modelID !== 'lumi.router' && xiaomiManufacturerID.includes(this.zhDevice.manufacturerID) &&
            (!this.zhDevice.manufacturerName || !this.zhDevice.manufacturerName.startsWith('Trust'));
    }

    isRouter(): boolean {return this.zhDevice.type === 'Router';}
    lqi(): Promise<zh.LQI> {return this.zhDevice.lqi();}
    routingTable(): Promise<zh.RoutingTable> {return this.zhDevice.routingTable();}

    isDevice(): this is Device {return true;}
    /* istanbul ignore next */
    isGroup(): this is Group {return false;}
}
