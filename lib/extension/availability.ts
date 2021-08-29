import ExtensionTS from './extensionts';
import logger from '../util/logger';
import {sleep, hours, minutes, seconds, isAvailabilityEnabledForDevice} from '../util/utils';
import * as settings from '../util/settings';
import debounce from 'debounce';

// TODO
// - Enable for HA addon
// - Add to setting schema (when old availability is removed)
class Availability extends ExtensionTS {
    private timers: {[s: string]: NodeJS.Timeout} = {};
    private availabilityCache: {[s: string]: boolean} = {};
    private retrieveStateDebouncers: {[s: string]: () => void} = {};
    private pingQueue: Device[] = [];
    private pingQueueExecuting = false;

    constructor(zigbee: Zigbee, mqtt: TempMQTT, state: TempState,
        publishEntityState: TempPublishEntityState, eventBus: eventbus.EventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.lastSeenChanged = this.lastSeenChanged.bind(this);
        this.onDeviceRenamed = this.onDeviceRenamed.bind(this);
        this.eventBus.on('deviceRenamed', this.onDeviceRenamed, this.constructor.name);
        this.zigbee.on('lastSeenChanged', this.lastSeenChanged);
        logger.warn('Using experimental new availability feature');
    }

    private onDeviceRenamed(data: eventbus.DeviceRenamedData): void {
        this.publishAvailability(data.device, false, true);
    }

    private getTimeout(device: Device): number {
        if (typeof device.settings.availability === 'object' && device.settings.availability?.timeout != null) {
            return minutes(device.settings.availability.timeout);
        }

        const key = this.isActiveDevice(device) ? 'active' : 'passive';
        const availabilitySettings = settings.get().availability;
        if (typeof availabilitySettings === 'object' && availabilitySettings[key]?.timeout != null) {
            return minutes(availabilitySettings[key]?.timeout);
        }

        return key === 'active' ? minutes(10) : hours(25);
    }

    private isActiveDevice(device: Device): boolean {
        return (device.type === 'Router' && device.powerSource !== 'Battery') ||
            device.powerSource === 'Mains (single phase)';
    }

    private isAvailable(device: Device): boolean {
        const ago = Date.now() - device.lastSeen;
        return ago < this.getTimeout(device);
    }

    private resetTimer(device: Device): void {
        clearTimeout(this.timers[device.ieeeAddr]);

        // If the timer triggers, the device is not avaiable anymore otherwise resetTimer already have been called
        if (this.isActiveDevice(device)) {
            // If device did not check in, ping it, if that fails it will be marked as offline
            this.timers[device.ieeeAddr] = setTimeout(
                () => this.addToPingQueue(device), this.getTimeout(device) + seconds(1));
        } else {
            this.timers[device.ieeeAddr] = setTimeout(
                () => this.publishAvailability(device, true), this.getTimeout(device) + seconds(1));
        }
    }

    private addToPingQueue(device: Device): void {
        this.pingQueue.push(device);
        this.pingQueueExecuteNext();
    }

    private removeFromPingQueue(device: Device): void {
        const index = this.pingQueue.findIndex((d) => d.ieeeAddr === device.ieeeAddr);
        index != -1 && this.pingQueue.splice(index, 1);
    }

    private async pingQueueExecuteNext(): Promise<void> {
        if (this.pingQueue.length === 0 || this.pingQueueExecuting) return;
        this.pingQueueExecuting = true;

        const device = this.pingQueue[0];
        let pingedSuccessfully = false;
        const available = this.availabilityCache[device.ieeeAddr] || this.isAvailable(device);
        const attempts = available ? 2 : 1;
        for (let i = 0; i < attempts; i++) {
            try {
                // Enable recovery if device is marked as available and first ping fails.
                const disableRecovery = !(i == 1 && available);
                await device.ping(disableRecovery);
                pingedSuccessfully = true;
                logger.debug(`Succesfully pinged '${device.name}' (attempt ${i + 1}/${attempts})`);
                break;
            } catch (error) {
                logger.error(`Failed to ping '${device.name}' (attempt ${i + 1}/${attempts}, ${error.message})`);
                // Try again in 3 seconds.
                const lastAttempt = i - 1 === attempts;
                !lastAttempt && await sleep(3);
            }
        }

        this.publishAvailability(device, !pingedSuccessfully);
        this.resetTimer(device);
        this.removeFromPingQueue(device);

        // Sleep 2 seconds before executing next ping
        await sleep(2);
        this.pingQueueExecuting = false;
        this.pingQueueExecuteNext();
    }

