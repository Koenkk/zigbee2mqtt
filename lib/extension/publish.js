
const settings = require('../util/settings');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const logger = require('../util/logger');
const utils = require('../util/utils');
const assert = require('assert');
const Extension = require('./extension');
const stringify = require('json-stable-stringify');

const topicRegex = new RegExp(`^(.+?)(?:/(${utils.getEndpointNames().join('|')}))?/(get|set)(?:/(.+))?`);
const stateValues = ['on', 'off', 'toggle', 'open', 'close', 'stop', 'lock', 'unlock'];

const groupConverters = [
    zigbeeHerdsmanConverters.toZigbeeConverters.light_onoff_brightness,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_color_colortemp,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_alert,
    zigbeeHerdsmanConverters.toZigbeeConverters.ignore_transition,
    zigbeeHerdsmanConverters.toZigbeeConverters.cover_position_tilt,
    zigbeeHerdsmanConverters.toZigbeeConverters.thermostat_occupied_heating_setpoint,
    zigbeeHerdsmanConverters.toZigbeeConverters.tint_scene,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_brightness_move,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_brightness_step,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_colortemp_step,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_colortemp_move,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_hue_saturation_move,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_hue_saturation_step,
];

class EntityPublish extends Extension {
    onMQTTConnected() {
        // Subscribe to topics.
        const baseTopic = settings.get().mqtt.base_topic;
        for (let step = 1; step < 20; step++) {
            const topic = `${baseTopic}/${'+/'.repeat(step)}`;
            this.mqtt.subscribe(`${topic}set`);
            this.mqtt.subscribe(`${topic}set/+`);
            this.mqtt.subscribe(`${topic}get`);
            this.mqtt.subscribe(`${topic}get/+`);
        }
    }

    parseTopic(topic) {
        const match = topic.match(topicRegex);
        if (!match) {
            return null;
        }

        const ID = match[1].replace(`${settings.get().mqtt.base_topic}/`, '');
        // If we didn't replace base_topic we received something we don't care about
        if (ID === match[1] || ID.match(/bridge/)) {
            return null;
        }

        return {ID: ID, endpointName: match[2] || '', type: match[3], attribute: match[4]};
    }

