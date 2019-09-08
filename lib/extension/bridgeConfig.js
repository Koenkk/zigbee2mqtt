const settings = require('../util/settings');
const logger = require('../util/logger');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const utils = require('../util/utils');
const assert = require('assert');

const configRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/config/((?:\\w+/get)|(?:\\w+))`);
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
        this.groups = this.groups.bind(this);
        this.rename = this.rename.bind(this);
        this.remove = this.remove.bind(this);
        this.ban = this.ban.bind(this);
        this.deviceOptions = this.deviceOptions.bind(this);
        this.addGroup = this.addGroup.bind(this);
        this.removeGroup = this.removeGroup.bind(this);
        this.whitelist= this.whitelist.bind(this);

        // Set supported options
        this.supportedOptions = {
            'permit_join': this.permitJoin,
            'last_seen': this.lastSeen,
            'elapsed': this.elapsed,
            'reset': this.reset,
            'log_level': this.logLevel,
            'devices': this.devices,
            'groups': this.groups,
            'devices/get': this.devices,
            'rename': this.rename,
            'remove': this.remove,
            'ban': this.ban,
            'device_options': this.deviceOptions,
            'add_group': this.addGroup,
            'remove_group': this.removeGroup,
            'whitelist': this.whitelist,
        };
    }

    whitelist(topic, message) {
        try {
            const entity = settings.getEntity(message);
            assert(entity, `Entity '${message}' does not exist`);
            settings.whitelistDevice(entity.ID);
            logger.info(`Whitelisted '${entity.friendlyName}'`);
            this.mqtt.log('device_whitelisted', entity.friendlyName);
        } catch (error) {
            logger.error(`Failed to whitelist '${message}' '${error}'`);
        }
    }

    deviceOptions(topic, message) {
        let json = null;
        try {
            json = JSON.parse(message);
        } catch (e) {
            logger.error('Failed to parse message as JSON');
            return;
        }

        if (!json.hasOwnProperty('friendly_name') || !json.hasOwnProperty('options')) {
            logger.error('Invalid JSON message, should contain "friendly_name" and "options"');
            return;
        }

        const entity = settings.getEntity(json.friendly_name);
        assert(entity, `Entity '${json.friendly_name}' does not exist`);
        settings.changeDeviceOptions(entity.ID, json.options);
        logger.info(`Changed device specific options of '${json.friendly_name}' (${JSON.stringify(json.options)})`);
    }

    async permitJoin(topic, message) {
        await this.zigbee.permitJoin(message.toLowerCase() === 'true');
        this.publish();
    }

    async reset(topic, message) {
        try {
            await this.zigbee.softReset();
            logger.info('Soft resetted ZNP');
        } catch (error) {
            logger.error('Soft reset failed');
        }
    }

    lastSeen(topic, message) {
        const allowed = ['disable', 'ISO_8601', 'epoch', 'ISO_8601_local'];
        if (!allowed.includes(message)) {
            logger.error(`${message} is not an allowed value, possible: ${allowed}`);
            return;
        }

        settings.set(['advanced', 'last_seen'], message);
        logger.info(`Set last_seen to ${message}`);
    }

    elapsed(topic, message) {
        const allowed = ['true', 'false'];
        if (!allowed.includes(message)) {
            logger.error(`${message} is not an allowed value, possible: ${allowed}`);
            return;
        }

        settings.set(['advanced', 'elapsed'], message === 'true');
        logger.info(`Set elapsed to ${message}`);
    }

    logLevel(topic, message) {
        const level = message.toLowerCase();
        if (allowedLogLevels.includes(level)) {
            logger.info(`Switching log level to '${level}'`);
            logger.transports.console.level = level;
            logger.transports.file.level = level;
        } else {
            logger.error(`Could not set log level to '${level}'. Allowed level: '${allowedLogLevels.join(',')}'`);
        }

        this.publish();
    }

    async devices(topic, message) {
        const devices = (await this.zigbee.getDevices({})).map((device) => {
            const payload = {
                ieeeAddr: device.ieeeAddr,
                type: device.type,
            };

            if (device.type !== 'Coordinator') {
                const mappedDevice = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
                const friendlyDevice = settings.getDevice(device.ieeeAddr);
                payload.model = mappedDevice ? mappedDevice.model : device.modelID;
                payload.friendly_name = friendlyDevice ? friendlyDevice.friendly_name : device.ieeeAddr;
                payload.networkAddress = device.networkAddress;
                payload.manufacturerID = device.manufacturerID;
                payload.manufacturerName = device.manufacturerName;
                payload.powerSource = device.powerSource;
                payload.modelID = device.modelID;
                payload.hwVersion = device.hwVersion;
                payload.swBuildId = device.swBuildId;
                payload.dateCode = device.dateCode;
            }

            return payload;
        });

        if (topic.split('/').pop() == 'get') {
            this.mqtt.publish(`bridge/config/devices`, JSON.stringify(devices), {});
        } else {
            this.mqtt.log('devices', devices);
        }
    }

    groups(topic, message) {
        this.mqtt.log('groups', settings.getGroups().map((g) => {
            const group = {...g};
            delete group.friendlyName;
            return group;
        }));
    }

    rename(topic, message) {
        const invalid = `Invalid rename message format expected {old: 'friendly_name', new: 'new_name} got ${message}`;

        let json = null;
        try {
            json = JSON.parse(message);
        } catch (e) {
            logger.error(invalid);
            return;
        }

        // Validate message
        if (!json.new || !json.old) {
            logger.error(invalid);
            return;
        }

        try {
            settings.changeFriendlyName(json.old, json.new);
            logger.info(`Successfully renamed - ${json.old} to ${json.new} `);
            this.mqtt.log('device_renamed', {from: json.old, to: json.new});
        } catch (error) {
            logger.error(`Failed to rename - ${json.old} to ${json.new}`);
        }
    }

    async addGroup(topic, message) {
        const name = message;
        const group = settings.addGroup(name);
        await this.zigbee.createGroup(group.ID);
        logger.info(`Added group '${name}'`);
    }

    removeGroup(topic, message) {
        const name = message;
        settings.removeGroup(name);
        logger.info(`Removed group '${name}'`);
    }

    async remove(topic, message) {
        await this.removeOrBan(false, message);
    }

    async ban(topic, message) {
        await this.removeOrBan(true, message);
    }

    async removeOrBan(ban, message) {
        const entity = await this.zigbee.resolveEntity(message);

        const cleanup = () => {
            // Remove from configuration.yaml
            settings.removeDevice(entity.settings.ID);

            // Remove from state
            this.state.remove(entity.settings.ID);

            logger.info(`Successfully ${ban ? 'banned' : 'removed'} ${entity.settings.friendlyName}`);
            this.mqtt.log(ban ? 'device_banned' : 'device_removed', message);
        };

        // Remove from zigbee network.
        try {
            logger.info(`Removing '${entity.settings.friendlyName}'`);
            await entity.device.removeFromNetwork();
            cleanup();
        } catch (error) {
            logger.error(`Failed to ${ban ? 'ban' : 'remove'} ${entity.settings.friendlyName} (${error})`);
        }
    }

    async onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/config/+`);
        await this.publish();
    }

    async onMQTTMessage(topic, message) {
        if (!topic.match(configRegex)) {
            return false;
        }

        const option = topic.match(configRegex)[1];

        if (!this.supportedOptions.hasOwnProperty(option)) {
            return false;
        }

        await this.supportedOptions[option](topic, message);

        return true;
    }

    async publish() {
        const info = await utils.getZigbee2mqttVersion();
        const coordinator = await this.zigbee.getCoordinatorVersion();

        const topic = `bridge/config`;
        const payload = {
            version: info.version,
            commit: info.commitHash,
            coordinator,
            log_level: logger.transports.console.level,
            permit_join: await this.zigbee.getPermitJoin(),
        };

        await this.mqtt.publish(topic, JSON.stringify(payload), {retain: true, qos: 0});
    }
}

module.exports = BridgeConfig;
