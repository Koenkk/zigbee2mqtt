import {randomInt} from "node:crypto";
import bind from "bind-decorator";
import stringify from "json-stable-stringify-without-jsonify";
import type {Events as ZHEvents} from "zigbee-herdsman";
import {Controller} from "zigbee-herdsman";
import type {StartResult} from "zigbee-herdsman/dist/adapter/tstype";

import Device from "./model/device";
import Group from "./model/group";
import data from "./util/data";
import logger from "./util/logger";
import * as settings from "./util/settings";
import utils from "./util/utils";

const entityIDRegex = /^(.+?)(?:\/([^/]+))?$/;

export default class Zigbee {
    private herdsman!: Controller;
    private eventBus: EventBus;
    private groupLookup = new Map<number /* group ID */, Group>();
    private deviceLookup = new Map<string /* IEEE address */, Device>();
    private coordinatorIeeeAddr!: string;

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
    }

    async start(): Promise<StartResult> {
        const infoHerdsman = await utils.getDependencyVersion("zigbee-herdsman");
        logger.info(`Starting zigbee-herdsman (${infoHerdsman.version})`);
        const panId = settings.get().advanced.pan_id;
        const extPanId = settings.get().advanced.ext_pan_id;
        const networkKey = settings.get().advanced.network_key;
        const herdsmanSettings = {
            network: {
                panID: panId === "GENERATE" ? this.generatePanID() : panId,
                extendedPanID: extPanId === "GENERATE" ? this.generateExtPanID() : extPanId,
                channelList: [settings.get().advanced.channel],
                networkKey: networkKey === "GENERATE" ? this.generateNetworkKey() : networkKey,
            },
            databasePath: data.joinPath("database.db"),
            databaseBackupPath: data.joinPath("database.db.backup"),
            backupPath: data.joinPath("coordinator_backup.json"),
            serialPort: {
                baudRate: settings.get().serial.baudrate,
                rtscts: settings.get().serial.rtscts,
                path: settings.get().serial.port,
                adapter: settings.get().serial.adapter,
            },
            adapter: {
                concurrent: settings.get().advanced.adapter_concurrent,
                delay: settings.get().advanced.adapter_delay,
                disableLED: settings.get().serial.disable_led,
                transmitPower: settings.get().advanced.transmit_power,
            },
            acceptJoiningDeviceHandler: this.acceptJoiningDeviceHandler,
        };

        logger.debug(
            () =>
                `Using zigbee-herdsman with settings: '${stringify(JSON.stringify(herdsmanSettings).replaceAll(JSON.stringify(herdsmanSettings.network.networkKey), '"HIDDEN"'))}'`,
        );

        let startResult: StartResult;
        try {
            this.herdsman = new Controller(herdsmanSettings);
            startResult = await this.herdsman.start();
        } catch (error) {
            logger.error("Error while starting zigbee-herdsman");
            throw error;
        }

        this.coordinatorIeeeAddr = this.herdsman.getDevicesByType("Coordinator")[0].ieeeAddr;
        await this.resolveDevicesDefinitions();

        this.herdsman.on("adapterDisconnected", () => this.eventBus.emitAdapterDisconnected());
        this.herdsman.on("lastSeenChanged", (data: ZHEvents.LastSeenChangedPayload) => {
            // biome-ignore lint/style/noNonNullAssertion: assumed valid
            this.eventBus.emitLastSeenChanged({device: this.resolveDevice(data.device.ieeeAddr)!, reason: data.reason});
        });
        this.herdsman.on("permitJoinChanged", (data: ZHEvents.PermitJoinChangedPayload) => {
            this.eventBus.emitPermitJoinChanged(data);
        });
        this.herdsman.on("deviceNetworkAddressChanged", (data: ZHEvents.DeviceNetworkAddressChangedPayload) => {
            // biome-ignore lint/style/noNonNullAssertion: assumed valid
            const device = this.resolveDevice(data.device.ieeeAddr)!;
            logger.debug(`Device '${device.name}' changed network address`);
            this.eventBus.emitDeviceNetworkAddressChanged({device});
        });
        this.herdsman.on("deviceAnnounce", (data: ZHEvents.DeviceAnnouncePayload) => {
            // biome-ignore lint/style/noNonNullAssertion: assumed valid
            const device = this.resolveDevice(data.device.ieeeAddr)!;
            logger.debug(`Device '${device.name}' announced itself`);
            this.eventBus.emitDeviceAnnounce({device});
        });
        this.herdsman.on("deviceInterview", async (data: ZHEvents.DeviceInterviewPayload) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            /* v8 ignore next */ if (!device) return; // Prevent potential race
            await device.resolveDefinition();
            const d = {device, status: data.status};
            this.logDeviceInterview(d);
            this.eventBus.emitDeviceInterview(d);
        });
        this.herdsman.on("deviceJoined", async (data: ZHEvents.DeviceJoinedPayload) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            /* v8 ignore next */ if (!device) return; // Prevent potential race
            await device.resolveDefinition();
            logger.info(`Device '${device.name}' joined`);
            this.eventBus.emitDeviceJoined({device});
        });
        this.herdsman.on("deviceLeave", (data: ZHEvents.DeviceLeavePayload) => {
            const name = settings.getDevice(data.ieeeAddr)?.friendly_name || data.ieeeAddr;
            logger.warning(`Device '${name}' left the network`);
            this.eventBus.emitDeviceLeave({ieeeAddr: data.ieeeAddr, name, device: this.deviceLookup.get(data.ieeeAddr)});
        });
        this.herdsman.on("message", async (data: ZHEvents.MessagePayload) => {
            // biome-ignore lint/style/noNonNullAssertion: assumed valid
            const device = this.resolveDevice(data.device.ieeeAddr)!;
            await device.resolveDefinition();
            logger.debug(() => {
                const groupId = data.groupID !== undefined ? ` with groupID ${data.groupID}` : "";
                const fromCoord = device.zh.type === "Coordinator" ? ", ignoring since it is from coordinator" : "";

                return `Received Zigbee message from '${device.name}', type '${data.type}', cluster '${data.cluster}', data '${stringify(data.data)}' from endpoint ${data.endpoint.ID}${groupId}${fromCoord}`;
            });
            if (device.zh.type === "Coordinator") return;
            this.eventBus.emitDeviceMessage({...data, device});
        });

        logger.info(`zigbee-herdsman started (${startResult})`);
        logger.info(`Coordinator firmware version: '${stringify(await this.getCoordinatorVersion())}'`);
        logger.debug(`Zigbee network parameters: ${stringify(await this.herdsman.getNetworkParameters())}`);

        for (const device of this.devicesIterator(utils.deviceNotCoordinator)) {
            // If a passlist is used, all other device will be removed from the network.
            const passlist = settings.get().passlist;
            const blocklist = settings.get().blocklist;
            const remove = async (device: Device): Promise<void> => {
                try {
                    await device.zh.removeFromNetwork();
                } catch (error) {
                    logger.error(`Failed to remove '${device.ieeeAddr}' (${(error as Error).message})`);
                }
            };

            if (passlist.length > 0) {
                if (!passlist.includes(device.ieeeAddr)) {
                    logger.warning(`Device not on passlist currently connected (${device.ieeeAddr}), removing...`);
                    await remove(device);
                }
            } else if (blocklist.includes(device.ieeeAddr)) {
                logger.warning(`Device on blocklist currently connected (${device.ieeeAddr}), removing...`);
                await remove(device);
            }
        }

        return startResult;
    }

    private logDeviceInterview(data: eventdata.DeviceInterview): void {
        const name = data.device.name;
        if (data.status === "successful") {
            logger.info(`Successfully interviewed '${name}', device has successfully been paired`);

            if (data.device.isSupported) {
                // biome-ignore lint/style/noNonNullAssertion: valid from `isSupported`
                const {vendor, description, model} = data.device.definition!;
                logger.info(`Device '${name}' is supported, identified as: ${vendor} ${description} (${model})`);
            } else {
                logger.warning(
                    `Device '${name}' with Zigbee model '${data.device.zh.modelID}' and manufacturer name '${data.device.zh.manufacturerName}' is NOT supported, please follow https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html`,
                );
            }
        } else if (data.status === "failed") {
            logger.error(`Failed to interview '${name}', device has not successfully been paired`);
        } else {
            // data.status === 'started'
            logger.info(`Starting interview of '${name}'`);
        }
    }

    private generateNetworkKey(): number[] {
        const key = Array.from({length: 16}, () => randomInt(256));
        settings.set(["advanced", "network_key"], key);
        return key;
    }

    private generateExtPanID(): number[] {
        const key = Array.from({length: 8}, () => randomInt(256));
        settings.set(["advanced", "ext_pan_id"], key);
        return key;
    }

    private generatePanID(): number {
        const panID = randomInt(1, 0xffff - 1);
        settings.set(["advanced", "pan_id"], panID);
        return panID;
    }

    async getCoordinatorVersion(): Promise<zh.CoordinatorVersion> {
        return await this.herdsman.getCoordinatorVersion();
    }

    isStopping(): boolean {
        return this.herdsman.isStopping();
    }

    async backup(): Promise<void> {
        return await this.herdsman.backup();
    }

    async coordinatorCheck(): Promise<{missingRouters: Device[]}> {
        const check = await this.herdsman.coordinatorCheck();
        // biome-ignore lint/style/noNonNullAssertion: assumed valid
        return {missingRouters: check.missingRouters.map((d) => this.resolveDevice(d.ieeeAddr)!)};
    }

    async getNetworkParameters(): Promise<zh.NetworkParameters> {
        return await this.herdsman.getNetworkParameters();
    }

    async stop(): Promise<void> {
        logger.info("Stopping zigbee-herdsman...");
        await this.herdsman.stop();
        logger.info("Stopped zigbee-herdsman");
    }

    getPermitJoin(): boolean {
        return this.herdsman.getPermitJoin();
    }

    getPermitJoinEnd(): number | undefined {
        return this.herdsman.getPermitJoinEnd();
    }

    async permitJoin(time: number, device?: Device): Promise<void> {
        if (time > 0) {
            logger.info(`Zigbee: allowing new devices to join${device ? ` via ${device.name}` : ""}.`);
        } else {
            logger.info("Zigbee: disabling joining new devices.");
        }

        await this.herdsman.permitJoin(time, device?.zh);
    }

    async resolveDevicesDefinitions(ignoreCache = false): Promise<void> {
        for (const device of this.devicesIterator(utils.deviceNotCoordinator)) {
            await device.resolveDefinition(ignoreCache);
        }
    }

    @bind private resolveDevice(ieeeAddr: string): Device | undefined {
        if (!this.deviceLookup.has(ieeeAddr)) {
            const device = this.herdsman.getDeviceByIeeeAddr(ieeeAddr);
            if (device) {
                this.deviceLookup.set(ieeeAddr, new Device(device));
            }
        }

        const device = this.deviceLookup.get(ieeeAddr);
        if (device && !device.zh.isDeleted) {
            device.ensureInSettings();
            return device;
        }
    }

    private resolveGroup(groupID: number): Group | undefined {
        if (!this.groupLookup.has(groupID)) {
            const group = this.herdsman.getGroupByID(groupID);

            if (group) {
                this.groupLookup.set(groupID, new Group(group, this.resolveDevice));
            }
        }

        const group = this.groupLookup.get(groupID);

        if (group) {
            group.ensureInSettings();
            return group;
        }
    }

    resolveEntity(key: string | number | zh.Device): Device | Group | undefined {
        if (typeof key === "object") {
            return this.resolveDevice(key.ieeeAddr);
        }

        if (typeof key === "string" && (key.toLowerCase() === "coordinator" || key === this.coordinatorIeeeAddr)) {
            return this.resolveDevice(this.coordinatorIeeeAddr);
        }

        const settingsDevice = settings.getDevice(key.toString());

        if (settingsDevice) {
            return this.resolveDevice(settingsDevice.ID);
        }

        const groupSettings = settings.getGroup(key);

        if (groupSettings) {
            const group = this.resolveGroup(groupSettings.ID);
            // If group does not exist, create it (since it's already in configuration.yaml)
            return group ? group : this.createGroup(groupSettings.ID);
        }
    }

    resolveEntityAndEndpoint(id: string): {ID: string; entity: Device | Group | undefined; endpointID?: string; endpoint?: zh.Endpoint} {
        // This function matches the following entity formats:
        // device_name          (just device name)
        // device_name/ep_name  (device name and endpoint numeric ID or name)
        // device/name          (device name with slashes)
        // device/name/ep_name  (device name with slashes, and endpoint numeric ID or name)

        // The function tries to find an exact match first
        let entityName = id;
        let deviceOrGroup = this.resolveEntity(id);
        let endpointNameOrID: string | undefined;

        // If exact match did not happen, try matching a device_name/endpoint pattern
        if (!deviceOrGroup) {
            // First split the input token by the latest slash
            const match = id.match(entityIDRegex);

            if (match) {
                // Get the resulting IDs from the match
                entityName = match[1];
                deviceOrGroup = this.resolveEntity(entityName);
                endpointNameOrID = match[2];
            }
        }

        // If the function returns non-null endpoint name, but the endpoint field is null, then
        // it means that endpoint was not matched because there is no such endpoint on the device
        // (or the entity is a group)
        const endpoint = deviceOrGroup?.isDevice() ? deviceOrGroup.endpoint(endpointNameOrID) : undefined;

        return {ID: entityName, entity: deviceOrGroup, endpointID: endpointNameOrID, endpoint};
    }

    firstCoordinatorEndpoint(): zh.Endpoint {
        return this.herdsman.getDevicesByType("Coordinator")[0].endpoints[0];
    }

    *devicesAndGroupsIterator(
        devicePredicate?: (value: zh.Device) => boolean,
        groupPredicate?: (value: zh.Group) => boolean,
    ): Generator<Device | Group> {
        for (const device of this.herdsman.getDevicesIterator(devicePredicate)) {
            // biome-ignore lint/style/noNonNullAssertion: assumed valid
            yield this.resolveDevice(device.ieeeAddr)!;
        }

        for (const group of this.herdsman.getGroupsIterator(groupPredicate)) {
            // biome-ignore lint/style/noNonNullAssertion: assumed valid
            yield this.resolveGroup(group.groupID)!;
        }
    }

    *groupsIterator(predicate?: (value: zh.Group) => boolean): Generator<Group> {
        for (const group of this.herdsman.getGroupsIterator(predicate)) {
            // biome-ignore lint/style/noNonNullAssertion: assumed valid
            yield this.resolveGroup(group.groupID)!;
        }
    }

    *devicesIterator(predicate?: (value: zh.Device) => boolean): Generator<Device> {
        for (const device of this.herdsman.getDevicesIterator(predicate)) {
            // biome-ignore lint/style/noNonNullAssertion: assumed valid
            yield this.resolveDevice(device.ieeeAddr)!;
        }
    }

    // biome-ignore lint/suspicious/useAwait: API
    @bind private async acceptJoiningDeviceHandler(ieeeAddr: string): Promise<boolean> {
        // If passlist is set, all devices not on passlist will be rejected to join the network
        const passlist = settings.get().passlist;
        const blocklist = settings.get().blocklist;
        if (passlist.length > 0) {
            if (passlist.includes(ieeeAddr)) {
                logger.info(`Accepting joining device which is on passlist '${ieeeAddr}'`);
                return true;
            }

            logger.info(`Rejecting joining not in passlist device '${ieeeAddr}'`);
            return false;
        }

        if (blocklist.length > 0) {
            if (blocklist.includes(ieeeAddr)) {
                logger.info(`Rejecting joining device which is on blocklist '${ieeeAddr}'`);
                return false;
            }

            logger.info(`Accepting joining not in blocklist device '${ieeeAddr}'`);
        }

        return true;
    }

    async touchlinkFactoryResetFirst(): Promise<boolean> {
        return await this.herdsman.touchlinkFactoryResetFirst();
    }

    async touchlinkFactoryReset(ieeeAddr: string, channel: number): Promise<boolean> {
        return await this.herdsman.touchlinkFactoryReset(ieeeAddr, channel);
    }

    async addInstallCode(installCode: string): Promise<void> {
        await this.herdsman.addInstallCode(installCode);
    }

    async touchlinkIdentify(ieeeAddr: string, channel: number): Promise<void> {
        await this.herdsman.touchlinkIdentify(ieeeAddr, channel);
    }

    async touchlinkScan(): Promise<{ieeeAddr: string; channel: number}[]> {
        return await this.herdsman.touchlinkScan();
    }

    createGroup(id: number): Group {
        this.herdsman.createGroup(id);
        // biome-ignore lint/style/noNonNullAssertion: just created
        return this.resolveGroup(id)!;
    }

    deviceByNetworkAddress(networkAddress: number): Device | undefined {
        const device = this.herdsman.getDeviceByNetworkAddress(networkAddress);
        return device && this.resolveDevice(device.ieeeAddr);
    }

    groupByID(id: number): Group | undefined {
        return this.resolveGroup(id);
    }
}