    async onMQTTMessage(topic, message) {
        topic = this.parseTopic(topic);
        if (!topic) {
            return false;
        }

        const entityKey = `${topic.ID}` + (topic.endpointName ? `/${topic.endpointName}` : '');
        const resolvedEntity = this.zigbee.resolveEntity(entityKey);

        if (!resolvedEntity) {
            /* istanbul ignore else */
            if (settings.get().advanced.legacy_api) {
                const message = {friendly_name: entityKey};
                this.mqtt.publish(
                    'bridge/log',
                    stringify({type: `entity_not_found`, message}),
                );
            }

            logger.error(`Entity '${entityKey}' is unknown`);
            return;
        }

        // Get entity details
        let converters = null;
        let target = null;
        let options = {};
        let device = null;
        let definition = null;

        assert(resolvedEntity.type === 'device' || resolvedEntity.type === 'group');
        if (resolvedEntity.type === 'device') {
            if (!resolvedEntity.definition) {
                logger.warn(`Device with modelID '${resolvedEntity.device.modelID}' is not supported.`);
                logger.warn(`Please see: https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html`);
                return;
            }

            device = resolvedEntity.device;
            definition = resolvedEntity.definition;
            target = resolvedEntity.endpoint;
            converters = resolvedEntity.definition.toZigbee;
            options = resolvedEntity.settings;
        } else {
            target = resolvedEntity.group;
            options = resolvedEntity.settings;
            definition = resolvedEntity.group.members
                .map((e) => zigbeeHerdsmanConverters.findByDevice(e.getDevice())).filter((d) => d);
            converters = new Set(groupConverters);
            for (const d of definition) {
                d.toZigbee.forEach(converters.add, converters);
            }
            converters = [...converters];
        }

        // Convert the MQTT message to a Zigbee message.
        let json = {};
        if (topic.hasOwnProperty('attribute') && topic.attribute) {
            try {
                json[topic.attribute] = JSON.parse(message);
            } catch (e) {
                json[topic.attribute] = message;
            }
        } else {
            try {
                json = JSON.parse(message);
            } catch (e) {
                if (stateValues.includes(message.toLowerCase())) {
                    json = {state: message};
                } else {
                    logger.error(`Invalid JSON '${message}', skipping...`);
                }
            }
        }


        /**
         * Home Assistant always publishes 'state', even when e.g. only setting
         * the color temperature. This would lead to 2 zigbee publishes, where the first one
         * (state) is probably unecessary.
         */
        const deviceState = this.state.get(resolvedEntity.settings.ID) || {};
        if (settings.get().homeassistant) {
            const hasColorTemp = json.hasOwnProperty('color_temp');
            const hasColor = json.hasOwnProperty('color');
            const hasBrightness = json.hasOwnProperty('brightness');
            const isOn = deviceState && deviceState.state === 'ON' ? true : false;
            if (isOn && (hasColorTemp || hasColor) && !hasBrightness) {
                delete json.state;
                logger.debug('Skipping state because of Home Assistant');
            }
        }

        /**
         * Order state & brightness based on current bulb state
         *
         * Not all bulbs support setting the color/color_temp while it is off
         * this results in inconsistant behavior between different vendors.
         *
         * bulb on => move state & brightness to the back
         * bulb off => move state & brightness to the front
         */
        const entries = Object.entries(json);
        const sorter = typeof json.state === 'string' && json.state.toLowerCase() === 'off' ? 1 : -1;
        entries.sort((a, b) => (['state', 'brightness', 'brightness_percent'].includes(a[0]) ? sorter : sorter * -1));

        // For each attribute call the corresponding converter
        const usedConverters = {};
        for (let [key, value] of entries) {
            let endpointName = topic.endpointName;
            let actualTarget = target;

            // When the key has a endpointName included (e.g. state_right), this will override the target.
            if (resolvedEntity.type === 'device' && key.includes('_')) {
                const underscoreIndex = key.lastIndexOf('_');
                const possibleEndpointName = key.substring(underscoreIndex + 1, key.length);
                if (utils.getEndpointNames().includes(possibleEndpointName)) {
                    endpointName = possibleEndpointName;
                    key = key.substring(0, underscoreIndex);
                    const device = target.getDevice();
                    actualTarget = device.getEndpoint(definition.endpoint(device)[endpointName]);

                    if (!actualTarget) {
                        logger.error(`Device '${resolvedEntity.name}' has no endpoint '${endpointName}'`);
                        continue;
                    }
                }
            }

            const endpointOrGroupID = actualTarget.constructor.name == 'Group' ? actualTarget.groupID : actualTarget.ID;
            if (!usedConverters.hasOwnProperty(endpointOrGroupID)) usedConverters[endpointOrGroupID] = [];
            const converter = converters.find((c) => c.key.includes(key));

            if (usedConverters[endpointOrGroupID].includes(converter)) {
                // Use a converter only once (e.g. light_onoff_brightness converters can convert state and brightness)
                continue;
            }

            if (!converter) {
                logger.error(`No converter available for '${key}' (${json[key]})`);
                continue;
            }

            // Converter didn't return a result, skip
            const meta = {
                endpoint_name: endpointName,
                options,
                message: json,
                logger,
                device,
                state: deviceState,
                mapped: definition,
            };

            try {
                if (topic.type === 'set' && converter.convertSet) {
                    logger.debug(`Publishing '${topic.type}' '${key}' to '${resolvedEntity.name}'`);
                    const result = await converter.convertSet(actualTarget, key, value, meta);
                    if (result && result.state) {
                        const msg = result.state;

                        if (endpointName) {
                            for (const key of ['state', 'brightness', 'color', 'color_temp']) {
                                if (msg.hasOwnProperty(key)) {
                                    msg[`${key}_${endpointName}`] = msg[key];
                                    delete msg[key];
                                }
                            }
                        }

                        this.publishEntityState(resolvedEntity.settings.ID, msg);
                    }

                    // It's possible for devices to get out of sync when writing an attribute that's not reportable.
                    // So here we re-read the value after a specified timeout, this timeout could for example be the
                    // transition time of a color change or for forcing a state read for devices that don't
                    // automatically report a new state when set.
                    // When reporting is requested for a device (report: true in device-specific settings) we won't
                    // ever issue a read here, as we assume the device will properly report changes.
                    // Only do this when the retrieve_state option is enabled for this device.
                    if (
                        resolvedEntity.type === 'device' && result && result.hasOwnProperty('readAfterWriteTime') &&
                        resolvedEntity.settings.retrieve_state
                    ) {
                        setTimeout(() => converter.convertGet(actualTarget, key, meta), result.readAfterWriteTime);
                    }
                } else if (topic.type === 'get' && converter.convertGet) {
                    logger.debug(`Publishing get '${topic.type}' '${key}' to '${resolvedEntity.name}'`);
                    await converter.convertGet(actualTarget, key, meta);
                } else {
                    logger.error(`No converter available for '${topic.type}' '${key}' (${json[key]})`);
                    continue;
                }
            } catch (error) {
                const message =
                    `Publish '${topic.type}' '${key}' to '${resolvedEntity.name}' failed: '${error}'`;
                logger.error(message);
                logger.debug(error.stack);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = {friendly_name: resolvedEntity.name};
                    this.mqtt.publish(
                        'bridge/log',
                        stringify({type: `zigbee_publish_error`, message, meta}),
                    );
                }
            }

            usedConverters[endpointOrGroupID].push(converter);
        }

        return true;
    }
}

module.exports = EntityPublish;
