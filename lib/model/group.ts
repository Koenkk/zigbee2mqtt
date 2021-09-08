/* eslint-disable brace-style */
import * as settings from '../util/settings';
// @ts-ignore
import zhc from 'zigbee-herdsman-converters';

export default class Device {
    private group: ZHGroup;

    get zhGroup(): ZHGroup {return this.group;}
    get ID(): number {return this.group.groupID;}
    get settings(): GroupSettings {return settings.getGroup(this.ID);}
    get name(): string {return this.settings.friendlyName;}
    get members(): ZHEndpoint[] {return this.group.members;}

    constructor(group: ZHGroup) {
        this.group = group;
    }

    membersDefinitions(): Definition[] {
        return this.members.map((m) => zhc.findByDevice(m.getDevice())).filter((d) => d) as Definition[];
    }

    membersIeeeAddr(): string[] {
        return this.members.map((m) => m.getDevice().ieeeAddr);
    }
}
