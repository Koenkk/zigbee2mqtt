const settings = require('../util/settings');
const logger = require('../util/logger');

const dontCacheProperties = ['action', 'button', 'button_left', 'button_right', 'click', 'forgotten', 'keyerror'];

/**
 * This extensions handles messages received from devices.
 */
class DeviceReceive {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishDeviceState = publishDeviceState;
    }

    onZigbeeMessage(message, device, mappedDevice) {
        if (message.type == 'devInterview' && !settings.getDevice(message.data)) {
            logger.info('Connecting with device...');
            this.mqtt.log('pairing', 'connecting with device');
        }

        if (message.type == 'devIncoming') {
            logger.info('Device incoming...');
            this.mqtt.log('pairing', 'device incoming');
        }

        if (!device) {
            logger.warn('Message without device!');
            return;
        }

        // Check if this is a new device.
        if (!settings.getDevice(device.ieeeAddr)) {
            logger.info(`New device with address ${device.ieeeAddr} connected!`);
            settings.addDevice(device.ieeeAddr);
            this.mqtt.log('device_connected', device.ieeeAddr);
        }

        if (!mappedDevice) {
            logger.warn(`Device with modelID '${device.modelId}' is not supported.`);
            logger.warn(`Please see: https://koenkk.github.io/zigbee2mqtt/how_tos/how_to_support_new_devices.html`);
            return;
        }

        // After this point we cant handle message withoud cid or cmdId anymore.
        if (!message.data || (!message.data.cid && !message.data.cmdId)) {
            return;
        }

        // Find a conveter for this message.
        const cid = message.data.cid;
        const cmdId = message.data.cmdId;
        const converters = mappedDevice.fromZigbee.filter((c) => {
            if (cid) {
                return c.cid === cid && c.type === message.type;
            } else if (cmdId) {
                return c.cmd === cmdId;
            }

            return false;
        });

        // Check if there is an available converter
        if (!converters.length) {
            if (cid) {
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

            logger.warn(`Please see: https://koenkk.github.io/zigbee2mqtt/how_tos/how_to_support_new_devices.html.`);
            return;
        }

        // Convert this Zigbee message to a MQTT message.
        // Get payload for the message.
        // - If a payload is returned publish it to the MQTT broker
        // - If NO payload is returned do nothing. This is for non-standard behaviour
        //   for e.g. click switches where we need to count number of clicks and detect long presses.
        converters.forEach((converter) => {
            const publish = (payload) => {
                // Don't cache messages with following properties:
                let cache = true;
                dontCacheProperties.forEach((property) => {
                    if (payload.hasOwnProperty(property)) {
                        cache = false;
                    }
                });

                // Add device linkquality.
                if (message.hasOwnProperty('linkquality')) {
                    payload.linkquality = message.linkquality;
                }

                // Add last seen timestamp
                const now = new Date();
                payload.last_seen = now.toISOString();

                this.publishDeviceState(device, payload, cache);
            };

            const options = {...settings.get().device_options, ...settings.getDevice(device.ieeeAddr)};
            const payload = converter.convert(mappedDevice, message, publish, options);

            if (payload) {
                publish(payload);
            }
        });
    }
}

module.exports = DeviceReceive;
