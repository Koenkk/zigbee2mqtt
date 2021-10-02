/* istanbul ignore file */
// DEPRECATED
import * as settings from '../../util/settings';
import logger from '../../util/logger';
import utils from '../../util/utils';
import Extension from '../extension';

/**
 * This extensions soft resets the ZNP after a certain timeout.
 */
export default class SoftReset extends Extension {
    private timer: NodeJS.Timer = null;
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
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private resetTimer(): void {
        if (this.timeout === 0) {
            return;
        }

        this.clearTimer();
        this.timer = setTimeout(() => this.handleTimeout(), this.timeout);
    }

    private async handleTimeout(): Promise<void> {
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
}
