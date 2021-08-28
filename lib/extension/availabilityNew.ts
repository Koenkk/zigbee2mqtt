import ExtensionTS from './extensionts';
import logger from '../util/logger';
import {sleep, isAvailabilityEnabledForDevice, hours, minutes, seconds} from '../util/utils';
import * as settings from '../util/settings';
import debounce from 'debounce';

// TODO
// - Enable for HA addon
// - Add to setting schema (when old availability is removed)
class AvailabilityNew extends ExtensionTS {
    private timers: {[s: string]: NodeJS.Timeout} = {};
    private availabilityCache: {[s: string]: boolean} = {};
    private retrieveStateDebouncers: {[s: string]: () => void} = {};
    private pingQueue: ResolvedDevice[] = [];
    private pingQueueExecuting = false;

    constructor(zigbee: TempZigbee, mqtt: TempMQTT, state: TempState,
        publishEntityState: TempPublishEntityState, eventBus: TempEventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.lastSeenChanged = this.lastSeenChanged.bind(this);
        logger.warn('Using experimental new availability feature');
    }

    private getTimeout(rd: ResolvedDevice): number {
        if (typeof rd.settings.availability === 'object' && rd.settings.availability?.timeout != null) {
            return minutes(rd.settings.availability.timeout);
        }

        const key = this.isActiveDevice(rd) ? 'active' : 'passive';
        const availabilitySettings = settings.get().availability;
        if (typeof availabilitySettings === 'object' && availabilitySettings[key]?.timeout != null) {
            return minutes(availabilitySettings[key]?.timeout);
        }

        return key === 'active' ? minutes(10) : hours(25);
    }

    private isActiveDevice(rd: ResolvedDevice): boolean {
        return (rd.device.type === 'Router' && rd.device.powerSource !== 'Battery') ||
            rd.device.powerSource === 'Mains (single phase)';
    }

    private isAvailable(rd: ResolvedDevice): boolean {
        const ago = Date.now() - rd.device.lastSeen;
        return ago < this.getTimeout(rd);
    }

    private resetTimer(rd: ResolvedDevice): void {
        clearTimeout(this.timers[rd.device.ieeeAddr]);

        // If the timer triggers, the device is not avaiable anymore otherwise resetTimer already have been called
        if (this.isActiveDevice(rd)) {
            // If device did not check in, ping it, if that fails it will be marked as offline
            this.timers[rd.device.ieeeAddr] = setTimeout(
                () => this.addToPingQueue(rd), this.getTimeout(rd) + seconds(1));
        } else {
            this.timers[rd.device.ieeeAddr] = setTimeout(
                () => this.publishAvailability(rd, true), this.getTimeout(rd) + seconds(1));
        }
    }

    private addToPingQueue(rd: ResolvedDevice): void {
        this.pingQueue.push(rd);
        this.pingQueueExecuteNext();
    }

    private removeFromPingQueue(rd: ResolvedDevice): void {
        const index = this.pingQueue.findIndex((r) => r.device.ieeeAddr === rd.device.ieeeAddr);
        index != -1 && this.pingQueue.splice(index, 1);
    }

    private async pingQueueExecuteNext(): Promise<void> {
        if (this.pingQueue.length === 0 || this.pingQueueExecuting) return;
        this.pingQueueExecuting = true;

        const rd = this.pingQueue[0];
        let pingedSuccessfully = false;
        const available = this.availabilityCache[rd.device.ieeeAddr] || this.isAvailable(rd);
        const attempts = available ? 2 : 1;
        for (let i = 0; i < attempts; i++) {
            try {
                // Enable recovery if device is marked as available and first ping fails.
                const disableRecovery = !(i == 1 && available);
                await rd.device.ping(disableRecovery);
                pingedSuccessfully = true;
                logger.debug(`Succesfully pinged '${rd.name}' (attempt ${i + 1}/${attempts})`);
                break;
            } catch (error) {
                logger.error(`Failed to ping '${rd.name}' (attempt ${i + 1}/${attempts}, ${error.message})`);
                // Try again in 3 seconds.
                const lastAttempt = i - 1 === attempts;
                !lastAttempt && await sleep(3);
            }
        }

        this.publishAvailability(rd, !pingedSuccessfully);
        this.resetTimer(rd);
        this.removeFromPingQueue(rd);

        // Sleep 2 seconds before executing next ping
        await sleep(2);
        this.pingQueueExecuting = false;
        this.pingQueueExecuteNext();
    }

