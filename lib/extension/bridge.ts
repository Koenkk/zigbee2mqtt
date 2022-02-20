/* eslint-disable camelcase */
import logger from '../util/logger';
import utils from '../util/utils';
import * as settings from '../util/settings';
import Transport from 'winston-transport';
import bind from 'bind-decorator';
import stringify from 'json-stable-stringify-without-jsonify';
import objectAssignDeep from 'object-assign-deep';
import {detailedDiff} from 'deep-object-diff';
import Extension from './extension';
import Device from '../model/device';
import Group from '../model/group';

const requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/(.*)`);

type Scene = {id: number, name: string};
type DefinitionPayload = {
    model: string, vendor: string, description: string, exposes: zhc.DefinitionExpose[], supports_ota:
    boolean, icon: string, options: zhc.DefinitionExpose[],
};

export default class Bridge extends Extension {
    private zigbee2mqttVersion: {commitHash: string, version: string};
    private coordinatorVersion: zh.CoordinatorVersion;
    private restartRequired = false;
    private lastJoinedDeviceIeeeAddr: string;
    private requestLookup: {[key: string]: (message: KeyValue | string) => Promise<MQTTResponse>};

    override async start(): Promise<void> {
        this.requestLookup = {
            'device/options': this.deviceOptions,
            'device/configure_reporting': this.deviceConfigureReporting,
            'device/remove': this.deviceRemove,
            'device/rename': this.deviceRename,
            'group/add': this.groupAdd,
            'group/options': this.groupOptions,
            'group/remove': this.groupRemove,
            'group/rename': this.groupRename,
            'permit_join': this.permitJoin,
            'restart': this.restart,
            'touchlink/factory_reset': this.touchlinkFactoryReset,
            'touchlink/identify': this.touchlinkIdentify,
            'touchlink/scan': this.touchlinkScan,
            'health_check': this.healthCheck,
            'options': this.bridgeOptions,
            // Below are deprecated
            'config/last_seen': this.configLastSeen,
            'config/homeassistant': this.configHomeAssistant,
            'config/elapsed': this.configElapsed,
            'config/log_level': this.configLogLevel,
        };

        const mqtt = this.mqtt;
        class EventTransport extends Transport {
            log(info: {message: string, level: string}, callback: () => void): void {
                const payload = stringify({message: info.message, level: info.level});
                mqtt.publish(`bridge/logging`, payload, {}, settings.get().mqtt.base_topic, true);
                callback();
            }
        }

        logger.addTransport(new EventTransport());

        this.zigbee2mqttVersion = await utils.getZigbee2MQTTVersion();
        this.coordinatorVersion = await this.zigbee.getCoordinatorVersion();

        this.eventBus.onEntityRenamed(this, () => this.publishInfo());
        this.eventBus.onGroupMembersChanged(this, () => this.publishGroups());
        this.eventBus.onDevicesChanged(this, () => this.publishDevices() && this.publishInfo());
        this.eventBus.onPermitJoinChanged(this, () => !this.zigbee.isStopping() && this.publishInfo());
        this.eventBus.onScenesChanged(this, () => {
            this.publishDevices();
            this.publishGroups();
        });

        // Zigbee events
        const publishEvent = (type: string, data: KeyValue): Promise<void> =>
            this.mqtt.publish('bridge/event', stringify({type, data}), {retain: false, qos: 0});
        this.eventBus.onDeviceJoined(this, (data) => {
            this.lastJoinedDeviceIeeeAddr = data.device.ieeeAddr;
            this.publishDevices();
            publishEvent('device_joined', {friendly_name: data.device.name, ieee_address: data.device.ieeeAddr});
        });
        this.eventBus.onDeviceLeave(this, (data) => {
            this.publishDevices();
            publishEvent('device_leave', {ieee_address: data.ieeeAddr, friendly_name: data.name});
        });
        this.eventBus.onDeviceNetworkAddressChanged(this, () => this.publishDevices());
        this.eventBus.onDeviceInterview(this, (data) => {
            this.publishDevices();
            const payload: KeyValue =
                {friendly_name: data.device.name, status: data.status, ieee_address: data.device.ieeeAddr};
            if (data.status === 'successful') {
                payload.supported = !!data.device.definition;
                payload.definition = this.getDefinitionPayload(data.device);
            }
            publishEvent('device_interview', payload);
        });
        this.eventBus.onDeviceAnnounce(this, (data) => {
            this.publishDevices();
            publishEvent('device_announce', {friendly_name: data.device.name, ieee_address: data.device.ieeeAddr});
        });

        await this.publishInfo();
        await this.publishDevices();
        await this.publishGroups();

        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const match = data.topic.match(requestRegex);
        const key = match?.[1]?.toLowerCase();
        if (key in this.requestLookup) {
            const message = utils.parseJSON(data.message, data.message);

            try {
                const response = await this.requestLookup[key](message);
                await this.mqtt.publish(`bridge/response/${match[1]}`, stringify(response));
            } catch (error) {
                logger.error(`Request '${data.topic}' failed with error: '${error.message}'`);
                logger.debug(error.stack);
                const response = utils.getResponse(message, {}, error.message);
                await this.mqtt.publish(`bridge/response/${match[1]}`, stringify(response));
            }
        }
    }

    /**
     * Requests
     */

    @bind async deviceOptions(message: KeyValue | string): Promise<MQTTResponse> {
        return this.changeEntityOptions('device', message);
    }

    @bind async groupOptions(message: KeyValue | string): Promise<MQTTResponse> {
        return this.changeEntityOptions('group', message);
    }

    @bind async bridgeOptions(message: KeyValue | string): Promise<MQTTResponse> {
        if (typeof message !== 'object' || typeof message.options !== 'object') {
            throw new Error(`Invalid payload`);
        }

        const diff: KeyValue = detailedDiff(settings.get(), message.options);

        // Remove any settings that are in the deleted.diff but not in the passed options
        const cleanupDeleted = (options: KeyValue, deleted: KeyValue): void => {
            for (const key of Object.keys(deleted)) {
                if (!(key in options)) {
                    delete deleted[key];
                } else if (!Array.isArray(options[key])) {
                    cleanupDeleted(options[key], deleted[key]);
                }
            }
        };
        cleanupDeleted(message.options, diff.deleted);

        const newSettings = objectAssignDeep({}, diff.added, diff.updated, diff.deleted);

        // deep-object-diff converts arrays to objects, set original array back here
        const convertBackArray = (before: KeyValue, after: KeyValue): void => {
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
            await this.enableDisableExtension(newSettings.homeassistant, 'HomeAssistant');
        }

        if (newSettings.hasOwnProperty('advanced') && newSettings.advanced.hasOwnProperty('log_level')) {
            logger.setLevel(newSettings.advanced.log_level);
        }

        logger.info('Succesfully changed options');
        this.publishInfo();
        return utils.getResponse(message, {restart_required: this.restartRequired}, null);
    }

    @bind async deviceRemove(message: string | KeyValue): Promise<MQTTResponse> {
        return this.removeEntity('device', message);
    }

    @bind async groupRemove(message: string | KeyValue): Promise<MQTTResponse> {
        return this.removeEntity('group', message);
    }

    @bind async healthCheck(message: string | KeyValue): Promise<MQTTResponse> {
        return utils.getResponse(message, {healthy: true}, null);
    }

    @bind async groupAdd(message: string | KeyValue): Promise<MQTTResponse> {
        if (typeof message === 'object' && !message.hasOwnProperty('friendly_name')) {
            throw new Error(`Invalid payload`);
        }

        const friendlyName = typeof message === 'object' ? message.friendly_name : message;
        const ID = typeof message === 'object' && message.hasOwnProperty('id') ? message.id : null;
        const group = settings.addGroup(friendlyName, ID);
        this.zigbee.createGroup(group.ID);
        this.publishGroups();
        return utils.getResponse(message, {friendly_name: group.friendly_name, id: group.ID}, null);
    }

    @bind async deviceRename(message: string | KeyValue): Promise<MQTTResponse> {
        return this.renameEntity('device', message);
    }

    @bind async groupRename(message: string | KeyValue): Promise<MQTTResponse> {
        return this.renameEntity('group', message);
    }

    @bind async restart(message: string | KeyValue): Promise<MQTTResponse> {
        // Wait 500 ms before restarting so response can be send.
        setTimeout(this.restartCallback, 500);
        logger.info('Restarting Zigbee2MQTT');
        return utils.getResponse(message, {}, null);
    }

    @bind async permitJoin(message: KeyValue | string): Promise<MQTTResponse> {
        if (typeof message === 'object' && !message.hasOwnProperty('value')) {
            throw new Error('Invalid payload');
        }

        let value: boolean | string;
        let time: number;
        let device: Device = null;
        if (typeof message === 'object') {
            value = message.value;
            time = message.time;
            if (message.device) {
                const resolved = this.zigbee.resolveEntity(message.device);
                if (resolved instanceof Device) {
                    device = resolved;
                } else {
                    throw new Error(`Device '${message.device}' does not exist`);
                }
            }
        } else {
            value = message;
        }

        if (typeof value === 'string') {
            value = value.toLowerCase() === 'true';
        }

        await this.zigbee.permitJoin(value, device, time);
        const response: {value: boolean, device?: string, time?: number} = {value};
        if (device && typeof message === 'object') response.device = message.device;
        if (time && typeof message === 'object') response.time = message.time;
        return utils.getResponse(message, response, null);
    }

    // Deprecated
    @bind async configLastSeen(message: KeyValue | string): Promise<MQTTResponse> {
        const allowed = ['disable', 'ISO_8601', 'epoch', 'ISO_8601_local'];
        const value = this.getValue(message);
        if (typeof value !== 'string' || !allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }

        settings.set(['advanced', 'last_seen'], value);
        this.publishInfo();
        return utils.getResponse(message, {value}, null);
    }

    // Deprecated
    @bind async configHomeAssistant(message: string | KeyValue): Promise<MQTTResponse> {
        const allowed = [true, false];
        const value = this.getValue(message);
        if (typeof value !== 'boolean' || !allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }

        await this.enableDisableExtension(value, 'HomeAssistant');
        settings.set(['homeassistant'], value);
        this.publishInfo();
        return utils.getResponse(message, {value}, null);
    }

    // Deprecated
    @bind async configElapsed(message: KeyValue | string): Promise<MQTTResponse> {
        const allowed = [true, false];
        const value = this.getValue(message);
        if (typeof value !== 'boolean' || !allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }

        settings.set(['advanced', 'elapsed'], value);
        this.publishInfo();
        return utils.getResponse(message, {value}, null);
    }

    // Deprecated
    @bind async configLogLevel(message: KeyValue | string): Promise<MQTTResponse> {
        const allowed = ['error', 'warn', 'info', 'debug'];
        const value = this.getValue(message) as 'error' | 'warn' | 'info' | 'debug';
        if (typeof value !== 'string' || !allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }

        logger.setLevel(value);
        this.publishInfo();
        return utils.getResponse(message, {value}, null);
    }

    @bind async touchlinkIdentify(message: KeyValue | string): Promise<MQTTResponse> {
        if (typeof message !== 'object' || !message.hasOwnProperty('ieee_address') ||
            !message.hasOwnProperty('channel')) {
            throw new Error('Invalid payload');
        }

        logger.info(`Start Touchlink identify of '${message.ieee_address}' on channel ${message.channel}`);
        await this.zigbee.touchlinkIdentify(message.ieee_address, message.channel);
        return utils.getResponse(message, {ieee_address: message.ieee_address, channel: message.channel}, null);
    }

    @bind async touchlinkFactoryReset(message: KeyValue | string): Promise<MQTTResponse> {
        let result = false;
        const payload: {ieee_address?: string, channel?: number} = {};
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

    @bind async touchlinkScan(message: KeyValue | string): Promise<MQTTResponse> {
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

    getValue(message: KeyValue | string): string | boolean | number {
        if (typeof message === 'object') {
            if (!message.hasOwnProperty('value')) {
                throw new Error('No value given');
            }

            return message.value;
        } else {
            return message;
        }
    }

    async changeEntityOptions(entityType: 'device' | 'group', message: KeyValue | string): Promise<MQTTResponse> {
        if (typeof message !== 'object' || !message.hasOwnProperty('id') || !message.hasOwnProperty('options')) {
            throw new Error(`Invalid payload`);
        }

        const cleanup = (o: KeyValue): KeyValue => {
            delete o.friendlyName; delete o.friendly_name; delete o.ID; delete o.type; delete o.devices;
            return o;
        };

        const ID = message.id;
        const entity = this.getEntity(entityType, ID);
        const oldOptions = objectAssignDeep({}, cleanup(entity.options));
        settings.changeEntityOptions(ID, message.options);
        const newOptions = cleanup(entity.options);
        await this.publishInfo();

        logger.info(`Changed config for ${entityType} ${ID}`);

        this.eventBus.emitEntityOptionsChanged({from: oldOptions, to: newOptions, entity});
        return utils.getResponse(message, {from: oldOptions, to: newOptions, id: ID}, null);
    }

    @bind async deviceConfigureReporting(message: string | KeyValue): Promise<MQTTResponse> {
        if (typeof message !== 'object' || !message.hasOwnProperty('id') || !message.hasOwnProperty('cluster') ||
            !message.hasOwnProperty('maximum_report_interval') || !message.hasOwnProperty('minimum_report_interval') ||
            !message.hasOwnProperty('reportable_change') || !message.hasOwnProperty('attribute')) {
            throw new Error(`Invalid payload`);
        }

        const parsedID = utils.parseEntityID(message.id);
        const endpoint = (this.getEntity('device', parsedID.ID) as Device).endpoint(parsedID.endpoint);

        const coordinatorEndpoint = this.zigbee.firstCoordinatorEndpoint();
        await endpoint.bind(message.cluster, coordinatorEndpoint);

        await endpoint.configureReporting(message.cluster, [{
            attribute: message.attribute, minimumReportInterval: message.minimum_report_interval,
            maximumReportInterval: message.maximum_report_interval, reportableChange: message.reportable_change,
        }], message.options);

        this.publishDevices();

        logger.info(`Configured reporting for '${message.id}', '${message.cluster}.${message.attribute}'`);

        return utils.getResponse(message, {
            id: message.id, cluster: message.cluster, maximum_report_interval: message.maximum_report_interval,
            minimum_report_interval: message.minimum_report_interval, reportable_change: message.reportable_change,
            attribute: message.attribute,
        }, null);
    }

    async renameEntity(entityType: 'group' | 'device', message: string | KeyValue): Promise<MQTTResponse> {
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
        const oldFriendlyName = entity.options.friendly_name;

        settings.changeFriendlyName(from, to);

        // Clear retained messages
        this.mqtt.publish(oldFriendlyName, '', {retain: true});

        this.eventBus.emitEntityRenamed({entity: entity, homeAssisantRename, from: oldFriendlyName, to});

        if (entity instanceof Device) {
            this.publishDevices();
        } else {
            this.publishGroups();
            this.publishInfo();
        }

        // Repulish entity state
        this.publishEntityState(entity, {});

        return utils.getResponse(
            message,
            {from: oldFriendlyName, to, homeassistant_rename: homeAssisantRename},
            null,
        );
    }

    async removeEntity(entityType: 'group' | 'device', message: string | KeyValue): Promise<MQTTResponse> {
        const ID = typeof message === 'object' ? message.id : message.trim();
        const entity = this.getEntity(entityType, ID);
        const friendlyName = entity.name;
        const entityID = entity.ID;

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
            logger.info(`Removing ${entityType} '${entity.name}'${blockForceLog}`);
            const ieeeAddr = entity.isDevice() && entity.ieeeAddr;
            const name = entity.name;

            if (entity instanceof Device) {
                if (block) {
                    settings.blockDevice(entity.ieeeAddr);
                }

                if (force) {
                    await entity.zh.removeFromDatabase();
                } else {
                    await entity.zh.removeFromNetwork();
                }
            } else {
                if (force) {
                    entity.zh.removeFromDatabase();
                } else {
                    await entity.zh.removeFromNetwork();
                }
            }

            // Fire event
            if (entity instanceof Device) {
                this.eventBus.emitDeviceRemoved({ieeeAddr, name});
            }

            // Remove from configuration.yaml
            if (entity instanceof Device) {
                settings.removeDevice(entityID as string);
            } else {
                settings.removeGroup(entityID);
            }

            // Remove from state
            this.state.remove(entityID);

            // Clear any retained messages
            this.mqtt.publish(friendlyName, '', {retain: true});

            logger.info(`Successfully removed ${entityType} '${friendlyName}'${blockForceLog}`);

            if (entity instanceof Device) {
                this.publishGroups();
                this.publishDevices();
                return utils.getResponse(message, {id: ID, block, force}, null);
            } else {
                this.publishGroups();
                return utils.getResponse(message, {id: ID, force: force}, null);
            }
        } catch (error) {
            throw new Error(
                `Failed to remove ${entityType} '${friendlyName}'${blockForceLog} (${error})`,
            );
        }
    }

    getEntity(type: 'group' | 'device', ID: string): Device | Group {
        const entity = this.zigbee.resolveEntity(ID);
        if (!entity || entity.constructor.name.toLowerCase() !== type) {
            throw new Error(`${utils.capitalize(type)} '${ID}' does not exist`);
        }
        return entity;
    }

    async publishInfo(): Promise<void> {
        const config = objectAssignDeep({}, settings.get());
        delete config.advanced.network_key;
        delete config.mqtt.password;
        config.frontend && delete config.frontend.auth_token;
        const payload = {
            version: this.zigbee2mqttVersion.version,
            commit: this.zigbee2mqttVersion.commitHash,
            coordinator: {
                ieee_address: this.zigbee.firstCoordinatorEndpoint().getDevice().ieeeAddr,
                ...this.coordinatorVersion,
            },
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

    private getScenes(entity: zh.Endpoint | zh.Group): Scene[] {
        const scenes: {[id: number]: Scene} = {};
        const endpoints = utils.isEndpoint(entity) ? [entity] : entity.members;
        const groupID = utils.isEndpoint(entity) ? 0 : entity.groupID;

        for (const endpoint of endpoints) {
            for (const [key, data] of Object.entries(endpoint.meta?.scenes || {})) {
                const split = key.split('_');
                const sceneID = parseInt(split[0], 10);
                const sceneGroupID = parseInt(split[1], 10);
                if (sceneGroupID === groupID) {
                    scenes[sceneID] = {id: sceneID, name: (data as KeyValue).name || `Scene ${sceneID}`};
                }
            }
        }

        return Object.values(scenes);
    }

    async publishDevices(): Promise<void> {
        interface Data {
            bindings: {cluster: string, target: {type: string, endpoint?: number, ieee_address?: string, id?: number}}[]
            configured_reportings: {cluster: string, attribute: string | number,
                minimum_report_interval: number, maximum_report_interval: number, reportable_change: number}[],
            clusters: {input: string[], output: string[]}, scenes: Scene[]
        }

        const devices = this.zigbee.devices().map((device) => {
            const endpoints: {[s: number]: Data} = {};
            for (const endpoint of device.zh.endpoints) {
                const data: Data = {
                    scenes: this.getScenes(endpoint),
                    bindings: [],
                    configured_reportings: [],
                    clusters: {
                        input: endpoint.getInputClusters().map((c) => c.name),
                        output: endpoint.getOutputClusters().map((c) => c.name),
                    },
                };

                for (const bind of endpoint.binds) {
                    const target = utils.isEndpoint(bind.target) ?
                        {type: 'endpoint', ieee_address: bind.target.getDevice().ieeeAddr, endpoint: bind.target.ID} :
                        {type: 'group', id: bind.target.groupID};
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
                type: device.zh.type,
                network_address: device.zh.networkAddress,
                supported: !!device.definition,
                friendly_name: device.name,
                description: device.options.description,
                definition: this.getDefinitionPayload(device),
                power_source: device.zh.powerSource,
                software_build_id: device.zh.softwareBuildID,
                date_code: device.zh.dateCode,
                model_id: device.zh.modelID,
                interviewing: device.zh.interviewing,
                interview_completed: device.zh.interviewCompleted,
                manufacturer: device.zh.manufacturerName,
                endpoints,
            };
        });

        await this.mqtt.publish('bridge/devices', stringify(devices),
            {retain: true, qos: 0}, settings.get().mqtt.base_topic, true);
    }

    async publishGroups(): Promise<void> {
        const groups = this.zigbee.groups().map((g) => {
            return {
                id: g.ID,
                friendly_name: g.ID === 901 ? 'default_bind_group' : g.name,
                description: g.options.description,
                scenes: this.getScenes(g.zh),
                members: g.zh.members.map((e) => {
                    return {ieee_address: e.getDevice().ieeeAddr, endpoint: e.ID};
                }),
            };
        });
        await this.mqtt.publish(
            'bridge/groups', stringify(groups), {retain: true, qos: 0}, settings.get().mqtt.base_topic, true);
    }

    getDefinitionPayload(device: Device): DefinitionPayload {
        if (!device.definition) return null;
        let icon = device.options.icon ? device.options.icon : device.definition.icon;
        if (icon) {
            icon = icon.replace('${zigbeeModel}', utils.sanitizeImageParameter(device.zh.modelID));
            icon = icon.replace('${model}', utils.sanitizeImageParameter(device.definition.model));
        }

        return {
            model: device.definition.model,
            vendor: device.definition.vendor,
            description: device.definition.description,
            exposes: device.exposes(),
            supports_ota: !!device.definition.ota,
            options: device.definition.options,
            icon,
        };
    }
}
