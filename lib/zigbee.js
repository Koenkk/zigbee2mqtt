const ZShepherd = require('zigbee-shepherd');
const logger = require('./util/logger');
const settings = require('./util/settings');
const data = require('./util/data');
const utils = require('./util/utils');
const cieApp = require('./zapp/cie');
const Q = require('q');

const advancedSettings = settings.get().advanced;
const shepherdSettings = {
    net: {
        panId: advancedSettings.pan_id,
        channelList: [advancedSettings.channel],
        precfgkey: settings.get().advanced.network_key,
    },
    dbPath: data.joinPath('database.db'),
    sp: {
        baudRate: advancedSettings.baudrate,
        rtscts: advancedSettings.rtscts,
    },
};

const defaultCfg = {
    manufSpec: 0,
    disDefaultRsp: 0,
};

logger.debug(`Using zigbee-shepherd with settings: '${JSON.stringify(shepherdSettings)}'`);

class Zigbee {
    constructor() {
        this.onReady = this.onReady.bind(this);
        this.onMessage = this.onMessage.bind(this);
        this.onError = this.onError.bind(this);
        this.messageHandler = null;
    }

    start(messageHandler, callback) {
        logger.info(`Starting zigbee-shepherd`);
        this.messageHandler = messageHandler;
        this.shepherd = new ZShepherd(settings.get().serial.port, shepherdSettings);

        this.shepherd.start((error) => {
            if (error) {
                logger.info('Error while starting zigbee-shepherd, attemping to fix... (takes 60 seconds)');
                this.shepherd.controller._znp.close((() => null));

                setTimeout(() => {
                    logger.info(`Starting zigbee-shepherd`);
                    this.shepherd.start((error) => {
                        if (error) {
                            logger.error('Error while starting zigbee-shepherd!');
                            logger.error(
                                'Press the reset button on the stick (the one closest to the USB) and start again'
                            );
                            callback(error);
                        } else {
                            this.logStartupInfo();
                            callback(null);
                        }
                    });
                }, utils.secondsToMilliseconds(60));
            } else {
                this.logStartupInfo();
                callback(null);
            }
        });

        // Register callbacks.
        this.shepherd.on('ready', this.onReady);
        this.shepherd.on('ind', this.onMessage);
        this.shepherd.on('error', this.onError);
    }

    logStartupInfo() {
        logger.info('zigbee-shepherd started');
        logger.info(`Coordinator firmware version: '${this.shepherd.info().firmware.revision}'`);
        logger.debug(`zigbee-shepherd info: ${JSON.stringify(this.shepherd.info())}`);
    }

    softReset(callback) {
        this.shepherd.reset('soft', callback);
    }

    stop(callback) {
        this.shepherd.stop((error) => {
            logger.info('zigbee-shepherd stopped');
            callback(error);
        });
    }

    onReady() {
        // Mount cieApp
        this.shepherd.mount(cieApp, (err, epId) => {
            if (!err) {
                logger.debug(`Mounted the cieApp (epId {epId})`);
            } else {
                logger.error(`Failed to mount the cieApp`);
            }
        });

        // Check if we have to turn off the led
        if (settings.get().serial.disable_led) {
            this.shepherd.controller.request('UTIL', 'ledControl', {ledid: 3, mode: 0});
        }

        logger.info('zigbee-shepherd ready');
    }

    onError(message) {
        // This event may appear if zigbee-shepherd cannot decode bad packets (invalid checksum).
        logger.error(message);
    }

    permitJoin(permit, callback) {
        if (permit) {
            logger.info('Zigbee: allowing new devices to join.');
        } else {
            logger.info('Zigbee: disabling joining new devices.');
        }

        this.shepherd.permitJoin(permit ? 255 : 0, (error) => {
            if (error) {
                logger.info(error);
            }

            if (callback) {
                callback();
            }
        });
    }

    getPermitJoin() {
        return this.shepherd.controller._permitJoinTime === 255;
    }

    getAllClients() {
        return this.getDevices().filter((device) => device.type !== 'Coordinator');
    }

