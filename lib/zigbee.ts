import {Controller} from 'zigbee-herdsman';
import logger from './util/logger';
import * as settings from './util/settings';
import data from './util/data';
import utils from './util/utils';
import objectAssignDeep from 'object-assign-deep';
import stringify from 'json-stable-stringify-without-jsonify';
import Device from './model/device';
import Group from './model/group';
import * as ZHEvents from 'zigbee-herdsman/dist/controller/events';
import bind from 'bind-decorator';

export default class Zigbee {
    private herdsman: Controller;
    private eventBus: EventBus;
    private groupLookup: {[s: number]: Group} = {};
    private deviceLookup: {[s: string]: Device} = {};

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
    }

    async start(): Promise<'reset' | 'resumed' | 'restored'> {
        const infoHerdsman = await utils.getDependencyVersion('zigbee-herdsman');
        logger.info(`Starting zigbee-herdsman (${infoHerdsman.version})`);
        const herdsmanSettings = {
            network: {
                panID: settings.get().advanced.pan_id === 'GENERATE' ?
                    this.generatePanID() : settings.get().advanced.pan_id as number,
                extendedPanID: settings.get().advanced.ext_pan_id,
                channelList: [settings.get().advanced.channel],
                networkKey: settings.get().advanced.network_key === 'GENERATE' ?
                    this.generateNetworkKey() : settings.get().advanced.network_key as number[],
            },
            databasePath: data.joinPath('database.db'),
            databaseBackupPath: data.joinPath('database.db.backup'),
            backupPath: data.joinPath('coordinator_backup.json'),
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
            },
            acceptJoiningDeviceHandler: this.acceptJoiningDeviceHandler,
        };

        const herdsmanSettingsLog = objectAssignDeep({}, herdsmanSettings, {network: {networkKey: 'HIDDEN'}});
        logger.debug(`Using zigbee-herdsman with settings: '${stringify(herdsmanSettingsLog)}'`);

        let startResult;
        try {
            this.herdsman = new Controller(herdsmanSettings, logger);
            startResult = await this.herdsman.start();
        } catch (error) {
            logger.error(`Error while starting zigbee-herdsman`);
            throw error;
        }

        this.herdsman.on('adapterDisconnected', () => this.eventBus.emitAdapterDisconnected());
        this.herdsman.on('lastSeenChanged', (data: ZHEvents.LastSeenChangedPayload) => {
            this.eventBus.emitLastSeenChanged({device: this.resolveDevice(data.device.ieeeAddr), reason: data.reason});
        });
        this.herdsman.on('permitJoinChanged', (data: ZHEvents.PermitJoinChangedPayload) => {
            this.eventBus.emitPermitJoinChanged(data);
        });
        this.herdsman.on('deviceNetworkAddressChanged', (data: ZHEvents.DeviceNetworkAddressChangedPayload) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            logger.debug(`Device '${device.name}' changed network address`);
            this.eventBus.emitDeviceNetworkAddressChanged({device});
        });
        this.herdsman.on('deviceAnnounce', (data: ZHEvents.DeviceAnnouncePayload) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            logger.debug(`Device '${device.name}' announced itself`);
            this.eventBus.emitDeviceAnnounce({device});
        });
        this.herdsman.on('deviceInterview', (data: ZHEvents.DeviceInterviewPayload) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            /* istanbul ignore if */ if (!device) return; // Prevent potential race
            const d = {device, status: data.status};
            this.logDeviceInterview(d);
            this.eventBus.emitDeviceInterview(d);
        });
        this.herdsman.on('deviceJoined', (data: ZHEvents.DeviceJoinedPayload) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            /* istanbul ignore if */ if (!device) return; // Prevent potential race
            logger.info(`Device '${device.name}' joined`);
            this.eventBus.emitDeviceJoined({device});
        });
        this.herdsman.on('deviceLeave', (data: ZHEvents.DeviceLeavePayload) => {
            const name = settings.getDevice(data.ieeeAddr)?.friendly_name || data.ieeeAddr;
            logger.warn(`Device '${name}' left the network`);
            this.eventBus.emitDeviceLeave({ieeeAddr: data.ieeeAddr, name});
        });
        this.herdsman.on('message', (data: ZHEvents.MessagePayload) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            logger.debug(`Received Zigbee message from '${device.name}', type '${data.type}', ` +
                `cluster '${data.cluster}', data '${stringify(data.data)}' from endpoint ${data.endpoint.ID}` +
                (data.hasOwnProperty('groupID') ? ` with groupID ${data.groupID}` : ``) +
                (device.zh.type === 'Coordinator' ? `, ignoring since it is from coordinator` : ``));
            if (device.zh.type === 'Coordinator') return;
            this.eventBus.emitDeviceMessage({...data, device});
        });

        logger.info(`zigbee-herdsman started (${startResult})`);
        logger.info(`Coordinator firmware version: '${stringify(await this.getCoordinatorVersion())}'`);
        logger.debug(`Zigbee network parameters: ${stringify(await this.herdsman.getNetworkParameters())}`);

        for (const device of this.devices(false)) {
            // If a passlist is used, all other device will be removed from the network.
            const passlist = settings.get().passlist;
            const blocklist = settings.get().blocklist;
            const remove = async (device: Device): Promise<void> => {
                try {
                    await device.zh.removeFromNetwork();
                } catch (error) {
                    logger.error(`Failed to remove '${device.ieeeAddr}' (${error.message})`);
                }
            };
            if (passlist.length > 0) {
                if (!passlist.includes(device.ieeeAddr)) {
                    logger.warn(`Device which is not on passlist connected (${device.ieeeAddr}), removing...`);
                    await remove(device);
                }
            } else if (blocklist.includes(device.ieeeAddr)) {
                logger.warn(`Device on blocklist is connected (${device.ieeeAddr}), removing...`);
                await remove(device);
            }
        }

        // Check if we have to set a transmit power
        if (settings.get().advanced.hasOwnProperty('transmit_power')) {
            const transmitPower = settings.get().advanced.transmit_power;
            await this.herdsman.setTransmitPower(transmitPower);
            logger.info(`Set transmit power to '${transmitPower}'`);
        }

        return startResult;
    }

    private logDeviceInterview(data: eventdata.DeviceInterview): void {
        const name = data.device.name;
        if (data.status === 'successful') {
            logger.info(`Successfully interviewed '${name}', device has successfully been paired`);

            if (data.device.definition) {
                const {vendor, description, model} = data.device.definition;
                logger.info(`Device '${name}' is supported, identified as: ${vendor} ${description} (${model})`);
            } else {
                logger.warn(`Device '${name}' with Zigbee model '${data.device.zh.modelID}' and manufacturer name ` +
                    `'${data.device.zh.manufacturerName}' is NOT supported, ` +
                    // eslint-disable-next-line max-len
                    `please follow https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html`);
            }
        } else if (data.status === 'failed') {
            logger.error(`Failed to interview '${name}', device has not successfully been paired`);
        } else { // data.status === 'started'
            logger.info(`Starting interview of '${name}'`);
        }
    }

    private generateNetworkKey(): number[] {
        const key = Array.from({length: 16}, () => Math.floor(Math.random() * 255));
        settings.set(['advanced', 'network_key'], key);
        return key;
    }

    private generatePanID(): number {
        const panID = Math.floor(Math.random() * (0xFFFF - 2)) + 1;
        settings.set(['advanced', 'pan_id'], panID);
        return panID;
    }

    async getCoordinatorVersion(): Promise<zh.CoordinatorVersion> {
        return this.herdsman.getCoordinatorVersion();
    }

    isStopping(): boolean {
        return this.herdsman.isStopping();
    }

    async getNetworkParameters(): Promise<zh.NetworkParameters> {
        return this.herdsman.getNetworkParameters();
    }

    async reset(type: 'soft' | 'hard'): Promise<void> {
        await this.herdsman.reset(type);
    }

    async stop(): Promise<void> {
        logger.info('Stopping zigbee-herdsman...');
        await this.herdsman.stop();
        logger.info('Stopped zigbee-herdsman');
    }

    getPermitJoin(): boolean {
        return this.herdsman.getPermitJoin();
    }

    getPermitJoinTimeout(): number {
        return this.herdsman.getPermitJoinTimeout();
    }

    async permitJoin(permit: boolean, device?: Device, time: number=undefined): Promise<void> {
        if (permit) {
            logger.info(`Zigbee: allowing new devices to join${device ? ` via ${device.name}` : ''}.`);
        } else {
            logger.info('Zigbee: disabling joining new devices.');
        }

        if (device && permit) {
            await this.herdsman.permitJoin(permit, device.zh, time);
        } else {
            await this.herdsman.permitJoin(permit, undefined, time);
        }
    }

    @bind private resolveDevice(ieeeAddr: string): Device {
        if (!this.deviceLookup[ieeeAddr]) {
            const device = this.herdsman.getDeviceByIeeeAddr(ieeeAddr);
            device && (this.deviceLookup[ieeeAddr] = new Device(device));
        }

        const device = this.deviceLookup[ieeeAddr];
        if (device && !device.zh.isDeleted) {
            device.ensureInSettings();
            return device;
        }
    }

    private resolveGroup(groupID: number): Group {
        const group = this.herdsman.getGroupByID(Number(groupID));
        if (group && !this.groupLookup[groupID]) {
            this.groupLookup[groupID] = new Group(group, this.resolveDevice);
        }

        return this.groupLookup[groupID];
    }

    resolveEntity(key: string | number | zh.Device): Device | Group {
        if (typeof key === 'object') {
            return this.resolveDevice(key.ieeeAddr);
        } else if (typeof key === 'string' && key.toLowerCase() === 'coordinator') {
            return this.resolveDevice(this.herdsman.getDevicesByType('Coordinator')[0].ieeeAddr);
        } else {
            const settingsDevice = settings.getDevice(key.toString());
            if (settingsDevice) return this.resolveDevice(settingsDevice.ID);

            const groupSettings = settings.getGroup(key);
            if (groupSettings) {
                const group = this.resolveGroup(groupSettings.ID);
                // If group does not exist, create it (since it's already in configuration.yaml)
                return group ? group : this.createGroup(groupSettings.ID);
            }
        }
    }

    firstCoordinatorEndpoint(): zh.Endpoint {
        return this.herdsman.getDevicesByType('Coordinator')[0].endpoints[0];
    }

    groups(): Group[] {
        return this.herdsman.getGroups().map((g) => this.resolveGroup(g.groupID));
    }

    devices(includeCoordinator=true): Device[] {
        return this.herdsman.getDevices()
            .map((d) => this.resolveDevice(d.ieeeAddr))
            .filter((d) => includeCoordinator || d.zh.type !== 'Coordinator');
    }

    @bind private async acceptJoiningDeviceHandler(ieeeAddr: string): Promise<boolean> {
        // If passlist is set, all devices not on passlist will be rejected to join the network
        const passlist = settings.get().passlist;
        const blocklist = settings.get().blocklist;
        if (passlist.length > 0) {
            if (passlist.includes(ieeeAddr)) {
                logger.info(`Accepting joining device which is on passlist '${ieeeAddr}'`);
                return true;
            } else {
                logger.info(`Rejecting joining not in passlist device '${ieeeAddr}'`);
                return false;
            }
        } else if (blocklist.length > 0) {
            if (blocklist.includes(ieeeAddr)) {
                logger.info(`Rejecting joining device which is on blocklist '${ieeeAddr}'`);
                return false;
            } else {
                logger.info(`Accepting joining not in blocklist device '${ieeeAddr}'`);
                return true;
            }
        } else {
            return true;
        }
    }

    async touchlinkFactoryResetFirst(): Promise<boolean> {
        return this.herdsman.touchlinkFactoryResetFirst();
    }

    async touchlinkFactoryReset(ieeeAddr: string, channel: number): Promise<boolean> {
        return this.herdsman.touchlinkFactoryReset(ieeeAddr, channel);
    }

    async touchlinkIdentify(ieeeAddr: string, channel: number): Promise<void> {
        await this.herdsman.touchlinkIdentify(ieeeAddr, channel);
    }

    async touchlinkScan(): Promise<{ieeeAddr: string, channel: number}[]> {
        return this.herdsman.touchlinkScan();
    }

    createGroup(ID: number): Group {
        this.herdsman.createGroup(ID);
        return this.resolveGroup(ID);
    }

    deviceByNetworkAddress(networkAddress: number): Device {
        const device = this.herdsman.getDeviceByNetworkAddress(networkAddress);
        return device && this.resolveDevice(device.ieeeAddr);
    }

    groupByID(ID: number): Group {
        return this.resolveGroup(ID);
    }
}
