const logger = require('../util/logger');
const settings = require('../util/settings');
const utils = require('../util/utils');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const Extension = require('./extension');
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/(.*)/availability`);

// Pingable end devices, some end devices should be pinged
// e.g. E11-G13 https://github.com/Koenkk/zigbee2mqtt/issues/775#issuecomment-453683846
const pingableEndDevices = [
    zigbeeHerdsmanConverters.devices.find((d) => d.model === 'E11-G13'),
    zigbeeHerdsmanConverters.devices.find((d) => d.model === 'E11-N1EA'),
    zigbeeHerdsmanConverters.devices.find((d) => d.model === '53170161'),
];

const Hours25 = 1000 * 60 * 60 * 25;
const AvailabilityLagRatio = 0.1;


function timeoutLag(timeout, ratio) {
    const lag = timeout * ratio;
    return Math.floor(Math.random() * Math.floor(lag));
}

/**
 * This extensions pings devices to check if they are online.
 */
class Availability extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);

        this.availability_timeout = settings.get().advanced.availability_timeout;
        this.timers = {};
        this.state = {};

        this.eventBus.on('deviceRemoved', (data) => this.onDeviceRemoved(data.resolvedEntity), this.constructor.name);
        this.eventBus.on('deviceRenamed', (data) => this.onDeviceRenamed(data), this.constructor.name);

        this.blocklist = settings.get().advanced.availability_blocklist
            .concat(settings.get().advanced.availability_blacklist)
            .map((e) => settings.getEntity(e).ID);

        this.passlist = settings.get().advanced.availability_passlist
            .concat(settings.get().advanced.availability_whitelist)
            .map((e) => settings.getEntity(e).ID);
    }

    onDeviceRenamed(data) {
        this.mqtt.publish(`${data.from}/availability`, null, {retain: true, qos: 0});
    }

    onDeviceRemoved(resolvedEntity) {
        this.mqtt.publish(`${resolvedEntity.name}/availability`, null, {retain: true, qos: 0});
        delete this.state[resolvedEntity.device.ieeeAddr];
        clearTimeout(this.timers[resolvedEntity.device.ieeeAddr]);
    }

    inPasslistOrNotInBlocklist(device) {
        const ieeeAddr = device.ieeeAddr;
        const deviceSettings = settings.getDevice(ieeeAddr);
        const name = deviceSettings.friendlyName;

        // Passlist is not empty and device is in it, enable availability
        if (this.passlist.length > 0) {
            return this.passlist.includes(ieeeAddr) || (name && this.passlist.includes(name));
        }

        // Device is on blocklist, disable availability
        if (this.blocklist.includes(ieeeAddr) || (name && this.blocklist.includes(name))) {
            return false;
        }

        return true;
    }

    isPingable(device) {
        if (pingableEndDevices.find((d) => d.hasOwnProperty('zigbeeModel') && d.zigbeeModel.includes(device.modelID))) {
            return true;
        }

        // Device is a mains powered router
        return device.type === 'Router' && device.powerSource !== 'Battery';
    }

    onMQTTConnected() {
        for (const device of this.zigbee.getClients()) {
            // Mark all devices as online on start
            const ieeeAddr = device.ieeeAddr;
            this.publishAvailability(device, this.state.hasOwnProperty(ieeeAddr) ? this.state[ieeeAddr] : true, true);

            if (this.inPasslistOrNotInBlocklist(device)) {
                if (this.isPingable(device)) {
                    this.setTimerPingable(device);
                } else {
                    this.timers[ieeeAddr] = setInterval(() => {
                        this.handleIntervalNotPingable(device);
                    }, utils.secondsToMilliseconds(300));
                }
            }
        }
    }

    async onMQTTMessage(topic, message) {
        // Clear topics for non-existing devices
        const match = topic.match(topicRegex);
        if (match && (!this.zigbee.resolveEntity(match[1]) || this.zigbee.resolveEntity(match[1]).name !== match[1])) {
            this.mqtt.publish(`${match[1]}/availability`, null, {retain: true, qos: 0});
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
        const resolvedEntity = this.zigbee.resolveEntity(device.ieeeAddr);
        if (!resolvedEntity || !device.lastSeen) {
            return;
        }

        const ago = Date.now() - resolvedEntity.device.lastSeen;
        logger.debug(`Non-pingable device '${resolvedEntity.name}' was last seen '${ago / 1000}' seconds ago.`);

        if (ago > Hours25) {
            this.publishAvailability(device, false);
        }
    }

    setTimerPingable(device) {
        const timeout = this.availability_timeout + timeoutLag(this.availability_timeout, AvailabilityLagRatio);
        clearTimeout(this.timers[device.ieeeAddr]);
        this.timers[device.ieeeAddr] = setTimeout(async () => {
            await this.handleIntervalPingable(device);
        }, utils.secondsToMilliseconds(timeout));
    }

    async stop() {
        super.stop();
        for (const timer of Object.values(this.timers)) {
            clearTimeout(timer);
        }

        this.zigbee.getClients().forEach((device) => this.publishAvailability(device, false));
    }

    async onReconnect(device) {
        const resolvedEntity = this.zigbee.resolveEntity(device);
        if (resolvedEntity && resolvedEntity.definition) {
            try {
                for (const key of ['state', 'brightness', 'color', 'color_temp']) {
                    const converter = resolvedEntity.definition.toZigbee.find((tz) => tz.key.includes(key));
                    if (converter) {
                        await converter.convertGet(device.endpoints[0], key, {});
                    }
                }
            } catch (error) {
                logger.error(`Failed to read state of '${resolvedEntity.name}' after reconnect`);
            }
        }
    }

    publishAvailability(device, available, force=false) {
        const ieeeAddr = device.ieeeAddr;
        if (this.state.hasOwnProperty(ieeeAddr) && !this.state[ieeeAddr] && available) {
            this.onReconnect(device);
        }

        const deviceSettings = settings.getDevice(ieeeAddr);
        const name = deviceSettings ? deviceSettings.friendlyName : ieeeAddr;
        const topic = `${name}/availability`;
        const payload = available ? 'online' : 'offline';
        if (this.state[ieeeAddr] !== available || force) {
            this.state[ieeeAddr] = available;
            this.mqtt.publish(topic, payload, {retain: true, qos: 0});
        }
    }

    onZigbeeEvent(type, data, resolvedEntity) {
        const device = data.device;
        if (!device) {
            return;
        }

        if (this.inPasslistOrNotInBlocklist(device)) {
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
