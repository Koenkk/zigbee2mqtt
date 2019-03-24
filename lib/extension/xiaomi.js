const utils = require('../util/utils');
const interval = utils.secondsToMilliseconds(60);
const logger = require('../util/logger');
const settings = require('../util/settings');

/**
 * This extensions handles Xiaomi devices.
 * - Marks Xiaomi devices as online.
 * - Polls Xiaomi routers to keep them awake.
 */
class Xiaomi {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.timer = null;
    }

    onZigbeeStarted() {
        // Set all Xiaomi devices to be online, so shepherd won't try
        // to query info from devices (which would fail because they go to sleep).
        const devices = this.zigbee.getAllClients();
        devices.forEach((d) => {
            if (utils.isXiaomiDevice(d)) {
                const device = this.zigbee.shepherd.find(d.ieeeAddr, 1);
                if (device) {
                    device.getDevice().update({
                        status: 'online',
                        joinTime: Math.floor(Date.now() / 1000),
                    });
                }
            }
        });

        /**
         * Device availability already pings Xiaomi devices.
         */
        if (!settings.get().advanced.availability_timeout) {
            this.startTimer();
        } else {
            logger.debug('Disabled pinging of Xiaomi devices in Xiaomi extension because availability is enabled');
        }
    }

    startTimer() {
        this.clearTimer();
        this.timer = setInterval(() => this.handleInterval(), interval);
    }

    clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    stop() {
        this.clearTimer();
    }

    ping(ieeeAddr) {
        this.zigbee.ping(ieeeAddr, 'error', null, 'basic');
    }

    handleInterval() {
        this.zigbee.getAllClients()
            .filter((d) => utils.isXiaomiDevice(d) && utils.isRouter(d) && !utils.isBatteryPowered(d))
            .forEach((d) => this.ping(d.ieeeAddr));
    }
}

module.exports = Xiaomi;
