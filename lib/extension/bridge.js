const logger = require('../util/logger');
const utils = require('../util/utils');
const Extension = require('./extension');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const settings = require('../util/settings');
const Transport = require('winston-transport');
const stringify = require('json-stable-stringify');

const requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/(.*)`);

class Bridge extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.enableDisableExtension = enableDisableExtension;
        this.lastJoinedDeviceIeeeAddr = null;
        this.setupMQTTLogging();

        this.requestLookup = {
            'device/options': this.deviceOptions.bind(this),
            'device/remove': this.deviceRemove.bind(this),
            'device/rename': this.deviceRename.bind(this),
            'group/add': this.groupAdd.bind(this),
            'group/options': this.groupOptions.bind(this),
            'group/remove': this.groupRemove.bind(this),
            'group/rename': this.groupRename.bind(this),
            'permit_join': this.permitJoin.bind(this),
            'config/last_seen': this.configLastSeen.bind(this),
            'config/homeassistant': this.configHomeAssistant.bind(this),
            'config/elapsed': this.configElapsed.bind(this),
            'config/log_level': this.configLogLevel.bind(this),
            'touchlink/factory_reset': this.touchlinkFactoryReset.bind(this),
            'health_check': this.healthCheck.bind(this),
        };
    }

    async onMQTTConnected() {
        this.zigbee2mqttVersion = await utils.getZigbee2mqttVersion();
        this.coordinatorVersion = await this.zigbee.getCoordinatorVersion();

        this.eventBus.on(`groupMembersChanged`, () => this.publishGroups());
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/request/#`);
        await this.publishInfo();
        await this.publishDevices();
        await this.publishGroups();
    }

    setupMQTTLogging() {
        const mqtt = this.mqtt;
        class EventTransport extends Transport {
            log(info, callback) {
                const payload = stringify({message: info.message, level: info.level});
                mqtt.publish(`bridge/logging`, payload, {}, settings.get().mqtt.base_topic, true);
                callback();
            }
        }

        logger.add(new EventTransport());
    }

    async onMQTTMessage(topic, message) {
        const match = topic.match(requestRegex);
        if (match && this.requestLookup[match[1].toLowerCase()]) {
            message = utils.parseJSON(message, message);

            try {
                const response = await this.requestLookup[match[1].toLowerCase()](message);
                await this.mqtt.publish(`bridge/response/${match[1]}`, stringify(response));
            } catch (error) {
                logger.error(`Request '${topic}' failed with error: '${error.message}'`);
                const response = utils.getResponse(message, {}, error.message);
                await this.mqtt.publish(`bridge/response/${match[1]}`, stringify(response));
            }
        }
    }

    async onZigbeeEvent(type, data, resolvedEntity) {
        if (type === 'deviceJoined' && resolvedEntity) {
            this.lastJoinedDeviceIeeeAddr = resolvedEntity.device.ieeeAddr;
        }

        if (['deviceJoined', 'deviceLeave', 'deviceInterview', 'deviceAnnounce'].includes(type)) {
            let payload;
            const ieeeAddress = data.device ? data.device.ieeeAddr : data.ieeeAddr;
            if (type === 'deviceJoined') {
                payload = {friendly_name: resolvedEntity.settings.friendlyName, ieee_address: ieeeAddress};
            } else if (type === 'deviceInterview') {
                payload = {
                    friendly_name: resolvedEntity.settings.friendlyName, status: data.status, ieee_address: ieeeAddress,
                };
                if (data.status === 'successful') {
                    payload.supported = !!resolvedEntity.definition;
                    payload.definition = resolvedEntity.definition ? {
                        model: resolvedEntity.definition.model,
                        vendor: resolvedEntity.definition.vendor,
                        description: resolvedEntity.definition.description,
                        supports: resolvedEntity.definition.supports,
                    } : null;
                }
            } else if (type === 'deviceAnnounce') {
                payload = {
                    friendly_name: resolvedEntity.settings.friendlyName, ieee_address: ieeeAddress,
                };
            } else payload = {ieee_address: ieeeAddress}; // deviceLeave

            await this.mqtt.publish(
                'bridge/event',
                stringify({type: utils.toSnakeCase(type), data: payload}),
                {retain: false, qos: 0},
            );
        }

        if ('deviceLeave' === type || ('deviceInterview' === type && data.status !== 'started')) {
            await this.publishDevices();
        }
    }

    /**
     * Requests
     */

    async deviceOptions(message) {
        return this.changeEntityOptions('device', message);
    }

    async groupOptions(message) {
        return this.changeEntityOptions('group', message);
    }

    async deviceRemove(message) {
        return this.removeEntity('device', message);
    }

    async groupRemove(message) {
        return this.removeEntity('group', message);
    }

    async healthCheck(message) {
        return utils.getResponse(message, {healthy: true}, null);
    }

    async groupAdd(message) {
        if (typeof message === 'object' && !message.hasOwnProperty('friendly_name')) {
            throw new Error(`Invalid payload`);
        }

        const friendlyName = typeof message === 'object' ? message.friendly_name : message;
        const ID = typeof message === 'object' && message.hasOwnProperty('id') ? message.id : null;
        const group = settings.addGroup(friendlyName, ID);
        this.zigbee.createGroup(group.ID);
        this.publishGroups();
        return utils.getResponse(message, {friendly_name: group.friendlyName, id: group.ID}, null);
    }

    async deviceRename(message) {
        return this.renameEntity('device', message);
    }

    async groupRename(message) {
        return this.renameEntity('group', message);
    }

    async permitJoin(message) {
        const value = this.getValue(message);
        await this.zigbee.permitJoin(value);
        await this.publishInfo();
        return utils.getResponse(message, {value: value}, null);
    }

    configLastSeen(message) {
        const allowed = ['disable', 'ISO_8601', 'epoch', 'ISO_8601_local'];
        const value = this.getValue(message);
        if (!allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }

        settings.set(['advanced', 'last_seen'], message);
        return utils.getResponse(message, {value}, null);
    }

    configHomeAssistant(message) {
        const allowed = [true, false];
        const value = this.getValue(message);
        if (!allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }

        this.enableDisableExtension(value, 'HomeAssistant');
        settings.set(['homeassistant'], value);
        return utils.getResponse(message, {value}, null);
    }

    configElapsed(message) {
        const allowed = [true, false];
        const value = this.getValue(message);
        if (!allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }

        settings.set(['advanced', 'elapsed'], value);
        return utils.getResponse(message, {value}, null);
    }

    configLogLevel(message) {
        const allowed = ['error', 'warn', 'info', 'debug'];
        const value = this.getValue(message);
        if (!allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }

        logger.setLevel(value);
        this.publishInfo();
        return utils.getResponse(message, {value}, null);
    }

    async touchlinkFactoryReset(message) {
        logger.info('Start touchlink factory reset');
        const result = await this.zigbee.touchlinkFactoryReset();
        if (result) {
            logger.info('Successfully factory reset device through Touchlink');
            return utils.getResponse(message, {}, null);
        } else {
            logger.error('Failed to factory reset device through Touchlink');
            throw new Error('Failed to factory reset device through Touchlink');
        }
    }

    /**
     * Utils
     */

    getValue(message) {
        if (typeof message === 'object') {
            if (!message.hasOwnProperty('value')) {
                throw new Error('No value given');
            }

            return message.value;
        } else {
            return message;
        }
    }

    changeEntityOptions(entityType, message) {
        if (typeof message !== 'object' || !message.hasOwnProperty('id') || !message.hasOwnProperty('options')) {
            throw new Error(`Invalid payload`);
        }

        const ID = message.id;
        const entity = this.getEntity(entityType, ID);
        settings.changeEntityOptions(ID, message.options);
        const cleanup = (o) => {
            delete o.friendlyName; delete o.friendly_name; delete o.ID; delete o.type; delete o.devices;
            return o;
        };
        const oldOptions = cleanup(entity.settings);
        const newOptions = cleanup(settings.getEntity(ID));
        return utils.getResponse(message, {from: oldOptions, to: newOptions, id: ID}, null);
    }

    renameEntity(entityType, message) {
        const deviceAndHasLast = entityType === 'device' && typeof message === 'object' && message.last === true;
        if (typeof message !== 'object' || (!message.hasOwnProperty('from') && !deviceAndHasLast) ||
            !message.hasOwnProperty('to')) {
            throw new Error(`Invalid payload`);
        }

        if (deviceAndHasLast && !this.lastJoinedDeviceIeeeAddr) {
            throw new Error('No device has joined since start');
        }

        const from = deviceAndHasLast ? this.lastJoinedDeviceIeeeAddr : message.from;
        const to = message.to;
        const entity = this.getEntity(entityType, from);

        settings.changeFriendlyName(from, to);

        if (entity.type === 'device') {
            this.publishDevices();
            this.eventBus.emit(`deviceRenamed`, {device: entity.device});
        } else {
            this.publishGroups();
            this.eventBus.emit(`groupRenamed`, {group: entity.group});
        }

        return utils.getResponse(message, {from: entity.settings.friendlyName, to}, null);
    }

    async removeEntity(entityType, message) {
        const ID = typeof message === 'object' ? message.id : message.trim();
        const entity = this.getEntity(entityType, ID);

        let block = false;
        let force = false;
        let blockForceLog = '';

        if (entityType === 'device' && typeof message === 'object') {
            block = !!message.block;
            force = !!message.force;
            blockForceLog = ` (block: ${block}, force: ${force})`;
        } else if (entityType === 'group' && typeof message === 'object') {
            force = !!message.force;
            blockForceLog = ` (force: ${force})`;
        }

        try {
            logger.info(`Removing ${entity.type} '${entity.settings.friendlyName}'${blockForceLog}`);
            if (entity.type === 'device') {
                if (block) {
                    settings.blockDevice(entity.settings.ID);
                }

                if (force) {
                    await entity.device.removeFromDatabase();
                } else {
                    await entity.device.removeFromNetwork();
                }
            } else {
                if (force) {
                    await entity.group.removeFromDatabase();
                } else {
                    await entity.group.removeFromNetwork();
                }
            }

            // Fire event
            if (entity.type === 'device') {
                this.eventBus.emit('deviceRemoved', {device: entity.device});
            }

            // Remove from configuration.yaml
            if (entity.type === 'device') {
                settings.removeDevice(entity.settings.ID);
            } else {
                settings.removeGroup(entity.settings.ID);
            }

            // Remove from state
            this.state.remove(entity.settings.ID);

            logger.info(`Successfully removed ${entity.type} '${entity.settings.friendlyName}'${blockForceLog}`);

            if (entity.type === 'device') {
                this.publishDevices();
                return utils.getResponse(message, {id: ID, block, force}, null);
            } else {
                this.publishGroups();
                return utils.getResponse(message, {id: ID, force: force}, null);
            }
        } catch (error) {
            throw new Error(
                `Failed to remove ${entity.type} '${entity.settings.friendlyName}'${blockForceLog} (${error})`,
            );
        }
    }

    getEntity(type, ID) {
        const entity = this.zigbee.resolveEntity(ID);
        if (!entity || entity.type !== type) {
            throw new Error(`${utils.capitalize(type)} '${ID}' does not exist`);
        }
        return entity;
    }

    async publishInfo() {
        const payload = {
            version: this.zigbee2mqttVersion.version,
            commit: this.zigbee2mqttVersion.commitHash,
            coordinator: this.coordinatorVersion,
            network: utils.toSnakeCase(await this.zigbee.getNetworkParameters()),
            log_level: logger.getLevel(),
            permit_join: await this.zigbee.getPermitJoin(),
        };

        await this.mqtt.publish('bridge/info', stringify(payload), {retain: true, qos: 0});
    }

    async publishDevices() {
        const devices = this.zigbee.getDevices().map((device) => {
            const definition = zigbeeHerdsmanConverters.findByDevice(device);
            const resolved = this.zigbee.resolveEntity(device);
            const definitionPayload = definition ? {
                model: definition.model,
                vendor: definition.vendor,
                description: definition.description,
                supports: definition.supports,
            } : null;

            const endpoints = {};
            for (const endpoint of device.endpoints) {
                const data = {
                    bindings: [],
                    clusters: {
                        input: endpoint.getInputClusters().map((c) => c.name),
                        output: endpoint.getOutputClusters().map((c) => c.name),
                    },
                };

                for (const bind of endpoint.binds) {
                    let target;

                    if (bind.target.constructor.name === 'Endpoint') {
                        target = {
                            type: 'endpoint', ieee_address: bind.target.getDevice().ieeeAddr, endpoint: bind.target.ID,
                        };
                    } else {
                        target = {type: 'group', id: bind.target.groupID};
                    }

                    data.bindings.push({cluster: bind.cluster.name, target});
                }

                endpoints[endpoint.ID] = data;
            }

            return {
                ieee_address: device.ieeeAddr,
                type: device.type,
                network_address: device.networkAddress,
                supported: !!definition,
                friendly_name: resolved.name,
                definition: definitionPayload,
                power_source: device.powerSource,
                software_build_id: device.softwareBuildID,
                date_code: device.dateCode,
                interviewing: device.interviewing,
                interview_completed: device.interviewCompleted,
                endpoints,
            };
        });

        await this.mqtt.publish('bridge/devices', stringify(devices), {retain: true, qos: 0});
    }

    async publishGroups() {
        const groups = this.zigbee.getGroups().map((group) => {
            const resolved = this.zigbee.resolveEntity(group);
            return {
                id: group.groupID,
                friendly_name: resolved.name,
                members: group.members.map((m) => {
                    return {
                        ieee_address: m.deviceIeeeAddress,
                        endpoint: m.ID,
                    };
                }),
            };
        });

        await this.mqtt.publish('bridge/groups', stringify(groups), {retain: true, qos: 0});
    }
}

module.exports = Bridge;
