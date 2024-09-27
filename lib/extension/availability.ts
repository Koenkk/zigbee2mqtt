import assert from 'assert';

import bind from 'bind-decorator';
import debounce from 'debounce';

import * as zhc from 'zigbee-herdsman-converters';

import logger from '../util/logger';
import * as settings from '../util/settings';
import utils from '../util/utils';
import Extension from './extension';

const RETRIEVE_ON_RECONNECT: readonly {keys: string[]; condition?: (state: KeyValue) => boolean}[] = [
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
    private stopped = false;

    private getTimeout(device: Device): number {
        if (typeof device.options.availability === 'object' && device.options.availability?.timeout != null) {
            return utils.minutes(device.options.availability.timeout);
        }

        const key = this.isActiveDevice(device) ? 'active' : 'passive';
        let value = settings.get().availability?.[key]?.timeout;

        if (value == null) {
            value = key == 'active' ? 10 : 1500;
        }

        return utils.minutes(value);
    }

    private isActiveDevice(device: Device): boolean {
        return (device.zh.type === 'Router' && device.zh.powerSource !== 'Battery') || device.zh.powerSource === 'Mains (single phase)';
    }

    private isAvailable(entity: Device | Group): boolean {
        if (entity.isDevice()) {
            return Date.now() - (entity.zh.lastSeen ?? /* istanbul ignore next */ 0) < this.getTimeout(entity);
        } else {
            const membersDevices = entity.membersDevices();
            return membersDevices.length === 0 || membersDevices.some((d) => this.availabilityCache[d.ieeeAddr]);
        }
    }

    private resetTimer(device: Device): void {
        clearTimeout(this.timers[device.ieeeAddr]);
        this.removeFromPingQueue(device);

        // If the timer triggers, the device is not available anymore otherwise resetTimer already has been called
        if (this.isActiveDevice(device)) {
            // If device did not check in, ping it, if that fails it will be marked as offline
            this.timers[device.ieeeAddr] = setTimeout(() => this.addToPingQueue(device), this.getTimeout(device) + utils.seconds(1));
        } else {
            this.timers[device.ieeeAddr] = setTimeout(() => this.publishAvailability(device, true), this.getTimeout(device) + utils.seconds(1));
        }
    }

    private addToPingQueue(device: Device): void {
        this.pingQueue.push(device);
        this.pingQueueExecuteNext().catch(utils.noop);
    }

    private removeFromPingQueue(device: Device): void {
        const index = this.pingQueue.findIndex((d) => d.ieeeAddr === device.ieeeAddr);
        if (index != -1) {
            this.pingQueue.splice(index, 1);
        }
    }

    private async pingQueueExecuteNext(): Promise<void> {
        if (this.pingQueue.length === 0 || this.pingQueueExecuting) {
            return;
        }

        this.pingQueueExecuting = true;
        const device = this.pingQueue[0];
        let pingedSuccessfully = false;
        const available = this.availabilityCache[device.ieeeAddr] || this.isAvailable(device);
        const attempts = available ? 2 : 1;

        for (let i = 1; i <= attempts; i++) {
            try {
                // Enable recovery if device is marked as available and first ping fails.
                await device.zh.ping(!available || i !== 2);

                pingedSuccessfully = true;

                logger.debug(`Successfully pinged '${device.name}' (attempt ${i}/${attempts})`);
                break;
            } catch (error) {
                logger.warning(`Failed to ping '${device.name}' (attempt ${i}/${attempts}, ${(error as Error).message})`);

                // Try again in 3 seconds.
                if (i !== attempts) {
                    await utils.sleep(3);
                }
            }
        }

        if (this.stopped) {
            // Exit here to avoid triggering any follow-up activity (e.g., re-queuing another ping attempt).
            return;
        }

        await this.publishAvailability(device, !pingedSuccessfully);
        this.resetTimer(device);
        this.removeFromPingQueue(device);

        // Sleep 2 seconds before executing next ping
        await utils.sleep(2);

        this.pingQueueExecuting = false;

        await this.pingQueueExecuteNext();
    }

    override async start(): Promise<void> {
        if (this.stopped) {
            throw new Error('This extension cannot be restarted.');
        }

        this.eventBus.onEntityRenamed(this, async (data) => {
            if (utils.isAvailabilityEnabledForEntity(data.entity, settings.get())) {
                await this.mqtt.publish(`${data.from}/availability`, '', {retain: true, qos: 1});
                await this.publishAvailability(data.entity, false, true);
            }
        });

        this.eventBus.onEntityRemoved(this, (data) => data.type == 'device' && clearTimeout(this.timers[data.id]));
        this.eventBus.onDeviceLeave(this, (data) => clearTimeout(this.timers[data.ieeeAddr]));
        this.eventBus.onDeviceAnnounce(this, (data) => this.retrieveState(data.device));
        this.eventBus.onLastSeenChanged(this, this.onLastSeenChanged);
        this.eventBus.onPublishAvailability(this, this.publishAvailabilityForAllEntities);
        this.eventBus.onGroupMembersChanged(this, (data) => this.publishAvailability(data.group, false));
        // Publish initial availability
        await this.publishAvailabilityForAllEntities();

        // Start availability for the devices
        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            if (utils.isAvailabilityEnabledForEntity(device, settings.get())) {
                this.resetTimer(device);

                // If an active device is unavailable on start, add it to the pingqueue immediately.
                if (this.isActiveDevice(device) && !this.isAvailable(device)) {
                    this.addToPingQueue(device);
                }
            }
        }
    }

    @bind private async publishAvailabilityForAllEntities(): Promise<void> {
        for (const entity of this.zigbee.devicesAndGroupsIterator(utils.deviceNotCoordinator)) {
            if (utils.isAvailabilityEnabledForEntity(entity, settings.get())) {
                await this.publishAvailability(entity, true, false, true);
            }
        }
    }

    private async publishAvailability(entity: Device | Group, logLastSeen: boolean, forcePublish = false, skipGroups = false): Promise<void> {
        if (logLastSeen && entity.isDevice()) {
            const ago = Date.now() - (entity.zh.lastSeen ?? /* istanbul ignore next */ 0);

            if (this.isActiveDevice(entity)) {
                logger.debug(`Active device '${entity.name}' was last seen '${(ago / utils.minutes(1)).toFixed(2)}' minutes ago.`);
            } else {
                logger.debug(`Passive device '${entity.name}' was last seen '${(ago / utils.hours(1)).toFixed(2)}' hours ago.`);
            }
        }

        const available = this.isAvailable(entity);

        if (!forcePublish && this.availabilityCache[entity.ID] == available) {
            return;
        }

        if (entity.isDevice() && entity.ieeeAddr in this.availabilityCache && available && this.availabilityCache[entity.ieeeAddr] === false) {
            logger.debug(`Device '${entity.name}' reconnected`);
            this.retrieveState(entity);
        }

        const topic = `${entity.name}/availability`;
        const payload = utils.availabilityPayload(available ? 'online' : 'offline', settings.get());
        this.availabilityCache[entity.ID] = available;
        await this.mqtt.publish(topic, payload, {retain: true, qos: 1});

        if (!skipGroups && entity.isDevice()) {
            for (const group of this.zigbee.groupsIterator()) {
                if (group.hasMember(entity) && utils.isAvailabilityEnabledForEntity(group, settings.get())) {
                    await this.publishAvailability(group, false, forcePublish);
                }
            }
        }
    }

    @bind private async onLastSeenChanged(data: eventdata.LastSeenChanged): Promise<void> {
        if (utils.isAvailabilityEnabledForEntity(data.device, settings.get())) {
            // Remove from ping queue, not necessary anymore since we know the device is online.
            this.removeFromPingQueue(data.device);
            this.resetTimer(data.device);
            await this.publishAvailability(data.device, false);
        }
    }

    override async stop(): Promise<void> {
        this.stopped = true;
        this.pingQueue = [];

        for (const t of Object.values(this.timers)) {
            clearTimeout(t);
        }

        await super.stop();
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
                for (const item of RETRIEVE_ON_RECONNECT) {
                    if (item.condition && this.state.get(device) && !item.condition(this.state.get(device))) {
                        continue;
                    }

                    const converter = device.definition!.toZigbee.find((c) => !c.key || c.key.find((k) => item.keys.includes(k)));
                    const options: KeyValue = device.options;
                    const state = this.state.get(device);
                    const meta: zhc.Tz.Meta = {
                        message: this.state.get(device),
                        mapped: device.definition!,
                        endpoint_name: undefined,
                        options,
                        state,
                        device: device.zh,
                    };

                    try {
                        const endpoint = device.endpoint();
                        assert(endpoint);
                        await converter?.convertGet?.(endpoint, item.keys[0], meta);
                    } catch (error) {
                        logger.error(`Failed to read state of '${device.name}' after reconnect (${(error as Error).message})`);
                    }

                    await utils.sleep(500);
                }
            }, utils.seconds(2));
        }

        this.retrieveStateDebouncers[device.ieeeAddr]?.();
    }
}
