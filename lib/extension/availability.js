const logger = require('../util/logger');
const settings = require('../util/settings');
const utils = require('../util/utils');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const Extension = require('./extension');

// Pingable end devices, some end devices should be pinged
// e.g. E11-G13 https://github.com/Koenkk/zigbee2mqtt/issues/775#issuecomment-453683846
const pingableEndDevices = [
    zigbeeHerdsmanConverters.devices.find((d) => d.model === 'E11-G13'),
    zigbeeHerdsmanConverters.devices.find((d) => d.model === '53170161'),
];

const Hours25 = 1000 * 60 * 60 * 25;

/**
 * This extensions pings devices to check if they are online.
 */
class Availability extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);

        this.availability_timeout = settings.get().advanced.availability_timeout;
        this.timers = {};
        this.state = {};

        this.blacklist = settings.get().advanced.availability_blacklist.map((e) => settings.getEntity(e).ID);
        this.whitelist = settings.get().advanced.availability_whitelist.map((e) => settings.getEntity(e).ID);
    }

    inWhitelistOrNotInBlacklist(device) {
        const ieeeAddr = device.ieeeAddr;
        const deviceSettings = settings.getDevice(ieeeAddr);
        const name = deviceSettings.friendlyName;

        // Whitelist is not empty and device is in it, enable availability
        if (this.whitelist.length > 0) {
            return this.whitelist.includes(ieeeAddr) || (name && this.whitelist.includes(name));
        }

        // Device is on blacklist, disable availability
        if (this.blacklist.includes(ieeeAddr) || (name && this.blacklist.includes(name))) {
            return false;
        }

        return true;
    }

    isPingable(device) {
        if (pingableEndDevices.find((d) => d.hasOwnProperty('zigbeeModel') && d.zigbeeModel.includes(device.modelID))) {
            return true;
        }

        // Device is a mains powered router
        return utils.isRouter(device) && !utils.isBatteryPowered(device);
    }

    onMQTTConnected() {
        for (const device of this.zigbee.getClients()) {
            // Mark all devices as online on start
            this.publishAvailability(device, true);

            if (this.inWhitelistOrNotInBlacklist(device)) {
                if (this.isPingable(device)) {
                    this.setTimerPingable(device);
                } else {
                    this.timers[device.ieeeAddr] = setInterval(() => {
                        this.handleIntervalNotPingable(device);
                    }, utils.secondsToMilliseconds(300));
                }
            }
        }
    }

    async handleIntervalPingable(device) {
        // When a device is already unavailable, log the ping failed on 'debug' instead of 'error'.
        const resolvedEntity = this.zigbee.resolveEntity(device.ieeeAddr);
        if (!resolvedEntity) {
            logger.debug(`Stop pinging '${device.ieeeAddr}', device is not known anymore`);
            return;
        }

        const level = this.state.hasOwnProperty(device.ieeeAddr) && !this.state[device.ieeeAddr] ? 'debug' : 'error';
        try {
            await device.ping();
            this.publishAvailability(device, true);
            logger.debug(`Successfully pinged '${resolvedEntity.name}'`);
        } catch (error) {
            this.publishAvailability(device, false);
            logger[level](`Failed to ping '${resolvedEntity.name}'`);
        } finally {
            this.setTimerPingable(device);
        }
    }

    async handleIntervalNotPingable(device) {
        const ago = Date.now() - device.lastSeen;
        const resolvedEntity = this.zigbee.resolveEntity(device.ieeeAddr);
        if (!resolvedEntity || !device.lastSeen) {
            return;
        }

        logger.debug(`Non-pingable device '${resolvedEntity.name}' was last seen '${ago / 1000}' seconds ago.`);

        if (ago > Hours25) {
            this.publishAvailability(device, false);
        }
    }

    setTimerPingable(device) {
        if (this.timers[device.ieeeAddr]) {
            clearTimeout(this.timers[device.ieeeAddr]);
        }

        this.timers[device.ieeeAddr] = setTimeout(async () => {
            await this.handleIntervalPingable(device);
        }, utils.secondsToMilliseconds(this.availability_timeout));
    }

    async stop() {
        for (const timer of Object.values(this.timers)) {
            clearTimeout(timer);
        }

        this.zigbee.getClients().forEach((device) => this.publishAvailability(device, false));
    }

    async onReconnect(device) {
        const resolvedEntity = this.zigbee.resolveEntity(device);
        if (resolvedEntity && resolvedEntity.definition) {
            const used = [];
            try {
                for (const key of ['state', 'brightness', 'color', 'color_temp']) {
                    const converter = resolvedEntity.definition.toZigbee.find((tz) => tz.key.includes(key));
                    if (converter && !used.includes(converter)) {
                        await converter.convertGet(device.endpoints[0], key, {});
                        used.push(converter);
                    }
                }
            } catch (error) {
                logger.error(`Failed to read state of '${resolvedEntity.name}' after reconnect`);
            }
        }
    }

    publishAvailability(device, available) {
        const ieeeAddr = device.ieeeAddr;
        if (this.state.hasOwnProperty(ieeeAddr) && !this.state[ieeeAddr] && available) {
            this.onReconnect(device);
        }

        const deviceSettings = settings.getDevice(ieeeAddr);
        const name = deviceSettings ? deviceSettings.friendlyName : ieeeAddr;
        const topic = `${name}/availability`;
        const payload = available ? 'online' : 'offline';
        if (this.state[ieeeAddr] !== available) {
            this.state[ieeeAddr] = available;
            this.mqtt.publish(topic, payload, {retain: true, qos: 0});
        }
    }

    onZigbeeEvent(type, data, resolvedEntity) {
        const device = data.device;
        if (!device) {
            return;
        }

        if (this.inWhitelistOrNotInBlacklist(device)) {
            this.publishAvailability(data.device, true);

            if (this.isPingable(device)) {
                // When a zigbee message from a device is received we know the device is still alive.
                // => reset the timer.
                this.setTimerPingable(device);

                const online = this.state.hasOwnProperty(device.ieeeAddr) && this.state[device.ieeeAddr];
                if (online && type === 'deviceAnnounce' && !utils.isIkeaTradfriDevice(device)) {
                    /**
                     * In case the device is powered off AND on within the availability timeout,
                     * zigbee2qmtt does not detect the device as offline (device is still marked online).
                     * When a device is turned on again the state could be out of sync.
                     * https://github.com/Koenkk/zigbee2mqtt/issues/1383#issuecomment-489412168
                     * deviceAnnounce is typically send when a device comes online.
                     *
                     * This isn't needed for TRADFRI devices as they already send the state themself.
                     */
                    this.onReconnect(device);
                }
            }
        }
    }
}

module.exports = Availability;
