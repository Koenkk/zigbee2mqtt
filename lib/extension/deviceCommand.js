
const settings = require('../util/settings');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const Queue = require('queue');
const logger = require('../util/logger');

const setTopic = new RegExp(`${settings.get().mqtt.base_topic}/[\\w\\s\\d.-]+/set`, 'g');
const setWithPrefixTopic = new RegExp(`${settings.get().mqtt.base_topic}/[\\w\\s\\d.-]+/[\\w\\s\\d.-]+/set`, 'g');

class DeviceCommand {
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
    }

    stop() {
        this.queue.stop();
    }

    handleMQTTMessage(topic, message) {
        if (!topic.match(setTopic) && !topic.match(setWithPrefixTopic)) {
            // Can't handle this message
            return false;
        }

        // Parse topic
        const hasPrefix = topic.match(setWithPrefixTopic);
        const friendlyName = topic.split('/').slice(hasPrefix ? -3 : -2)[0];
        const prefix = hasPrefix ? topic.split('/').slice(-2)[0] : '';

        // Map friendlyName to ieeeAddr.
        const ieeeAddr = settings.getIeeAddrByFriendlyName(friendlyName);
        if (!ieeeAddr) {
            logger.error(`Cannot handle '${topic}' because ieeAddr of '${friendlyName}' cannot be found`);
            return;
        }

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
            const converted = converter.convert(json[key], json);
            if (!converted) {
                return;
            }

            // Add job to queue
            this.queue.push((queueCallback) => {
                this.zigbee.publish(
                    ieeeAddr,
                    converted.cid,
                    converted.cmd,
                    converted.zclData,
                    converted.cfg,
                    endpoint,
                    converted.type,
                    (error) => {
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

        // TODO
        // Is this still needed??????
        /**
         * After publishing a command to a zigbee device we want to monitor the changed attribute(s) so that
         * everything stays in sync.
         */
        // published.forEach((p) => {
        //     let counter = 0;
        //     let secondsToMonitor = 1;

        //     // In case of a transition we need to monitor for the whole transition time.
        //     if (p.message.zclData.hasOwnProperty('transtime')) {
        //         // Note that: transtime 10 = 0.1 seconds, 100 = 1 seconds, etc.
        //         secondsToMonitor = (p.message.zclData.transtime / 10) + 1;
        //     }

        //     const timer = setInterval(() => {
        //         counter++;

        //         // Doing a 'read' will result in the device sending a zigbee message with the
        //            //current attribute value.
        //         // which will be handled by this.handleZigbeeMessage.
        //         p.converter.attr.forEach((attribute) => {
        //             this.zigbee.read(deviceID, p.message.cid, attribute, ep, () => null);
        //         });

        //         if (counter >= secondsToMonitor) {
        //             clearTimeout(timer);
        //         }
        //     }, 1000);
        // });
    }
}

module.exports = DeviceCommand;
