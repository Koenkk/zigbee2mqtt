const logger = require('../util/logger');
const settings = require('../util/settings');
const utils = require('../util/utils');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const BaseExtension = require('./baseExtension');

// Some EndDevices should be pinged
// e.g. E11-G13 https://github.com/Koenkk/zigbee2mqtt/issues/775#issuecomment-453683846
const forcedPingable = [
    zigbeeHerdsmanConverters.devices.find((d) => d.model === 'E11-G13'),
];

const toZigbeeCandidates = ['state', 'brightness', 'color', 'color_temp'];

const Hours25 = 1000 * 60 * 60 * 25;

/**
 * This extensions pings devices to check if they are online.
 */
class DeviceAvailability extends BaseExtension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);

        this.availability_timeout = settings.get().advanced.availability_timeout;
        this.timers = {};
        this.state = {};

        // Initialize blacklist
        this.blacklist = settings.get().advanced.availability_blacklist.map((e) => {
            return settings.getEntity(e).ID;
        });

        // Initialize whitelist
        this.whitelist = settings.get().advanced.availability_whitelist.map((e) => {
            return settings.getEntity(e).ID;
        });
    }

    isAllowed(device) {
        const ieeeAddr = device.ieeeAddr;

        const deviceSettings = settings.getDevice(ieeeAddr);
        const name = deviceSettings ? deviceSettings.friendly_name : null;

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
        // Device is on forcedPingable-list, enable availability
        if (forcedPingable.find((d) => d.zigbeeModel.includes(device.modelID))) {
            return true;
        }

        // Device is a mains powered router
        const result = utils.isRouter(device) && !utils.isBatteryPowered(device);

        return result;
    }

    onMQTTConnected() {
        for (const device of this.zigbee.getClients()) {
            // Mark all devices as online on start
            this.publishAvailability(device, true);

            if (this.isAllowed(device)) {
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
        const entity = this.zigbee.resolveEntity(device.ieeeAddr);
        if (!entity) {
            logger.debug(`Stop pinging '${device.ieeeAddr}', device is not known anymore`);
            return;
        }

        const ieeeAddr = device.ieeeAddr;
        const level = this.state.hasOwnProperty(ieeeAddr) && !this.state[ieeeAddr] ? 'debug' : 'error';
        try {
            await device.ping();
            this.publishAvailability(device, true);
            logger.debug(`Successfully pinged '${entity.name}'`);
        } catch (error) {
            this.publishAvailability(device, false);
            logger[level](`Failed to ping '${entity.name}'`);
        } finally {
            this.setTimerPingable(device);
        }
    }

    async handleIntervalNotPingable(device) {
        const ago = Date.now() - device.lastSeen;
        const entity = this.zigbee.resolveEntity(device.ieeeAddr);
        if (!entity || !device.lastSeen) {
            return;
        }

        logger.debug(`Non-pingable device '${entity.name}' was last seen '${ago / 1000}' seconds ago.`);

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
        if (device && device.modelID) {
            const mappedDevice = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);

            if (mappedDevice) {
                const used = [];
                try {
                    for (const key of toZigbeeCandidates) {
                        const converter = mappedDevice.toZigbee.find((tz) => tz.key.includes(key));
                        if (converter && !used.includes(converter)) {
                            await converter.convertGet(device.endpoints[0], key, {});
                            used.push(converter);
                        }
                    }
                } catch (error) {
                    const entity = this.zigbee.resolveEntity(device.ieeeAddr);
                    logger.error(`Failed to read state of '${entity.name}' after reconnect`);
                }
            }
        }
    }

    publishAvailability(device, available) {
        const ieeeAddr = device.ieeeAddr;
        if (this.state.hasOwnProperty(ieeeAddr) && !this.state[ieeeAddr] && available) {
            this.onReconnect(device);
        }

        const deviceSettings = settings.getDevice(ieeeAddr);
        const name = deviceSettings ? deviceSettings.friendly_name : ieeeAddr;
        const topic = `${name}/availability`;
        const payload = available ? 'online' : 'offline';
        if (this.state[ieeeAddr] !== available) {
            this.state[ieeeAddr] = available;
            this.mqtt.publish(topic, payload, {retain: true, qos: 0});
        }
    }

    onZigbeeEvent(type, data, mappedDevice, settingsDevice) {
        const device = data.device;
        if (!device) {
            return;
        }

        if (this.isAllowed(device)) {
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

module.exports = DeviceAvailability;
