const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');
const debounce = require('debounce');
const Extension = require('./extension');

class DeviceReceive extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.coordinator = null;
        this.elapsed = {};
        this.debouncers = {};
    }

    async onZigbeeStarted() {
        this.coordinator = this.zigbee.getDevicesByType('Coordinator')[0];
    }

    publishDebounce(ieeeAddr, payload, time, debounceIgnore) {
        if (!this.debouncers[ieeeAddr]) {
            this.debouncers[ieeeAddr] = {
                payload: {},
                publish: debounce(() => {
                    this.publishEntityState(ieeeAddr, this.debouncers[ieeeAddr].payload);
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

    canHandleEvent(type, data, resolvedEntity) {
        if (type !== 'message' || !resolvedEntity) {
            return false;
        }

        if (data.device.ieeeAddr === this.coordinator.ieeeAddr) {
            logger.debug('Ignoring message from coordinator');
            return false;
        }

        /**
         * Don't handle re-transmitted Xiaomi messages.
         * https://github.com/Koenkk/zigbee2mqtt/issues/1238
         *
         * Some Xiaomi router devices re-transmit messages from Xiaomi end devices.
         * The source address of these message is set to the one of the Xiaomi router.
         * Therefore it looks like if the message came from the Xiaomi router, while in
         * fact it came from the end device.
         * Handling these message would result in false state updates.
         * The group ID attribute of these message defines the source address of the end device.
         * As the same message is also received directly from the end device, it makes no sense
         * to handle these messages.
         */
        const hasGroupID = data.hasOwnProperty('groupID') && data.groupID != 0;
        if (utils.isXiaomiDevice(data.device) && utils.isRouter(data.device) && hasGroupID) {
            logger.debug('Skipping re-transmitted Xiaomi message');
            return false;
        }

        if (!data.device.modelID && data.device.interviewing) {
            logger.debug(`Skipping message, modelID is undefined and still interviewing`);
            return false;
        }

        if (!resolvedEntity.definition) {
            logger.warn(`Received message from unsupported device with Zigbee model '${data.device.modelID}'`);
            logger.warn(`Please see: https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html.`);
            return false;
        }

        return true;
    }

    onZigbeeEvent(type, data, resolvedEntity) {
        if (!this.canHandleEvent(type, data, resolvedEntity)) {
            return;
        }

        const converters = resolvedEntity.definition.fromZigbee.filter((c) => {
            const type = Array.isArray(c.type) ? c.type.includes(data.type) : c.type === data.type;
            return c.cluster === data.cluster && type;
        });

        // Check if there is an available converter, genOta messages are not interesting.
        if (!converters.length && data.cluster !== 'genOta') {
            logger.debug(
                `No converter available for '${resolvedEntity.definition.model}' with cluster '${data.cluster}' ` +
                `and type '${data.type}' and data '${JSON.stringify(data.data)}'`,
            );
            return;
        }

        const debounce = resolvedEntity.settings.debounce || settings.get().device_options.debounce;
        const debounceIgnore = resolvedEntity.settings.debounce_ignore || settings.get().device_options.debounce_ignore;

        // Convert this Zigbee message to a MQTT message.
        // Get payload for the message.
        // - If a payload is returned publish it to the MQTT broker
        // - If NO payload is returned do nothing. This is for non-standard behaviour
        //   for e.g. click switches where we need to count number of clicks and detect long presses.
        const publish = (payload) => {
            // Add device linkquality.
            if (data.hasOwnProperty('linkquality')) {
                payload.linkquality = data.linkquality;
            }

            if (settings.get().advanced.elapsed) {
                const now = Date.now();
                if (this.elapsed[data.device.ieeeAddr]) {
                    payload.elapsed = now - this.elapsed[data.device.ieeeAddr];
                }

                this.elapsed[data.device.ieeeAddr] = now;
            }

            // Check if we have to debounce
            if (debounce) {
                this.publishDebounce(data.device.ieeeAddr, payload, debounce, debounceIgnore);
            } else {
                this.publishEntityState(data.device.ieeeAddr, payload);

                if (settings.get().homeassistant && settings.get().advanced.homeassistant_legacy_triggers) {
                    /**
                     * Publish an empty value for click and action payload, in this way Home Assistant
                     * can use Home Assistant entities in automations.
                     * https://github.com/Koenkk/zigbee2mqtt/issues/959#issuecomment-480341347
                     */
                    Object.keys(payload).forEach((key) => {
                        if (['action', 'click'].includes(key)) {
                            const counterPayload = {};
                            counterPayload[key] = '';
                            this.publishEntityState(data.device.ieeeAddr, counterPayload);
                        }
                    });
                }
            }
        };

        const meta = {device: data.device};
        let payload = {};
        converters.forEach((converter) => {
            const options = {...settings.get().device_options, ...settings.getDevice(data.device.ieeeAddr)};
            const converted = converter.convert(resolvedEntity.definition, data, publish, options, meta);
            if (converted) {
                payload = {...payload, ...converted};
            }
        });

        if (Object.keys(payload).length) {
            publish(payload);
        }
    }
}

module.exports = DeviceReceive;
