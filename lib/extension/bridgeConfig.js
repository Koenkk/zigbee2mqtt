const settings = require('../util/settings');
const logger = require('../util/logger');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const utils = require('../util/utils');
const assert = require('assert');
const BaseExtension = require('./baseExtension');

const configRegex =
    new RegExp(`${settings.get().mqtt.base_topic}/bridge/config/((?:\\w+/get)|(?:\\w+/factory_reset)|(?:\\w+))`);
const allowedLogLevels = ['error', 'warn', 'info', 'debug'];

class BridgeConfig extends BaseExtension {
    constructor(zigbee, mqtt, state, publishEntityState) {
        super(zigbee, mqtt, state, publishEntityState);

        // Bind functions
        this.permitJoin = this.permitJoin.bind(this);
        this.lastSeen = this.lastSeen.bind(this);
        this.elapsed = this.elapsed.bind(this);
        this.reset = this.reset.bind(this);
        this.logLevel = this.logLevel.bind(this);
        this.devices = this.devices.bind(this);
        this.groups = this.groups.bind(this);
        this.rename = this.rename.bind(this);
        this.renameLast = this.renameLast.bind(this);
        this.remove = this.remove.bind(this);
        this.forceRemove = this.forceRemove.bind(this);
        this.ban = this.ban.bind(this);
        this.deviceOptions = this.deviceOptions.bind(this);
        this.addGroup = this.addGroup.bind(this);
        this.removeGroup = this.removeGroup.bind(this);
        this.whitelist = this.whitelist.bind(this);
        this.touchlinkFactoryReset = this.touchlinkFactoryReset.bind(this);

        this.lastJoinedDeviceName = null;

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
            'rename_last': this.renameLast,
            'remove': this.remove,
            'force_remove': this.forceRemove,
            'ban': this.ban,
            'device_options': this.deviceOptions,
            'add_group': this.addGroup,
            'remove_group': this.removeGroup,
            'whitelist': this.whitelist,
            'touchlink/factory_reset': this.touchlinkFactoryReset,
        };
    }

    whitelist(topic, message) {
        try {
            const entity = settings.getEntity(message);
            assert(entity, `Entity '${message}' does not exist`);
            settings.whitelistDevice(entity.ID);
            logger.info(`Whitelisted '${entity.friendlyName}'`);
            this.mqtt.log('device_whitelisted', {friendly_name: entity.friendlyName});
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
            await this.zigbee.reset('soft');
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
            logger.setLevel(level);
        } else {
            logger.error(`Could not set log level to '${level}'. Allowed level: '${allowedLogLevels.join(',')}'`);
        }

        this.publish();
    }

    async devices(topic, message) {
        const coordinator = await this.zigbee.getCoordinatorVersion();
        const devices = this.zigbee.getDevices().map((device) => {
            const payload = {
                ieeeAddr: device.ieeeAddr,
                type: device.type,
                networkAddress: device.networkAddress,
            };

            if (device.type !== 'Coordinator') {
                const mappedDevice = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
                const friendlyDevice = settings.getDevice(device.ieeeAddr);
                payload.model = mappedDevice ? mappedDevice.model : device.modelID;
                payload.friendly_name = friendlyDevice ? friendlyDevice.friendly_name : device.ieeeAddr;
                payload.manufacturerID = device.manufacturerID;
                payload.manufacturerName = device.manufacturerName;
                payload.powerSource = device.powerSource;
                payload.modelID = device.modelID;
                payload.hardwareVersion = device.hardwareVersion;
                payload.softwareBuildID = device.softwareBuildID;
                payload.dateCode = device.dateCode;
                payload.lastSeen = device.lastSeen;
            } else {
                payload.friendly_name = 'Coordinator';
                payload.softwareBuildID = coordinator.type;
                payload.dateCode = coordinator.meta.revision.toString();
                payload.lastSeen = Date.now();
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

        this._renameInternal(json.old, json.new);
    }

    renameLast(topic, message) {
        if (!this.lastJoinedDeviceName) {
            logger.error(`Cannot rename last joined device, no device has joined during this session`);
            return;
        }

        this._renameInternal(this.lastJoinedDeviceName, message);
    }

    _renameInternal(from, to) {
        try {
            settings.changeFriendlyName(from, to);
            logger.info(`Successfully renamed - ${from} to ${to} `);
            this.mqtt.log('device_renamed', {from, to});
        } catch (error) {
            logger.error(`Failed to rename - ${from} to ${to}`);
        }
    }

    addGroup(topic, message) {
        let id = null;
        let name = null;
        try {
            // json payload with id and friendly_name
            const json = JSON.parse(message);
            if (json.hasOwnProperty('id')) {
                id = json.id;
                name = `group_${id}`;
            }
            if (json.hasOwnProperty('friendly_name')) {
                name = json.friendly_name;
            }
        } catch (e) {
            // just friendly_name
            name = message;
        }

        if (name == null) {
            logger.error('Failed to add group, missing friendly_name!');
            return;
        }

        const group = settings.addGroup(name, id);
        this.zigbee.createGroup(group.ID);
        logger.info(`Added group '${name}'`);
    }

    removeGroup(topic, message) {
        const name = message;
        settings.removeGroup(name);
        logger.info(`Removed group '${name}'`);
    }

    async forceRemove(topic, message) {
        await this.removeForceRemoveOrBan('force_remove', message);
    }

    async remove(topic, message) {
        await this.removeForceRemoveOrBan('remove', message);
    }

    async ban(topic, message) {
        await this.removeForceRemoveOrBan('ban', message);
    }

    async removeForceRemoveOrBan(action, message) {
        const entity = this.zigbee.resolveEntity(message.trim());
        const lookup = {
            ban: ['banned', 'Banning', 'ban'],
            force_remove: ['force_removed', 'Force removing', 'force remove'],
            remove: ['removed', 'Removing', 'remove'],
        };

        if (!entity) {
            logger.error(`Cannot ${lookup[action][2]}, device '${message}' does not exist`);
            return;
        }

        const cleanup = () => {
            // Remove from configuration.yaml
            settings.removeDevice(entity.settings.ID);

            // Remove from state
            this.state.remove(entity.settings.ID);

            logger.info(`Successfully ${lookup[action][0]} ${entity.settings.friendlyName}`);
            this.mqtt.log(`device_${lookup[action][0]}`, message);
        };

        try {
            logger.info(`${lookup[action][1]} '${entity.settings.friendlyName}'`);
            if (action === 'force_remove') {
                await entity.device.removeFromDatabase();
            } else {
                await entity.device.removeFromNetwork();
            }

            cleanup();
        } catch (error) {
            logger.error(`Failed to ${lookup[action][2]} ${entity.settings.friendlyName} (${error})`);
            // eslint-disable-next-line
            logger.error(`See https://www.zigbee2mqtt.io/information/mqtt_topics_and_message_structure.html#zigbee2mqttbridgeconfigremove for more info`);
        }

        if (action === 'ban') {
            settings.banDevice(entity.settings.ID);
        }
    }

    async onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/config/+`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/config/+/+`);
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
            log_level: logger.getLevel(),
            permit_join: await this.zigbee.getPermitJoin(),
        };

        await this.mqtt.publish(topic, JSON.stringify(payload), {retain: true, qos: 0});
    }

    onZigbeeEvent(type, data, mappedDevice, settingsDevice) {
        if (type === 'deviceJoined') {
            this.lastJoinedDeviceName = settingsDevice.friendlyName;
        }
    }

    async touchlinkFactoryReset() {
        logger.info('Starting touchlink factory reset...');
        const result = await this.zigbee.touchlinkFactoryReset();

        if (result) {
            logger.info('Succesfully factory reset device through Touchlink');
        } else {
            logger.warn('Failed to factory reset device through Touchlink');
        }
    }
}

module.exports = BridgeConfig;
