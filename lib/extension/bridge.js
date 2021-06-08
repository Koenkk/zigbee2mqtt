const logger = require('../util/logger');
const utils = require('../util/utils');
const Extension = require('./extension');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const settings = require('../util/settings');
const Transport = require('winston-transport');
const stringify = require('json-stable-stringify-without-jsonify');
const objectAssignDeep = require(`object-assign-deep`);
const {updatedDiff, addedDiff} = require('deep-object-diff');

const requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/(.*)`);

class Bridge extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.enableDisableExtension = enableDisableExtension;
        this.restartCallback = restartCallback;
        this.lastJoinedDeviceIeeeAddr = null;
        this.setupMQTTLogging();
        this.restartRequired = false;

        this.requestLookup = {
            'device/options': this.deviceOptions.bind(this),
            'device/configure_reporting': this.deviceConfigureReporting.bind(this),
            'device/remove': this.deviceRemove.bind(this),
            'device/rename': this.deviceRename.bind(this),
            'group/add': this.groupAdd.bind(this),
            'group/options': this.groupOptions.bind(this),
            'group/remove': this.groupRemove.bind(this),
            'group/rename': this.groupRename.bind(this),
            'permit_join': this.permitJoin.bind(this),
            'restart': this.restart.bind(this),
            'touchlink/factory_reset': this.touchlinkFactoryReset.bind(this),
            'touchlink/identify': this.touchlinkIdentify.bind(this),
            'touchlink/scan': this.touchlinkScan.bind(this),
            'health_check': this.healthCheck.bind(this),
            'options': this.bridgeOptions.bind(this),
            // Below are deprecated
            'config/last_seen': this.configLastSeen.bind(this),
            'config/homeassistant': this.configHomeAssistant.bind(this),
            'config/elapsed': this.configElapsed.bind(this),
            'config/log_level': this.configLogLevel.bind(this),
        };
    }

    async onMQTTConnected() {
        this.zigbee2mqttVersion = await utils.getZigbee2mqttVersion();
        this.coordinatorVersion = await this.zigbee.getCoordinatorVersion();

        this.eventBus.on(`groupMembersChanged`, () => this.publishGroups());
        this.eventBus.on(`devicesChanged`, () => {
            this.publishDevices();
            this.publishInfo();
        });
        this.eventBus.on(`deviceRenamed`, () => {
            this.publishInfo();
        });
        this.eventBus.on(`groupRenamed`, () => {
            this.publishInfo();
        });
        this.zigbee.on('permitJoinChanged', (data) => this.permitJoinChanged(data));
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

        logger.addTransport(new EventTransport());
    }

    permitJoinChanged(data) {
        if (!this.zigbee.isStopping()) {
            this.publishInfo();
        }
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
                    const definition = resolvedEntity.definition;
                    payload.supported = !!definition;
                    payload.definition = this.getDefinitionPayload(definition, resolvedEntity);
                }
            } else if (type === 'deviceAnnounce') {
                payload = {
                    friendly_name: resolvedEntity.settings.friendlyName, ieee_address: ieeeAddress,
                };
            } else {
                // deviceLeave
                const settingsDevice = settings.getDevice(ieeeAddress);
                payload = {ieee_address: ieeeAddress,
                    friendly_name: settingsDevice ? settingsDevice.friendlyName : null};
            }

            await this.mqtt.publish(
                'bridge/event',
                stringify({type: utils.toSnakeCase(type), data: payload}),
                {retain: false, qos: 0},
            );
        }

        if ('deviceLeave' === type || ('deviceInterview' === type && data.status !== 'started') ||
            'deviceNetworkAddressChanged' === type) {
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

    async bridgeOptions(message) {
        if (typeof message !== 'object' || typeof message.options !== 'object') {
            throw new Error(`Invalid payload`);
        }

        const diffUpdated = updatedDiff(settings.get(), message.options);
        const diffAdded = addedDiff(settings.get(), message.options);
        const newSettings = objectAssignDeep.noMutate(diffUpdated, diffAdded);

        // deep-object-diff converts arrays to objects, set original array back here
        const convertBackArray = (before, after) => {
            for (const [key, afterValue] of Object.entries(after)) {
                const beforeValue = before[key];
                if (Array.isArray(beforeValue)) {
                    after[key] = beforeValue;
                } else if (afterValue && typeof beforeValue === 'object') {
                    convertBackArray(beforeValue, afterValue);
                }
            }
        };
        convertBackArray(message.options, newSettings);

        const restartRequired = settings.apply(newSettings);
        if (restartRequired) this.restartRequired = true;

        // Apply some settings on-the-fly.
        if (newSettings.hasOwnProperty('permit_join')) {
            await this.zigbee.permitJoin(newSettings.permit_join);
        }

        if (newSettings.hasOwnProperty('homeassistant')) {
            this.enableDisableExtension(newSettings.homeassistant, 'HomeAssistant');
        }

        if (newSettings.hasOwnProperty('advanced') && newSettings.advanced.hasOwnProperty('log_level')) {
            logger.setLevel(newSettings.advanced.log_level);
        }

        logger.info('Succesfully changed options');
        this.publishInfo();
        return utils.getResponse(message, {restart_required: this.restartRequired}, null);
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

    async restart(message) {
        // Wait 500 ms before restarting so response can be send.
        setTimeout(this.restartCallback, 500);
        logger.info('Restarting Zigbee2MQTT');
        return utils.getResponse(message, {}, null);
    }

    async permitJoin(message) {
        if (typeof message === 'object' && !message.hasOwnProperty('value')) {
            throw new Error('Invalid payload');
        }

        let value;
        let time;
        let resolvedEntity;
        if (typeof message === 'object') {
            value = message.value;
            time = message.time;
            if (message.device) {
                resolvedEntity = this.zigbee.resolveEntity(message.device);
                if (!resolvedEntity || resolvedEntity.type !== 'device') {
                    throw new Error(`Device '${message.device}' does not exist`);
                }
            }
        } else {
            value = message;
        }

        if (typeof value === 'string') {
            value = value.toLowerCase() === 'true';
        }

        await this.zigbee.permitJoin(value, resolvedEntity, time);
        const response = {value};
        if (resolvedEntity) response.device = message.device;
        if (time) response.time = message.time;
        return utils.getResponse(message, response, null);
    }

    // Deprecated
    configLastSeen(message) {
        const allowed = ['disable', 'ISO_8601', 'epoch', 'ISO_8601_local'];
        const value = this.getValue(message);
        if (!allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }

        settings.set(['advanced', 'last_seen'], value);
        this.publishInfo();
        return utils.getResponse(message, {value}, null);
    }

    // Deprecated
    configHomeAssistant(message) {
        const allowed = [true, false];
        const value = this.getValue(message);
        if (!allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }

        this.enableDisableExtension(value, 'HomeAssistant');
        settings.set(['homeassistant'], value);
        this.publishInfo();
        return utils.getResponse(message, {value}, null);
    }

    // Deprecated
    configElapsed(message) {
        const allowed = [true, false];
        const value = this.getValue(message);
        if (!allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }

        settings.set(['advanced', 'elapsed'], value);
        this.publishInfo();
        return utils.getResponse(message, {value}, null);
    }

    // Deprecated
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

    async touchlinkIdentify(message) {
        if (typeof message !== 'object' || !message.hasOwnProperty('ieee_address') ||
            !message.hasOwnProperty('channel')) {
            throw new Error('Invalid payload');
        }

        logger.info(`Start Touchlink identify of '${message.ieee_address}' on channel ${message.channel}`);
        await this.zigbee.touchlinkIdentify(message.ieee_address, message.channel);
        return utils.getResponse(message, {ieee_address: message.ieee_address, channel: message.channel}, null);
    }

    async touchlinkFactoryReset(message) {
        let result = false;
        const payload = {};
        if (typeof message === 'object' && message.hasOwnProperty('ieee_address') &&
            message.hasOwnProperty('channel')) {
            logger.info(`Start Touchlink factory reset of '${message.ieee_address}' on channel ${message.channel}`);
            result = await this.zigbee.touchlinkFactoryReset(message.ieee_address, message.channel);
            payload.ieee_address = message.ieee_address;
            payload.channel = message.channel;
        } else {
            logger.info('Start Touchlink factory reset of first found device');
            result = await this.zigbee.touchlinkFactoryResetFirst();
        }

        if (result) {
            logger.info('Successfully factory reset device through Touchlink');
            return utils.getResponse(message, payload, null);
        } else {
            logger.error('Failed to factory reset device through Touchlink');
            throw new Error('Failed to factory reset device through Touchlink');
        }
    }

    async touchlinkScan(message) {
        logger.info('Start Touchlink scan');
        const result = await this.zigbee.touchlinkScan();
        const found = result.map((r) => {
            return {ieee_address: r.ieeeAddr, channel: r.channel};
        });
        logger.info('Finished Touchlink scan');
        return utils.getResponse(message, {found}, null);
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

    async changeEntityOptions(entityType, message) {
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
        await this.publishInfo();

        logger.info(`Changed config for ${entityType} ${ID}`);

        return utils.getResponse(message, {from: oldOptions, to: newOptions, id: ID}, null);
    }

    async deviceConfigureReporting(message) {
        if (typeof message !== 'object' || !message.hasOwnProperty('id') || !message.hasOwnProperty('cluster') ||
            !message.hasOwnProperty('maximum_report_interval') || !message.hasOwnProperty('minimum_report_interval') ||
            !message.hasOwnProperty('reportable_change') || !message.hasOwnProperty('attribute')) {
            throw new Error(`Invalid payload`);
        }

        const ID = message.id;
        const endpoint = this.getEntity('device', ID).endpoint;

        const coordinator = this.zigbee.getDevicesByType('Coordinator')[0];
        const coordinatorEndpoint = coordinator.getEndpoint(1);
        await endpoint.bind(message.cluster, coordinatorEndpoint);

        await endpoint.configureReporting(message.cluster, [{
            attribute: message.attribute, minimumReportInterval: message.minimum_report_interval,
            maximumReportInterval: message.maximum_report_interval, reportableChange: message.reportable_change,
        }]);

        this.publishDevices();

        logger.info(`Configured reporting for '${message.id}', '${message.cluster}.${message.attribute}'`);

        return utils.getResponse(message, {
            id: message.id, cluster: message.cluster, maximum_report_interval: message.maximum_report_interval,
            minimum_report_interval: message.minimum_report_interval, reportable_change: message.reportable_change,
            attribute: message.attribute,
        }, null);
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
        const homeAssisantRename = message.hasOwnProperty('homeassistant_rename') ?
            message.homeassistant_rename : false;
        const entity = this.getEntity(entityType, from);

        settings.changeFriendlyName(from, to);

        // Clear retained messages
        this.mqtt.publish(entity.name, '', {retain: true});

        const oldFriendlyName = entity.settings.friendlyName;
        if (entity.type === 'device') {
            this.publishDevices();
            this.eventBus.emit(`deviceRenamed`, {device: entity.device, homeAssisantRename, from: oldFriendlyName, to});
        } else {
            this.publishGroups();
            this.eventBus.emit(`groupRenamed`, {group: entity.group, homeAssisantRename, from: oldFriendlyName, to});
        }

        // Repulish entity state
        this.publishEntityState(to, {});

        return utils.getResponse(
            message,
            {from: oldFriendlyName, to, homeassistant_rename: homeAssisantRename},
            null,
        );
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
                this.eventBus.emit('deviceRemoved', {resolvedEntity: entity});
            }

            // Remove from configuration.yaml
            if (entity.type === 'device') {
                settings.removeDevice(entity.settings.ID);
            } else {
                settings.removeGroup(entity.settings.ID);
            }

            // Remove from state
            this.state.remove(entity.settings.ID);

            // Clear any retained messages
            this.mqtt.publish(entity.name, '', {retain: true});

            logger.info(`Successfully removed ${entity.type} '${entity.settings.friendlyName}'${blockForceLog}`);

            if (entity.type === 'device') {
                this.publishGroups();
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
        const config = objectAssignDeep.noMutate({}, settings.get());
        delete config.advanced.network_key;
        delete config.mqtt.password;
        config.frontend && delete config.frontend.auth_token;
        const payload = {
            version: this.zigbee2mqttVersion.version,
            commit: this.zigbee2mqttVersion.commitHash,
            coordinator: this.coordinatorVersion,
            network: utils.toSnakeCase(await this.zigbee.getNetworkParameters()),
            log_level: logger.getLevel(),
            permit_join: this.zigbee.getPermitJoin(),
            permit_join_timeout: this.zigbee.getPermitJoinTimeout(),
            restart_required: this.restartRequired,
            config,
            config_schema: settings.schema,
        };

        await this.mqtt.publish(
            'bridge/info', stringify(payload), {retain: true, qos: 0}, settings.get().mqtt.base_topic, true);
    }

    async publishDevices() {
        const devices = this.zigbee.getDevices().map((device) => {
            const definition = zigbeeHerdsmanConverters.findByDevice(device);
            const resolved = this.zigbee.resolveEntity(device);
            const endpoints = {};
            for (const endpoint of device.endpoints) {
                const data = {
                    bindings: [],
                    configured_reportings: [],
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

                for (const configuredReporting of endpoint.configuredReportings) {
                    data.configured_reportings.push({
                        cluster: configuredReporting.cluster.name,
                        attribute: configuredReporting.attribute.name || configuredReporting.attribute.ID,
                        minimum_report_interval: configuredReporting.minimumReportInterval,
                        maximum_report_interval: configuredReporting.maximumReportInterval,
                        reportable_change: configuredReporting.reportableChange,
                    });
                }

                endpoints[endpoint.ID] = data;
            }

            return {
                ieee_address: device.ieeeAddr,
                type: device.type,
                network_address: device.networkAddress,
                supported: !!definition,
                friendly_name: resolved.name,
                definition: this.getDefinitionPayload(definition, resolved),
                power_source: device.powerSource,
                software_build_id: device.softwareBuildID,
                date_code: device.dateCode,
                model_id: device.modelID,
                interviewing: device.interviewing,
                interview_completed: device.interviewCompleted,
                endpoints,
            };
        });

        await this.mqtt.publish(
            'bridge/devices', stringify(devices), {retain: true, qos: 0}, settings.get().mqtt.base_topic, true);
    }

    async publishGroups() {
        const groups = this.zigbee.getGroups().map((group) => {
            const resolved = this.zigbee.resolveEntity(group);
            return {
                id: group.groupID,
                friendly_name: group.groupID === 901 ? 'default_bind_group' : resolved.name,
                members: group.members.map((m) => {
                    return {
                        ieee_address: m.deviceIeeeAddress,
                        endpoint: m.ID,
                    };
                }),
            };
        });

        await this.mqtt.publish(
            'bridge/groups', stringify(groups), {retain: true, qos: 0}, settings.get().mqtt.base_topic, true);
    }

    getDefinitionPayload(definition, resolvedDevice) {
        if (definition) {
            let icon = null;
            if (resolvedDevice && resolvedDevice.hasOwnProperty('settings')) {
                icon = resolvedDevice.settings.icon;
            }
            if (!icon) {
                icon = definition.icon;
            }
            if (icon) {
                let zigbeeModel = '';
                /* istanbul ignore else */
                if (resolvedDevice && resolvedDevice.hasOwnProperty('device')) {
                    zigbeeModel = resolvedDevice.device.modelID;
                }
                icon = icon.replace('${zigbeeModel}', utils.sanitizeImageParameter(zigbeeModel));
                icon = icon.replace('${model}', utils.sanitizeImageParameter(definition.model));
            }
            return {
                model: definition.model,
                vendor: definition.vendor,
                description: definition.description,
                exposes: definition.exposes,
                supports_ota: !!definition.ota,
                icon,
            };
        } else {
            return null;
        }
    }
}

module.exports = Bridge;
