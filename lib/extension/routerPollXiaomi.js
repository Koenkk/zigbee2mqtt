const utils = require('../util/utils');
const interval = utils.secondsToMilliseconds(60);
const Queue = require('queue');
const logger = require('../util/logger');

/**
 * This extensions polls Xiaomi Zigbee routers to keep them awake.
 */
class RouterPollXiaomi {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.timer = null;

        /**
         * Setup command queue.
         * The command queue ensures that only 1 command is executed at a time.
         * This is to avoid DDoSiNg of the coordinator.
         */
        this.queue = new Queue();
        this.queue.concurrency = 1;
        this.queue.autostart = true;
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
        this.queue.stop();
        this.clearTimer();
    }

    ping(ieeeAddr) {
        this.queue.push((queueCallback) => {
            this.zigbee.ping(ieeeAddr, (error) => {
                if (error) {
                    logger.debug(`Failed to ping ${ieeeAddr}`);
                } else {
                    logger.debug(`Successfully pinged ${ieeeAddr}`);
                }

                queueCallback();
            });
        });
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
