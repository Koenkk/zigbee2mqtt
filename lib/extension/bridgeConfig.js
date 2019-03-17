const settings = require('../util/settings');
const logger = require('../util/logger');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const utils = require('../util/utils');

const configRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/config/\\w+`, 'g');
const allowedLogLevels = ['error', 'warn', 'info', 'debug'];

class BridgeConfig {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;

        // Bind functions
        this.permitJoin = this.permitJoin.bind(this);
        this.lastSeen = this.lastSeen.bind(this);
        this.elapsed = this.elapsed.bind(this);
        this.reset = this.reset.bind(this);
        this.logLevel = this.logLevel.bind(this);
        this.devices = this.devices.bind(this);
        this.rename = this.rename.bind(this);
        this.remove = this.remove.bind(this);
        this.ban = this.ban.bind(this);
        this.deviceOptions = this.deviceOptions.bind(this);
        this.addGroup = this.addGroup.bind(this);
        this.removeGroup = this.removeGroup.bind(this);

        // Set supported options
        this.supportedOptions = {
            'permit_join': this.permitJoin,
            'last_seen': this.lastSeen,
            'elapsed': this.elapsed,
            'reset': this.reset,
            'log_level': this.logLevel,
            'devices': this.devices,
            'rename': this.rename,
            'remove': this.remove,
            'ban': this.ban,
            'device_options': this.deviceOptions,
            'add_group': this.addGroup,
            'remove_group': this.removeGroup,
        };
    }

    deviceOptions(topic, message) {
        let json = null;
        try {
            json = JSON.parse(message.toString());
        } catch (e) {
            logger.error('Failed to parse message as JSON');
            return;
        }

        if (!json.hasOwnProperty('friendly_name') || !json.hasOwnProperty('options')) {
            logger.error('Invalid JSON message, should contain "friendly_name" and "options"');
            return;
        }

        const ieeeAddr = settings.getIeeeAddrByFriendlyName(json.friendly_name);
        if (!ieeeAddr) {
            logger.error(`Failed to find device '${json.friendly_name}'`);
            return;
        }

        settings.changeDeviceOptions(ieeeAddr, json.options);
        logger.info(`Changed device specific options of '${json.friendly_name}' (${JSON.stringify(json.options)})`);
    }

    permitJoin(topic, message) {
        this.zigbee.permitJoin(message.toString().toLowerCase() === 'true', () => this.publish());
    }

    reset(topic, message) {
        this.zigbee.softReset((error) => {
            if (error) {
                logger.error('Soft reset failed');
            } else {
                logger.info('Soft resetted ZNP');
            }
        });
    }

    lastSeen(topic, message) {
        const allowed = ['disable', 'ISO_8601', 'epoch', 'ISO_8601_local'];
        message = message.toString();

        if (!allowed.includes(message)) {
            logger.error(`${message} is not an allowed value, possible: ${allowed}`);
            return;
        }

        settings.set(['advanced', 'last_seen'], message);
        logger.info(`Set last_seen to ${message}`);
    }

    elapsed(topic, message) {
        const allowed = ['true', 'false'];
        message = message.toString();

        if (!allowed.includes(message)) {
            logger.error(`${message} is not an allowed value, possible: ${allowed}`);
            return;
        }

        settings.set(['advanced', 'elapsed'], message === 'true');
        logger.info(`Set elapsed to ${message}`);
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

        this.publish();
    }

    devices(topic, message) {
        const devices = this.zigbee.getDevices().map((device) => {
            const payload = {
                ieeeAddr: device.ieeeAddr,
                type: device.type,
            };

            if (device.type !== 'Coordinator') {
                const mappedDevice = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
                const friendlyDevice = settings.getDevice(device.ieeeAddr);
                payload.model = mappedDevice ? mappedDevice.model : device.modelId;
                payload.friendly_name = friendlyDevice ? friendlyDevice.friendly_name : device.ieeeAddr;
            }

            return payload;
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
            this.mqtt.log('device_renamed', {from: json.old, to: json.new});
        } else {
            logger.error(`Failed to renamed - ${json.old} to ${json.new}`);
            return;
        }
    }

    addGroup(topic, message) {
        const name = message.toString();
        const added = settings.addGroup(name);
        added ? logger.info(`Added group '${name}'`) : logger.error(`Failed to add group '${name}'`);
    }

    removeGroup(topic, message) {
        const name = message.toString();
        const removed = settings.removeGroup(name);
        removed ? logger.info(`Removed group '${name}'`) : logger.error(`Failed to remove group '${name}'`);
    }

    remove(topic, message) {
        this.removeOrBan(false, message);
    }

    ban(topic, message) {
        this.removeOrBan(true, message);
    }

    removeOrBan(ban, message) {
        message = message.toString();
        const IDByFriendlyName = settings.getIeeeAddrByFriendlyName(message);
        const deviceID = IDByFriendlyName ? IDByFriendlyName : message;
        const device = this.zigbee.getDevice(deviceID);

        const cleanup = () => {
            // Remove from configuration.yaml
            settings.removeDevice(deviceID);

            // Remove from state
            this.state.remove(deviceID);

            logger.info(`Successfully ${ban ? 'banned' : 'removed'} ${deviceID}`);
            this.mqtt.log(ban ? 'device_banned' : 'device_removed', message);
        };

        // Remove from zigbee network.
        if (device) {
            this.zigbee.removeDevice(deviceID, ban, (error) => {
                if (!error) {
                    cleanup();
                } else {
                    logger.error(`Failed to ${ban ? 'ban' : 'remove'} ${deviceID}`);
                }
            });
        } else {
            cleanup();
        }
    }

    onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/config/+`);
        this.publish();
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

    publish() {
        utils.getZigbee2mqttVersion((info) => {
            const topic = `bridge/config`;
            const payload = {
                version: info.version,
                commit: info.commitHash,
                coordinator_firmware: this.zigbee.getFirmwareVersion(),
                log_level: logger.transports.console.level,
                permit_join: this.zigbee.getPermitJoin(),
            };

            this.mqtt.publish(topic, JSON.stringify(payload), {retain: true, qos: 0}, null);
        });
    }
}

module.exports = BridgeConfig;
