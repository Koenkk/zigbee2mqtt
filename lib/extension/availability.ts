import assert from "node:assert";
import bind from "bind-decorator";
import debounce from "debounce";
import type * as zhc from "zigbee-herdsman-converters";
import type {Zigbee2MQTTAPI} from "../types/api";

import logger from "../util/logger";
import * as settings from "../util/settings";
import utils from "../util/utils";
import Extension from "./extension";

const RETRIEVE_ON_RECONNECT: readonly {keys: string[]; condition?: (state: KeyValue) => boolean}[] = [
    {keys: ["state"]},
    {keys: ["brightness"], condition: (state: KeyValue): boolean => state.state === "ON"},
    {keys: ["color", "color_temp"], condition: (state: KeyValue): boolean => state.state === "ON"},
];

export default class Availability extends Extension {
    /** Mapped by IEEE address */
    private readonly timers = new Map<string, NodeJS.Timeout>();
    /** Mapped by IEEE address or Group ID */
    private readonly lastPublishedAvailabilities = new Map<string | number, boolean>();
    /** Mapped by IEEE address */
    private readonly pingBackoffs = new Map<string, number>();
    /** IEEE addresses, waiting for last seen changes to take them out of "availability sleep" */
    private readonly backoffPausedDevices = new Set<string>();
    /** Mapped by IEEE address */
    private readonly retrieveStateDebouncers = new Map<string, () => void>();
    private pingQueue: Device[] = [];
    private pingQueueExecuting = false;
    private stopped = false;

    private getTimeout(device: Device): number {
        if (typeof device.options.availability === "object" && device.options.availability?.timeout != null) {
            return utils.minutes(device.options.availability.timeout);
        }

        return utils.minutes(this.isActiveDevice(device) ? settings.get().availability.active.timeout : settings.get().availability.passive.timeout);
    }

    private getMaxJitter(device: Device): number {
        if (typeof device.options.availability === "object" && device.options.availability?.max_jitter != null) {
            return device.options.availability.max_jitter;
        }

        return settings.get().availability.active.max_jitter;
    }

    private getBackoff(device: Device): boolean {
        if (typeof device.options.availability === "object" && device.options.availability?.backoff != null) {
            return device.options.availability.backoff;
        }

        return settings.get().availability.active.backoff;
    }

    private getPauseOnBackoffGt(device: Device): number {
        if (typeof device.options.availability === "object" && device.options.availability?.pause_on_backoff_gt != null) {
            return device.options.availability.pause_on_backoff_gt;
        }

        return settings.get().availability.active.pause_on_backoff_gt;
    }

    private isActiveDevice(device: Device): boolean {
        return (
            (device.zh.type === "Router" && device.zh.powerSource !== "Battery") ||
            (device.zh.powerSource !== undefined && device.zh.powerSource !== "Unknown" && device.zh.powerSource !== "Battery")
        );
    }

    private isAvailable(entity: Device | Group): boolean {
        if (entity.isDevice()) {
            const lastSeen = entity.zh.lastSeen ?? /* v8 ignore next */ 0;

            return Date.now() - lastSeen < this.getTimeout(entity);
        }

        for (const memberDevice of entity.membersDevices()) {
            if (this.lastPublishedAvailabilities.get(memberDevice.ieeeAddr) === true) {
                return true;
            }
        }

        return false;
    }

    private resetTimer(device: Device, resetBackoff = false): void {
        clearTimeout(this.timers.get(device.ieeeAddr));
        this.removeFromPingQueue(device);

        // If the timer triggers, the device is not available anymore otherwise resetTimer already has been called
        if (this.isActiveDevice(device)) {
            const backoffEnabled = this.getBackoff(device);
            const jitter = Math.random() * this.getMaxJitter(device);
            let backoff = 1;

            if (resetBackoff) {
                // always cleanup even if backoff disabled (ensures proper state if changed at runtime)
                this.backoffPausedDevices.delete(device.ieeeAddr);
                this.pingBackoffs.delete(device.ieeeAddr);
            } else if (backoffEnabled) {
                backoff = this.pingBackoffs.get(device.ieeeAddr) ?? 1;
            }

            // never paused if was reset (just deleted) or backoff disabled, might as well skip the Set lookup
            if (!backoffEnabled || resetBackoff || !this.backoffPausedDevices.has(device.ieeeAddr)) {
                // If device did not check in, ping it, if that fails it will be marked as offline
                this.timers.set(
                    device.ieeeAddr,
                    setTimeout(this.addToPingQueue.bind(this, device), (this.getTimeout(device) + utils.seconds(1) + jitter) * backoff),
                );
            }
        } else {
            this.timers.set(
                device.ieeeAddr,
                setTimeout(this.publishAvailability.bind(this, device, true), this.getTimeout(device) + utils.seconds(1)),
            );
        }
    }

    private clearTimer(ieeeAddress: string): void {
        clearTimeout(this.timers.get(ieeeAddress));
        this.timers.delete(ieeeAddress);
    }

    private addToPingQueue(device: Device): void {
        this.pingQueue.push(device);
        this.pingQueueExecuteNext().catch(utils.noop);
    }

    private removeFromPingQueue(device: Device): void {
        const index = this.pingQueue.findIndex((d) => d.ieeeAddr === device.ieeeAddr);
        if (index !== -1) {
            this.pingQueue.splice(index, 1);
        }
    }

