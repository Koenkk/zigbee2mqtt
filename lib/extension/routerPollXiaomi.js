const utils = require('../util/utils');
const interval = utils.secondsToMilliseconds(60);

/**
 * This extensions polls Xiaomi Zigbee routers to keep them awake.
 */
class RouterPollXiaomi {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.timer = null;
    }

    onZigbeeStarted() {
        this.startTimer();
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
        this.zigbee.ping(ieeeAddr);
    }

    handleInterval() {
        this.zigbee.getAllClients()
            .filter((d) => utils.isXiaomiDevice(d)) // Filter Xiaomi devices
            .filter((d) => d.type === 'Router') // Filter routers
            .filter((d) => d.powerSource && d.powerSource !== 'Battery') // Remove battery powered devices
            .forEach((d) => this.ping(d.ieeeAddr)); // Ping devices.
    }
}

module.exports = RouterPollXiaomi;
