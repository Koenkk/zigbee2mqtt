const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');
const debounce = require('debounce');
const Extension = require('./extension');
const stringify = require('json-stable-stringify-without-jsonify');

class Receive extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.elapsed = {};
        this.debouncers = {};
        this.eventBus.on('publishEntityState', (data) => this.onPublishEntityState(data));
    }

    async onZigbeeStarted() {
        this.coordinator = this.zigbee.getDevicesByType('Coordinator')[0];
    }

    async onPublishEntityState(data) {
        /**
         * Prevent that outdated properties are being published.
         * In case that e.g. the state is currently held back by a debounce and a new state is published
         * remove it from the to be send debounced message.
         */
        if (data.entity.type === 'device' && this.debouncers[data.entity.device.ieeeAddr] &&
            data.stateChangeReason !== 'publishDebounce') {
            for (const key of Object.keys(data.payload)) {
                delete this.debouncers[data.entity.device.ieeeAddr].payload[key];
            }
        }
    }

    publishDebounce(ieeeAddr, payload, time, debounceIgnore) {
        if (!this.debouncers[ieeeAddr]) {
            this.debouncers[ieeeAddr] = {
                payload: {},
                publish: debounce(() => {
                    this.publishEntityState(ieeeAddr, this.debouncers[ieeeAddr].payload, 'publishDebounce');
                    this.debouncers[ieeeAddr].payload = {};
                }, time * 1000),
            };
        }

        if (this.isPayloadConflicted(payload, this.debouncers[ieeeAddr].payload, debounceIgnore)) {
            // publish previous payload immediately
            this.debouncers[ieeeAddr].publish.flush();
        }

        // extend debounced payload with current
        this.debouncers[ieeeAddr].payload = {...this.debouncers[ieeeAddr].payload, ...payload};
        this.debouncers[ieeeAddr].publish();
    }

    // if debounce_ignore are specified (Array of strings)
    // then all newPayload values with key present in debounce_ignore
    // should equal or be undefined in oldPayload
    // otherwise payload is conflicted
    isPayloadConflicted(newPayload, oldPayload, debounceIgnore) {
        let result = false;
        Object.keys(oldPayload)
            .filter((key) => (debounceIgnore || []).includes(key))
            .forEach((key) => {
                if (typeof newPayload[key] !== 'undefined' && newPayload[key] !== oldPayload[key]) {
                    result = true;
                }
            });

        return result;
    }

    shouldProcess(type, data, resolvedEntity) {
        if (type !== 'message' || !resolvedEntity) {
            return false;
        }

        if (!resolvedEntity.definition) {
            if (data.device.interviewing) {
                logger.debug(`Skipping message, definition is undefined and still interviewing`);
            } else {
                logger.warn(
                    `Received message from unsupported device with Zigbee model '${data.device.modelID}' ` +
                    `and manufacturer name '${data.device.manufacturerName}'`);
                logger.warn(`Please see: https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html.`);
            }

            return false;
        }

        return true;
    }

    onZigbeeEvent(type, data, resolvedEntity) {
        /**
         * Handling of re-transmitted Xiaomi messages.
         * https://github.com/Koenkk/zigbee2mqtt/issues/1238
         * https://github.com/Koenkk/zigbee2mqtt/issues/3592
         *
         * Some Xiaomi router devices re-transmit messages from Xiaomi end devices.
         * The network address of these message is set to the one of the Xiaomi router.
         * Therefore it looks like if the message came from the Xiaomi router, while in
         * fact it came from the end device.
         * Handling these message would result in false state updates.
         * The group ID attribute of these message defines the network address of the end device.
         */
        if (type === 'message' && utils.isXiaomiDevice(data.device) && data.device.type === 'Router' && data.groupID) {
            logger.debug('Handling re-transmitted Xiaomi message');
            data.device = this.zigbee.getDeviceByNetworkAddress(data.groupID);
            resolvedEntity = this.zigbee.resolveEntity(data.device);
        }

        if (!this.shouldProcess(type, data, resolvedEntity)) {
            return;
        }

        const converters = resolvedEntity.definition.fromZigbee.filter((c) => {
            const type = Array.isArray(c.type) ? c.type.includes(data.type) : c.type === data.type;
            return c.cluster === data.cluster && type;
        });

        // Check if there is an available converter, genOta messages are not interesting.
        if (!converters.length && !['genOta', 'genTime', 'genBasic'].includes(data.cluster)) {
            logger.debug(
                `No converter available for '${resolvedEntity.definition.model}' with cluster '${data.cluster}' ` +
                `and type '${data.type}' and data '${stringify(data.data)}'`,
            );
            return;
        }

        // Convert this Zigbee message to a MQTT message.
        // Get payload for the message.
        // - If a payload is returned publish it to the MQTT broker
        // - If NO payload is returned do nothing. This is for non-standard behaviour
        //   for e.g. click switches where we need to count number of clicks and detect long presses.
        const publish = (payload) => {
            if (settings.get().advanced.elapsed) {
                const now = Date.now();
                if (this.elapsed[data.device.ieeeAddr]) {
                    payload.elapsed = now - this.elapsed[data.device.ieeeAddr];
                }

                this.elapsed[data.device.ieeeAddr] = now;
            }

            // Check if we have to debounce
            if (resolvedEntity.settings.debounce) {
                this.publishDebounce(
                    data.device.ieeeAddr, payload, resolvedEntity.settings.debounce,
                    resolvedEntity.settings.debounce_ignore,
                );
            } else {
                this.publishEntityState(data.device.ieeeAddr, payload);
            }
        };

        const meta = {device: data.device, logger, state: this.state.get(data.device.ieeeAddr)};
        let payload = {};
        converters.forEach((converter) => {
            const converted = converter.convert(
                resolvedEntity.definition, data, publish, resolvedEntity.settings, meta,
            );
            if (converted) {
                payload = {...payload, ...converted};
            }
        });

        if (Object.keys(payload).length) {
            publish(payload);
        }
    }
}

module.exports = Receive;
