const ZShepherd = require('zigbee-shepherd');
const logger = require('./util/logger');
const settings = require('./util/settings');
const data = require('./util/data');

const shepherdSettings = {
    net: {
        panId: settings.get().advanced.pan_id,
        channelList: [settings.get().advanced.hasOwnProperty('channel')
            ? settings.get().advanced.channel
            : 11]
    },
    dbPath: data.joinPath('database.db')
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

        // this event may appear if zigbee lib cannot decode bad packets (Invalid checksum)
        this.shepherd.on('error', this.handleError);

        this.onMessage = onMessage;
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

    handleMessage(message) {
        if (this.onMessage) {
            this.onMessage(message);
        }
    }

    getDevice(deviceID) {
        return this.shepherd.list().find((d) => d.ieeeAddr === deviceID);
    }

    publish(deviceID, cid, cmd, zclData, ep, callback) {
        // Find device in zigbee-shepherd
        let device = this.getDevice(deviceID);
        if (!device || !device.epList || !device.epList.length) {
            logger.error(`Zigbee cannot determine endpoint for '${deviceID}'`);
            return;
        }

        ep = ep ? ep : device.epList[0];
        device = this.shepherd.find(deviceID, ep);

        if (!device) {
            logger.error(
                `Zigbee cannot publish message to device because '${deviceID}' is not known by zigbee-shepherd`
            );
            return;
        }

        logger.info(`Zigbee publish to '${deviceID}', ${cid} - ${cmd} - ${JSON.stringify(zclData)} - ${ep}`);
        device.functional(cid, cmd, zclData, callback);
    }
}

module.exports = Zigbee;
