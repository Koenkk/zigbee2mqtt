import Extension from './extension';
import logger from '../util/logger';
import utils from '../util/utils';
import * as settings from '../util/settings';
import debounce from 'debounce';
import bind from 'bind-decorator';

const retrieveOnReconnect = [
    {keys: ['state']},
    {keys: ['brightness'], condition: (state: KeyValue): boolean => state.state === 'ON'},
    {keys: ['color', 'color_temp'], condition: (state: KeyValue): boolean => state.state === 'ON'},
];

export default class Availability extends Extension {
    private timers: {[s: string]: NodeJS.Timeout} = {};
    private availabilityCache: {[s: string]: boolean} = {};
    private retrieveStateDebouncers: {[s: string]: () => void} = {};
    private pingQueue: Device[] = [];
    private pingQueueExecuting = false;

    private getTimeout(device: Device): number {
        if (typeof device.options.availability === 'object' && device.options.availability?.timeout != null) {
            return utils.minutes(device.options.availability.timeout);
        }

        const key = this.isActiveDevice(device) ? 'active' : 'passive';
        let value = settings.get().availability?.[key]?.timeout;
        if (value == null) value = key == 'active' ? 10 : 1500;
        return utils.minutes(value);
    }

    private isActiveDevice(device: Device): boolean {
        return (device.zh.type === 'Router' && device.zh.powerSource !== 'Battery') ||
            device.zh.powerSource === 'Mains (single phase)';
    }

    private isAvailable(entity: Device | Group): boolean {
        if (entity.isDevice()) {
            const ago = Date.now() - entity.zh.lastSeen;
            return ago < this.getTimeout(entity);
        } else {
            return entity.membersDevices().length === 0 ||
                entity.membersDevices().map((d) => this.availabilityCache[d.ieeeAddr]).includes(true);
        }
    }

    private resetTimer(device: Device): void {
        clearTimeout(this.timers[device.ieeeAddr]);

        // If the timer triggers, the device is not avaiable anymore otherwise resetTimer already have been called
        if (this.isActiveDevice(device)) {
            // If device did not check in, ping it, if that fails it will be marked as offline
            this.timers[device.ieeeAddr] = setTimeout(
                () => this.addToPingQueue(device), this.getTimeout(device) + utils.seconds(1));
        } else {
            this.timers[device.ieeeAddr] = setTimeout(
                () => this.publishAvailability(device, true), this.getTimeout(device) + utils.seconds(1));
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
                await device.zh.ping(disableRecovery);
                pingedSuccessfully = true;
                logger.debug(`Succesfully pinged '${device.name}' (attempt ${i + 1}/${attempts})`);
                break;
            } catch (error) {
                logger.warn(`Failed to ping '${device.name}' (attempt ${i + 1}/${attempts}, ${error.message})`);
                // Try again in 3 seconds.
                const lastAttempt = i - 1 === attempts;
                !lastAttempt && await utils.sleep(3);
            }
        }

        this.publishAvailability(device, !pingedSuccessfully);
        this.resetTimer(device);
        this.removeFromPingQueue(device);