    override onMQTTConnected(): void {
        for (const device of this.zigbee.getClients()) {
            if (isAvailabilityEnabledForDevice(device, settings.get())) {
                // Publish initial availablility
                this.publishAvailability(device, true);

                this.resetTimer(device);

                // If an active device is initially unavailable, ping it.
                if (this.isActiveDevice(device) && !this.isAvailable(device)) {
                    this.addToPingQueue(device);
                }
            }
        }
    }

    override onZigbeeEvent(type: ZigbeeEventType, data: ZigbeeEventData, re: ResolvedEntity): void {
        if (type === 'deviceLeave') {
            clearTimeout(this.timers[data.ieeeAddr]);
        } else if (type === 'deviceAnnounce') {
            const device = this.zigbee.resolveEntity((re as ResolvedDevice).device);
            this.retrieveState(device);
        }
    }

    private publishAvailability(device: Device, logLastSeen: boolean, forcePublish=false): void {
        if (logLastSeen) {
            const ago = Date.now() - device.lastSeen;
            if (this.isActiveDevice(device)) {
                logger.debug(
                    `Active device '${device.name}' was last seen '${(ago / minutes(1)).toFixed(2)}' minutes ago.`);
            } else {
                logger.debug(
                    `Passive device '${device.name}' was last seen '${(ago / hours(1)).toFixed(2)}' hours ago.`);
            }
        }

        const available = this.isAvailable(device);
        if (!forcePublish && this.availabilityCache[device.ieeeAddr] == available) {
            return;
        }

        if (device.ieeeAddr in this.availabilityCache && available &&
            this.availabilityCache[device.ieeeAddr] === false) {
            logger.debug(`Device '${device.name}' reconnected`);
            this.retrieveState(device);
        }

        const topic = `${device.name}/availability`;
        const payload = available ? 'online' : 'offline';
        this.availabilityCache[device.ieeeAddr] = available;
        this.mqtt.publish(topic, payload, {retain: true, qos: 0});
    }

    private lastSeenChanged(data: {device: ZHDevice}): void {
        const device = this.zigbee.resolveEntity(data.device);
        if (isAvailabilityEnabledForDevice(device, settings.get())) {
            // Remove from ping queue, not necessary anymore since we know the device is online.
            this.removeFromPingQueue(device);
            this.resetTimer(device);
            this.publishAvailability(device, false);
        }
    }

    override stop(): void {
        super.stop();
        Object.values(this.timers).forEach((t) => clearTimeout(t));
        this.zigbee.removeListener('lastSeenChanged', this.lastSeenChanged);
    }

    private retrieveState(device: Device): void {
        /**
         * Retrieve state of a device in a debounced manner, this function is called on a 'deviceAnnounce' which a
         * device can send multiple times after each other.
         */
        if (device.definition && !device.interviewing && !this.retrieveStateDebouncers[device.ieeeAddr]) {
            this.retrieveStateDebouncers[device.ieeeAddr] = debounce(async () => {
                try {
                    logger.debug(`Retrieving state of '${device.name}' after reconnect`);
                    // Color and color temperature converters do both, only needs to be called once.
                    const keySet = [['state'], ['brightness'], ['color', 'color_temp']];
                    for (const keys of keySet) {
                        const converter = device.definition.toZigbee.find((c) => c.key.find((k) => keys.includes(k)));
                        await converter?.convertGet?.(device.endpoint(), keys[0],
                            {message: this.state.get(device.ieeeAddr) || {}, mapped: device.definition});
                    }
                } catch (error) {
                    logger.error(`Failed to read state of '${device.name}' after reconnect (${error.message})`);
                }
            }, seconds(2));
        }

        this.retrieveStateDebouncers[device.ieeeAddr]?.();
    }
}

// TODO_finished: : change class to export default
module.exports = Availability;
