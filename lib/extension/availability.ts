import ExtensionTS from './extensionts';
import logger from '../util/logger';

const Seconds1 = 1000;
const Minutes1 = 1000 * 60;
const Hours1 = Minutes1 * 60;
const Hours25 = 25 * Hours1;
const Minutes10 = 10 * Minutes1;

class Availability extends ExtensionTS {
    private timers: {[s: string]: NodeJS.Timeout} = {};
    private lastSeenHandlers: {[s: string]: {handler: () => void, device: Device}} = {};
    private availabilityCache: {[s: string]: boolean} = {};

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

    private lastSeenChanged(re: ResolvedEntity) {
        this.resetTimer(re);
        this.publishAvailability(re);
    }

    private initLastSeenHandlers(re: ResolvedEntity): void {
        if (this.lastSeenHandlers[re.device.ieeeAddr]) return;
        const handler = (): void => this.lastSeenChanged(re);
        this.lastSeenHandlers[re.device.ieeeAddr] = {handler, device: re.device};
        // TODO implement in zigbee-herdsman
        re.device.on('lastSeenChanged', handler);
    }

    private resetTimer(re: ResolvedEntity): void {
        clearTimeout(this.timers[re.device.ieeeAddr]);

        // If the timer triggers, the device is not avaiable anymore otherwise resetTimer already have been called
        if (this.isActiveDevice(re)) {
            this.timers[re.device.ieeeAddr] = setTimeout(async () => {
                // Device did not check in, ping it
                try {
                    await re.device.ping();
                    logger.debug(`Succesfully pinged '${re.name}'`);
                } catch (error) {
                    logger.error(`Failed to ping '${re.name}'`);
                }

                this.publishAvailability(re);
                this.resetTimer(re);
            }, Minutes10 + Seconds1);
        } else {
            this.timers[re.device.ieeeAddr] = setTimeout(() => this.publishAvailability(re), Hours25 + Seconds1);
        }
    }

    onMQTTConnected(): void {
        for (const device of this.zigbee.getClients()) {
            const re: ResolvedEntity = this.zigbee.resolveEntity(device);
            this.initLastSeenHandlers(re);
            this.resetTimer(re);

            // Publish initial availablility
            this.publishAvailability(re);
            // TODO: if a active device is initially unavaiable, ping it.
        }
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

    public stop() {
        // TODO implement in zigbee-herdsman
        Object.values(this.lastSeenHandlers).forEach((e) => e.device.removeListener(e.handler));
        super.stop();
    }
}

module.exports = Availability;
