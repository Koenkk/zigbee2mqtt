const settings = require('../util/settings');
const logger = require('../util/logger');
const Extension = require('./extension');

/**
 * This extension calls the zigbee-herdsman-converters definition configure() method
 */
class Configure extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);

        this.configuring = new Set();
        this.attempts = {};

        this.legacyApi = settings.get().advanced.legacy_api;
        this.legacyTopic = `${settings.get().mqtt.base_topic}/bridge/configure`;
    }

    shouldConfigure(resolvedEntity) {
        if (!resolvedEntity || !resolvedEntity.definition || !resolvedEntity.definition.configure) {
            return false;
        }

        if (resolvedEntity.device.meta &&
            resolvedEntity.device.meta.hasOwnProperty('configured') &&
            resolvedEntity.device.meta.configured === resolvedEntity.definition.meta.configureKey) {
            return false;
        }

        if (resolvedEntity.device.interviewing === true) {
            return false;
        }

        return true;
    }

    onMQTTConnected() {
        /* istanbul ignore else */
        if (this.legacyApi) {
            this.mqtt.subscribe(this.legacyTopic);
        }
    }

    async onMQTTMessage(topic, message) {
        /* istanbul ignore else */
        if (this.legacyApi) {
            if (topic !== this.legacyTopic) {
                return;
            }

            const resolvedEntity = this.zigbee.resolveEntity(message);
            if (!resolvedEntity || resolvedEntity.type !== 'device') {
                logger.error(`Device '${message}' does not exist`);
                return;
            }

            if (!resolvedEntity.definition || !resolvedEntity.definition.configure) {
                logger.warn(`Skipping configure of '${resolvedEntity.name}', device does not require this.`);
                return;
            }

            this.configure(resolvedEntity, true);
        }
    }

    async onZigbeeStarted() {
        this.coordinatorEndpoint = this.zigbee.getDevicesByType('Coordinator')[0].getEndpoint(1);

        for (const device of this.zigbee.getClients()) {
            const resolvedEntity = this.zigbee.resolveEntity(device);
            if (this.shouldConfigure(resolvedEntity)) {
                await this.configure(resolvedEntity);
            }
        }
    }

    onZigbeeEvent(type, data, resolvedEntity) {
        const device = data.device;

        if (type === 'deviceJoined' && device.meta.hasOwnProperty('configured')) {
            delete device.meta.configured;
            device.save();
        }

        if (this.shouldConfigure(resolvedEntity)) {
            this.configure(resolvedEntity);
        }
    }

    async configure(resolvedEntity, force=false) {
        const device = resolvedEntity.device;
        if (this.configuring.has(device.ieeeAddr) || (this.attempts[device.ieeeAddr] >= 3 && !force)) {
            return false;
        }

        this.configuring.add(device.ieeeAddr);

        if (!this.attempts.hasOwnProperty(device.ieeeAddr)) {
            this.attempts[device.ieeeAddr] = 0;
        }

        logger.info(`Configuring '${resolvedEntity.name}'`);
        try {
            await resolvedEntity.definition.configure(device, this.coordinatorEndpoint);
            logger.info(`Successfully configured '${resolvedEntity.name}'`);
            device.meta.configured = resolvedEntity.definition.meta.configureKey;
            device.save();
        } catch (error) {
            logger.error(
                `Failed to configure '${resolvedEntity.name}', ` +
                `attempt ${this.attempts[device.ieeeAddr] + 1} (${error.stack})`,
            );
            this.attempts[device.ieeeAddr]++;
        }

        this.configuring.delete(device.ieeeAddr);
    }
}

module.exports = Configure;
