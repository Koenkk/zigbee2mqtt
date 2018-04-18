const ZShepherd = require('zigbee-shepherd');
const logger = require('./util/logger');
const settings = require('./util/settings');
const deviceMapping = require('./devices');

const shepherdSettings = {
    net: {panId: 0x1a62},
    dbPath: `${__dirname}/../data/database.db`
};

class Zigbee {

    constructor() {
        this.handleReady = this.handleReady.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
    }

    start(onMessage, callback) {
        logger.info(`Starting zigbee-shepherd`);

        this.shepherd = new ZShepherd(settings.get().serial.port, shepherdSettings);

        this.shepherd.start((error) => {
            if (error) {
                logger.error('Error while starting zigbee-shepherd!');
            } else {
                logger.info('zigbee-shepherd started');
            }

            callback(error);
        });

        // Register callbacks.
        this.shepherd.on('ready', this.handleReady);
        this.shepherd.on('ind', this.handleMessage);

        this.onMessage = onMessage;
    }

    stop(callback) {
        this.shepherd.stop((error) => {
            if (error) {
                logger.error('Error while stopping zigbee-shepherd');
            } else {
                logger.error('zigbee-shepherd stopped')
            }

            callback(error);
        });
    }

    handleReady() {
        logger.info('zigbee-shepherd ready');

        const devices = this.shepherd.list().filter((device) => device.type !== 'Coordinator');

        logger.info(`Currently ${devices.length} devices are joined:`);
        devices.forEach((device) => logger.info(getDeviceLogMessage(device)));

        // Set all Xiaomi devices (manufId === 4151) to be online, so shepherd won't try
        // to query info from devices (which would fail because they go tosleep).
        devices.forEach((device) => {
            if (device.manufId === 4151) {
                this.shepherd.find(device.ieeeAddr, 1).getDevice().update({
                    status: 'online',
                    joinTime: Math.floor(Date.now()/1000)
                });
            }
        });

        // Allow or disallow new devices to join the network.
        if (settings.get().allowJoin) {
            logger.warn('allowJoin set to  true in configuration.yaml.')
            logger.warn('Allowing new devices to join.');
            logger.warn('Remove this parameter once you joined all devices.');
        }

        this.shepherd.permitJoin(settings.get().allowJoin ? 255 : 0, (error) => {
            if (error) {
                logger.info(error);
            }
        });
    }

    handleMessage(message) {
        if (this.onMessage) {
            this.onMessage(message);
        }
    }

    getDeviceLogMessage(device) {
        let friendlyName = 'unknown';
        let friendlyDevice = {model: 'unkown', description: 'unknown'};

        if (deviceMapping[device.modelId]) {
            friendlyDevice = deviceMapping[device.modelId];
        }

        if (settings.get().devices[device.ieeeAddr]) {
            friendlyName = settings.devices[device.ieeeAddr].friendly_name
        }

        return `${friendlyName} (${device.ieeeAddr}): ${friendlyDevice.model} - ${friendlyDevice.description}`;
    }

    publish(deviceID, cId, cmd, zclData, callback) {
        // Find device in zigbee-shepherd
        const device = this.shepherd.find(deviceID, 1);
        if (!device) {
            logger.error(`Zigbee cannot publish message to device because '${deviceID}' is not known by zigbee-shepherd`);
        }

        logger.info(`Zigbee publish to '${deviceID}', ${cId} - ${cmd} - ${zclData}`);
        device.functional(cId, cmd, zclData, callback);
    }
}

module.exports = Zigbee;
