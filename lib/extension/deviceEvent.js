const BaseExtension = require('./baseExtension');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');

class DeviceEvent extends BaseExtension {
    async onZigbeeStarted() {
        for (const device of this.zigbee.getClients()) {
            this.callOnEvent(device, 'start', {});
        }
    }

    onZigbeeEvent(type, data, resolvedEntity) {
        if (data.device && resolvedEntity.definition) {
            this.callOnEvent(data.device, type, data, resolvedEntity.definition);
        }
    }

    async stop() {
        for (const device of this.zigbee.getClients()) {
            this.callOnEvent(device, 'stop', {});
        }
    }

    callOnEvent(device, type, data, definition) {
        zigbeeHerdsmanConverters.onEvent(type, data, device);

        if (!definition) {
            definition = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
        }

        if (definition && definition.onEvent) {
            definition.onEvent(type, data, device);
        }
    }
}

module.exports = DeviceEvent;
