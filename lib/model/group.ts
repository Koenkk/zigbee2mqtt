/* eslint-disable brace-style */
import * as settings from '../util/settings';
import zigbeeHerdsmanConverters from 'zigbee-herdsman-converters';

export default class Group {
    public zh: zh.Group;
    private resolveDevice: (ieeeAddr: string) => Device;

    get ID(): number {return this.zh.groupID;}
    get options(): GroupOptions {return {...settings.getGroup(this.ID)};}
    get name(): string {return this.options?.friendly_name || this.ID.toString();}

    constructor(group: zh.Group, resolveDevice: (ieeeAddr: string) => Device) {
        this.zh = group;
        this.resolveDevice = resolveDevice;
    }

    hasMember(device: Device): boolean {
        return !!device.zh.endpoints.find((e) => this.zh.members.includes(e));
    }

    membersDevices(): Device[] {
        return this.zh.members.map((e) => this.resolveDevice(e.getDevice().ieeeAddr)).filter((d) => d);
    }

    membersDefinitions(): zhc.Definition[] {
        return this.zh.members.map((m) =>
            zigbeeHerdsmanConverters.findByDevice(m.getDevice())).filter((d) => d) as zhc.Definition[];
    }

    isDevice(): this is Device {return false;}
    isGroup(): this is Group {return true;}
}
