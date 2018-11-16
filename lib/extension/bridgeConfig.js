const settings = require('../util/settings');
const logger = require('../util/logger');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');

const configRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/config/\\w+`, 'g');
const allowedLogLevels = ['error', 'warn', 'info', 'debug'];

class BridgeConfig {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishDeviceState = publishDeviceState;

        // Bind functions
        this.permitJoin = this.permitJoin.bind(this);
        this.logLevel = this.logLevel.bind(this);
        this.devices = this.devices.bind(this);
        this.rename = this.rename.bind(this);
        this.remove = this.remove.bind(this);

        // Set supported options
        this.supportedOptions = {
            'permit_join': this.permitJoin,
            'log_level': this.logLevel,
            'devices': this.devices,
            'rename': this.rename,
            'remove': this.remove,
        };
    }

    permitJoin(topic, message) {
        this.zigbee.permitJoin(message.toString().toLowerCase() === 'true');
    }

    logLevel(topic, message) {
        const level = message.toString().toLowerCase();
        if (allowedLogLevels.includes(level)) {
            logger.info(`Switching log level to '${level}'`);
            logger.transports.console.level = level;
            logger.transports.file.level = level;
        } else {
            logger.error(`Could not set log level to '${level}'. Allowed level: '${allowedLogLevels.join(',')}'`);
        }
    }

    devices(topic, message) {
        const devices = this.zigbee.getAllClients().map((device) => {
            const mappedDevice = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
            const friendlyDevice = settings.getDevice(device.ieeeAddr);

            return {
                ieeeAddr: device.ieeeAddr,
                type: device.type,
                model: mappedDevice ? mappedDevice.model : device.modelId,
                friendly_name: friendlyDevice ? friendlyDevice.friendly_name : device.ieeeAddr,
            };
        });

        this.mqtt.log('devices', devices);
    }

    rename(topic, message) {
        const invalid = `Invalid rename message format expected {old: 'friendly_name', new: 'new_name} ` +
                            `got ${message.toString()}`;

        let json = null;
        try {
            json = JSON.parse(message.toString());
        } catch (e) {
            logger.error(invalid);
            return;
        }

        // Validate message
        if (!json.new || !json.old) {
            logger.error(invalid);
            return;
        }

        if (settings.changeFriendlyName(json.old, json.new)) {
            logger.info(`Successfully renamed - ${json.old} to ${json.new} `);
        } else {
            logger.error(`Failed to renamed - ${json.old} to ${json.new}`);
            return;
        }
    }

    remove(topic, message) {
        message = message.toString();
        const IDByFriendlyName = settings.getIeeeAddrByFriendlyName(message);
        const deviceID = IDByFriendlyName ? IDByFriendlyName : message;
        const device = this.zigbee.getDevice(deviceID);

        const cleanup = () => {
            // Remove from configuration.yaml
            settings.removeDevice(deviceID);

            // Remove from state
            this.state.remove(deviceID);

            logger.info(`Successfully removed ${deviceID}`);
            this.mqtt.log('device_removed', message);
        };

        // Remove from zigbee network.
        if (device) {
            this.zigbee.removeDevice(deviceID, (error) => {
                if (!error) {
                    cleanup();
                } else {
                    logger.error(`Failed to remove ${deviceID}`);
                }
            });
        } else {
            cleanup();
        }
    }

    onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/config/+`);
    }

    onMQTTMessage(topic, message) {
        if (!topic.match(configRegex)) {
            return false;
        }

        const option = topic.split('/').slice(-1)[0];

        if (!this.supportedOptions.hasOwnProperty(option)) {
            return false;
        }

        this.supportedOptions[option](topic, message);

        return true;
    }
}

module.exports = BridgeConfig;
