import ExtensionTS from './extensionts';
import logger from '../util/logger';

const hours = (hours: number): number => 1000 * 60 * 60 * hours;
const minutes = (minutes: number): number => 1000 * 60 * minutes;
const seconds = (seconds: number): number => 1000 * seconds;

const ActiveTimeout = minutes(10);
const PassiveTimeout = hours(25);

class AvailabilityNew extends ExtensionTS {
    private timers: {[s: string]: NodeJS.Timeout} = {};
    private availabilityCache: {[s: string]: boolean} = {};
    private pingQueue: ResolvedEntity[] = [];
    private pingQueueExecuting = false;

    constructor(zigbee: TempZigbee, mqtt: TempMQTT, state: TempState,
        publishEntityState: TempPublishEntityState, eventBus: TempEventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.lastSeenChanged = this.lastSeenChanged.bind(this);
        logger.warn('Using experimental new availability feature');
    }

    private isActiveDevice(re: ResolvedEntity): boolean {
        return (re.device.type === 'Router' && re.device.powerSource !== 'Battery') ||
            re.device.powerSource === 'Mains (single phase)';
    }

    private isAvailable(re: ResolvedEntity): boolean {
        const ago = Date.now() - re.device.lastSeen;
        if (this.isActiveDevice(re)) {
            logger.debug(`Active device '${re.name}' was last seen '${(ago / minutes(1)).toFixed(2)}' minutes ago.`);
            return ago < ActiveTimeout;
        } else {
            logger.debug(`Passive device '${re.name}' was last seen '${(ago / hours(1)).toFixed(2)}' hours ago.`);
            return ago < PassiveTimeout;
        }
    }

    private resetTimer(re: ResolvedEntity): void {
        clearTimeout(this.timers[re.device.ieeeAddr]);

        // If the timer triggers, the device is not avaiable anymore otherwise resetTimer already have been called
        if (this.isActiveDevice(re)) {
            // If device did not check in, ping it, if that fails it will be marked as offline
            this.timers[re.device.ieeeAddr] = setTimeout(
                () => this.addToPingQueue(re), ActiveTimeout + seconds(1));
        } else {
            this.timers[re.device.ieeeAddr] = setTimeout(
                () => this.publishAvailability(re), PassiveTimeout + seconds(1));
        }
    }

    private addToPingQueue(re: ResolvedEntity): void {
        this.pingQueue.push(re);
        this.pingQueueExecuteNext();
    }

    private removeFromPingQueue(re: ResolvedEntity): void {
        const index = this.pingQueue.findIndex((r) => r.device.ieeeAddr === re.device.ieeeAddr);
        index != -1 && this.pingQueue.splice(index, 1);
    }

    private async pingQueueExecuteNext(): Promise<void> {
        if (this.pingQueue.length === 0 || this.pingQueueExecuting) return;
        this.pingQueueExecuting = true;

        const re = this.pingQueue[0];
        try {
            await re.device.ping();
            logger.debug(`Succesfully pinged '${re.name}'`);
        } catch {
            logger.error(`Failed to ping '${re.name}'`);
        }

        this.publishAvailability(re);
        this.resetTimer(re);
        this.removeFromPingQueue(re);
        this.pingQueueExecuting = false;
        this.pingQueueExecuteNext();
    }

    override onMQTTConnected(): void {
        for (const device of this.zigbee.getClients()) {
            const re: ResolvedEntity = this.zigbee.resolveEntity(device);
            this.resetTimer(re);

            // Publish initial availablility
            this.publishAvailability(re);

            // If an active device is initially unavailable, ping it.
            if (this.isActiveDevice(re) && !this.isAvailable(re)) {
                this.addToPingQueue(re);
            }
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

        // Remove from ping queue, not necessary anymore since we know the device is online.
        this.removeFromPingQueue(re);
        this.resetTimer(re);
        this.publishAvailability(re);
    }

    override stop(): void {
        Object.values(this.timers).forEach((t) => clearTimeout(t));
        this.zigbee.removeListener('lastSeenChanged', this.lastSeenChanged);
        super.stop();
    }
}

module.exports = AvailabilityNew;