    override onMQTTConnected(): void {
        for (const device of this.zigbee.getClients()) {
            const rd = this.zigbee.resolveEntity(device) as ResolvedDevice;
            if (isAvailabilityEnabledForDevice(rd, settings.get())) {
                // Publish initial availablility
                this.publishAvailability(rd, true);

                this.resetTimer(rd);

                // If an active device is initially unavailable, ping it.
                if (this.isActiveDevice(rd) && !this.isAvailable(rd)) {
                    this.addToPingQueue(rd);
                }
            }
        }
    }

    override onZigbeeStarted(): void {
        this.zigbee.on('lastSeenChanged', this.lastSeenChanged);
    }

    override onZigbeeEvent(type: ZigbeeEventType, data: ZigbeeEventData, re: ResolvedEntity): void {
        /* istanbul ignore else */
        if (type === 'deviceLeave') {
            clearTimeout(this.timers[data.ieeeAddr]);
        } else if (type === 'deviceAnnounce') {
            this.retrieveState(re as ResolvedDevice);
        }
    }

    private publishAvailability(rd: ResolvedDevice, logLastSeen: boolean): void {
        if (logLastSeen) {
            const ago = Date.now() - rd.device.lastSeen;
            if (this.isActiveDevice(rd)) {
                logger.debug(
                    `Active device '${rd.name}' was last seen '${(ago / minutes(1)).toFixed(2)}' minutes ago.`);
            } else {
                logger.debug(`Passive device '${rd.name}' was last seen '${(ago / hours(1)).toFixed(2)}' hours ago.`);
            }
        }

        const available = this.isAvailable(rd);
        if (this.availabilityCache[rd.device.ieeeAddr] == available) {
            return;
        }

        if (rd.device.ieeeAddr in this.availabilityCache && available &&
            this.availabilityCache[rd.device.ieeeAddr] === false) {
            logger.debug(`Device '${rd.name}' reconnected`);
            this.retrieveState(rd);
        }

        const topic = `${rd.name}/availability`;
        const payload = available ? 'online' : 'offline';
        this.availabilityCache[rd.device.ieeeAddr] = available;
        this.mqtt.publish(topic, payload, {retain: true, qos: 0});
    }

    private lastSeenChanged(data: {device: Device}): void {
        const rd = this.zigbee.resolveEntity(data.device) as ResolvedDevice;
        if (isAvailabilityEnabledForDevice(rd, settings.get())) {
            // Remove from ping queue, not necessary anymore since we know the device is online.
            this.removeFromPingQueue(rd);
            this.resetTimer(rd);
            this.publishAvailability(rd, false);
        }
    }

    override stop(): void {
        Object.values(this.timers).forEach((t) => clearTimeout(t));
        this.zigbee.removeListener('lastSeenChanged', this.lastSeenChanged);
        super.stop();
    }

    private retrieveState(rd: ResolvedDevice): void {
        /**
         * Retrieve state of a device in a debounced manner, this function is called on a 'deviceAnnounce' which a
         * device can send multiple times after each other.
         */
        if (rd.definition && !rd.device.interviewing && !this.retrieveStateDebouncers[rd.device.ieeeAddr]) {
            this.retrieveStateDebouncers[rd.device.ieeeAddr] = debounce(async () => {
                try {
                    logger.debug(`Retrieving state of '${rd.name}' after reconnect`);
                    // Color and color temperature converters do both, only needs to be called once.
                    const keySet = [['state'], ['brightness'], ['color', 'color_temp']];
                    for (const keys of keySet) {
                        const converter = rd.definition.toZigbee.find((c) => c.key.find((k) => keys.includes(k)));
                        await converter?.convertGet?.(rd.endpoint, keys[0],
                            {message: this.state.get(rd.device.ieeeAddr) || {}, mapped: rd.definition});
                    }
                } catch (error) {
                    logger.error(`Failed to read state of '${rd.name}' after reconnect (${error.message})`);
                }
            }, seconds(2));
        }

        this.retrieveStateDebouncers[rd.device.ieeeAddr]?.();
    }
}

module.exports = AvailabilityNew;
