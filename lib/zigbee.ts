import {Controller} from 'zigbee-herdsman';
import logger from './util/logger';
import * as settings from './util/settings';
import * as data from './util/data';
import assert from 'assert';
import * as utils from './util/utils';
import objectAssignDeep from 'object-assign-deep';
// @ts-ignore
import zigbeeHerdsmanConverters from 'zigbee-herdsman-converters';
// @ts-ignore
import stringify from 'json-stable-stringify-without-jsonify';
import Device from './model/device';
import Group from './model/group';
import * as ZHEvents from 'zigbee-herdsman/dist/controller/events';

export default class Zigbee {
    private herdsman: Controller;
    private eventBus: EventBus;
    private resolvedEntitiesLookup: {[s: string]: Device | Group} = {};

    constructor(eventBus: EventBus) {
        this.acceptJoiningDeviceHandler = this.acceptJoiningDeviceHandler.bind(this);
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
                baudRate: settings.get().advanced.baudrate,
                rtscts: settings.get().advanced.rtscts,
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

        const herdsmanSettingsLog = objectAssignDeep({}, herdsmanSettings);
        // @ts-ignore
        herdsmanSettingsLog.network.networkKey = 'HIDDEN';
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
            this.eventBus.emitLastSeenChanged({device: this.resolveEntity(data.device) as Device});
        });
        this.herdsman.on('permitJoinChanged', (data: ZHEvents.PermitJoinChangedPayload) => {
            this.eventBus.emitPermitJoinChanged(data);
        });
        this.herdsman.on('deviceNetworkAddressChanged', (data: ZHEvents.DeviceNetworkAddressChangedPayload) => {
            this.eventBus.emit('event', 'deviceNetworkAddressChanged', data); // TODO remove this event
            this.eventBus.emitDeviceNetworkAddressChanged({device: this.resolveEntity(data.device) as Device});
        });
        this.herdsman.on('deviceAnnounce', (data: ZHEvents.DeviceAnnouncePayload) => {
            this.eventBus.emit('event', 'deviceAnnounce', data); // TODO remove this event
            this.eventBus.emitDeviceAnnounce({device: this.resolveEntity(data.device) as Device});
        });
        this.herdsman.on('deviceInterview', (data: ZHEvents.DeviceInterviewPayload) => {
            this.eventBus.emit('event', 'deviceInterview', data); // TODO remove this event
            this.eventBus.emitDeviceInterview({device: this.resolveEntity(data.device) as Device, status: data.status});
        });
        this.herdsman.on('deviceJoined', (data: ZHEvents.DeviceJoinedPayload) => {
            this.eventBus.emit('event', 'deviceJoined', data); // TODO remove this event
            this.eventBus.emitDeviceJoined({device: this.resolveEntity(data.device) as Device});
        });
        this.herdsman.on('deviceLeave', (data: ZHEvents.DeviceLeavePayload) => {
            this.eventBus.emit('event', 'deviceLeave', data); // TODO remove this event
            this.eventBus.emitDeviceLeave(data);
        });
        this.herdsman.on('message', (data: ZHEvents.MessagePayload) => {
            this.eventBus.emit('event', 'message', data); // TODO remove this event
            this.eventBus.emitDeviceMessage({...data, device: this.resolveEntity(data.device) as Device});
        });

        logger.info(`zigbee-herdsman started (${startResult})`);
        logger.info(`Coordinator firmware version: '${stringify(await this.getCoordinatorVersion())}'`);
        logger.debug(`Zigbee network parameters: ${stringify(await this.herdsman.getNetworkParameters())}`);

        for (const device of this.getClients()) {
            // If a passlist is used, all other device will be removed from the network.
            const passlist = settings.get().passlist.concat(settings.get().whitelist);
            const blocklist = settings.get().blocklist.concat(settings.get().ban);
            if (passlist.length > 0) {
                if (!passlist.includes(device.ieeeAddr)) {
                    logger.warn(`Device which is not on passlist connected (${device.ieeeAddr}), removing...`);
                    device.removeFromNetwork();
                }
            } else if (blocklist.includes(device.ieeeAddr)) {
                logger.warn(`Device on blocklist is connected (${device.ieeeAddr}), removing...`);
                device.removeFromNetwork();
            }
        }

        // Check if we have to turn off the led
        if (settings.get().serial.disable_led) {
            await this.herdsman.setLED(false);
        }

        // Check if we have to set a transmit power
        if (settings.get().experimental.hasOwnProperty('transmit_power')) {
            const transmitPower = settings.get().experimental.transmit_power;
            await this.herdsman.setTransmitPower(transmitPower);
            logger.info(`Set transmit power to '${transmitPower}'`);
        }

        return startResult;
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

    async getCoordinatorVersion(): Promise<CoordinatorVersion> {
        return this.herdsman.getCoordinatorVersion();
    }

    isStopping(): boolean {
        return this.herdsman.isStopping();
    }

    async getNetworkParameters(): Promise<NetworkParameters> {
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
            await this.herdsman.permitJoin(permit, device.zhDevice, time);
        } else {
            await this.herdsman.permitJoin(permit, undefined, time);
        }
    }

    private addDeviceToResolvedEntitiesLookup(ieeeAddr: string): Device {
        if (!this.resolvedEntitiesLookup[ieeeAddr]) {
            const device = this.herdsman.getDeviceByIeeeAddr(ieeeAddr);
            /* istanbul ignore else */
            if (device) this.resolvedEntitiesLookup[ieeeAddr] = new Device(device);
        }

        return this.resolvedEntitiesLookup[ieeeAddr] as Device;
    }

    private addGroupToResolvedEntitiesLookup(groupID: number): Group {
        if (!this.resolvedEntitiesLookup[groupID]) {
            let group = this.herdsman.getGroupByID(groupID);
            // Legacy: previously zigbee-herdsman did not keep track of groups, therefore create it when published to
            // note that the group is in the configuration.yaml already.
            if (group == null) group = this.herdsman.createGroup(groupID);
            this.resolvedEntitiesLookup[groupID] = new Group(group);
        }

        return this.resolvedEntitiesLookup[groupID] as Group;
    }

    resolveEntity(key: ZHDevice | string | number): Device | Group {
        const ID = typeof key === 'string' || typeof key === 'number' ? key.toString() : key.ieeeAddr;
        const entitySettings = settings.getEntity(ID);
        if (!entitySettings && !(typeof key === 'object' && key.type === 'Coordinator')) return undefined;

        if (typeof key === 'object') {
            return this.addDeviceToResolvedEntitiesLookup(key.ieeeAddr);
        } else {
            return entitySettings.type === 'device' ?
                this.addDeviceToResolvedEntitiesLookup(entitySettings.ID as string) :
                this.addGroupToResolvedEntitiesLookup(entitySettings.ID as number);
        }
    }

    getClients(): Device[] {
        return this.herdsman.getDevices().filter((device) => device.type !== 'Coordinator')
            .map((d) => this.resolveEntity(d) as Device).filter((d) => d);
    }

    getFirstCoordinatorEndpoint(): ZHEndpoint {
        return this.herdsman.getDevicesByType('Coordinator')[0].endpoints[0];
    }

    getGroups(): Group[] {
        return this.herdsman.getGroups().map((g) => this.addGroupToResolvedEntitiesLookup(g.groupID)).filter((g) => g);
    }

    getDevices(): Device[] {
        return this.herdsman.getDevices()
            .map((d) => this.addDeviceToResolvedEntitiesLookup(d.ieeeAddr)).filter((d) => d);
    }

    private async acceptJoiningDeviceHandler(ieeeAddr: string): Promise<boolean> {
        // If passlist is set, all devices not on passlist will be rejected to join the network
        const passlist = settings.get().passlist.concat(settings.get().whitelist);
        const blocklist = settings.get().blocklist.concat(settings.get().ban);
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

    createGroup(groupID: number): Group {
        this.herdsman.createGroup(groupID);
        return this.addGroupToResolvedEntitiesLookup(groupID);
    }

    deviceByNetworkAddress(networkAddress: number): Device {
        const device = this.herdsman.getDeviceByNetworkAddress(networkAddress);
        return device && this.addDeviceToResolvedEntitiesLookup(device.ieeeAddr);
    }

    groupByID(ID: number): Group {
        const group = this.herdsman.getGroupByID(ID);
        return group && this.addGroupToResolvedEntitiesLookup(group.groupID);
    }

    // TODO remove all legacy below
    createGroupLegacy(groupID: number): ZHGroup {
        return this.herdsman.createGroup(groupID);
    }
    getGroupByIDLegacy(ID: number): ZHGroup {
        return this.herdsman.getGroupByID(ID);
    }
    getDevicesByTypeLegacy(type: 'Coordinator' | 'Router' | 'EndDevice'): ZHDevice[] {
        return this.herdsman.getDevicesByType(type);
    }
    getClientsLegacy(): ZHDevice[] {
        return this.herdsman.getDevices().filter((device) => device.type !== 'Coordinator');
    }
    getDevicesLegacy(): ZHDevice[] {
        return this.herdsman.getDevices();
    }
    async permitJoinLegacy(permit: boolean, resolvedEntity: ResolvedDevice, time: number=undefined): Promise<void> {
        if (permit) {
            /* istanbul ignore next */
            logger.info(`Zigbee: allowing new devices to join${resolvedEntity ? ` via ${resolvedEntity.name}` : ''}.`);
        } else {
            logger.info('Zigbee: disabling joining new devices.');
        }

        /* istanbul ignore next */
        if (resolvedEntity && permit) {
            /* istanbul ignore next */
            await this.herdsman.permitJoin(permit, resolvedEntity.device, time);
        } else {
            await this.herdsman.permitJoin(permit, undefined, time);
        }
    }
    /* istanbul ignore next */ /* eslint-disable-next-line */
    resolveEntityLegacy(key: any): any {
        assert(
            typeof key === 'string' || typeof key === 'number' ||
            key.constructor.name === 'Device' || key.constructor.name === 'Group' ||
            key.constructor.name === 'Endpoint',
            `Wrong type '${typeof key}'`,
        );

        /* eslint-disable-next-line */
        const getEndpointName = (endpointNames: any, endpoint: any) => {
            return endpoint ?
                utils.getKey(endpointNames, endpoint.ID, null, ((v) => v === 'default' ? null : v)) : null;
        };

        const deviceOptions = settings.get().device_options;
        /* istanbul ignore else */
        if (typeof key === 'string' || typeof key === 'number') {
            if (typeof key === 'number') {
                key = key.toString();
            }

            if (typeof key === 'string' && key.toLowerCase() === 'coordinator') {
                const coordinator = this.getDevicesByTypeLegacy('Coordinator')[0];
                return {
                    type: 'device',
                    device: coordinator,
                    endpoint: coordinator.getEndpoint(1),
                    settings: {friendlyName: 'Coordinator'},
                    name: 'Coordinator',
                    endpointName: null,
                };
            }

            /* eslint-disable-next-line */
            let endpointKey: any = utils.endpointNames.find((p) => key.endsWith(`/${p}`));
            const keyEndpointByNumber = new RegExp(`.*/([0-9]*)$`);
            const endpointByNumber = key.match(keyEndpointByNumber);
            if (!endpointKey && endpointByNumber) {
                endpointKey = Number(endpointByNumber[1]);
            }
            if (endpointKey) {
                key = key.replace(`/${endpointKey}`, '');
            }

            const entity = settings.getEntity(key);
            if (!entity) {
                return null;
            } else if (entity.type === 'device') {
                /* eslint-disable-line */ // @ts-ignore
                const device = this.herdsman.getDeviceByIeeeAddr(entity.ID);
                if (!device) {
                    return null;
                }

                const definition = zigbeeHerdsmanConverters.findByDevice(device);
                const endpointNames = definition && definition.endpoint ? definition.endpoint(device) : null;
                let endpoint;
                if (endpointKey) {
                    if (endpointByNumber) {
                        endpoint = device.getEndpoint(endpointKey);
                    } else {
                        assert(definition != null, `Endpoint name '${endpointKey}' is given but device is unsupported`);
                        assert(endpointNames != null,
                            `Endpoint name '${endpointKey}' is given but no endpoints defined`);
                        const endpointID = endpointNames[endpointKey];
                        assert(endpointID, `Endpoint name '${endpointKey}' is given but device has no such endpoint`);
                        endpoint = device.getEndpoint(endpointID);
                    }
                } else if (endpointNames && endpointNames['default']) {
                    endpoint = device.getEndpoint(endpointNames['default']);
                } else {
                    endpoint = device.endpoints[0];
                }

                return {
                    type: 'device', device, endpoint, settings: {...deviceOptions, ...entity},
                    name: entity.friendlyName, definition,
                    endpointName: getEndpointName(endpointNames, endpoint),
                };
            } else {
                /* eslint-disable-line */ // @ts-ignore
                let group = this.getGroupByIDLegacy(entity.ID);
                /* istanbul ignore if */ // @ts-ignore
                if (!group) group = this.createGroupLegacy(entity.ID);
                return {type: 'group', group, settings: {...deviceOptions, ...entity}, name: entity.friendlyName};
            }
        } else if (key.constructor.name === 'Device' || key.constructor.name === 'Endpoint') {
            const device = key.constructor.name === 'Endpoint' ? key.getDevice() : key;
            const setting = settings.getEntity(device.ieeeAddr);
            const definition = zigbeeHerdsmanConverters.findByDevice(device);
            const name = setting ? setting.friendlyName :
                (device.type === 'Coordinator' ? 'Coordinator' : device.ieeeAddr);
            const endpointNames = definition && definition.endpoint ? definition.endpoint(device) : null;

            let endpoint;
            if (key.constructor.name === 'Endpoint') endpoint = key;
            else if (endpointNames && endpointNames['default']) endpoint = device.getEndpoint(endpointNames['default']);
            else endpoint = device.endpoints[0];

            return {
                type: 'device', definition, name, device, endpoint, settings: {...deviceOptions, ...(setting || {})},
                endpointName: getEndpointName(endpointNames, endpoint),
            };
        } else { // Group
            const setting = settings.getEntity(key.groupID);
            return {
                type: 'group',
                group: key,
                settings: {...deviceOptions, ...(setting || {})},
                name: setting ? setting.friendlyName : key.groupID,
            };
        }
    }
}