        // Sleep 2 seconds before executing next ping
        await utils.sleep(2);
        this.pingQueueExecuting = false;
        this.pingQueueExecuteNext();
    }

    override async start(): Promise<void> {
        this.eventBus.onEntityRenamed(this, (data) => {
            if (utils.isAvailabilityEnabledForEntity(data.entity, settings.get())) {
                this.mqtt.publish(`${data.from}/availability`, null, {retain: true, qos: 0});
                this.publishAvailability(data.entity, false, true);
            }
        });

        this.eventBus.onDeviceRemoved(this, (data) => clearTimeout(this.timers[data.ieeeAddr]));
        this.eventBus.onDeviceLeave(this, (data) => clearTimeout(this.timers[data.ieeeAddr]));
        this.eventBus.onDeviceAnnounce(this, (data) => this.retrieveState(data.device));
        this.eventBus.onLastSeenChanged(this, this.onLastSeenChanged);
        this.eventBus.onPublishAvailability(this, this.publishAvailabilityForAllEntities);
        this.eventBus.onGroupMembersChanged(this, (data) => this.publishAvailability(data.group, false));
        this.publishAvailabilityForAllEntities();
    }

    @bind private publishAvailabilityForAllEntities(): void {
        for (const entity of [...this.zigbee.devices(false), ...this.zigbee.groups()]) {
            if (utils.isAvailabilityEnabledForEntity(entity, settings.get())) {
                // Publish initial availablility
                this.publishAvailability(entity, true, false, true);

                if (entity.isDevice()) {
                    this.resetTimer(entity);

                    // If an active device is initially unavailable, ping it.
                    if (this.isActiveDevice(entity) && !this.isAvailable(entity)) {
                        this.addToPingQueue(entity);
                    }
                }
            }
        }
    }

    private publishAvailability(entity: Device | Group, logLastSeen: boolean,
        forcePublish=false, skipGroups=false): void {
        if (logLastSeen && entity.isDevice()) {
            const ago = Date.now() - entity.zh.lastSeen;
            if (this.isActiveDevice(entity)) {
                logger.debug(`Active device '${entity.name}' was last seen ` +
                    `'${(ago / utils.minutes(1)).toFixed(2)}' minutes ago.`);
            } else {
                logger.debug(
                    `Passive device '${entity.name}' was last seen '${(ago / utils.hours(1)).toFixed(2)}' hours ago.`);
            }
        }

        const available = this.isAvailable(entity);
        if (!forcePublish && this.availabilityCache[entity.ID] == available) {
            return;
        }

        if (entity.isDevice() && entity.ieeeAddr in this.availabilityCache && available &&
            this.availabilityCache[entity.ieeeAddr] === false) {
            logger.debug(`Device '${entity.name}' reconnected`);
            this.retrieveState(entity);
        }

        const topic = `${entity.name}/availability`;
        const payload = utils.availabilityPayload(available ? 'online' : 'offline', settings.get());
        this.availabilityCache[entity.ID] = available;
        this.mqtt.publish(topic, payload, {retain: true, qos: 0});

        if (!skipGroups && entity.isDevice()) {
            this.zigbee.groups().filter((g) => g.hasMember(entity))
                .filter((g) => utils.isAvailabilityEnabledForEntity(g, settings.get()))
                .forEach((g) => this.publishAvailability(g, false, forcePublish));
        }
    }

    @bind private onLastSeenChanged(data: eventdata.LastSeenChanged): void {
        if (utils.isAvailabilityEnabledForEntity(data.device, settings.get())) {
            // Remove from ping queue, not necessary anymore since we know the device is online.
            this.removeFromPingQueue(data.device);
            this.resetTimer(data.device);
            this.publishAvailability(data.device, false);
        }
    }

    override async stop(): Promise<void> {
        Object.values(this.timers).forEach((t) => clearTimeout(t));
        super.stop();
    }

    private retrieveState(device: Device): void {
        /**
         * Retrieve state of a device in a debounced manner, this function is called on a 'deviceAnnounce' which a
         * device can send multiple times after each other.
         */
        if (device.definition && !device.zh.interviewing && !this.retrieveStateDebouncers[device.ieeeAddr]) {
            this.retrieveStateDebouncers[device.ieeeAddr] = debounce(async () => {
                logger.debug(`Retrieving state of '${device.name}' after reconnect`);
                // Color and color temperature converters do both, only needs to be called once.
                for (const item of retrieveOnReconnect) {
                    if (item.condition && this.state.get(device) && !item.condition(this.state.get(device))) continue;
                    const converter = device.definition.toZigbee.find((c) => c.key.find((k) => item.keys.includes(k)));
                    await converter?.convertGet?.(device.endpoint(), item.keys[0],
                        {message: this.state.get(device), mapped: device.definition})
                        .catch((e) => {
                            logger.error(`Failed to read state of '${device.name}' after reconnect (${e.message})`);
                        });
                    await utils.sleep(500);
                }
            }, utils.seconds(2));
        }

        this.retrieveStateDebouncers[device.ieeeAddr]?.();
    }
}
