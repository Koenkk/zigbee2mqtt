
const settings = require('../util/settings');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const Queue = require('queue');
const logger = require('../util/logger');
const utils = require('../util/utils');

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/.+/(set|get)$`);
const postfixes = ['left', 'right', 'center', 'bottom_left', 'bottom_right', 'top_left', 'top_right'];
const maxDepth = 20;

const groupConverters = [
    zigbeeShepherdConverters.toZigbeeConverters.on_off,
    zigbeeShepherdConverters.toZigbeeConverters.light_brightness,
    zigbeeShepherdConverters.toZigbeeConverters.light_colortemp,
    zigbeeShepherdConverters.toZigbeeConverters.light_color,
    zigbeeShepherdConverters.toZigbeeConverters.ignore_transition,
];

class DevicePublish {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishDeviceState = publishDeviceState;

        /**
         * Setup command queue.
         * The command queue ensures that only 1 command is executed at a time.
         * When executing multiple commands at the same time, some commands may fail.
         */
        this.queue = new Queue();
        this.queue.concurrency = 1;
        this.queue.autostart = true;
    }

    onMQTTConnected() {
        // Subscribe to topics.
        for (let step = 1; step < maxDepth; step++) {
            const topic = `${settings.get().mqtt.base_topic}/${'+/'.repeat(step)}`;
            this.mqtt.subscribe(`${topic}set`);
            this.mqtt.subscribe(`${topic}get`);
        }
    }

    stop() {
        this.queue.stop();
    }

    parseTopic(topic) {
        if (!topic.match(topicRegex)) {
            return null;
        }

        // Remove base from topic
        topic = topic.replace(`${settings.get().mqtt.base_topic}/`, '');

        // Parse type from topic
        const type = topic.substr(topic.lastIndexOf('/') + 1, topic.length);

        // Remove type from topic
        topic = topic.replace(`/${type}`, '');

        // Check if we have to deal with a postfix.
        let postfix = '';
        if (postfixes.find((p) => topic.endsWith(p))) {
            postfix = topic.substr(topic.lastIndexOf('/') + 1, topic.length);

            // Remove postfix from topic
            topic = topic.replace(`/${postfix}`, '');
        }

        const ID = topic;

        return {type: type, ID: ID, postfix: postfix};
    }

    onMQTTMessage(topic, message) {
        topic = this.parseTopic(topic);

        if (!topic) {
            return false;
        }

        // Resolve the entity
        const entity = utils.resolveEntity(topic.ID);

        // Get entity details
        let endpoint = null;
        let converters = null;
        let device = null;

        if (entity.type === 'device') {
            device = this.zigbee.getDevice(entity.ID);
            if (!device) {
                logger.error(`Failed to find device with ieeAddr: '${entity.ID}'`);
                return;
            }

            // Map device to a model
            const model = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
            if (!model) {
                logger.warn(`Device with modelID '${device.modelId}' is not supported.`);
                logger.warn(`Please see: https://koenkk.github.io/zigbee2mqtt/how_tos/how_to_support_new_devices.html`);
                return;
            }

            // Determine endpoint to publish to.
            if (model.hasOwnProperty('ep')) {
                const eps = model.ep(device);
                endpoint = eps.hasOwnProperty(topic.postfix) ? eps[topic.postfix] : null;
            }

            converters = model.toZigbee;
        } else if (entity.type === 'group') {
            converters = groupConverters;
        }

        // Convert the MQTT message to a Zigbee message.
        let json = null;
        try {
            json = JSON.parse(message);
        } catch (e) {
            // Cannot be parsed to JSON, assume state message.
            json = {state: message.toString()};
        }

        // When brightness is present skip state; brightness also handles state.
        if (json.hasOwnProperty('brightness') && json.hasOwnProperty('state')) {
            logger.debug(`Skipping 'state' because of 'brightness'`);
            delete json.state;
        }

        // Ensure that state and brightness are executed before other commands.
        const keys = Object.keys(json);
        keys.sort((a, b) => (['state', 'brightness'].includes(a) ? -1 : 1));

        // For each key in the JSON message find the matching converter.
        keys.forEach((key) => {
            const converter = converters.find((c) => c.key.includes(key));
            if (!converter) {
                logger.error(`No converter available for '${key}' (${json[key]})`);
                return;
            }

            // Converter didn't return a result, skip
            const converted = converter.convert(key, json[key], json, topic.type);
            if (!converted) {
                return;
            }

            // Add job to queue
            this.queue.push((queueCallback) => {
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
                        // Devices do not report when they go off, this ensures state (on/off) is always in sync.
                        if (entity.type === 'device' && topic.type === 'set' &&
                            !error && (key.startsWith('state') || key === 'brightness')) {
                            const msg = {};
                            const _key = topic.postfix ? `state_${topic.postfix}` : 'state';
                            msg[_key] = key === 'brightness' ? 'ON' : json['state'];
                            this.publishDeviceState(device, msg, true);
                        }

                        queueCallback();
                    }
                );
            });

            // It's possible for devices to get out of sync when writing an attribute that's not reportable.
            // So here we re-read the value after a specified timeout, this timeout could for example be the
            // transition time of a color change.
            if (topic.type === 'set' && entity.type === 'device'
                && converted.hasOwnProperty('readAfterWriteTime') && converted.readAfterWriteTime !== 0) {
                const getConverted = converter.convert(key, json[key], json, 'get');
                setTimeout(() => {
                    // Add job to queue
                    this.queue.push((queueCallback) => {
                        this.zigbee.publish(
                            entity.ID, entity.type, getConverted.cid, getConverted.cmd, getConverted.cmdType,
                            getConverted.zclData, getConverted.cfg, endpoint, () => queueCallback()
                        );
                    });
                }, converted.readAfterWriteTime);
            }
        });

        return true;
    }
}

module.exports = DevicePublish;
