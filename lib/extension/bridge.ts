import fs from 'fs';

import bind from 'bind-decorator';
import stringify from 'json-stable-stringify-without-jsonify';
import JSZip from 'jszip';
import objectAssignDeep from 'object-assign-deep';
import winston from 'winston';
import Transport from 'winston-transport';

import * as zhc from 'zigbee-herdsman-converters';
import {Clusters} from 'zigbee-herdsman/dist/zspec/zcl/definition/cluster';
import {ClusterDefinition, ClusterName, CustomClusters} from 'zigbee-herdsman/dist/zspec/zcl/definition/tstype';

import Device from '../model/device';
import Group from '../model/group';
import data from '../util/data';
import logger from '../util/logger';
import * as settings from '../util/settings';
import utils from '../util/utils';
import Extension from './extension';

const requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/(.*)`);

type DefinitionPayload = {
    model: string;
    vendor: string;
    description: string;
    exposes: zhc.Expose[];
    supports_ota: boolean;
    icon: string;
    options: zhc.Option[];
};

export default class Bridge extends Extension {
    // @ts-expect-error initialized in `start`
    private zigbee2mqttVersion: {commitHash?: string; version: string};
    // @ts-expect-error initialized in `start`
    private zigbeeHerdsmanVersion: {version: string};
    // @ts-expect-error initialized in `start`
    private zigbeeHerdsmanConvertersVersion: {version: string};
    // @ts-expect-error initialized in `start`
    private coordinatorVersion: zh.CoordinatorVersion;
    private restartRequired = false;
    private lastJoinedDeviceIeeeAddr?: string;
    private lastBridgeLoggingPayload?: string;
    // @ts-expect-error initialized in `start`
    private logTransport: winston.transport;
    // @ts-expect-error initialized in `start`
    private requestLookup: {[key: string]: (message: KeyValue | string) => Promise<MQTTResponse>};

    override async start(): Promise<void> {
        this.requestLookup = {
            'device/options': this.deviceOptions,
            'device/configure_reporting': this.deviceConfigureReporting,
            'device/remove': this.deviceRemove,
            'device/interview': this.deviceInterview,
            'device/generate_external_definition': this.deviceGenerateExternalDefinition,
            'device/rename': this.deviceRename,
            'group/add': this.groupAdd,
            'group/options': this.groupOptions,
            'group/remove': this.groupRemove,
            'group/rename': this.groupRename,
            permit_join: this.permitJoin,
            restart: this.restart,
            backup: this.backup,
            'touchlink/factory_reset': this.touchlinkFactoryReset,
            'touchlink/identify': this.touchlinkIdentify,
            'install_code/add': this.installCodeAdd,
            'touchlink/scan': this.touchlinkScan,
            health_check: this.healthCheck,
            coordinator_check: this.coordinatorCheck,
            options: this.bridgeOptions,
            // Below are deprecated
            'config/last_seen': this.configLastSeen,
            'config/homeassistant': this.configHomeAssistant,
            'config/elapsed': this.configElapsed,
            'config/log_level': this.configLogLevel,
        };

        const debugToMQTTFrontend = settings.get().advanced.log_debug_to_mqtt_frontend;
        const baseTopic = settings.get().mqtt.base_topic;

        const bridgeLogging = (message: string, level: string, namespace: string): void => {
            const payload = stringify({message, level, namespace});

            if (payload !== this.lastBridgeLoggingPayload) {
                this.lastBridgeLoggingPayload = payload;
                void this.mqtt.publish(`bridge/logging`, payload, {}, baseTopic, true);
            }
        };

        if (debugToMQTTFrontend) {
            class DebugEventTransport extends Transport {
                log(info: {message: string; level: string; namespace: string}, next: () => void): void {
                    bridgeLogging(info.message, info.level, info.namespace);
                    next();
                }
            }

            this.logTransport = new DebugEventTransport();
        } else {
            class EventTransport extends Transport {
                log(info: {message: string; level: string; namespace: string}, next: () => void): void {
                    if (info.level !== 'debug') {
                        bridgeLogging(info.message, info.level, info.namespace);
                    }
                    next();
                }
            }

            this.logTransport = new EventTransport();
        }

        logger.addTransport(this.logTransport);

        this.zigbee2mqttVersion = await utils.getZigbee2MQTTVersion();
        this.zigbeeHerdsmanVersion = await utils.getDependencyVersion('zigbee-herdsman');
        this.zigbeeHerdsmanConvertersVersion = await utils.getDependencyVersion('zigbee-herdsman-converters');
        this.coordinatorVersion = await this.zigbee.getCoordinatorVersion();

        this.eventBus.onEntityRenamed(this, async () => {
            await this.publishInfo();
        });
        this.eventBus.onGroupMembersChanged(this, async () => {
            await this.publishGroups();
        });
        this.eventBus.onDevicesChanged(this, async () => {
            await this.publishDevices();
            await this.publishInfo();
            await this.publishDefinitions();
        });
        this.eventBus.onPermitJoinChanged(this, async () => {
            if (!this.zigbee.isStopping()) {
                await this.publishInfo();
            }
        });
        this.eventBus.onScenesChanged(this, async () => {
            await this.publishDevices();
            await this.publishGroups();
        });

        // Zigbee events
        const publishEvent = async (type: string, data: KeyValue): Promise<void> =>
            await this.mqtt.publish('bridge/event', stringify({type, data}), {retain: false, qos: 0});
        this.eventBus.onDeviceJoined(this, async (data) => {
            this.lastJoinedDeviceIeeeAddr = data.device.ieeeAddr;
            await this.publishDevices();
            await publishEvent('device_joined', {friendly_name: data.device.name, ieee_address: data.device.ieeeAddr});
        });
        this.eventBus.onDeviceLeave(this, async (data) => {
            await this.publishDevices();
            await this.publishDefinitions();
            await publishEvent('device_leave', {ieee_address: data.ieeeAddr, friendly_name: data.name});
        });
        this.eventBus.onDeviceNetworkAddressChanged(this, async () => {
            await this.publishDevices();
        });
        this.eventBus.onDeviceInterview(this, async (data) => {
            await this.publishDevices();
            const payload: KeyValue = {friendly_name: data.device.name, status: data.status, ieee_address: data.device.ieeeAddr};

            if (data.status === 'successful') {
                payload.supported = data.device.isSupported;
                payload.definition = this.getDefinitionPayload(data.device);
            }

            await publishEvent('device_interview', payload);
        });
        this.eventBus.onDeviceAnnounce(this, async (data) => {
            await this.publishDevices();
            await publishEvent('device_announce', {friendly_name: data.device.name, ieee_address: data.device.ieeeAddr});
        });

        await this.publishInfo();
        await this.publishDevices();
        await this.publishGroups();
        await this.publishDefinitions();

        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
    }

    override async stop(): Promise<void> {
        await super.stop();
        logger.removeTransport(this.logTransport);
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const match = data.topic.match(requestRegex);

        if (!match) {
            return;
        }

        const key = match[1].toLowerCase();

        if (key in this.requestLookup) {
            const message = utils.parseJSON(data.message, data.message);

            try {
                const response = await this.requestLookup[key](message);
                await this.mqtt.publish(`bridge/response/${match[1]}`, stringify(response));
            } catch (error) {
                logger.error(`Request '${data.topic}' failed with error: '${(error as Error).message}'`);
                logger.debug((error as Error).stack!);
                const response = utils.getResponse(message, {}, (error as Error).message);
                await this.mqtt.publish(`bridge/response/${match[1]}`, stringify(response));
            }
        }
    }

    /**
     * Requests
     */

    @bind async deviceOptions(message: KeyValue | string): Promise<MQTTResponse> {
        return await this.changeEntityOptions('device', message);
    }

    @bind async groupOptions(message: KeyValue | string): Promise<MQTTResponse> {
        return await this.changeEntityOptions('group', message);
    }

    @bind async bridgeOptions(message: KeyValue | string): Promise<MQTTResponse> {
        if (typeof message !== 'object' || typeof message.options !== 'object') {
            throw new Error(`Invalid payload`);
        }

        const newSettings = message.options;
        const restartRequired = settings.apply(newSettings);
        if (restartRequired) this.restartRequired = true;

        // Apply some settings on-the-fly.
        if (newSettings.permit_join != undefined) {
            await this.zigbee.permitJoin(settings.get().permit_join);
        }

        if (newSettings.homeassistant != undefined) {
            await this.enableDisableExtension(!!settings.get().homeassistant, 'HomeAssistant');
        }

        if (newSettings.advanced?.log_level != undefined) {
            logger.setLevel(settings.get().advanced.log_level);
        }

        if (newSettings.advanced?.log_namespaced_levels != undefined) {
            logger.setNamespacedLevels(settings.get().advanced.log_namespaced_levels);
        }

        if (newSettings.advanced?.log_debug_namespace_ignore != undefined) {
            logger.setDebugNamespaceIgnore(settings.get().advanced.log_debug_namespace_ignore);
        }

        logger.info('Successfully changed options');
        await this.publishInfo();
        return utils.getResponse(message, {restart_required: this.restartRequired});
    }

    @bind async deviceRemove(message: string | KeyValue): Promise<MQTTResponse> {
        return await this.removeEntity('device', message);
    }

    @bind async groupRemove(message: string | KeyValue): Promise<MQTTResponse> {
        return await this.removeEntity('group', message);
    }

    @bind async healthCheck(message: string | KeyValue): Promise<MQTTResponse> {
        return utils.getResponse(message, {healthy: true});
    }

    @bind async coordinatorCheck(message: string | KeyValue): Promise<MQTTResponse> {
        const result = await this.zigbee.coordinatorCheck();
        const missingRouters = result.missingRouters.map((d) => {
            return {ieee_address: d.ieeeAddr, friendly_name: d.name};
        });
        return utils.getResponse(message, {missing_routers: missingRouters});
    }

    @bind async groupAdd(message: string | KeyValue): Promise<MQTTResponse> {
        if (typeof message === 'object' && message.friendly_name === undefined) {
            throw new Error(`Invalid payload`);
        }

        const friendlyName = typeof message === 'object' ? message.friendly_name : message;
        const ID = typeof message === 'object' && message.id !== undefined ? message.id : null;
        const group = settings.addGroup(friendlyName, ID);
        this.zigbee.createGroup(group.ID);
        await this.publishGroups();
        return utils.getResponse(message, {friendly_name: group.friendly_name, id: group.ID});
    }

    @bind async deviceRename(message: string | KeyValue): Promise<MQTTResponse> {
        return await this.renameEntity('device', message);
    }

    @bind async groupRename(message: string | KeyValue): Promise<MQTTResponse> {
        return await this.renameEntity('group', message);
    }

    @bind async restart(message: string | KeyValue): Promise<MQTTResponse> {
        // Wait 500 ms before restarting so response can be send.
        setTimeout(this.restartCallback, 500);
        logger.info('Restarting Zigbee2MQTT');
        return utils.getResponse(message, {});
    }

    @bind async backup(message: string | KeyValue): Promise<MQTTResponse> {
        await this.zigbee.backup();
        const dataPath = data.getPath();
        const files = utils
            .getAllFiles(dataPath)
            .map((f) => [f, f.substring(dataPath.length + 1)])
            .filter((f) => !f[1].startsWith('log'));
        const zip = new JSZip();
        files.forEach((f) => zip.file(f[1], fs.readFileSync(f[0])));
        const base64Zip = await zip.generateAsync({type: 'base64'});
        return utils.getResponse(message, {zip: base64Zip});
    }

    @bind async installCodeAdd(message: KeyValue | string): Promise<MQTTResponse> {
        if (typeof message === 'object' && message.value === undefined) {
            throw new Error('Invalid payload');
        }

        const value = typeof message === 'object' ? message.value : message;
        await this.zigbee.addInstallCode(value);
        logger.info('Successfully added new install code');
        return utils.getResponse(message, {value});
    }

    @bind async permitJoin(message: KeyValue | string): Promise<MQTTResponse> {
        if (typeof message === 'object' && message.value === undefined) {
            throw new Error('Invalid payload');
        }

        let value: boolean | string;
        let time: number | undefined;
        let device: Device | undefined;

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

        const response: {value: boolean; device?: string; time?: number} = {value};

        if (typeof message === 'object') {
            if (device) {
                response.device = message.device;
            }

            if (time != undefined) {
                response.time = message.time;
            }
        }

        return utils.getResponse(message, response);
    }

    // Deprecated
    @bind async configLastSeen(message: KeyValue | string): Promise<MQTTResponse> {
        const allowed = ['disable', 'ISO_8601', 'epoch', 'ISO_8601_local'];
        const value = this.getValue(message);
        if (typeof value !== 'string' || !allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }

        settings.set(['advanced', 'last_seen'], value);
        await this.publishInfo();
        return utils.getResponse(message, {value});
    }

    // Deprecated
    @bind async configHomeAssistant(message: string | KeyValue): Promise<MQTTResponse> {
        const allowed = [true, false];
        const value = this.getValue(message);
        if (typeof value !== 'boolean' || !allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }

        settings.set(['homeassistant'], value);
        await this.enableDisableExtension(value, 'HomeAssistant');
        await this.publishInfo();
        return utils.getResponse(message, {value});
    }

    // Deprecated
    @bind async configElapsed(message: KeyValue | string): Promise<MQTTResponse> {
        const allowed = [true, false];
        const value = this.getValue(message);
        if (typeof value !== 'boolean' || !allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }

        settings.set(['advanced', 'elapsed'], value);
        await this.publishInfo();
        return utils.getResponse(message, {value});
    }

    // Deprecated
    @bind async configLogLevel(message: KeyValue | string): Promise<MQTTResponse> {
        const value = this.getValue(message) as settings.LogLevel;
        if (typeof value !== 'string' || !settings.LOG_LEVELS.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${settings.LOG_LEVELS}`);
        }

        logger.setLevel(value);
        await this.publishInfo();
        return utils.getResponse(message, {value});
    }

    @bind async touchlinkIdentify(message: KeyValue | string): Promise<MQTTResponse> {
        if (typeof message !== 'object' || message.ieee_address === undefined || message.channel === undefined) {
            throw new Error('Invalid payload');
        }

        logger.info(`Start Touchlink identify of '${message.ieee_address}' on channel ${message.channel}`);
        await this.zigbee.touchlinkIdentify(message.ieee_address, message.channel);
        return utils.getResponse(message, {ieee_address: message.ieee_address, channel: message.channel});
    }

    @bind async touchlinkFactoryReset(message: KeyValue | string): Promise<MQTTResponse> {
        let result = false;
        const payload: {ieee_address?: string; channel?: number} = {};
        if (typeof message === 'object' && message.ieee_address !== undefined && message.channel !== undefined) {
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
            return utils.getResponse(message, payload);
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
        return utils.getResponse(message, {found});
    }

    /**
     * Utils
     */

    getValue(message: KeyValue | string): string | boolean | number {
        if (typeof message === 'object') {
            if (message.value === undefined) {
                throw new Error('No value given');
            }

            return message.value;
        } else {
            return message;
        }
    }

    async changeEntityOptions(entityType: 'device' | 'group', message: KeyValue | string): Promise<MQTTResponse> {
        if (typeof message !== 'object' || message.id === undefined || message.options === undefined) {
            throw new Error(`Invalid payload`);
        }

        const cleanup = (o: KeyValue): KeyValue => {
            delete o.friendlyName;
            delete o.friendly_name;
            delete o.ID;
            delete o.type;
            delete o.devices;
            return o;
        };

        const ID = message.id;
        const entity = this.getEntity(entityType, ID);
        const oldOptions = objectAssignDeep({}, cleanup(entity.options));
        const restartRequired = settings.changeEntityOptions(ID, message.options);
        if (restartRequired) this.restartRequired = true;
        const newOptions = cleanup(entity.options);
        await this.publishInfo();

        logger.info(`Changed config for ${entityType} ${ID}`);

        this.eventBus.emitEntityOptionsChanged({from: oldOptions, to: newOptions, entity});
        return utils.getResponse(message, {from: oldOptions, to: newOptions, id: ID, restart_required: this.restartRequired});
    }

    @bind async deviceConfigureReporting(message: string | KeyValue): Promise<MQTTResponse> {
        if (
            typeof message !== 'object' ||
            message.id === undefined ||
            message.cluster === undefined ||
            message.maximum_report_interval === undefined ||
            message.minimum_report_interval === undefined ||
            message.reportable_change === undefined ||
            message.attribute === undefined
        ) {
            throw new Error(`Invalid payload`);
        }

        const device = this.zigbee.resolveEntityAndEndpoint(message.id);
        if (!device.entity) {
            throw new Error(`Device '${message.id}' does not exist`);
        }

        const endpoint = device.endpoint;
        if (!endpoint) {
            throw new Error(`Device '${device.ID}' does not have endpoint '${device.endpointID}'`);
        }

        const coordinatorEndpoint = this.zigbee.firstCoordinatorEndpoint();
        await endpoint.bind(message.cluster, coordinatorEndpoint);

        await endpoint.configureReporting(
            message.cluster,
            [
                {
                    attribute: message.attribute,
                    minimumReportInterval: message.minimum_report_interval,
                    maximumReportInterval: message.maximum_report_interval,
                    reportableChange: message.reportable_change,
                },
            ],
            message.options,
        );

        await this.publishDevices();

        logger.info(`Configured reporting for '${message.id}', '${message.cluster}.${message.attribute}'`);

        return utils.getResponse(message, {
            id: message.id,
            cluster: message.cluster,
            maximum_report_interval: message.maximum_report_interval,
            minimum_report_interval: message.minimum_report_interval,
            reportable_change: message.reportable_change,
            attribute: message.attribute,
        });
    }

    @bind async deviceInterview(message: string | KeyValue): Promise<MQTTResponse> {
        if (typeof message !== 'object' || message.id === undefined) {
            throw new Error(`Invalid payload`);
        }

        const device = this.getEntity('device', message.id) as Device;
        logger.info(`Interviewing '${device.name}'`);

        try {
            await device.zh.interview(true);
            logger.info(`Successfully interviewed '${device.name}'`);
        } catch (error) {
            throw new Error(`interview of '${device.name}' (${device.ieeeAddr}) failed: ${error}`, {cause: error});
        }

        // A re-interview can for example result in a different modelId, therefore reconsider the definition.
        await device.resolveDefinition(true);
        this.eventBus.emitDevicesChanged();
        this.eventBus.emitExposesChanged({device});

        return utils.getResponse(message, {id: message.id});
    }

    @bind async deviceGenerateExternalDefinition(message: string | KeyValue): Promise<MQTTResponse> {
        if (typeof message !== 'object' || message.id === undefined) {
            throw new Error(`Invalid payload`);
        }

        const device = this.zigbee.resolveEntityAndEndpoint(message.id).entity as Device;

        if (!device) {
            throw new Error(`Device '${message.id}' does not exist`);
        }

        const source = await zhc.generateExternalDefinitionSource(device.zh);

        return utils.getResponse(message, {id: message.id, source});
    }

    async renameEntity(entityType: 'group' | 'device', message: string | KeyValue): Promise<MQTTResponse> {
        const deviceAndHasLast = entityType === 'device' && typeof message === 'object' && message.last === true;

        if (typeof message !== 'object' || (message.from === undefined && !deviceAndHasLast) || message.to === undefined) {
            throw new Error(`Invalid payload`);
        }

        if (deviceAndHasLast && !this.lastJoinedDeviceIeeeAddr) {
            throw new Error('No device has joined since start');
        }

        const from = deviceAndHasLast ? this.lastJoinedDeviceIeeeAddr : message.from;
        const to = message.to;
        const homeAssisantRename = message.homeassistant_rename !== undefined ? message.homeassistant_rename : false;
        const entity = this.getEntity(entityType, from);
        const oldFriendlyName = entity.options.friendly_name;

        settings.changeFriendlyName(from, to);

        // Clear retained messages
        await this.mqtt.publish(oldFriendlyName, '', {retain: true});

        this.eventBus.emitEntityRenamed({entity: entity, homeAssisantRename, from: oldFriendlyName, to});

        if (entity instanceof Device) {
            await this.publishDevices();
        } else {
            await this.publishGroups();
            await this.publishInfo();
        }

        // Republish entity state
        await this.publishEntityState(entity, {});

        return utils.getResponse(message, {from: oldFriendlyName, to, homeassistant_rename: homeAssisantRename});
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
            const name = entity.name;

            if (entity instanceof Device) {
                if (block) {
                    settings.blockDevice(entity.ieeeAddr);
                }

                if (force) {
                    entity.zh.removeFromDatabase();
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
                this.eventBus.emitEntityRemoved({id: entityID, name, type: 'device'});
            } else {
                this.eventBus.emitEntityRemoved({id: entityID, name, type: 'group'});
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
            await this.mqtt.publish(friendlyName, '', {retain: true});

            logger.info(`Successfully removed ${entityType} '${friendlyName}'${blockForceLog}`);

            if (entity instanceof Device) {
                await this.publishGroups();
                await this.publishDevices();
                // Refresh Cluster definition
                await this.publishDefinitions();
                return utils.getResponse(message, {id: ID, block, force});
            } else {
                await this.publishGroups();
                return utils.getResponse(message, {id: ID, force: force});
            }
        } catch (error) {
            throw new Error(`Failed to remove ${entityType} '${friendlyName}'${blockForceLog} (${error})`);
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
        // @ts-expect-error hidden from publish
        delete config.advanced.network_key;
        delete config.mqtt.password;

        if (config.frontend) {
            delete config.frontend.auth_token;
        }

        const payload = {
            version: this.zigbee2mqttVersion.version,
            commit: this.zigbee2mqttVersion.commitHash,
            zigbee_herdsman_converters: this.zigbeeHerdsmanConvertersVersion,
            zigbee_herdsman: this.zigbeeHerdsmanVersion,
            coordinator: {
                ieee_address: this.zigbee.firstCoordinatorEndpoint().getDevice().ieeeAddr,
                ...this.coordinatorVersion,
            },
            network: utils.toSnakeCaseObject(await this.zigbee.getNetworkParameters()),
            log_level: logger.getLevel(),
            permit_join: this.zigbee.getPermitJoin(),
            permit_join_timeout: this.zigbee.getPermitJoinTimeout(),
            restart_required: this.restartRequired,
            config,
            config_schema: settings.schema,
        };

        await this.mqtt.publish('bridge/info', stringify(payload), {retain: true, qos: 0}, settings.get().mqtt.base_topic, true);
    }

    async publishDevices(): Promise<void> {
        interface Data {
            bindings: {cluster: string; target: {type: string; endpoint?: number; ieee_address?: string; id?: number}}[];
            configured_reportings: {
                cluster: string;
                attribute: string | number;
                minimum_report_interval: number;
                maximum_report_interval: number;
                reportable_change: number;
            }[];
            clusters: {input: string[]; output: string[]};
            scenes: Scene[];
        }

        // XXX: definition<>DefinitionPayload don't match to use `Device[]` type here
        const devices: KeyValue[] = [];

        for (const device of this.zigbee.devicesIterator()) {
            const endpoints: {[s: number]: Data} = {};

            for (const endpoint of device.zh.endpoints) {
                const data: Data = {
                    scenes: utils.getScenes(endpoint),
                    bindings: [],
                    configured_reportings: [],
                    clusters: {
                        input: endpoint.getInputClusters().map((c) => c.name),
                        output: endpoint.getOutputClusters().map((c) => c.name),
                    },
                };

                for (const bind of endpoint.binds) {
                    const target = utils.isZHEndpoint(bind.target)
                        ? {type: 'endpoint', ieee_address: bind.target.getDevice().ieeeAddr, endpoint: bind.target.ID}
                        : {type: 'group', id: bind.target.groupID};
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

            devices.push({
                ieee_address: device.ieeeAddr,
                type: device.zh.type,
                network_address: device.zh.networkAddress,
                supported: device.isSupported,
                friendly_name: device.name,
                disabled: !!device.options.disabled,
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
            });
        }

        await this.mqtt.publish('bridge/devices', stringify(devices), {retain: true, qos: 0}, settings.get().mqtt.base_topic, true);
    }

    async publishGroups(): Promise<void> {
        // XXX: id<>ID can't use `Group[]` type
        const groups: KeyValue[] = [];

        for (const group of this.zigbee.groupsIterator()) {
            const members = [];

            for (const member of group.zh.members) {
                members.push({ieee_address: member.getDevice().ieeeAddr, endpoint: member.ID});
            }

            groups.push({
                id: group.ID,
                friendly_name: group.ID === 901 ? 'default_bind_group' : group.name,
                description: group.options.description,
                scenes: utils.getScenes(group.zh),
                members,
            });
        }

        await this.mqtt.publish('bridge/groups', stringify(groups), {retain: true, qos: 0}, settings.get().mqtt.base_topic, true);
    }

    async publishDefinitions(): Promise<void> {
        interface ClusterDefinitionPayload {
            clusters: Readonly<Record<ClusterName, Readonly<ClusterDefinition>>>;
            custom_clusters: {[key: string]: CustomClusters};
        }

        const data: ClusterDefinitionPayload = {
            clusters: Clusters,
            custom_clusters: {},
        };

        for (const device of this.zigbee.devicesIterator((d) => !utils.objectIsEmpty(d.customClusters))) {
            data.custom_clusters[device.ieeeAddr] = device.customClusters;
        }

        await this.mqtt.publish('bridge/definitions', stringify(data), {retain: true, qos: 0}, settings.get().mqtt.base_topic, true);
    }

    getDefinitionPayload(device: Device): DefinitionPayload | undefined {
        if (!device.definition) {
            return undefined;
        }

        // TODO: better typing to avoid @ts-expect-error
        // @ts-expect-error icon is valid for external definitions
        const definitionIcon = device.definition.icon;
        let icon = device.options.icon ?? definitionIcon;

        if (icon) {
            /* istanbul ignore next */
            icon = icon.replace('${zigbeeModel}', utils.sanitizeImageParameter(device.zh.modelID ?? ''));
            icon = icon.replace('${model}', utils.sanitizeImageParameter(device.definition.model));
        }

        const payload: DefinitionPayload = {
            model: device.definition.model,
            vendor: device.definition.vendor,
            description: device.definition.description,
            exposes: device.exposes(),
            supports_ota: !!device.definition.ota,
            options: device.definition.options ?? [],
            icon,
        };

        return payload;
    }
}
