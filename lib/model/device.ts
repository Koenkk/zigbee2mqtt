/* eslint-disable brace-style */
import * as settings from '../util/settings';
// @ts-ignore
import zhc from 'zigbee-herdsman-converters';

export default class Device {
    private device: ZHDevice;
    private _definition: Definition;

    get zhDevice(): ZHDevice {return this.device;}
    get ieeeAddr(): string {return this.device.ieeeAddr;}
    get ID(): string {return this.device.ieeeAddr;}
    get settings(): DeviceSettings {return settings.getDevice(this.ieeeAddr);}
    get name(): string {return this.settings.friendlyName;}
    get lastSeen(): number {return this.device.lastSeen;}
    get interviewing(): boolean {return this.device.interviewing;}
    get type(): 'Coordinator' | 'Router' | 'EndDevice' | 'Unknown' | 'GreenPower' {return this.device.type;}
    get powerSource(): string {return this.device.powerSource;}
    get definition(): Definition | undefined {
        if (!this._definition && !this.device.interviewing) {
            this._definition = zhc.findByDevice(this.device);
        }
        return this._definition;
    }

    constructor(device: ZHDevice) {
        this.device = device;
    }

    async ping(disableRecovery: boolean): Promise<void> {await this.device.ping(disableRecovery);}
    async removeFromNetwork(): Promise<void> {await this.device.removeFromNetwork();}

    endpoint(key?: string): ZHEndpoint {
        let endpoint: ZHEndpoint;
        if (key == null) key = 'default';

        if (this.definition?.endpoint) {
            const ID = this.definition?.endpoint?.(this.device)[key];
            if (ID) endpoint = this.device.getEndpoint(ID);
            else if (key === 'default') endpoint = this.device.endpoints[0];
            else return null;
        } else {
            if (key !== 'default') return null;
            endpoint = this.device.endpoints[0];
        }

        return endpoint;
    }
}
