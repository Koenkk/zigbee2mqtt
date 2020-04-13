
const settings = require('../util/settings');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const logger = require('../util/logger');
const utils = require('../util/utils');
const assert = require('assert');
const Extension = require('./extension');

const postfixes = utils.getEndpointNames();
const topicRegex = new RegExp(`^(.+?)(?:/(${postfixes.join('|')}))?/(get|set)(?:/(.+))?`);

const groupConverters = [
    zigbeeHerdsmanConverters.toZigbeeConverters.light_onoff_brightness,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_colortemp,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_color,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_alert,
    zigbeeHerdsmanConverters.toZigbeeConverters.ignore_transition,
    zigbeeHerdsmanConverters.toZigbeeConverters.cover_position_tilt,
    zigbeeHerdsmanConverters.toZigbeeConverters.thermostat_occupied_heating_setpoint,
    zigbeeHerdsmanConverters.toZigbeeConverters.tint_scene,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_brightness_move,
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

        return {ID: ID, postfix: match[2] || '', type: match[3], attribute: match[4]};
    }

    async onMQTTMessage(topic, message) {
        topic = this.parseTopic(topic);
        if (!topic) {
            return false;
        }

        const entityName = `${topic.ID}` + (topic.postfix ? `/${topic.postfix}` : '');
        const entity = this.zigbee.resolveEntity(entityName);

        if (!entity) {
            /* istanbul ignore else */
            if (settings.get().advanced.legacy_api) {
                const message = {friendly_name: entityName};
                this.mqtt.publish(
                    'bridge/log',
                    JSON.stringify({type: `entity_not_found`, message}),
                );
            }

            logger.error(`Entity '${entityName}' is unknown`);
            return;
        }

        // Get entity details
        let converters = null;
        let target = null;
        let options = {};
        let device = null;
        let mapped = null;

        assert(entity.type === 'device' || entity.type === 'group');
        if (entity.type === 'device') {
            // Map device to a model
            if (!entity.definition) {
                logger.warn(`Device with modelID '${entity.device.modelID}' is not supported.`);
                logger.warn(`Please see: https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html`);
                return;
            }

            device = entity.device;
            mapped = entity.definition;
            target = entity.endpoint;
            converters = entity.definition.toZigbee;
            options = entity.settings;
        } else {
            converters = groupConverters;
            target = entity.group;
            options = entity.settings;
            mapped = entity.group.members.map((e) => zigbeeHerdsmanConverters.findByDevice(e.getDevice()));
        }

        // Convert the MQTT message to a Zigbee message.
        let json = {};
        if (topic.hasOwnProperty('attribute') && topic.attribute) {
            json[topic.attribute] = message;
        } else {
            try {
                json = JSON.parse(message);
            } catch (e) {
                // Cannot be parsed to JSON, assume state message.
                json = {state: message};
            }
        }

        /**
         * Home Assistant always publishes 'state', even when e.g. only setting
         * the color temperature. This would lead to 2 zigbee publishes, where the first one
         * (state) is probably unecessary.
         */
        const deviceState = this.state.get(entity.settings.ID) || {};
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

        // Ensure that state and brightness are executed before other commands.
        const entries = Object.entries(json);
        entries.sort((a, b) => (['state', 'brightness'].includes(a[0]) ? -1 : 1));

        // For each attribute call the corresponding converter
        const usedConverters = [];
        for (let [key, value] of entries) {
            let postfix = topic.postfix;
            let actualTarget = target;

            // When the key has a postfix included (e.g. state_right), this will override the target.
            if (entity.type === 'device' && key.includes('_')) {
                const underscoreIndex = key.lastIndexOf('_');
                const possiblePostfix = key.substring(underscoreIndex + 1, key.length);
                if (utils.getEndpointNames().includes(possiblePostfix)) {
                    postfix = possiblePostfix;
                    key = key.substring(0, underscoreIndex);
                    const device = target.getDevice();
                    actualTarget = device.getEndpoint(mapped.endpoint(device)[postfix]);
                }
            }

            const converter = converters.find((c) => c.key.includes(key));

            if (usedConverters.includes(converter)) {
                // Use a converter only once (e.g. light_onoff_brightness converters can convert state and brightness)
                continue;
            }

            if (!converter) {
                logger.error(`No converter available for '${key}' (${json[key]})`);
                continue;
            }

            // Converter didn't return a result, skip
            const meta = {
                endpoint_name: postfix,
                options,
                message: json,
                logger,
                device,
                state: deviceState,
                mapped,
            };

            try {
                if (topic.type === 'set' && converter.convertSet) {
                    logger.debug(`Publishing '${topic.type}' '${key}' to '${entity.name}'`);
                    const result = await converter.convertSet(actualTarget, key, value, meta);
                    if (result && result.state) {
                        const msg = result.state;

                        if (postfix) {
                            for (const key of ['state', 'brightness']) {
                                if (msg.hasOwnProperty(key)) {
                                    msg[`${key}_${postfix}`] = msg[key];
                                    delete msg[key];
                                }
                            }
                        }

                        this.publishEntityState(entity.settings.ID, msg);
                    }

                    // It's possible for devices to get out of sync when writing an attribute that's not reportable.
                    // So here we re-read the value after a specified timeout, this timeout could for example be the
                    // transition time of a color change or for forcing a state read for devices that don't
                    // automatically report a new state when set.
                    // When reporting is requested for a device (report: true in device-specific settings) we won't
                    // ever issue a read here, as we assume the device will properly report changes.
                    // Only do this when the retrieve_state option is enabled for this device.
                    if (
                        entity.type === 'device' && result && result.hasOwnProperty('readAfterWriteTime') &&
                        entity.settings.retrieve_state
                    ) {
                        setTimeout(() => converter.convertGet(actualTarget, key, meta), result.readAfterWriteTime);
                    }
                } else if (topic.type === 'get' && converter.convertGet) {
                    logger.debug(`Publishing get '${topic.type}' '${key}' to '${entity.name}'`);
                    await converter.convertGet(actualTarget, key, meta);
                } else {
                    logger.error(`No converter available for '${topic.type}' '${key}' (${json[key]})`);
                    continue;
                }
            } catch (error) {
                const message =
                    `Publish '${topic.type}' '${key}' to '${entity.name}' failed: '${error}'`;
                logger.error(message);
                logger.debug(error.stack);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = {friendly_name: entity.name};
                    this.mqtt.publish(
                        'bridge/log',
                        JSON.stringify({type: `zigbee_publish_error`, message, meta}),
                    );
                }
            }

            usedConverters.push(converter);
        }

        return true;
    }
}

module.exports = EntityPublish;
