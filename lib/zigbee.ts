import {Controller} from 'zigbee-herdsman';
import logger from './util/logger';
import * as settings from './util/settings';
import data from './util/data';
import assert from 'assert';
import * as utils from './util/utils';
import events from 'events';
import objectAssignDeep from 'object-assign-deep';
/* eslint-disable-line */ // @ts-ignore
import zigbeeHerdsmanConverters from 'zigbee-herdsman-converters';
/* eslint-disable-line */ // @ts-ignore
import stringify from 'json-stable-stringify-without-jsonify';

const keyEndpointByNumber = new RegExp(`.*/([0-9]*)$`);

export default class Zigbee extends events.EventEmitter {
    private herdsman: Controller;

    constructor() {
        super();
        this.acceptJoiningDeviceHandler = this.acceptJoiningDeviceHandler.bind(this);
    }

    async start(): Promise<'reset' | 'resumed' | 'restored'> {
        const infoHerdsman = await utils.getDependencyVersion('zigbee-herdsman');
        logger.info(`Starting zigbee-herdsman (${infoHerdsman.version})`);
        const herdsmanSettings = {
            network: {
                panID: settings.get().advanced.pan_id,
                extendedPanID: settings.get().advanced.ext_pan_id,
                channelList: [settings.get().advanced.channel],
                networkKey: settings.get().advanced.network_key,
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
        };

        /* eslint-disable-line */ // @ts-ignore
        const herdsmanSettingsLog = objectAssignDeep.noMutate(herdsmanSettings);
        herdsmanSettingsLog.network.networkKey = 'HIDDEN';
        logger.debug(`Using zigbee-herdsman with settings: '${stringify(herdsmanSettingsLog)}'`);

        /* eslint-disable-line */ // @ts-ignore
        if (herdsmanSettings.network.networkKey === 'GENERATE') {
            const newKey = Array.from({length: 16}, () => Math.floor(Math.random() * 255));
            settings.set(['advanced', 'network_key'], newKey);
            herdsmanSettings.network.networkKey = newKey;
        }

        /* eslint-disable-line */ // @ts-ignore
        if (herdsmanSettings.network.panID === 'GENERATE') {
            const newPanID = Math.floor(Math.random() * (0xFFFF - 2)) + 1;
            settings.set(['advanced', 'pan_id'], newPanID);
            herdsmanSettings.network.panID = newPanID;
        }

        let startResult;
        try {
            /* eslint-disable-line */ // @ts-ignore
            herdsmanSettings.acceptJoiningDeviceHandler = this.acceptJoiningDeviceHandler;
            /* eslint-disable-line */ // @ts-ignore
            this.herdsman = new Controller(herdsmanSettings, logger);
            startResult = await this.herdsman.start();
        } catch (error) {
            logger.error(`Error while starting zigbee-herdsman`);
            throw error;
        }

        this.herdsman.on('adapterDisconnected', () => this.emit('adapterDisconnected'));
        this.herdsman.on('deviceNetworkAddressChanged', (data) =>
            this.emit('event', 'deviceNetworkAddressChanged', data));
        this.herdsman.on('deviceAnnounce', (data) => this.emit('event', 'deviceAnnounce', data));
        this.herdsman.on('deviceInterview', (data) => this.emit('event', 'deviceInterview', data));
        this.herdsman.on('deviceJoined', (data) => this.emit('event', 'deviceJoined', data));
        this.herdsman.on('deviceLeave', (data) => this.emit('event', 'deviceLeave', data));
        this.herdsman.on('message', (data) => this.emit('event', 'message', data));
        this.herdsman.on('permitJoinChanged', (data) => this.emit('permitJoinChanged', data));
        this.herdsman.on('lastSeenChanged', (data) => this.emit('lastSeenChanged', data));

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

    async permitJoin(permit: boolean, resolvedEntity: ResolvedDevice, time: number=undefined): Promise<void> {
        permit ?
            logger.info(`Zigbee: allowing new devices to join${resolvedEntity ? ` via ${resolvedEntity.name}` : ''}.`) :
            logger.info('Zigbee: disabling joining new devices.');

        if (resolvedEntity && permit) {
            await this.herdsman.permitJoin(permit, resolvedEntity.device, time);
        } else {
            await this.herdsman.permitJoin(permit, undefined, time);
        }
    }

    getPermitJoin(): boolean {
        return this.herdsman.getPermitJoin();
    }

    getPermitJoinTimeout(): number {
        return this.herdsman.getPermitJoinTimeout();
    }

    getClients(): Device[] {
        return this.herdsman.getDevices().filter((device) => device.type !== 'Coordinator');
    }

    getDevices(): Device[] {
        return this.herdsman.getDevices();
    }

    getDeviceByIeeeAddr(ieeeAddr: string): Device {
        return this.herdsman.getDeviceByIeeeAddr(ieeeAddr);
    }

    getDeviceByNetworkAddress(networkAddress: number): Device {
        return this.herdsman.getDeviceByNetworkAddress(networkAddress);
    }

    getDevicesByType(type: 'Coordinator' | 'Router' | 'EndDevice'): Device[] {
        return this.herdsman.getDevicesByType(type);
    }

    /**
     * @param {string} key
     * @return {object} {
     *      type: device | coordinator
     *      device|group: zigbee-herdsman entity
     *      endpoint: selected endpoint (only if type === device)
     *      settings: from configuration.yaml
     *      name: name of the entity
     *      definition: zigbee-herdsman-converters definition (only if type === device)
     * }
     */
    // TODO remove
    /* eslint-disable-next-line */
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
        if (typeof key === 'string' || typeof key === 'number') {
            if (typeof key === 'number') {
                key = key.toString();
            }

            if (typeof key === 'string' && key.toLowerCase() === 'coordinator') {
                const coordinator = this.getDevicesByType('Coordinator')[0];
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
                const device = this.getDeviceByIeeeAddr(entity.ID);
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
                let group = this.getGroupByID(entity.ID);
                /* eslint-disable-line */ // @ts-ignore
                if (!group) group = this.createGroup(entity.ID);
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

    getGroupByID(ID: number): Group {
        return this.herdsman.getGroupByID(ID);
    }

    getGroups(): Group[] {
        return this.herdsman.getGroups();
    }

    createGroup(groupID: number): Group {
        return this.herdsman.createGroup(groupID);
    }

    private acceptJoiningDeviceHandler(ieeeAddr: string): boolean {
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
}
