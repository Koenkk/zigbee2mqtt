const logger = require('../util/logger');
const settings = require('../util/settings');

/**
 * This extensions set availablity based on optionally polling router devices 
 * and optionally check device publish with attribute reporting
 */
class DeviceAvailabilityHandler {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.publishDeviceState = publishDeviceState;
        const advancedSettings = settings.get().advanced;
        this.interval = advancedSettings.hasOwnProperty('availability_interval') ?
            (advancedSettings.availability_interval * 1000) : 0;
        this.timer = null;
        this.devicesAvailability = {};
    }

    onZigbeeStarted() {
        if (this.interval) {
            this.startTimer();
        }
    }

    onPublishDeviceState(device, messagePayload) {
        this.setDeviceAvailable(device, messagePayload.hasOwnProperty('last_seen') ?
            (new Date(messagePayload.last_seen)).getTime() : 0);
    }

    setDeviceAvailable(device, lastSeen) {
        const deviceSettings = settings.getDevice(device.ieeeAddr);
        const attributeReportInterval = (deviceSettings && deviceSettings.hasOwnProperty('attribute_report_interval')) ?
            deviceSettings.attribute_report_interval : 0;
        // Interval depends on power source, on battery-powered device enabled only when attribute reporting exists
        const interval = (this.interval && (device.powerSource === 'Mains (single phase)')) ? this.interval : attributeReportInterval;

        // Return on disabled
        if (!interval) {
            return;
        }

        const deviceID = device.ieeeAddr;
        const now = Date.now();
        const timeout = interval + 10;
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
                this.publishDeviceState(device, {});
            }, 120 * 1000);
        }

        // Publish availability
        if (changed) {
            const deviceSettings = settings.getDevice(deviceID);
            const friendlyName = deviceSettings ? deviceSettings.friendly_name : deviceID;
            const availablePayload = available ? 'online' : 'offline';
            const options = {
                retain: deviceSettings ? deviceSettings.retain : false,
                qos: deviceSettings && deviceSettings.qos ? deviceSettings.qos : 0,
            };
            logger.info(`Device availability changed: ${availablePayload} (${friendlyName} ${deviceID})`);
            this.mqtt.publish(`devices/${friendlyName}/state`, availablePayload, options);
        }
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

    pingDevice(device) {
        const self = this;
        this.zigbee.ping(device.ieeeAddr).then(function() {
            self.setDeviceAvailable(device, Date.now());
        }).fail(function(err) {
            self.setDeviceAvailable(device, 0);
        }).done();
    }

    handleInterval() {
        this.zigbee.getAllClients()
            .filter((d) => d.type === 'Router') // Filter routers
            .filter((d) => d.powerSource && d.powerSource !== 'Battery') // Remove battery powered devices
            .forEach((d) => this.pingDevice(d)); // Ping devices.
    }
}

module.exports = DeviceAvailabilityHandler;
