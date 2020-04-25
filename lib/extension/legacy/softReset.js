/* istanbul ignore file */
// DEPRECATED
const settings = require('../../util/settings');
const logger = require('../../util/logger');
const utils = require('../../util/utils');
const Extension = require('../extension');

/**
 * This extensions soft resets the ZNP after a certain timeout.
 */
class SoftReset extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
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

    async handleTimeout() {
        logger.warn('Soft reset timeout triggered');

        try {
            await this.zigbee.reset('soft');
            logger.warn('Soft resetted ZNP due to timeout');
        } catch (error) {
            logger.warn('Soft reset failed, trying stop/start');

            await this.zigbee.stop();
            logger.warn('Zigbee stopped');

            try {
                await this.zigbee.start();
            } catch (error) {
                logger.error('Failed to restart!');
            }
        }

        this.resetTimer();
    }

    onZigbeeEvent() {
        this.resetTimer();
    }
}

module.exports = SoftReset;
