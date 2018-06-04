const ZShepherd = require('zigbee-shepherd');
const logger = require('./util/logger');
const settings = require('./util/settings');
const data = require('./util/data');
const debug = require('debug')('zigbee2mqtt:zigbee');

const advancedSettings = settings.get().advanced;

const shepherdSettings = {
    net: {
        panId: advancedSettings && advancedSettings.pan_id ? advancedSettings.pan_id : 0x1a62,
        channelList: [advancedSettings && advancedSettings.channel ? advancedSettings.channel : 11],
    },
    dbPath: data.joinPath('database.db'),
};

class Zigbee {
    constructor() {
        this.handleReady = this.handleReady.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.handleError = this.handleError.bind(this);
    }

    start(onMessage, callback) {
        logger.info(`Starting zigbee-shepherd`);

        this.shepherd = new ZShepherd(settings.get().serial.port, shepherdSettings);

        this.shepherd.start((error) => {
            if (error) {
                logger.warn('Error while starting zigbee-shepherd, attemping to fix... (takes 60 seconds)');
                this.shepherd.controller._znp.close((() => null));

                setTimeout(() => {
                    logger.info(`Starting zigbee-shepherd`);
                    this.shepherd.start((error) => {
                        if (error) {
                            logger.error('Error while starting zigbee-shepherd!');
                            callback(error);
                        } else {
                            logger.info('zigbee-shepherd started');
                            callback(null);
                        }
                    });
                }, 60 * 1000);
            } else {
                logger.info('zigbee-shepherd started');
                callback(null);
            }
        });

        // Register callbacks.
        this.shepherd.on('ready', this.handleReady);
        this.shepherd.on('ind', this.handleMessage);
        this.shepherd.on('error', this.handleError);

        this.onMessage = onMessage;
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
        // Set all Xiaomi devices (manufId === 4151) to be online, so shepherd won't try
        // to query info from devices (which would fail because they go tosleep).
        // Xiaomi lumi.plug has manufId === 4447 and can be in the sleep mode too
        const devices = this.getAllClients();
        devices.forEach((device) => {
            if ((device.manufId === 4151) || (device.manufId === 4447)) {
                this.shepherd.find(device.ieeeAddr, 1).getDevice().update({
                    status: 'online',
                    joinTime: Math.floor(Date.now() / 1000),
                });
            }
        });

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
        return this.shepherd.list().filter((device) => device.type !== 'Coordinator');
    }

    removedevice(deviceID) {
            if (deviceID) {
                logger.info(`Found Device with ID ${deviceID}`);
                this.shepherd.remove('deviceID', function (err) {
                        if (err) {
                                console.log(`Failed to removed ${deviceID}`);
                        } else {
                                console.log(`Successfully removed ${deviceID}`);
                        }
                });
            } else {
                   logger.error('removedevice function need deviceID to proceed');
                   return;
            }
    }
    
    ping(deviceID) {
        const device = this.shepherd._findDevByAddr(deviceID);

        if (device) {
            // Note: checkOnline has the callback argument but does not call callback
            debug(`Check online ${deviceID}`);
            this.shepherd.controller.checkOnline(device);
        }
    }

    handleMessage(message) {
        if (this.onMessage) {
            this.onMessage(message);
        }
    }

    getDevice(deviceID) {
        return this.shepherd.list().find((d) => d.ieeeAddr === deviceID);
    }

    getCoordinator() {
        const device = this.shepherd.list().find((d) => d.type === 'Coordinator');
        return this.shepherd.find(device.ieeeAddr, 1);
    }

    publish(deviceID, cid, cmd, zclData, ep, callback) {
        const device = this._findDevice(deviceID, ep);
        if (!device) {
            logger.error(`Zigbee cannot publish message to device because '${deviceID}' not known by zigbee-shepherd`);
            return;
        }

        logger.info(`Zigbee publish to '${deviceID}', ${cid} - ${cmd} - ${JSON.stringify(zclData)} - ${ep}`);
        device.functional(cid, cmd, zclData, callback);
    }

    read(deviceID, cid, attr, ep, callback) {
        const device = this._findDevice(deviceID, ep);
        if (!device) {
            logger.error(`Zigbee cannot read attribute from device because '${deviceID}' not known by zigbee-shepherd`);
            return;
        }

        device.read(cid, attr, callback);
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
