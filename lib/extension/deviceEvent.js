const BaseExtension = require('./baseExtension');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');

class DeviceEvent extends BaseExtension {
    async onZigbeeStarted() {
        for (const device of this.zigbee.getClients()) {
            this.callOnEvent(device, 'start', {});
        }
    }

    onZigbeeEvent(type, data, mappedDevice, settingsDevice) {
        if (data.device) {
            this.callOnEvent(data.device, type, data, mappedDevice);
        }
    }

    async stop() {
        for (const device of this.zigbee.getClients()) {
            this.callOnEvent(device, 'stop', {});
        }
    }

    callOnEvent(device, type, data, mappedDevice) {
        zigbeeHerdsmanConverters.onEvent(type, data, device);

        if (!mappedDevice) {
            mappedDevice = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
        }

        if (mappedDevice && mappedDevice.onEvent) {
            mappedDevice.onEvent(type, data, device);
        }
    }
}

module.exports = DeviceEvent;
