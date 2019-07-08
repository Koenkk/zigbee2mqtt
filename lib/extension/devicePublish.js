
const settings = require('../util/settings');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const logger = require('../util/logger');
const utils = require('../util/utils');

const postfixes = utils.getPostfixes();
const topicRegex = new RegExp(`^(.+?)(?:/(${postfixes.join('|')}))?/(get|set)(?:/(.+))?`);

const maxDepth = 20;

const groupConverters = [
    zigbeeShepherdConverters.toZigbeeConverters.light_onoff_brightness,
    zigbeeShepherdConverters.toZigbeeConverters.light_colortemp,
    zigbeeShepherdConverters.toZigbeeConverters.light_color,
    zigbeeShepherdConverters.toZigbeeConverters.light_alert,
    zigbeeShepherdConverters.toZigbeeConverters.ignore_transition,
];

class DevicePublish {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
    }

    onMQTTConnected() {
        // Subscribe to topics.
        const baseTopic = settings.get().mqtt.base_topic;
        for (let step = 1; step < maxDepth; step++) {
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
        // If we didn't repalce base_topic we received something we don't care about
        if (ID === match[1] || ID.match(/bridge\/config/)) {
            return null;
        }

        return {ID: ID, postfix: match[2] || '', type: match[3], attribute: match[4]};
    }

    handlePublishError(entity, message, error) {
        const meta = {
            entity,
            message: message.toString(),
        };

        this.mqtt.log('zigbee_publish_error', error.toString(), meta);
    }

    handlePublished(entity, topic, converter, converted, key, value) {
        if (topic.type === 'set' && converted.hasOwnProperty('newState') && converted.newState) {
            const msg = converted.newState;

            if (topic.postfix) {
                msg[`state_${topic.postfix}`] = msg.state;
                delete msg.state;
            }

            if (settings.get().advanced.last_seen !== 'disable') {
                msg.last_seen = utils.formatDate(Date.now(), settings.get().advanced.last_seen);
            }

            this.publishEntityState(entity.ID, msg);
        }
    }

    onMQTTMessage(topic, message) {
        topic = this.parseTopic(topic);

        if (!topic) {
            return false;
        }

        // Resolve the entity
        const entity = settings.resolveEntity(topic.ID);

        // Get entity details
        let endpoint = null;
        let converters = null;
        let device = null;
        let options = {};

        if (entity.type === 'device') {
            device = this.zigbee.getDevice(entity.ID);
            if (!device) {
                logger.error(`Failed to find device with ieeeAddr: '${entity.ID}'`);
                this.mqtt.log('entity_not_found', entity.ID);
                return;
            }

            // Map device to a model
            const model = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
            if (!model) {
                logger.warn(`Device with modelID '${device.modelId}' is not supported.`);
                logger.warn(`Please see: https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html`);
                return;
            }

            // Determine endpoint to publish to.
            if (model.hasOwnProperty('ep')) {
                const eps = model.ep(device);
                endpoint = eps.hasOwnProperty(topic.postfix) ? eps[topic.postfix] : null;
                if (endpoint === null && eps.hasOwnProperty('default')) {
                    endpoint = eps['default'];
                }
            }

            converters = model.toZigbee;
            options = model.options || {};
        } else if (entity.type === 'group') {
            converters = groupConverters;
        }

        // Convert the MQTT message to a Zigbee message.
        let json = {};
        if (topic.hasOwnProperty('attribute') && topic.attribute) {
            json[topic.attribute] = message.toString();
        } else {
            try {
                json = JSON.parse(message);
            } catch (e) {
                // Cannot be parsed to JSON, assume state message.
                json = {state: message.toString()};
            }
        }

        /**
         * Home Assistant always publishes 'state', even when e.g. only setting
         * the color temperature. This would lead to 2 zigbee publishes, where the first one
         * (state) is probably unecessary.
         */
        if (settings.get().homeassistant) {
            const deviceState = this.state.get(entity.ID);
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
        const keys = Object.keys(json);
        keys.sort((a, b) => (['state', 'brightness'].includes(a) ? -1 : 1));

        // For each key in the JSON message find the matching converter.
        const usedConverters = [];
        keys.forEach((key) => {
            const converter = converters.find((c) => c.key.includes(key));

            if (usedConverters.includes(converter)) {
                // Use a converter only once (e.g. light_onoff_brightness converters can convert state and brightness)
                return;
            }

            if (!converter) {
                logger.error(`No converter available for '${key}' (${json[key]})`);
                return;
            }

            // Converter didn't return a result, skip
            const convertedResults = converter.convert(key, json[key], json, topic.type, topic.postfix, options);
            if (!convertedResults || !convertedResults.length) {
                return;
            }

            convertedResults.forEach((converted) => {
                this.zigbee.publish(
                    entity.ID,
                    entity.type,
                    converted.cid,
                    converted.cmd,
                    converted.cmdType,
                    converted.zclData,
                    converted.cfg,
                    endpoint,
                    (error, rsp) => {
                        if (!error) {
                            this.handlePublished(entity, topic, converter, converted, key, json[key]);
                        } else {
                            this.handlePublishError(entity, message, error);
                        }
                    }
                );

                // It's possible for devices to get out of sync when writing an attribute that's not reportable.
                // So here we re-read the value after a specified timeout, this timeout could for example be the
                // transition time of a color change or for forcing a state read for devices that don't
                // automatically report a new state when set.
                // When reporting is requested for a device (report: true in device-specific settings) we won't
                // ever issue a read here, as we assume the device will properly report changes.
                // Only do this when the retrieve_state option is enabled for this device.
                const deviceSettings = settings.getDevice(entity.ID);
                if (topic.type === 'set' && entity.type === 'device' &&
                    converted.hasOwnProperty('readAfterWriteTime') && deviceSettings && deviceSettings.retrieve_state) {
                    const getConvertedResults = converter.convert(key, json[key], json, 'get', '', options);
                    getConvertedResults.forEach((getConverted) => {
                        setTimeout(() => {
                            this.zigbee.publish(
                                entity.ID, entity.type, getConverted.cid, getConverted.cmd, getConverted.cmdType,
                                getConverted.zclData, getConverted.cfg, endpoint, () => {}
                            );
                        }, converted.readAfterWriteTime);
                    });
                }

                usedConverters.push(converter);
            });
        });

        return true;
    }
}

module.exports = DevicePublish;
