import type * as zhc from "zigbee-herdsman-converters";
export default class Group {
    zh: zh.Group;
    private resolveDevice;
    get ID(): number;
    get options(): GroupOptions;
    get name(): string;
    constructor(group: zh.Group, resolveDevice: (ieeeAddr: string) => Device | undefined);
    ensureInSettings(): void;
    hasMember(device: Device): boolean;
    membersDevices(): Generator<Device>;
    membersDefinitions(): zhc.Definition[];
    isDevice(): this is Device;
    isGroup(): this is Group;
}
//# sourceMappingURL=group.d.ts.map