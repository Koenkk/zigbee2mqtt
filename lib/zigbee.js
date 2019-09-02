const ZigbeeHerdsman = require('zigbee-herdsman');
const logger = require('./util/logger');
const settings = require('./util/settings');
const data = require('./util/data');
const assert = require('assert');
const utils = require('./util/utils');
const events = require('events');
const objectAssignDeep = require('object-assign-deep');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');

const postfixes = utils.getPostfixes();

const herdsmanSettings = {
    network: {
        panID: settings.get().advanced.pan_id,
        extenedPanID: settings.get().advanced.ext_pan_id,
        channelList: [settings.get().advanced.channel],
        networkKey: settings.get().advanced.network_key,
    },
    databasePath: data.joinPath('database.db'),
    backupPath: data.joinPath('coordinator_backup.json'),
    serialPort: {
        baudRate: settings.get().advanced.baudrate,
        rtscts: settings.get().advanced.rtscts,
        path: settings.get().serial.port,
    },
};

class Zigbee extends events.EventEmitter {
    constructor() {
        super();
    }

    async start() {
        logger.info(`Starting zigbee-herdsman...`);
        const herdsmanSettingsLog = objectAssignDeep.noMutate(herdsmanSettings);
        herdsmanSettingsLog.network.networkKey = 'HIDDEN';
        logger.debug(`Using zigbee-herdsman with settings: '${JSON.stringify(herdsmanSettingsLog)}'`);

        try {
            this.herdsman = new ZigbeeHerdsman.Controller(herdsmanSettings);
            await this.herdsman.start();
        } catch (error) {
            logger.error(`Error while starting zigbee-herdsman`);
            logger.error(error.stack);
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

        for (const device of await this.getClients()) {
            // If a whitelist is used, all other device will be removed from the network.
            if (settings.get().whitelist.size > 0) {
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
            this.herdsman.disableLED();
        }
    }

    async getCoordinatorVersion() {
        return this.herdsman.getCoordinatorVersion();
    }

    async softReset() {
        await this.herdsman.softReset();
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

    async getClients() {
        const devices = await this.herdsman.getDevices({});
        return devices.filter((device) => device.type !== 'Coordinator');
    }

    async getDevices(query) {
        return this.herdsman.getDevices(query);
    }

    async getDevice(query) {
        return this.herdsman.getDevice(query);
    }

    async resolveEntity(key) {
        assert(typeof key === 'string' || key.constructor.name === 'Device', `Wrong type '${typeof key}'`);

        if (typeof key === 'string') {
            if (key === 'coordinator') {
                const coordinator = await this.getDevice({type: 'Coordinator'});
                return {
                    type: 'device',
                    device: coordinator,
                    endpoint: coordinator.getEndpoint(1),
                    settings: {friendlyName: 'Coordinator'},
                };
            }

            const postfix = postfixes.find((p) => key.endsWith(`/${p}`));
            if (postfix) {
                key = key.replace(`/${postfix}`, '');
            }

            const entity = settings.getEntity(key);
            if (entity.type === 'device') {
                const device = await this.getDevice({ieeeAddr: entity.ID});
                const mapped = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
                const endpoints = mapped && mapped.endpoint ? mapped.endpoint(device) : null;
                let endpoint;
                if (postfix) {
                    assert(mapped != null, `Postfix '${postfix}' is given but device is unsupported`);
                    assert(endpoints != null, `Postfix '${postfix}' is given but device defines no endpoints`);
                    const endpointID = endpoints[postfix];
                    assert(endpointID, `Postfix '${postfix}' is given but device has no such endpoint`);
                    endpoint = device.getEndpoint(endpointID);
                } else if (endpoints && endpoints['default']) {
                    endpoint = device.getEndpoint(endpoint['default']);
                } else {
                    endpoint = device.endpoints[0];
                }

                return {type: 'device', device, settings: entity, mapped, endpoint};
            } else {
                return {type: 'group', group: await this.getGroup({groupID: entity.ID}), settings: entity};
            }
        } else {
            return {
                type: 'device',
                device: key,
                settings: settings.getEntity(key.ieeeAddr),
                mapped: zigbeeHerdsmanConverters.findByZigbeeModel(key.modelID),
            };
        }
    }

    async getGroup(query) {
        return this.herdsman.getGroup(query);
    }

    async createGroup(groupID) {
        await this.herdsman.createGroup(groupID);
    }

    // TODO
    // _acceptDevIncoming(devInfo, callback) {
    //     logger.debug(
    //         `Accept device incoming with ieeeAddr '${devInfo.ieeeAddr}' permit join is '${this.getPermitJoin()}'`
    //     );
    //     // If set whitelist devices, all other device will be ban or reject to join the network
    //     if (settings.get().whitelist.size>0) {
    //         if (settings.get().whitelist.includes(devInfo.ieeeAddr)) {
    //             logger.info(`whitelist device tried to connect (${devInfo.ieeeAddr})`);
    //             callback(null, true);
    //         } else {
    //             logger.debug(`Not allowing device '${devInfo.ieeeAddr}' to join`);
    //             callback(null, false);
    //         }
    //     } else {
    //         if (settings.get().ban.includes(devInfo.ieeeAddr)) {
    //             logger.info(`Banned device tried to connect (${devInfo.ieeeAddr})`);
    //             callback(null, false);
    //         } else {
    //             logger.debug(`Allowing device '${devInfo.ieeeAddr}' to join`);
    //             callback(null, true);
    //         }
    //     }
    // }
}

module.exports = Zigbee;
