/* eslint-disable brace-style */
import * as settings from '../util/settings';

export default class Device {
    private group: ZHGroup;

    get ID(): number {return this.group.groupID;}
    get settings(): GroupSettings {return settings.getGroup(this.ID);}
    get name(): string {return this.settings.friendlyName;}

    constructor(group: ZHGroup) {
        this.group = group;
    }
}
