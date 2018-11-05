const ZShepherd = require('zigbee-shepherd');
const logger = require('./util/logger');
const settings = require('./util/settings');
const data = require('./util/data');
const zclPacket = require('zcl-packet');
const utils = require('./util/utils');

const advancedSettings = settings.get().advanced;

const shepherdSettings = {
    net: {
        panId: advancedSettings && advancedSettings.pan_id ? advancedSettings.pan_id : 0x1a62,
        channelList: [advancedSettings && advancedSettings.channel ? advancedSettings.channel : 11],
    },
    dbPath: data.joinPath('database.db'),
    sp: {
        baudRate: advancedSettings && advancedSettings.baudrate ? advancedSettings.baudrate : 115200,
        rtscts: advancedSettings && (typeof(advancedSettings.rtscts) === 'boolean') ? advancedSettings.rtscts : true,
    },
};

logger.debug(`Using zigbee-shepherd with settings: '${JSON.stringify(shepherdSettings)}'`);

class Zigbee {
    constructor(onMessage) {
        this.onMessage = onMessage;
        this.handleReady = this.handleReady.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.handleError = this.handleError.bind(this);
    }

    start(callback) {
        logger.info(`Starting zigbee-shepherd`);

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
                            this._logStartupInfo();
                            callback(null);
                        }
                    });
                }, 60 * 1000);
            } else {
                this._logStartupInfo();
                callback(null);
            }
        });

        // Register callbacks.
        this.shepherd.on('ready', this.handleReady);
        this.shepherd.on('ind', this.handleMessage);
        this.shepherd.on('error', this.handleError);
    }

    _logStartupInfo() {
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

    handleReady() {
        // Set all Xiaomi devices to be online, so shepherd won't try
        // to query info from devices (which would fail because they go to sleep).
        const devices = this.getAllClients();
        devices.forEach((d) => {
            if (utils.isXiaomiDevice(d)) {
                const device = this.shepherd.find(d.ieeeAddr, 1);
                if (device) {
                    device.getDevice().update({
                        status: 'online',
                        joinTime: Math.floor(Date.now() / 1000),
                    });
                }
            }
        });

        // Check if we have to turn off the led
        if (settings.get().serial.disable_led) {
            this.shepherd.controller.request('UTIL', 'ledControl', {ledid: 3, mode: 0});
        }

        logger.info('zigbee-shepherd ready');
    }

    handleError(message) {
        // This event may appear if zigbee-shepherd cannot decode bad packets (invalid checksum).
        logger.error(message);
    }

    permitJoin(permit) {
        if (permit) {
            logger.info('Zigbee: allowing new devices to join.');
        } else {
            logger.info('Zigbee: disabling joining new devices.');
        }

        this.shepherd.permitJoin(permit ? 255 : 0, (error) => {
            if (error) {
                logger.info(error);
            }
        });
    }

    getAllClients() {
        return this.getDevices().filter((device) => device.type !== 'Coordinator');
    }

    removeDevice(deviceID, callback) {
        this.shepherd.remove(deviceID, (error) => {
            if (error) {
                logger.warn(`Failed to remove '${deviceID}', trying force remove...`);
                this._forceRemove(deviceID, callback);
            } else {
                callback(null);
            }
        });
    }

    _forceRemove(deviceID, callback) {
        const device = this.shepherd._findDevByAddr(deviceID);

        if (device) {
            return this.shepherd._unregisterDev(device, (error) => callback(error));
        } else {
            logger.warn(`Could not find ${deviceID} for force removal`);
            callback(true);
        }
    }

    ping(deviceID) {
        let friendlyName = 'unknown';
        const device = this.shepherd._findDevByAddr(deviceID);
        const ieeeAddr = device.ieeeAddr;
        if (settings.getDevice(ieeeAddr)) {
            friendlyName = settings.getDevice(ieeeAddr).friendly_name;
        }

        if (device) {
            // Note: checkOnline has the callback argument but does not call callback
            logger.debug(`Check online ${friendlyName} ${deviceID}`);
            this.shepherd.controller.checkOnline(device);
        }
    }

    handleMessage(message) {
        if (this.onMessage) {
            this.onMessage(message);
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

    publish(ieeAddr, cid, cmd, cmdType, zclData, cfg, ep, callback) {
        const device = this._findDevice(ieeAddr, ep);
        if (!device) {
            logger.error(`Zigbee cannot publish message to device because '${ieeAddr}' not known by zigbee-shepherd`);
            return;
        }

        logger.info(
            `Zigbee publish to '${ieeAddr}', ${cid} - ${cmd} - ` +
            `${JSON.stringify(zclData)} - ${JSON.stringify(cfg)} - ${ep}`
        );

        const callback_ = (error, rsp) => {
            if (error) {
                logger.error(
                    `Zigbee publish to '${ieeAddr}', ${cid} - ${cmd} - ${JSON.stringify(zclData)} ` +
                    `- ${JSON.stringify(cfg)} - ${ep} ` +
                    `failed with error ${error}`);
            }

            callback(error, rsp);

            // TODO: Send read reponse back to MQTT.
        };

        if (cmdType === 'functional') {
            device.functional(cid, cmd, zclData, cfg, callback_);
        } else if (cmdType === 'foundation') {
            device.foundation(cid, cmd, zclData, cfg, callback_);
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

    registerOnAfIncomingMsg(ieeeAddr, ep) {
        const device = this._findDevice(ieeeAddr, ep);
        device.onAfIncomingMsg = (message) => {
            // Parse the message
            zclPacket.parse(message.data, message.clusterid, (error, zclData) => {
                const message = {
                    endpoints: [device],
                    data: zclData,
                };

                this.handleMessage(message);
            });
        };
    }

    _findDevice(deviceID, ep) {
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
