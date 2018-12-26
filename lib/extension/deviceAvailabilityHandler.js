const logger = require('../util/logger');
const settings = require('../util/settings');

/**
 * This extensions polls router devices to set availability
 */
class DeviceAvailabilityHandler {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        const advanced_settings = settings.get().advanced;
        this.interval = (advanced_settings.hasOwnProperty('availability_interval') ? (advanced_settings.availability_interval * 1000) : 0);
        this.timer = null;
        this.devicesAvailability = {};
    }

    onZigbeeStarted() {
        if (this.interval) {
            this.startTimer();
        }
    }

    onPublishDeviceState(device, messagePayload) {
        // Return on disabled
        if (! this.interval) {
            return;
        }
        this.setDeviceAvailable(device, (messagePayload.hasOwnProperty('last_seen') ? (new Date(messagePayload.last_seen)).getTime() : 0));
    }

    setDeviceAvailable(device, lastSeen) {
        // Only check availability on mains-powered devices
        if (device.powerSource !== 'Mains (single phase)') {
            return;
        }

        const deviceID = device.ieeeAddr;
        const now = Date.now();
        const timeout = this.interval + 10;
        let available = lastSeen ? (((now - lastSeen) / 1000) < timeout) : false;
        let changed = true;

        // Check stored values
        if (this.devicesAvailability.hasOwnProperty(deviceID)) {
            available = available || (((now - this.devicesAvailability[deviceID].lastSeen) / 1000) < timeout);
            changed = this.devicesAvailability[deviceID].available !== available;
            if (this.devicesAvailability[deviceID].timer) {
                clearTimeout(this.devicesAvailability[deviceID].timer);
                this.devicesAvailability[deviceID].timer = null;
            }
        } else {
            this.devicesAvailability[deviceID] = {timer: null};
        }

        // Set new availability and start a offline timer if available
        this.devicesAvailability[deviceID].available = available;
        this.devicesAvailability[deviceID].lastSeen = lastSeen;
        if (available) {
            this.devicesAvailability[deviceID].timer = setTimeout(() => {
                this.devicesAvailability[deviceID].timer = null;
                this.publishDeviceState(device, {}, false);
            }, 120 * 1000);
        }

        // Publish availability
        if (changed) {
            const deviceSettings = settings.getDevice(deviceID);
            const friendlyName = deviceSettings ? deviceSettings.friendly_name : deviceID;
            const availablePayload = (available ? 'online' : 'offline');
            logger.info(`Device availability changed: ${availablePayload} (${friendlyName} ${deviceID})`);
            this.mqtt.publish(`devices/${friendlyName}/state`, availablePayload, {retain: true, qos: 0}, null, settings.get().mqtt.base_topic);
        }
    }

    pingDevice(device) {
        const self = this;
        this.zigbee.ping(device.ieeeAddr).then(function() {
            logger.info(`Device availability ping success: ${device.ieeeAddr}`);
            self.setDeviceAvailable(device, Date.now());
        }).fail(function(err) {
            logger.info(`Device availability ping fail: ${err} ${device.ieeeAddr}`);
            self.setDeviceAvailable(device, 0);
        }).done();
    }

    startTimer() {
        this.clearTimer();
        this.timer = setInterval(() => this.handleInterval(), this.interval);
    }

    clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    stop() {
        this.clearTimer();
    }

    handleInterval() {
        this.zigbee.getAllClients()
            .filter((d) => d.type === 'Router') // Filter routers
            .filter((d) => d.powerSource && d.powerSource !== 'Battery') // Remove battery powered devices
            .forEach((d) => this.pingDevice(d)); // Ping devices.
    }
}

module.exports = DeviceAvailabilityHandler;
