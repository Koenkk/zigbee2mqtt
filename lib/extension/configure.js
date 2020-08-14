const settings = require('../util/settings');
const utils = require('../util/utils');
const logger = require('../util/logger');
const Extension = require('./extension');
const stringify = require('json-stable-stringify');

/**
 * This extension calls the zigbee-herdsman-converters definition configure() method
 */
class Configure extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);

        this.configuring = new Set();
        this.onReportingDisabled = this.onReportingDisabled.bind(this);
        this.attempts = {};

        this.topic = `${settings.get().mqtt.base_topic}/bridge/request/device/configure`;
        this.legacyTopic = `${settings.get().mqtt.base_topic}/bridge/configure`;
        this.eventBus.on(`reportingDisabled`, this.onReportingDisabled);
    }

    onReportingDisabled(data) {
        // Disabling reporting unbinds some cluster which could be bound by configure, re-setup.
        const device = data.device;

        const resolvedEntity = this.zigbee.resolveEntity(device);
        if (resolvedEntity.device.meta && resolvedEntity.device.meta.hasOwnProperty('configured')) {
            delete device.meta.configured;
            device.save();
        }

        if (this.shouldConfigure(resolvedEntity)) {
            this.configure(resolvedEntity);
        }
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
        if (settings.get().advanced.legacy_api) {
            this.mqtt.subscribe(this.legacyTopic);
        }

        /* istanbul ignore else */
        if (settings.get().experimental.new_api) {
            this.mqtt.subscribe(this.topic);
        }
    }

    async onMQTTMessage(topic, message) {
        if (topic === this.legacyTopic) {
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
        } else if (topic === this.topic) {
            message = utils.parseJSON(message, message);
            const ID = typeof message === 'object' && message.hasOwnProperty('id') ? message.id : message;
            let error = null;

            const resolvedEntity = this.zigbee.resolveEntity(ID);
            if (!resolvedEntity || resolvedEntity.type !== 'device') {
                error = `Device '${ID}' does not exist`;
            } else if (!resolvedEntity.definition || !resolvedEntity.definition.configure) {
                error = `Device '${resolvedEntity.name}' cannot be configured`;
            } else {
                try {
                    await this.configure(resolvedEntity, true, true);
                } catch (e) {
                    error = `Failed to configure (${e.message})`;
                }
            }

            const response = utils.getResponse(message, {id: ID}, error);
            await this.mqtt.publish(`bridge/response/device/configure`, stringify(response));
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

    async configure(resolvedEntity, force=false, thowError=false) {
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
            this.attempts[device.ieeeAddr]++;
            const attempt = this.attempts[device.ieeeAddr];
            const msg = `Failed to configure '${resolvedEntity.name}', attempt ${attempt} (${error.stack})`;
            logger.error(msg);

            if (thowError) {
                throw error;
            }
        }

        this.configuring.delete(device.ieeeAddr);
    }
}

module.exports = Configure;
