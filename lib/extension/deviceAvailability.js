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

/**
 * This extensions pings devices to check if they are online.
 */
class DeviceAvailability extends BaseExtension {
    constructor(zigbee, mqtt, state, publishEntityState) {
        super(zigbee, mqtt, state, publishEntityState);

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

        // Initialize lastseen default incase devicelastSeen === null
        this.lastSeen = Date.now();
    }

    isPingable(device) {
        // Whitelist is not empty and device is in it, enable availability
        if (this.whitelist.length > 0) {
            return this.whitelist.includes(device.ieeeAddr);
        }

        // Device is on blacklist, disable availability
        if (this.blacklist.includes(device.ieeeAddr)) {
            return false;
        }

        // Device is on forcedPingable-list, enable availability
        if (forcedPingable.find((d) => d.zigbeeModel.includes(device.modelID))) {
            return true;
        }

        // Device is mains powered and a routerk
        if(!utils.isBatteryPowered(device) && utils.isRouter(device)) {
            return true;
        }

        // Device has availability_lastseen_timeout setting
        const deviceSettings = settings.getDevice(device.ieeeAddr);
        if (deviceSettings && deviceSettings.hasOwnProperty('availability_lastseen_timeout')) {
            return (typeof deviceSettings.availability_lastseen_timeout === 'number' &&
                    deviceSettings.availability_lastseen_timeout > 0);
        }

        return false;
    }

    getAllPingableDevices() {
        return this.zigbee.getClients().filter((d) => this.isPingable(d));
    }

    onMQTTConnected() {
        // As some devices are not checked for availability (e.g. battery powered devices)
        // we mark all device as online by default.
        this.zigbee.getClients().forEach((device) => this.publishAvailability(device, true));

        // Start timers for all devices
        this.getAllPingableDevices().forEach((device) => this.setTimer(device));
    }

    async handleInterval(device) {
        // When a device is already unavailable, log the ping failed on 'debug' instead of 'error'.
        const entity = this.zigbee.resolveEntity(device.ieeeAddr);
        if (!entity) {
            logger.debug(`Stop pinging '${device.ieeeAddr}', device is not known anymore`);
            return;
        }

        const ieeeAddr = device.ieeeAddr;
        const deviceSettings = settings.getDevice(ieeeAddr);
        const level = this.state.hasOwnProperty(ieeeAddr) && !this.state[ieeeAddr] ? 'debug' : 'error';
        if (deviceSettings && deviceSettings.hasOwnProperty('availability_lastseen_timeout')) {
            const lastSeen = device.lastSeen !== null ? device.lastSeen : this.lastSeen;
            const lastSeenSecondsAgo = Math.floor((Date.now() - lastSeen)/1000);

            if (lastSeenSecondsAgo <= deviceSettings.availability_lastseen_timeout) {
                this.publishAvailability(device, true);
                logger.debug(`Device '${entity.name}' was last seen '${lastSeenSecondsAgo}' seconds ago.`)
            } else {
                this.publishAvailability(device, false);
                logger[level](`Device '${entity.name}' was not seen for more than '${deviceSettings.availability_lastseen_timeout}' seconds!`);
            }
        } else {
            try {
                await device.ping();
                this.publishAvailability(device, true);
                logger.debug(`Successfully pinged '${entity.name}'`);
            } catch (error) {
                this.publishAvailability(device, false);
                logger[level](`Failed to ping '${entity.name}'`);
            }
        }
        this.setTimer(device);
    }

    setTimer(device) {
        if (this.timers[device.ieeeAddr]) {
            clearTimeout(this.timers[device.ieeeAddr]);
        }

        this.timers[device.ieeeAddr] = setTimeout(async () => {
            await this.handleInterval(device);
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

        if (this.isPingable(device)) {
            // When a zigbee message from a device is received we know the device is still alive.
            // => reset the timer.
            this.setTimer(device);

            const online = this.state.hasOwnProperty(device.ieeeAddr) && this.state[device.ieeeAddr];
            const offline = this.state.hasOwnProperty(device.ieeeAddr) && !this.state[device.ieeeAddr];

            if (!online && !offline) {
                // A new device has been connected
                this.publishAvailability(device, true);
            } else if (offline) {
                // When a message is received and the device is marked as offline, mark it online.
                this.publishAvailability(device, true);
            } else {
                /* istanbul ignore else */
                if (online && type === 'deviceAnnounce' && !utils.isIkeaTradfriDevice(device)) {
                    /**
                     * In case the device is powered off AND on within the availability timeout,
                     * zigbee2qmtt does not detect the device as offline (device is still marked online).
                     * When a device is turned on again the state could be out of sync.
                     * https://github.com/Koenkk/zigbee2mqtt/issues/1383#issuecomment-489412168
                     * endDeviceAnnce is typically send when a device comes online.
                     *
                     * This isn't needed for TRADFRI devices as they already send the state themself.
                     */
                    this.onReconnect(device);
                }
            }
        } else if (type === 'deviceJoined') {
            this.publishAvailability(data.device, true);
        }
    }
}

module.exports = DeviceAvailability;
