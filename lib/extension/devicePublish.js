
const settings = require('../util/settings');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const Queue = require('queue');
const logger = require('../util/logger');

const setTopic = new RegExp(`${settings.get().mqtt.base_topic}/[\\w\\s\\d.-]+/set`, 'g');
const setWithPrefixTopic = new RegExp(`${settings.get().mqtt.base_topic}/[\\w\\s\\d.-]+/[\\w\\s\\d.-]+/set`, 'g');
const getTopic = new RegExp(`${settings.get().mqtt.base_topic}/[\\w\\s\\d.-]+/get`, 'g');
const getWithPrefixTopic = new RegExp(`${settings.get().mqtt.base_topic}/[\\w\\s\\d.-]+/[\\w\\s\\d.-]+/get`, 'g');

class DevicePublish {
    constructor(zigbee, mqtt, state, mqttPublishDeviceState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;

        // TODO -> remove this; move to publish device state method to mqtt.js
        this.mqttPublishDeviceState = mqttPublishDeviceState;

        /**
         * Setup command queue.
         * The command queue ensures that only 1 command is executed at a time.
         * When executing multiple commands at the same time, some commands may fail.
         */
        this.queue = new Queue();
        this.queue.concurrency = 1;
        this.queue.autostart = true;

        // Subscribe to topics.
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/+/set`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/+/+/set`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/+/get`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/+/+/get`);
    }

    stop() {
        this.queue.stop();
    }

    handleMQTTMessage(topic, message) {
        if (!topic.match(setTopic) && !topic.match(setWithPrefixTopic) &&
            !topic.match(getTopic) && !topic.match(getWithPrefixTopic)) {
            // Can't handle this message
            return false;
        }

        // Parse topic
        const hasPrefix = topic.match(setWithPrefixTopic);
        const deviceKey = topic.split('/').slice(hasPrefix ? -3 : -2)[0]; // Could be friendlyName or ieeeAddr
        const prefix = hasPrefix ? topic.split('/').slice(-2)[0] : '';
        const type = (topic.match(getTopic) || topic.match(getWithPrefixTopic)) ? 'get' : 'set';

        // Map friendlyName to ieeeAddr if possible.
        const ieeeAddr = settings.getIeeAddrByFriendlyName(deviceKey) || deviceKey;

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
        const endpoint = model.hasOwnProperty('ep') && model.ep.hasOwnProperty(prefix) ? model.ep[prefix] : null;

        // For each key in the JSON message find the matching converter.
        Object.keys(json).forEach((key) => {
            const converter = model.toZigbee.find((c) => c.key === key);
            if (!converter) {
                logger.error(`No converter available for '${key}' (${json[key]})`);
                return;
            }

            // Converter didn't return a result, skip
            const converted = converter.convert(json[key], json, type);
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
                        if (!error && (key.startsWith('state') || key === 'brightness')) {
                            const msg = {};
                            const _key = prefix ? `state_${prefix}` : 'state';
                            msg[_key] = key === 'brightness' ? 'ON' : json['state'];
                            this.mqttPublishDeviceState(device, msg, true);
                        }

                        queueCallback();
                    }
                );
            });
        });

        return true;
    }
}

module.exports = DevicePublish;
