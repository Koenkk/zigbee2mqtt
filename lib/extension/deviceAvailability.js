const logger = require('../util/logger');
const settings = require('../util/settings');
const utils = require('../util/utils');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');

// Some EndDevices should be pinged
// e.g. E11-G13 https://github.com/Koenkk/zigbee2mqtt/issues/775#issuecomment-453683846
const forcedPingable = [
    zigbeeHerdsmanConverters.devices.find((d) => d.model === 'E11-G13'),
];

const toZigbeeCandidates = ['state', 'color', 'color_temp'];

/**
 * This extensions pings devices to check if they are online.
 */
class DeviceAvailability {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.availability_timeout = settings.get().advanced.availability_timeout;
        this.timers = {};
        this.pending = [];
        this.state = {};

        // Initialize blacklist
        this.blacklist = settings.get().advanced.availability_blacklist.map((e) => {
            return settings.getEntity(e).ID;
        });
    }

    isPingable(device) {
        logger.trace(`Checking if ${device.ieeeAddr} is pingable`);

        if (this.blacklist.includes(device.ieeeAddr)) {
            logger.trace(`${device.ieeeAddr} is not pingable because of blacklist`);
            return false;
        }

        if (forcedPingable.find((d) => d.zigbeeModel.includes(device.modelID))) {
            logger.trace(`${device.ieeeAddr} is pingable because in pingable devices`);
            return true;
        }

        const result = utils.isRouter(device) && !utils.isBatteryPowered(device);
        logger.trace(`${device.ieeeAddr} is pingable (${result}) not router or battery powered`);
        return result;
    }

    async getAllPingableDevices() {
        return (await this.zigbee.getClients()).filter((d) => this.isPingable(d));
    }

    async onMQTTConnected() {
        // As some devices are not checked for availability (e.g. battery powered devices)
        // we mark all device as online by default.
        (await this.zigbee.getClients())
            .forEach((device) => this.publishAvailability(device.ieeeAddr, true));

        // Start timers for all devices
        (await this.getAllPingableDevices()).forEach((device) => this.setTimer(device));
    }

    async handleInterval(device) {
        // Check if a job is already pending.
        // This avoids overflowing of the queue in case the queue is not able to catch-up with the jobs being added.
        const ieeeAddr = device.ieeeAddr;
        if (this.pending.includes(ieeeAddr)) {
            logger.debug(`Skipping ping for ${ieeeAddr} becuase job is already in queue`);
            return;
        }

        this.pending.push(ieeeAddr);

        // When a device is already unavailable, log the ping failed on 'debug' instead of 'error'.
        const available = this.state.hasOwnProperty(ieeeAddr) && !this.state[ieeeAddr] ? 'debug' : 'error';
        try {
            await device.ping();
            this.publishAvailability(ieeeAddr, true);
            logger.debug(`Succesfully pinged '${device.ieeeAddr}'`);
        } catch (error) {
            this.publishAvailability(ieeeAddr, false);
            available ? logger.error(`Failed to ping '${device.ieeeAddr}'`) :
                logger.debug(`Failed to ping '${device.ieeeAddr}'`);
        } finally {
            const index = this.pending.indexOf(ieeeAddr);
            if (index !== -1) {
                this.pending.splice(index, 1);
            }

            this.setTimer(device);
        }
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
        (await this.zigbee.getClients()).forEach((device) => this.publishAvailability(device.ieeeAddr, false));
    }

    async onReconnect(ieeeAddr) {
        const device = await this.zigbee.getDevice({ieeeAddr});
        let mappedDevice = null;

        if (device && device.modelID) {
            mappedDevice = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
        }

        if (mappedDevice) {
            const converters = mappedDevice.toZigbee.filter((tz) => {
                return tz.key.find((k) => toZigbeeCandidates.includes(k));
            });

            for (const converter of converters) {
                converter.convertGet(device.endpoints[0], null, {});
            }
        }
    }

    publishAvailability(ieeeAddr, available) {
        if (this.state.hasOwnProperty(ieeeAddr) && !this.state[ieeeAddr] && available) {
            this.onReconnect(ieeeAddr);
        }

        this.state[ieeeAddr] = available;
        const deviceSettings = settings.getDevice(ieeeAddr);
        const name = deviceSettings ? deviceSettings.friendly_name : ieeeAddr;
        const topic = `${name}/availability`;
        const payload = available ? 'online' : 'offline';
        this.mqtt.publish(topic, payload, {retain: true, qos: 0});
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
                this.publishAvailability(device.ieeeAddr, true);
            } else if (offline) {
                // When a message is received and the device is marked as offline, mark it online.
                this.publishAvailability(device.ieeeAddr, true);
            } else if (online) {
                /**
                 * In case the device is powered off AND on within the availability timeout,
                 * zigbee2qmtt does not detect the device as offline (device is still marked online).
                 * When a device is turned on again the state could be out of sync.
                 * https://github.com/Koenkk/zigbee2mqtt/issues/1383#issuecomment-489412168
                 * endDeviceAnnce is typically send when a device comes online.
                 *
                 * This isn't needed for TRADFRI devices as they already send the state themself.
                 */
                if (type === 'deviceAnnounce' && !utils.isIkeaTradfriDevice(device)) {
                    this.onReconnect(device.ieeeAddr);
                }
            }
        } else {
            this.publishAvailability(device.ieeeAddr, true);
        }
    }
}

module.exports = DeviceAvailability;
