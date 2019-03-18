const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');
const debounce = require('debounce');

/**
 * This extensions handles messages received from devices.
 */
class DeviceReceive {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
        this.coordinator = null;
        this.elapsed = {};
        this.debouncers = {};
    }

    onZigbeeStarted() {
        this.coordinator = this.zigbee.getCoordinator().device.ieeeAddr;
    }

    publishDebounce(ieeeAddr, payload, time) {
        if (!this.debouncers[ieeeAddr]) {
            this.debouncers[ieeeAddr] = {
                payload: {},
                publish: debounce(() => {
                    this.publishEntityState(ieeeAddr, this.debouncers[ieeeAddr].payload);
                    this.debouncers[ieeeAddr].payload = {};
                }, time * 1000),
            };
        }

        this.debouncers[ieeeAddr].payload = {...this.debouncers[ieeeAddr].payload, ...payload};
        this.debouncers[ieeeAddr].publish();
    }

    onZigbeeMessage(message, device, mappedDevice) {
        if (message.type == 'devInterview') {
            if (!settings.getDevice(message.data)) {
                logger.info('Connecting with device...');
                this.mqtt.log('pairing', 'connecting with device');
            }

            return;
        }

        if (message.type == 'devIncoming') {
            logger.info('Device incoming...');
            this.mqtt.log('pairing', 'device incoming');
        }

        if (!device) {
            logger.warn('Message without device!');
            return;
        }

        if (device.ieeeAddr === this.coordinator) {
            logger.debug('Ignoring message from coordinator');
            return;
        }

        // Check if this is a new device.
        const settingsDevice = settings.getDevice(device.ieeeAddr);
        if (!settingsDevice) {
            logger.info(`New device '${device.modelId}' with address ${device.ieeeAddr} connected!`);
            settings.addDevice(device.ieeeAddr);
            this.mqtt.log('device_connected', device.ieeeAddr, {modelID: device.modelId});
        }

        if (!mappedDevice) {
            logger.warn(`Device with modelID '${device.modelId}' is not supported.`);
            logger.warn(`Please see: https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html`);
            return;
        }

        // After this point we cant handle message withoud cid or cmdId anymore.
        if (!message.data || (!message.data.cid && !message.data.cmdId)) {
            return;
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
        const hasGroupID = message.hasOwnProperty('groupid') && message.groupid != 0;
        if (utils.isXiaomiDevice(device) && utils.isRouter(device) && hasGroupID) {
            logger.debug('Skipping re-transmitted Xiaomi message');
            return;
        }

        // Find a conveter for this message.
        const cid = message.data.cid;
        const cmdId = message.data.cmdId;
        const converters = mappedDevice.fromZigbee.filter((c) => {
            if (cid) {
                // readRsp messages have the same structure as attReport messages.
                // search for attReport converters on readRsp.
                if (c.cid === cid) {
                    if (c.type instanceof Array) {
                        return c.type.includes(message.type);
                    } else {
                        return c.type === message.type;
                    }
                }

                return false;
            } else if (cmdId) {
                return c.cmd === cmdId;
            }

            return false;
        });

        // Check if there is an available converter
        if (!converters.length) {
            if (cid) {
                // Don't log readRsp messages, they are not interesting most of the time.
                if (message.type === 'readRsp') {
                    return;
                }

                logger.warn(
                    `No converter available for '${mappedDevice.model}' with cid '${cid}', ` +
                    `type '${message.type}' and data '${JSON.stringify(message.data)}'`
                );
            } else if (cmdId) {
                logger.warn(
                    `No converter available for '${mappedDevice.model}' with cmd '${cmdId}' ` +
                    `and data '${JSON.stringify(message.data)}'`
                );
            }

            logger.warn(`Please see: https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html.`);
            return;
        }

        // Convert this Zigbee message to a MQTT message.
        // Get payload for the message.
        // - If a payload is returned publish it to the MQTT broker
        // - If NO payload is returned do nothing. This is for non-standard behaviour
        //   for e.g. click switches where we need to count number of clicks and detect long presses.
        const publish = (payload) => {
            // Add device linkquality.
            if (message.hasOwnProperty('linkquality')) {
                payload.linkquality = message.linkquality;
            }

            // Add last seen timestamp
            const now = Date.now();
            switch (settings.get().advanced.last_seen) {
            case 'ISO_8601':
                payload.last_seen = new Date(now).toISOString();
                break;
            case 'ISO_8601_local':
                payload.last_seen = utils.toLocalISOString(new Date(now));
                break;
            case 'epoch':
                payload.last_seen = now;
                break;
            }

            if (settings.get().advanced.elapsed) {
                if (this.elapsed[device.ieeeAddr]) {
                    payload.elapsed = now - this.elapsed[device.ieeeAddr];
                }

                this.elapsed[device.ieeeAddr] = now;
            }

            // Check if we have to debounce
            if (settingsDevice && settingsDevice.hasOwnProperty('debounce')) {
                this.publishDebounce(device.ieeeAddr, payload, settingsDevice.debounce);
            } else {
                this.publishEntityState(device.ieeeAddr, payload);
            }
        };

        let payload = {};
        converters.forEach((converter) => {
            const options = {...settings.get().device_options, ...settings.getDevice(device.ieeeAddr)};
            const converted = converter.convert(mappedDevice, message, publish, options);

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
