const logger = require('../util/logger');
const settings = require('../util/settings');
const utils = require('../util/utils');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');

// Some EndDevices should be pinged
// e.g. E11-G13 https://github.com/Koenkk/zigbee2mqtt/issues/775#issuecomment-453683846
const pingableDevices = [
    zigbeeShepherdConverters.devices.find((d) => d.model === 'E11-G13'),
];

const toZigbeeCandidates = ['state'];

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
            return settings.getIeeeAddrByFriendlyName(e) || e;
        });
    }

    isPingable(device) {
        if (this.blacklist.includes(device.ieeeAddr)) {
            return false;
        }

        if (pingableDevices.find((d) => d.zigbeeModel.includes(device.modelId))) {
            return true;
        }

        return utils.isRouter(device) && !utils.isBatteryPowered(device);
    }

    getAllPingableDevices() {
        return this.zigbee.getAllClients().filter((d) => this.isPingable(d));
    }

    onMQTTConnected() {
        // As some devices are not checked for availability (e.g. battery powered devices)
        // we mark all device as online by default.
        this.zigbee.getDevices()
            .filter((d) => d.type !== 'Coordinator')
            .forEach((device) => this.publishAvailability(device.ieeeAddr, true));

        // Start timers for all devices
        this.getAllPingableDevices().forEach((device) => this.setTimer(device));
    }

    handleInterval(device) {
        // Check if a job is already pending.
        // This avoids overflowing of the queue in case the queue is not able to catch-up with the jobs being added.
        const ieeeAddr = device.ieeeAddr;
        if (this.pending.includes(ieeeAddr)) {
            logger.debug(`Skipping ping for ${ieeeAddr} becuase job is already in queue`);
            return;
        }

        this.pending.push(ieeeAddr);

        // When a device is already unavailable, log the ping failed on 'debug' instead of 'error'.
        const errorLogLevel = this.state.hasOwnProperty(ieeeAddr) && !this.state[ieeeAddr] ? 'debug' : 'error';
        const mechanism = utils.isXiaomiDevice(device) ? 'basic' : 'default';

        this.zigbee.ping(ieeeAddr, errorLogLevel, (error) => {
            this.publishAvailability(ieeeAddr, !error);

            // Remove from pending jobs.
            const index = this.pending.indexOf(ieeeAddr);
            if (index !== -1) {
                this.pending.splice(index, 1);
            }

            this.setTimer(device);
        }, mechanism);
    }

    setTimer(ieeeAddr) {
        if (this.timers[ieeeAddr]) {
            clearTimeout(this.timers[ieeeAddr]);
        }

        this.timers[ieeeAddr] = setTimeout(() => {
            this.handleInterval(ieeeAddr);
        }, utils.secondsToMilliseconds(this.availability_timeout));
    }

    stop() {
        this.zigbee.getDevices()
            .filter((d) => d.type !== 'Coordinator')
            .forEach((device) => this.publishAvailability(device.ieeeAddr, false));
    }

    onReconnect(ieeeAddr) {
        const device = this.zigbee.getDevice(ieeeAddr);
        let mappedDevice = null;

        if (device && device.modelId) {
            mappedDevice = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
        }

        if (mappedDevice) {
            const converters = mappedDevice.toZigbee.filter((tz) => {
                return tz.key.find((k) => toZigbeeCandidates.includes(k));
            });

            converters.forEach((converter) => {
                const converted = converter.convert(null, null, null, 'get');
                if (converted) {
                    this.zigbee.publish(
                        ieeeAddr, 'device', converted.cid, converted.cmd, converted.cmdType,
                        converted.zclData, converted.cfg, null, () => {}
                    );
                }
            });
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

    onZigbeeMessage(message, device, mappedDevice) {
        // When a zigbee message from a device is received we know the device is still alive.
        // => reset the timer.
        if (device && this.isPingable(this.zigbee.getDevice(device.ieeeAddr))) {
            // When a message is received and the device is marked as offline, mark it online.
            if (this.state.hasOwnProperty(device.ieeeAddr) && !this.state[device.ieeeAddr]) {
                this.publishAvailability(device.ieeeAddr, true);
            } else if (!this.state.hasOwnProperty(device.ieeeAddr)) {
                // A new device has been connected
                this.publishAvailability(device.ieeeAddr, true);
            }

            this.setTimer(device);
        }
    }
}

module.exports = DeviceAvailability;
