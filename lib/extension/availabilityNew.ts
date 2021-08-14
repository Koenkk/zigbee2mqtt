import ExtensionTS from './extensionts';
import logger from '../util/logger';

const Seconds1 = 1000;
const Minutes1 = 1000 * 60;
const Hours1 = Minutes1 * 60;
const Hours25 = 25 * Hours1;
const Minutes10 = 10 * Minutes1;

class AvailabilityNew extends ExtensionTS {
    private timers: {[s: string]: NodeJS.Timeout} = {};
    private availabilityCache: {[s: string]: boolean} = {};
    private pingQueue: {ieeAddr: string, handler: () => void}[] = [];

    private isActiveDevice(re: ResolvedEntity): boolean {
        return (re.device.type === 'Router' && re.device.powerSource !== 'Battery') ||
            re.device.powerSource === 'Mains (single phase)';
    }

    private isAvailable(re: ResolvedEntity): boolean {
        const ago = Date.now() - re.device.lastSeen;
        if (this.isActiveDevice(re)) {
            logger.debug(`Active device '${re.name}' was last seen '${(ago / Minutes1).toFixed(2)}' minutes ago.`);
            return ago < Minutes10;
        } else {
            logger.debug(`Passive device '${re.name}' was last seen '${(ago / Hours1).toFixed(2)}' hours ago.`);
            return ago < Hours25;
        }
    }

    private resetTimer(re: ResolvedEntity): void {
        clearTimeout(this.timers[re.device.ieeeAddr]);

        // If the timer triggers, the device is not avaiable anymore otherwise resetTimer already have been called
        if (this.isActiveDevice(re)) {
            // If device did not check in, ping it, if that fails it will be marked as offline
            this.timers[re.device.ieeeAddr] = setTimeout(() => this.ping(re), Minutes10 + Seconds1);
        } else {
            this.timers[re.device.ieeeAddr] = setTimeout(() => this.publishAvailability(re), Hours25 + Seconds1);
        }
    }

    private ping(re: ResolvedEntity): void {
        if (this.pingQueue.find((r) => r.ieeAddr === re.device.ieeeAddr)) {
            logger.debug(`Device '${re.name}' already in ping queue, skipping...`);
            return;
        }

        const handler = (): void => {
            re.device.ping()
                .then(() => logger.debug(`Succesfully pinged '${re.name}'`))
                .catch(() => logger.error(`Failed to ping '${re.name}'`))
                .finally(() => {
                    this.publishAvailability(re);
                    this.resetTimer(re);
                    this.pingQueue = this.pingQueue.filter((e) => e.ieeAddr !== re.device.ieeeAddr);
                });
        };

        this.pingQueue.push({ieeAddr: re.device.ieeeAddr, handler});
        // TODO: take elements from ping queue
    }

    override onMQTTConnected(): void {
        for (const device of this.zigbee.getClients()) {
            const re: ResolvedEntity = this.zigbee.resolveEntity(device);
            this.resetTimer(re);

            // Publish initial availablility
            this.publishAvailability(re);
            // TODO: if a active device is initially unavaiable, ping it.
        }
    }

    override onZigbeeStarted(): void {
        this.zigbee.on('lastSeenChanged', this.lastSeenChanged);
    }

    private publishAvailability(re: ResolvedEntity): void {
        const available = this.isAvailable(re);
        if (this.availabilityCache[re.device.ieeeAddr] == available) {
            return;
        }

        const topic = `${re.name}/availability`;
        const payload = available ? 'online' : 'offline';
        this.availabilityCache[re.device.ieeeAddr] = available;
        this.mqtt.publish(topic, payload, {retain: true, qos: 0});
    }

    private lastSeenChanged(data: {device: Device}): void {
        const re = this.zigbee.resolveEntity(data.device);
        this.resetTimer(re);
        this.publishAvailability(re);
    }

    override stop(): void {
        this.zigbee.removeListener('lastSeenChanged', this.lastSeenChanged);
        super.stop();
    }
}

module.exports = AvailabilityNew;