    private async pingQueueExecuteNext(): Promise<void> {
        if (this.pingQueue.length === 0 || this.pingQueueExecuting) {
            return;
        }

        this.pingQueueExecuting = true;
        const device = this.pingQueue[0];
        let pingSuccess = false;
        const available = this.lastPublishedAvailabilities.get(device.ieeeAddr) || this.isAvailable(device);
        const attempts = available ? 2 : 1;

        for (let i = 1; i <= attempts; i++) {
            try {
                // Enable recovery if device is marked as available and first ping fails.
                await device.zh.ping(!available || i !== 2);

                pingSuccess = true;

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

        if (!pingSuccess && this.getBackoff(device)) {
            const currentBackoff = this.pingBackoffs.get(device.ieeeAddr) ?? 1;
            // setting is "greater than" but since we already did the ping, we use ">=" for comparison below (pause next)
            const pauseOnBackoff = this.getPauseOnBackoffGt(device);

            if (pauseOnBackoff > 0 && currentBackoff >= pauseOnBackoff) {
                this.backoffPausedDevices.add(device.ieeeAddr);
            } else {
                // results in backoffs: *1.5, *3, *6, *12... (with default timeout: 10, 15, 30, 60, 120)
                this.pingBackoffs.set(device.ieeeAddr, currentBackoff * (available ? 1.5 : 2));
            }
        }

        await this.publishAvailability(device, !pingSuccess);
        this.resetTimer(device, pingSuccess);
        this.removeFromPingQueue(device);

        // Sleep 2 seconds before executing next ping
        await utils.sleep(2);

        this.pingQueueExecuting = false;

        await this.pingQueueExecuteNext();
    }

    override async start(): Promise<void> {
        if (this.stopped) {
            throw new Error("This extension cannot be restarted.");
        }

        this.eventBus.onEntityRenamed(this, async (data) => {
            if (utils.isAvailabilityEnabledForEntity(data.entity, settings.get())) {
                await this.mqtt.publish(`${data.from}/availability`, "", {clientOptions: {retain: true, qos: 1}});
                await this.publishAvailability(data.entity, false, true);
            }
        });
        this.eventBus.onEntityRemoved(this, (data) => data.entity.isDevice() && this.clearTimer(data.entity.ID));
        this.eventBus.onDeviceLeave(this, (data) => this.clearTimer(data.ieeeAddr));
        this.eventBus.onDeviceAnnounce(this, (data) => this.retrieveState(data.device));
        this.eventBus.onLastSeenChanged(this, this.onLastSeenChanged);
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

    private async publishAvailabilityForAllEntities(): Promise<void> {
        for (const entity of this.zigbee.devicesAndGroupsIterator(utils.deviceNotCoordinator)) {
            if (utils.isAvailabilityEnabledForEntity(entity, settings.get())) {
                await this.publishAvailability(entity, true, false, true);
            }
        }
    }

    private async publishAvailability(entity: Device | Group, logLastSeen: boolean, forcePublish = false, skipGroups = false): Promise<void> {
        if (logLastSeen && entity.isDevice()) {
            const ago = Date.now() - (entity.zh.lastSeen ?? /* v8 ignore next */ 0);

            if (this.isActiveDevice(entity)) {
                logger.debug(`Active device '${entity.name}' was last seen '${(ago / utils.minutes(1)).toFixed(2)}' minutes ago.`);
            } else {
                logger.debug(`Passive device '${entity.name}' was last seen '${(ago / utils.hours(1)).toFixed(2)}' hours ago.`);
            }
        }

        const available = this.isAvailable(entity);

        if (!forcePublish && this.lastPublishedAvailabilities.get(entity.ID) === available) {
            return;
        }

        if (entity.isDevice() && available && this.lastPublishedAvailabilities.get(entity.ieeeAddr) === false) {
            logger.debug(`Device '${entity.name}' reconnected`);
            this.retrieveState(entity);
        }

        const topic = `${entity.name}/availability`;
        const payload: Zigbee2MQTTAPI["{friendlyName}/availability"] = {state: available ? "online" : "offline"};
        this.lastPublishedAvailabilities.set(entity.ID, available);
        await this.mqtt.publish(topic, JSON.stringify(payload), {clientOptions: {retain: true, qos: 1}});

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
            this.resetTimer(data.device, true);
            await this.publishAvailability(data.device, false);
        }
    }

    override async stop(): Promise<void> {
        this.stopped = true;
        this.pingQueue = [];

        for (const [, t] of this.timers) {
            clearTimeout(t);
        }

        await super.stop();
    }

    private retrieveState(device: Device): void {
        /**
         * Retrieve state of a device in a debounced manner, this function is called on a 'deviceAnnounce' which a
         * device can send multiple times after each other.
         */
        if (device.definition && device.interviewed && !this.retrieveStateDebouncers.get(device.ieeeAddr)) {
            this.retrieveStateDebouncers.set(
                device.ieeeAddr,
                debounce(async () => {
                    logger.debug(`Retrieving state of '${device.name}' after reconnect`);

                    // Color and color temperature converters do both, only needs to be called once.
                    for (const item of RETRIEVE_ON_RECONNECT) {
                        if (item.condition && this.state.get(device) && !item.condition(this.state.get(device))) {
                            continue;
                        }

                        // biome-ignore lint/style/noNonNullAssertion: doesn't change once valid
                        const converter = device.definition!.toZigbee.find((c) => !c.key || c.key.find((k) => item.keys.includes(k)));
                        const options: KeyValue = device.options;
                        const state = this.state.get(device);
                        const meta: zhc.Tz.Meta = {
                            message: this.state.get(device),
                            // biome-ignore lint/style/noNonNullAssertion: doesn't change once valid
                            mapped: device.definition!,
                            endpoint_name: undefined,
                            options,
                            state,
                            device: device.zh,
                            /* v8 ignore next */
                            publish: (payload: KeyValue) => this.publishEntityState(device, payload),
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
                }, utils.seconds(2)),
            );
        }

        this.retrieveStateDebouncers.get(device.ieeeAddr)?.();
    }
}
