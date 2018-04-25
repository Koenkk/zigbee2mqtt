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
            logger.info('zigbee-shepherd stopped')
            callback(error);
        });
    }

    handleReady() {
        logger.info('zigbee-shepherd ready');

        const devices = this.getAllClients();

        logger.info(`Currently ${devices.length} devices are joined:`);
        devices.forEach((device) => logger.info(this.getDeviceLogMessage(device)));

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

        if (settings.getDevice(device.ieeeAddr)) {
            friendlyName = settings.getDevice(device.ieeeAddr).friendly_name
        }

        return `${friendlyName} (${device.ieeeAddr}): ${friendlyDevice.model} - ${friendlyDevice.vendor} ${friendlyDevice.description}`;
    }

    publish(deviceID, cId, cmd, zclData, callback) {
        // Find device in zigbee-shepherd
        let device = this.shepherd.list().find((d) => d.ieeeAddr === deviceID);
        if (!device || !device.epList || !device.epList[0]) {
            logger.error(`Zigbee cannot determine endpoint for '${deviceID}'`);
            return;
        }

        device = this.shepherd.find(deviceID, device.epList[0]);

        if (!device) {
            logger.error(`Zigbee cannot publish message to device because '${deviceID}' is not known by zigbee-shepherd`);
            return;
        }

        logger.info(`Zigbee publish to '${deviceID}', ${cId} - ${cmd} - ${JSON.stringify(zclData)}`);
        device.functional(cId, cmd, zclData, callback);
    }
}

module.exports = Zigbee;
