const BaseExtension = require('./baseExtension');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const settings = require('../util/settings');

class DeviceEvent extends BaseExtension {
    async onZigbeeStarted() {
        for (const device of this.zigbee.getClients()) {
            this.callOnEvent(device, 'start', {});
        }
    }

    onZigbeeEvent(type, data, mappedDevice, settingsDevice) {
        if (data.device) {
            this.callOnEvent(data.device, type, data, mappedDevice, settingsDevice);
        }
    }

    async stop() {
        for (const device of this.zigbee.getClients()) {
            this.callOnEvent(device, 'stop', {});
        }
    }

    callOnEvent(device, type, data, mappedDevice, options) {
        if (!mappedDevice) {
            mappedDevice = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
        }
        if (!options) {
            options = {...settings.get().device_options, ...settings.getDevice(device.ieeeAddr)};
        }

        if (mappedDevice && mappedDevice.onEvent) {
            mappedDevice.onEvent(type, data, device, options);
        }
    }
}

module.exports = DeviceEvent;
