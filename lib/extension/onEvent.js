const Extension = require('./extension');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');

/**
 * This extension calls the zigbee-herdsman-converters onEvent.
 */
class OnEvent extends Extension {
    async onZigbeeStarted() {
        for (const device of this.zigbee.getClients()) {
            const resolvedEntity = this.zigbee.resolveEntity(device);
            this.callOnEvent(resolvedEntity, 'start', {});
        }
    }

    onZigbeeEvent(type, data, resolvedEntity) {
        if (resolvedEntity && resolvedEntity.type === 'device') {
            this.callOnEvent(resolvedEntity, type, data);
        }
    }

    async stop() {
        super.stop();
        for (const device of this.zigbee.getClients()) {
            const resolvedEntity = this.zigbee.resolveEntity(device);
            this.callOnEvent(resolvedEntity, 'stop', {});
        }
    }

    callOnEvent(resolvedEntity, type, data) {
        zigbeeHerdsmanConverters.onEvent(type, data, resolvedEntity.device);

        if (resolvedEntity.definition && resolvedEntity.definition.onEvent) {
            resolvedEntity.definition.onEvent(type, data, resolvedEntity.device);
        }
    }
}

module.exports = OnEvent;
