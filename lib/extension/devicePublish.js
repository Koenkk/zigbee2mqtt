
const settings = require('../util/settings');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const Queue = require('queue');
const logger = require('../util/logger');

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/.+/(set|get)$`);
const postfixes = ['left', 'right', 'center', 'bottom_left', 'bottom_right', 'top_left', 'top_right'];
const maxDepth = 20;

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

        const deviceID = topic;

        return {type: type, deviceID: deviceID, postfix: postfix};
    }

    onMQTTMessage(topic, message) {
        topic = this.parseTopic(topic);

        if (!topic) {
            return false;
        }

        // Map friendlyName to ieeeAddr if possible.
        const ieeeAddr = settings.getIeeeAddrByFriendlyName(topic.deviceID) || topic.deviceID;

        // Get device
        const device = this.zigbee.getDevice(ieeeAddr);
        if (!device) {
            logger.error(`Failed to find device with ieeAddr: '${ieeeAddr}'`);
            return;
        }

        // Map device to a model
        const model = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
        if (!model) {
            logger.warn(`Device with modelID '${device.modelId}' is not supported.`);
            logger.warn(`Please see: https://github.com/Koenkk/zigbee2mqtt/wiki/How-to-support-new-devices`);
            return;
        }

        // Convert the MQTT message to a Zigbee message.
        let json = null;
        try {
            json = JSON.parse(message);
        } catch (e) {
            // Cannot be parsed to JSON, assume state message.
            json = {state: message.toString()};
        }

        // Determine endpoint to publish to.
        let endpoint = null;
        if (model.hasOwnProperty('ep')) {
            const eps = model.ep(device);
            endpoint = eps.hasOwnProperty(topic.postfix) ? eps[topic.postfix] : null;
        }

        // When brightness is present skip state; brightness also handles state.
        if (json.hasOwnProperty('brightness') && json.hasOwnProperty('state')) {
            logger.debug(`Skipping 'state' because of 'brightness'`);
            delete json.state;
        }

        // For each key in the JSON message find the matching converter.
        Object.keys(json).forEach((key) => {
            const converter = model.toZigbee.find((c) => c.key.includes(key));
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
                    ieeeAddr,
                    converted.cid,
                    converted.cmd,
                    converted.cmdType,
                    converted.zclData,
                    converted.cfg,
                    endpoint,
                    (error, rsp) => {
                        // Devices do not report when they go off, this ensures state (on/off) is always in sync.
                        if (topic.type === 'set' && !error && (key.startsWith('state') || key === 'brightness')) {
                            const msg = {};
                            const _key = topic.postfix ? `state_${topic.postfix}` : 'state';
                            msg[_key] = key === 'brightness' ? 'ON' : json['state'];
                            this.publishDeviceState(device, msg, true);
                        }

                        queueCallback();
                    }
                );
            });

            // When there is a transition in the message the state of the device gets out of sync.
            // Therefore; at the end of the transition, read the new state from the device.
            if (topic.type === 'set' && converted.zclData.transtime) {
                const time = converted.zclData.transtime * 100;
                const getConverted = converter.convert(json[key], json, 'get');
                setTimeout(() => {
                    // Add job to queue
                    this.queue.push((queueCallback) => {
                        this.zigbee.publish(
                            ieeeAddr, getConverted.cid, getConverted.cmd, getConverted.cmdType,
                            getConverted.zclData, getConverted.cfg, endpoint, () => queueCallback()
                        );
                    });
                }, time);
            }
        });

        return true;
    }
}

module.exports = DevicePublish;
