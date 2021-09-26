/* eslint-disable brace-style */
import * as settings from '../util/settings';
// @ts-ignore
import zhc from 'zigbee-herdsman-converters';

export default class Group {
    public zh: zh.Group;

    get ID(): number {return this.zh.groupID;}
    get settings(): GroupSettings {return settings.getGroup(this.ID);}
    get name(): string {return this.settings?.friendlyName || this.ID.toString();}

    constructor(group: zh.Group) {
        this.zh = group;
    }

    membersDefinitions(): Definition[] {
        return this.zh.members.map((m) => zhc.findByDevice(m.getDevice())).filter((d) => d) as Definition[];
    }

    membersIeeeAddr(): string[] {
        return this.zh.members.map((m) => m.getDevice().ieeeAddr);
    }

    isDevice(): this is Device {return false;}
    isGroup(): this is Group {return true;}
}
