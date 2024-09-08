import * as zhc from 'zigbee-herdsman-converters';

import * as settings from '../util/settings';

export default class Group {
    public zh: zh.Group;
    private resolveDevice: (ieeeAddr: string) => Device | undefined;

    get ID(): number {
        return this.zh.groupID;
    }
    get options(): GroupOptions {
        // XXX: Group always exists in settings
        return {...settings.getGroup(this.ID)!};
    }
    get name(): string {
        return this.options?.friendly_name || this.ID.toString();
    }

    constructor(group: zh.Group, resolveDevice: (ieeeAddr: string) => Device | undefined) {
        this.zh = group;
        this.resolveDevice = resolveDevice;
    }

    hasMember(device: Device): boolean {
        return !!device.zh.endpoints.find((e) => this.zh.members.includes(e));
    }

    membersDevices(): Device[] {
        return this.zh.members.map((d) => this.resolveDevice(d.getDevice().ieeeAddr)!);
    }

    membersDefinitions(): zhc.Definition[] {
        const definitions: zhc.Definition[] = [];

        for (const member of this.membersDevices()) {
            /* istanbul ignore else */
            if (member.definition) {
                definitions.push(member.definition);
            }
        }

        return definitions;
    }

    isDevice(): this is Device {
        return false;
    }
    isGroup(): this is Group {
        return true;
    }
}
