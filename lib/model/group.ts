/* eslint-disable brace-style */
import * as settings from '../util/settings';
import zigbeeHerdsmanConverters from 'zigbee-herdsman-converters';

export default class Group {
    public zh: zh.Group;

    get ID(): number {return this.zh.groupID;}
    get options(): GroupOptions {return {...settings.getGroup(this.ID)};}
    get name(): string {return this.options?.friendly_name || this.ID.toString();}

    constructor(group: zh.Group) {
        this.zh = group;
    }

    membersDefinitions(): zhc.Definition[] {
        return this.zh.members.map((m) =>
            zigbeeHerdsmanConverters.findByDevice(m.getDevice())).filter((d) => d) as zhc.Definition[];
    }

    isDevice(): this is Device {return false;}
    isGroup(): this is Group {return true;}
}
