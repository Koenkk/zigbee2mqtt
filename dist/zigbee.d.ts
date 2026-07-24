import { Controller } from "zigbee-herdsman";
import Device from "./model/device";
import Group from "./model/group";
export default class Zigbee {
    #private;
    private eventBus;
    private groupLookup;
    private deviceLookup;
    private coordinatorIeeeAddr;
    constructor(eventBus: EventBus);
    get zhController(): Controller;
    start(abortSignal: AbortSignal): Promise<boolean>;
    private logDeviceInterview;
    private generateNetworkKey;
    private generateExtPanID;
    private generatePanID;
    getCoordinatorVersion(): Promise<zh.CoordinatorVersion>;
    isStopping(): boolean;
    backup(): Promise<void>;
    coordinatorCheck(): Promise<{
        missingRouters: Device[];
    }>;
    getNetworkParameters(): Promise<zh.NetworkParameters>;
    stop(): Promise<void>;
    getPermitJoin(): boolean;
    getPermitJoinEnd(): number | undefined;
    permitJoin(time: number, device?: Device): Promise<void>;
    resolveDevicesDefinitions(ignoreCache?: boolean, abortSignal?: AbortSignal | undefined): Promise<void>;
    private resolveDevice;
    private resolveGroup;
    resolveEntity(key: string | number | zh.Device): Device | Group | undefined;
    resolveEntityAndEndpoint(id: string): {
        ID: string;
        entity: Device | Group | undefined;
        endpointID?: string;
        endpoint?: zh.Endpoint;
    };
    firstCoordinatorEndpoint(): zh.Endpoint;
    devicesAndGroupsIterator(devicePredicate?: (value: zh.Device) => boolean, groupPredicate?: (value: zh.Group) => boolean): Generator<Device | Group>;
    groupsIterator(predicate?: (value: zh.Group) => boolean): Generator<Group>;
    devicesIterator(predicate?: (value: zh.Device) => boolean): Generator<Device>;
    private acceptJoiningDeviceHandler;
    touchlinkFactoryResetFirst(): Promise<boolean>;
    touchlinkFactoryReset(ieeeAddr: string, channel: number): Promise<boolean>;
    addInstallCode(installCode: string): Promise<void>;
    touchlinkIdentify(ieeeAddr: string, channel: number): Promise<void>;
    touchlinkScan(): Promise<{
        ieeeAddr: string;
        channel: number;
    }[]>;
    createGroup(id: number): Group;
    deviceByNetworkAddress(networkAddress: number): Device | undefined;
    groupByID(id: number): Group | undefined;
    removeDeviceFromLookup(ieee: string): boolean;
    removeGroupFromLookup(id: number): boolean;
}
//# sourceMappingURL=zigbee.d.ts.map