    removeDevice(deviceID, callback) {
        this.shepherd.remove(deviceID, (error) => {
            if (error) {
                logger.warn(`Failed to remove '${deviceID}', trying force remove...`);
                this.forceRemove(deviceID, callback);
            } else {
                callback(null);
            }
        });
    }

    forceRemove(deviceID, callback) {
        const device = this.shepherd._findDevByAddr(deviceID);

        if (device) {
            return this.shepherd._unregisterDev(device, (error) => callback(error));
        } else {
            logger.warn(`Could not find ${deviceID} for force removal`);
            callback(true);
        }
    }

    ping(deviceID, callback) {
        let friendlyName = 'unknown';
        const device = this.shepherd._findDevByAddr(deviceID);
        const ieeeAddr = device.ieeeAddr;
        const deferred = Q.defer();

        if (settings.getDevice(ieeeAddr)) {
            friendlyName = settings.getDevice(ieeeAddr).friendly_name;
        }

        if (device) {
            // Note: currently checkOnline does not call callback, hopefully will be fixed soon
            logger.debug(`Check online ${friendlyName} ${deviceID}`);
            this.shepherd.controller.checkOnline(device).then(function() {
                return deferred.resolve();
            }).fail(function(err) {
                logger.info(`Ping device error: ${err}`);
                return deferred.reject(err);
            }).done();
        } else {
            deferred.reject(new Error('Device not found.'));
        }

        return deferred.promise.nodeify(callback);
    }

    onMessage(message) {
        if (this.messageHandler) {
            this.messageHandler(message);
        }
    }

    getDevices() {
        return this.shepherd.list();
    }

    getDevice(ieeeAddr) {
        return this.getDevices().find((d) => d.ieeeAddr === ieeeAddr);
    }

    getCoordinator() {
        const device = this.getDevices().find((d) => d.type === 'Coordinator');
        return this.shepherd.find(device.ieeeAddr, 1);
    }

    getGroup(ID) {
        return this.shepherd.getGroup(ID);
    }

    publish(entityID, entityType, cid, cmd, cmdType, zclData, cfg=defaultCfg, ep, callback) {
        let entity = null;
        if (entityType === 'device') {
            entity = this.findDevice(entityID, ep);
        } else if (entityType === 'group') {
            entity = this.getGroup(entityID);
        }

        if (!entity) {
            logger.error(
                `Zigbee cannot publish message to ${entityType} because '${entityID}' not known by zigbee-shepherd`
            );
            return;
        }

        logger.info(
            `Zigbee publish to ${entityType} '${entityID}', ${cid} - ${cmd} - ` +
            `${JSON.stringify(zclData)} - ${JSON.stringify(cfg)} - ${ep}`
        );

        const callback_ = (error, rsp) => {
            if (error) {
                logger.error(
                    `Zigbee publish to ${entityType} '${entityID}', ${cid} - ${cmd} - ${JSON.stringify(zclData)} ` +
                    `- ${JSON.stringify(cfg)} - ${ep} ` +
                    `failed with error ${error}`);
            }

            callback(error, rsp);
        };

        if (cmdType === 'functional' && entity.functional) {
            entity.functional(cid, cmd, zclData, cfg, callback_);
        } else if (cmdType === 'foundation' && entity.foundation) {
            entity.foundation(cid, cmd, zclData, cfg, callback_);
        } else {
            logger.error(`Unknown zigbee publish cmdType ${cmdType}`);
        }
    }

    networkScan(callback) {
        logger.info('Starting network scan...');
        this.shepherd.lqiScan().then((result) => {
            logger.info('Network scan completed');
            callback(result);
        });
    }

    findDevice(deviceID, ep) {
        // Find device in zigbee-shepherd
        let device = this.getDevice(deviceID);
        if (!device || !device.epList || !device.epList.length) {
            logger.error(`Zigbee cannot determine endpoint for '${deviceID}'`);
            return null;
        }

        ep = ep ? ep : device.epList[0];
        device = this.shepherd.find(deviceID, ep);
        return device;
    }
}

module.exports = Zigbee;
