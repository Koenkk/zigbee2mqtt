const ZigbeeHerdsman = require('zigbee-herdsman');
const logger = require('./util/logger');
const settings = require('./util/settings');
const data = require('./util/data');
const assert = require('assert');
const utils = require('./util/utils');
const events = require('events');
const objectAssignDeep = require('object-assign-deep');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');

const endpointNames = utils.getEndpointNames();
const keyEndpointByNumber = new RegExp(`.*/([0-9]*)$`);

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
    },
};

class Zigbee extends events.EventEmitter {
    constructor() {
        super();
        this.acceptJoiningDeviceHandler = this.acceptJoiningDeviceHandler.bind(this);
    }

    async start() {
        logger.info(`Starting zigbee-herdsman...`);
        const herdsmanSettingsLog = objectAssignDeep.noMutate(herdsmanSettings);
        herdsmanSettingsLog.network.networkKey = 'HIDDEN';
        logger.debug(`Using zigbee-herdsman with settings: '${JSON.stringify(herdsmanSettingsLog)}'`);

        try {
            herdsmanSettings.acceptJoiningDeviceHandler = this.acceptJoiningDeviceHandler;
            this.herdsman = new ZigbeeHerdsman.Controller(herdsmanSettings);
            await this.herdsman.start();
        } catch (error) {
            logger.error(`Error while starting zigbee-herdsman`);
            throw error;
        }

        this.herdsman.on('adapterDisconnected', () => this.emit('adapterDisconnected'));
        this.herdsman.on('deviceAnnounce', (data) => this.emit('event', 'deviceAnnounce', data));
        this.herdsman.on('deviceInterview', (data) => this.emit('event', 'deviceInterview', data));
        this.herdsman.on('deviceJoined', (data) => this.emit('event', 'deviceJoined', data));
        this.herdsman.on('deviceLeave', (data) => this.emit('event', 'deviceLeave', data));
        this.herdsman.on('message', (data) => this.emit('event', 'message', data));

        logger.info('zigbee-herdsman started');
        logger.info(`Coordinator firmware version: '${JSON.stringify(await this.getCoordinatorVersion())}'`);
        logger.debug(`Zigbee network parameters: ${JSON.stringify(await this.herdsman.getNetworkParameters())}`);

        for (const device of this.getClients()) {
            // If a whitelist is used, all other device will be removed from the network.
            if (settings.get().whitelist.length > 0) {
                if (!settings.get().whitelist.includes(device.ieeeAddr)) {
                    logger.warn(`Blacklisted device is connected (${device.ieeeAddr}), removing...`);
                    device.removeFromNetwork();
                }
            } else if (settings.get().ban.includes(device.ieeeAddr)) {
                logger.warn(`Banned device is connected (${device.ieeeAddr}), removing...`);
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
    }

    async getCoordinatorVersion() {
        return this.herdsman.getCoordinatorVersion();
    }

    async reset(type) {
        await this.herdsman.reset(type);
    }

    async stop() {
        await this.herdsman.stop();
        logger.info('zigbee-herdsman stopped');
    }

    async permitJoin(permit) {
        permit ?
            logger.info('Zigbee: allowing new devices to join.') :
            logger.info('Zigbee: disabling joining new devices.');

        await this.herdsman.permitJoin(permit);
    }

    async getPermitJoin() {
        return this.herdsman.getPermitJoin();
    }

    getClients() {
        return this.herdsman.getDevices().filter((device) => device.type !== 'Coordinator');
    }

    getDevices() {
        return this.herdsman.getDevices();
    }

    getDeviceByIeeeAddr(ieeeAddr) {
        return this.herdsman.getDeviceByIeeeAddr(ieeeAddr);
    }

    getDevicesByType(type) {
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
    resolveEntity(key) {
        assert(
            typeof key === 'string' || typeof key === 'number' ||
            key.constructor.name === 'Device', `Wrong type '${typeof key}'`,
        );

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
                };
            }

            let endpointKey = endpointNames.find((p) => key.endsWith(`/${p}`));
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
                const device = this.getDeviceByIeeeAddr(entity.ID);
                if (!device) {
                    return null;
                }

                const definition = zigbeeHerdsmanConverters.findByDevice(device);
                const endpoints = definition && definition.endpoint ? definition.endpoint(device) : null;
                let endpoint;
                if (endpointKey) {
                    if (endpointByNumber) {
                        endpoint = device.getEndpoint(endpointKey);
                    } else {
                        assert(definition != null, `Endpoint name '${endpointKey}' is given but device is unsupported`);
                        assert(endpoints != null, `Endpoint name '${endpointKey}' is given but no endpoints defined`);
                        const endpointID = endpoints[endpointKey];
                        assert(endpointID, `Endpoint name '${endpointKey}' is given but device has no such endpoint`);
                        endpoint = device.getEndpoint(endpointID);
                    }
                } else if (endpoints && endpoints['default']) {
                    endpoint = device.getEndpoint(endpoints['default']);
                } else {
                    endpoint = device.endpoints[0];
                }

                return {
                    type: 'device', device, endpoint, settings: entity, name: entity.friendlyName, definition,
                };
            } else {
                let group = this.getGroupByID(entity.ID);
                if (!group) group = this.createGroup(entity.ID);
                return {type: 'group', group, settings: entity, name: entity.friendlyName};
            }
        } else {
            const setting = settings.getEntity(key.ieeeAddr);
            return {
                type: 'device',
                device: key,
                endpoint: key.endpoints[0],
                settings: setting,
                name: setting ? setting.friendlyName : (key.type === 'Coordinator' ? 'Coordinator' : key.ieeeAddr),
                definition: zigbeeHerdsmanConverters.findByDevice(key),
            };
        }
    }

    getGroupByID(ID) {
        return this.herdsman.getGroupByID(ID);
    }

    getGroups() {
        return this.herdsman.getGroups();
    }

    createGroup(groupID) {
        return this.herdsman.createGroup(groupID);
    }

    acceptJoiningDeviceHandler(ieeeAddr) {
        // If set whitelist devices, all other device will be rejected to join the network
        if (settings.get().whitelist.length > 0) {
            if (settings.get().whitelist.includes(ieeeAddr)) {
                logger.info(`Accepting joining whitelisted device '${ieeeAddr}'`);
                return true;
            } else {
                logger.info(`Rejecting joining non-whitelisted device '${ieeeAddr}'`);
                return false;
            }
        } else if (settings.get().ban.length > 0) {
            if (settings.get().ban.includes(ieeeAddr)) {
                logger.info(`Rejecting joining banned device '${ieeeAddr}'`);
                return false;
            } else {
                logger.info(`Accepting joining non-banned device '${ieeeAddr}'`);
                return true;
            }
        } else {
            return true;
        }
    }

    async touchlinkFactoryReset() {
        return this.herdsman.touchlinkFactoryReset();
    }
}

module.exports = Zigbee;
