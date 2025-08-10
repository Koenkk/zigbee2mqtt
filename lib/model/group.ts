import type * as zhc from "zigbee-herdsman-converters";
import * as settings from "../util/settings";
import {DEFAULT_BIND_GROUP_ID} from "../util/utils";

export default class Group {
    public zh: zh.Group;
    private resolveDevice: (ieeeAddr: string) => Device | undefined;

    // biome-ignore lint/style/useNamingConvention: API
    get ID(): number {
        return this.zh.groupID;
    }
    get options(): GroupOptions {
        // biome-ignore lint/style/noNonNullAssertion: Group always exists in settings
        return {...settings.getGroup(this.ID)!};
    }
    get name(): string {
        return this.options?.friendly_name || this.ID.toString();
    }

    constructor(group: zh.Group, resolveDevice: (ieeeAddr: string) => Device | undefined) {
        this.zh = group;
        this.resolveDevice = resolveDevice;
    }

    ensureInSettings(): void {
        if (this.ID !== DEFAULT_BIND_GROUP_ID && !settings.getGroup(this.ID)) {
            settings.addGroup(this.name, this.ID.toString());
        }
    }

    hasMember(device: Device): boolean {
        return !!device.zh.endpoints.find((e) => this.zh.members.includes(e));
    }

    *membersDevices(): Generator<Device> {
        for (const member of this.zh.members) {
            const resolvedDevice = this.resolveDevice(member.deviceIeeeAddress);

            if (resolvedDevice) {
                yield resolvedDevice;
            }
        }
    }

    membersDefinitions(): zhc.Definition[] {
        const definitions: zhc.Definition[] = [];

        for (const member of this.membersDevices()) {
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
