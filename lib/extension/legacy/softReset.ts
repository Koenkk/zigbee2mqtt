/* istanbul ignore file */

import logger from '../../util/logger';
// DEPRECATED
import * as settings from '../../util/settings';
import utils from '../../util/utils';
import Extension from '../extension';

/**
 * This extensions soft resets the ZNP after a certain timeout.
 */
export default class SoftReset extends Extension {
    private timer?: NodeJS.Timeout;
    private timeout = utils.seconds(settings.get().advanced.soft_reset_timeout);

    override async start(): Promise<void> {
        logger.debug(`Soft reset timeout set to ${this.timeout / 1000} seconds`);
        this.resetTimer();
        this.eventBus.onDeviceMessage(this, () => this.resetTimer());
        this.eventBus.onDeviceAnnounce(this, () => this.resetTimer());
        this.eventBus.onDeviceNetworkAddressChanged(this, () => this.resetTimer());
        this.eventBus.onDeviceJoined(this, () => this.resetTimer());
        this.eventBus.onDeviceInterview(this, () => this.resetTimer());
    }

    private clearTimer(): void {
        clearTimeout(this.timer);
        this.timer = undefined;
    }

    private resetTimer(): void {
        if (this.timeout === 0) {
            return;
        }

        this.clearTimer();
        this.timer = setTimeout(() => this.handleTimeout(), this.timeout);
    }

    private async handleTimeout(): Promise<void> {
        logger.warning('Soft reset timeout triggered');

        try {
            await this.zigbee.reset('soft');
            logger.warning('Soft reset ZNP due to timeout');
        } catch (error) {
            logger.warning(`Soft reset failed, trying stop/start (${(error as Error).message})`);

            await this.zigbee.stop();
            logger.warning('Zigbee stopped');

            try {
                await this.zigbee.start();
            } catch (error) {
                logger.error(`Failed to restart! (${(error as Error).message})`);
            }
        }

        this.resetTimer();
    }
}
