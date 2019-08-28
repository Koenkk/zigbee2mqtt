
const settings = require('../util/settings');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const logger = require('../util/logger');
const utils = require('../util/utils');

const postfixes = utils.getPostfixes();
const topicRegex = new RegExp(`^(.+?)(?:/(${postfixes.join('|')}))?/(get|set)(?:/(.+))?`);

const groupConverters = [
    zigbeeShepherdConverters.toZigbeeConverters.light_onoff_brightness,
    zigbeeShepherdConverters.toZigbeeConverters.light_colortemp,
    zigbeeShepherdConverters.toZigbeeConverters.light_color,
    zigbeeShepherdConverters.toZigbeeConverters.light_alert,
    zigbeeShepherdConverters.toZigbeeConverters.ignore_transition,
];

class EntityPublish {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
    }

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
        // If we didn't repalce base_topic we received something we don't care about
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

        const entitySettings = settings.getEntity(topic.ID);
        if (!entitySettings) {
            logger.error(`Entity '${topic.ID}' is unknown`);
        }

        // Get entity details
        let converters = null;
        let entity = null;
        let options = {};

        if (entitySettings.type === 'device') {
            const device = await this.zigbee.getDevice({ieeeAddr: entitySettings.ID});

            // Map device to a model
            const mappedDevice = zigbeeShepherdConverters.findByZigbeeModel(device.modelID);
            if (!mappedDevice) {
                logger.warn(`Device with modelID '${device.modelID}' is not supported.`);
                logger.warn(`Please see: https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html`);
                return;
            }

            // Determine endpoint to publish to.
            if (mappedDevice.hasOwnProperty('endpoint')) {
                const endpoints = mappedDevice.endpoint(device);
                const endpointID = endpoints.hasOwnProperty(topic.postfix) ? endpoints[topic.postfix] : null;
                if (endpointID) {
                    entity = device.getEndpoint(endpointID);
                } else if (endpoints.hasOwnProperty('default')) {
                    entity = device.getEndpoint(endpoints['default']);
                }
            }

            if (!entity) {
                entity = device.getEndpoints()[0];
            }

            converters = mappedDevice.toZigbee;
            options = mappedDevice.options || {};
            options = {...options, ...entitySettings};
        } else if (entitySettings.type === 'group') {
            converters = groupConverters;
            entity = await this.zigbee.getGroup({groupID: entitySettings.ID});
        }

        if (!entity) {
            logger.error(`Failed to find entity: '${entitySettings.ID}'`);
            this.mqtt.log('entity_not_found', entitySettings.ID);
            return;
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
        const entries = Object.entries(json);
        entries.sort((a, b) => (['state', 'brightness'].includes(a[0]) ? -1 : 1));

        // For each attribute call the corresponding converter
        const usedConverters = [];
        for (const [key, value] of entries) {
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
                endpoint_name: topic.postfix,
                options,
                message: json,
            };

            try {
                if (topic.type === 'set' && converter && converter.convertSet) {
                    logger.debug(`Publishing set '${topic.type}' '${key}' to '${entitySettings.friendlyName}'`);
                    const result = await converter.convertSet(entity, key, value, meta);
                    if (result && result.hasOwnProperty('state')) {
                        const msg = result.state;

                        if (topic.postfix) {
                            msg[`state_${topic.postfix}`] = msg.state;
                            delete msg.state;
                        }

                        if (settings.get().advanced.last_seen !== 'disable') {
                            msg.last_seen = utils.formatDate(Date.now(), settings.get().advanced.last_seen);
                        }

                        this.publishEntityState(entitySettings.ID, msg);
                    }

                    // It's possible for devices to get out of sync when writing an attribute that's not reportable.
                    // So here we re-read the value after a specified timeout, this timeout could for example be the
                    // transition time of a color change or for forcing a state read for devices that don't
                    // automatically report a new state when set.
                    // When reporting is requested for a device (report: true in device-specific settings) we won't
                    // ever issue a read here, as we assume the device will properly report changes.
                    // Only do this when the retrieve_state option is enabled for this device.
                    if (
                        entitySettings.type === 'device' && result && result.hasOwnProperty('readAfterWriteTime') &&
                        entitySettings.retrieve_state
                    ) {
                        setTimeout(() => converter.convertGet(entity, key, meta), result.readAfterWriteTime);
                    }
                } else if (topic.type === 'get' && converter && converter.convertGet) {
                    logger.debug(`Publishing get '${topic.type}' '${key}' to '${entitySettings.friendlyName}'`);
                    await converter.convertGet(entity, key, meta);
                } else {
                    logger.error(`No converter available for '${topic.type}' '${key}' (${json[key]})`);
                    continue;
                }
            } catch (error) {
                const message =
                    `Publish '${topic.type}' '${key}' to '${entitySettings.friendlyName}' failed: '${error}'`;
                logger.error(message);
                this.mqtt.log('zigbee_publish_error', message, {entity: entitySettings.ID});
            }

            usedConverters.push(converter);
        }

        return true;
    }
}

module.exports = EntityPublish;
