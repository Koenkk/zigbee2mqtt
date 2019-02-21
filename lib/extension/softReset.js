const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');

/**
 * This extensions soft resets the ZNP after a certain timeout.
 */
class SoftReset {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.timer = null;
        this.timeout = utils.secondsToMilliseconds(settings.get().advanced.soft_reset_timeout);
    }

    onZigbeeStarted() {
        logger.debug(`Soft reset timeout set to ${utils.millisecondsToSeconds(this.timeout)} seconds`);
        this.resetTimer();
    }

    clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    resetTimer() {
        if (this.timeout === 0) {
            return;
        }

        this.clearTimer();
        this.timer = setTimeout(() => this.handleTimeout(), this.timeout);
    }

    handleTimeout() {
        logger.warn('Soft reset timeout triggered');

        this.zigbee.softReset((error) => {
            if (error) {
                logger.warn('Soft reset failed, trying stop/start');
                this.zigbee.stop((error) => {
                    logger.warn('Zigbee stopped');
                    this.zigbee.start((error) => {
                        if (error) {
                            logger.error('Failed to restart!');
                        }
                    });
                });
            } else {
                logger.warn('Soft resetted ZNP due to timeout');
            }

            this.resetTimer();
        });
    }

    onZigbeeMessage(message, device, mappedDevice) {
        this.resetTimer();
    }
}

module.exports = SoftReset;
