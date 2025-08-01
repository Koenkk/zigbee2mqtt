import fs from "node:fs";
import bind from "bind-decorator";
import stringify from "json-stable-stringify-without-jsonify";
import JSZip from "jszip";
import objectAssignDeep from "object-assign-deep";
import type winston from "winston";
import Transport from "winston-transport";
import {Zcl} from "zigbee-herdsman";
import {InterviewState} from "zigbee-herdsman/dist/controller/model/device";
import * as zhc from "zigbee-herdsman-converters";
import Device from "../model/device";
import type Group from "../model/group";
import type {Zigbee2MQTTAPI, Zigbee2MQTTDevice, Zigbee2MQTTResponse, Zigbee2MQTTResponseEndpoints} from "../types/api";
import data from "../util/data";
import logger from "../util/logger";
import * as settings from "../util/settings";
import utils, {assertString, DEFAULT_BIND_GROUP_ID} from "../util/utils";
import Extension from "./extension";

export default class Bridge extends Extension {
    #requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/(.*)`);
    // set on `start`
    #osInfo!: Zigbee2MQTTAPI["bridge/info"]["os"];
    private zigbee2mqttVersion!: {commitHash?: string; version: string};
    private zigbeeHerdsmanVersion!: {version: string};
    private zigbeeHerdsmanConvertersVersion!: {version: string};
    private coordinatorVersion!: zh.CoordinatorVersion;
    private restartRequired = false;
    private lastJoinedDeviceIeeeAddr?: string;
    private lastBridgeLoggingPayload?: string;
    private logTransport!: winston.transport;
    private requestLookup: {[key: string]: (message: KeyValue | string) => Promise<Zigbee2MQTTResponse<Zigbee2MQTTResponseEndpoints>>} = {
        "device/options": this.deviceOptions,
        "device/configure_reporting": this.deviceConfigureReporting,
        "device/remove": this.deviceRemove,
        "device/interview": this.deviceInterview,
        "device/generate_external_definition": this.deviceGenerateExternalDefinition,
        "device/rename": this.deviceRename,
        "group/add": this.groupAdd,
        "group/options": this.groupOptions,
        "group/remove": this.groupRemove,
        "group/rename": this.groupRename,
        permit_join: this.permitJoin,
        restart: this.restart,
        backup: this.backup,
        "touchlink/factory_reset": this.touchlinkFactoryReset,
        "touchlink/identify": this.touchlinkIdentify,
        "install_code/add": this.installCodeAdd,
        "touchlink/scan": this.touchlinkScan,
        health_check: this.healthCheck,
        coordinator_check: this.coordinatorCheck,
        options: this.bridgeOptions,
    };

    override async start(): Promise<void> {
        const debugToMQTTFrontend = settings.get().advanced.log_debug_to_mqtt_frontend;

        const bridgeLogging = (message: string, level: string, namespace: string): void => {
            const payload = stringify({message, level, namespace});

            if (payload !== this.lastBridgeLoggingPayload) {
                this.lastBridgeLoggingPayload = payload;
                void this.mqtt.publish("bridge/logging", payload, {skipLog: true});
            }
        };

        if (debugToMQTTFrontend) {
            class DebugEventTransport extends Transport {
                override log(info: {message: string; level: string; namespace: string}, next: () => void): void {
                    bridgeLogging(info.message, info.level, info.namespace);
                    next();
                }
            }

            this.logTransport = new DebugEventTransport();
        } else {
            class EventTransport extends Transport {
                override log(info: {message: string; level: string; namespace: string}, next: () => void): void {
                    if (info.level !== "debug") {
                        bridgeLogging(info.message, info.level, info.namespace);
                    }
                    next();
                }
            }

            this.logTransport = new EventTransport();
        }

        logger.addTransport(this.logTransport);

        const os = await import("node:os");
        const process = await import("node:process");
        const logicalCpuCores = os.cpus();
        this.#osInfo = {
            version: `${os.version()} - ${os.release()} - ${os.arch()}`,
            node_version: process.version,
            cpus: `${[...new Set(logicalCpuCores.map((cpu) => cpu.model))].join(" | ")} (x${logicalCpuCores.length})`,
            memory_mb: Math.round(os.totalmem() / 1024 / 1024),
        };
        this.zigbee2mqttVersion = await utils.getZigbee2MQTTVersion();
        this.zigbeeHerdsmanVersion = await utils.getDependencyVersion("zigbee-herdsman");
        this.zigbeeHerdsmanConvertersVersion = await utils.getDependencyVersion("zigbee-herdsman-converters");
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
        this.eventBus.onDeviceJoined(this, async (data) => {
            this.lastJoinedDeviceIeeeAddr = data.device.ieeeAddr;
            await this.publishDevices();

            const payload: Zigbee2MQTTAPI["bridge/event"] = {
                type: "device_joined",
                data: {friendly_name: data.device.name, ieee_address: data.device.ieeeAddr},
            };

            await this.mqtt.publish("bridge/event", stringify(payload));
        });
        this.eventBus.onDeviceLeave(this, async (data) => {
            await this.publishDevices();
            await this.publishDefinitions();

            const payload: Zigbee2MQTTAPI["bridge/event"] = {type: "device_leave", data: {ieee_address: data.ieeeAddr, friendly_name: data.name}};

            await this.mqtt.publish("bridge/event", stringify(payload));
        });
        this.eventBus.onDeviceNetworkAddressChanged(this, async () => {
            await this.publishDevices();
        });
        this.eventBus.onDeviceInterview(this, async (data) => {
            await this.publishDevices();

            let payload: Zigbee2MQTTAPI["bridge/event"];

            if (data.status === "successful") {
                payload = {
                    type: "device_interview",
                    data: {
                        friendly_name: data.device.name,
                        status: data.status,
                        ieee_address: data.device.ieeeAddr,
                        supported: data.device.isSupported,
                        definition: this.getDefinitionPayload(data.device),
                    },
                };
            } else {
                payload = {
                    type: "device_interview",
                    data: {friendly_name: data.device.name, status: data.status, ieee_address: data.device.ieeeAddr},
                };
            }

            await this.mqtt.publish("bridge/event", stringify(payload));
        });
        this.eventBus.onDeviceAnnounce(this, async (data) => {
            await this.publishDevices();

            const payload: Zigbee2MQTTAPI["bridge/event"] = {
                type: "device_announce",
                data: {friendly_name: data.device.name, ieee_address: data.device.ieeeAddr},
            };

            await this.mqtt.publish("bridge/event", stringify(payload));
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
        const match = data.topic.match(this.#requestRegex);

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
                // biome-ignore lint/style/noNonNullAssertion: always using Error
                logger.debug((error as Error).stack!);
                const response = utils.getResponse(message, {}, (error as Error).message);
                await this.mqtt.publish(`bridge/response/${match[1]}`, stringify(response));
            }
        }
    }

    /**
     * Requests
     */

    @bind async deviceOptions(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/device/options">> {
        return await this.changeEntityOptions("device", message);
    }

    @bind async groupOptions(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/group/options">> {
        return await this.changeEntityOptions("group", message);
    }

    @bind async bridgeOptions(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/options">> {
        if (typeof message !== "object" || typeof message.options !== "object") {
            throw new Error("Invalid payload");
        }

        const newSettings = message.options as Partial<Settings>;
        this.restartRequired = settings.apply(newSettings);

        // Apply some settings on-the-fly.
        if (newSettings.homeassistant) {
            await this.enableDisableExtension(settings.get().homeassistant.enabled, "HomeAssistant");
        }

        if (newSettings.advanced?.log_level != null) {
            logger.setLevel(settings.get().advanced.log_level);
        }

        if (newSettings.advanced?.log_namespaced_levels != null) {
            logger.setNamespacedLevels(settings.get().advanced.log_namespaced_levels);
        }

        if (newSettings.advanced?.log_debug_namespace_ignore != null) {
            logger.setDebugNamespaceIgnore(settings.get().advanced.log_debug_namespace_ignore);
        }

        logger.info("Successfully changed options");
        await this.publishInfo();
        return utils.getResponse(message, {restart_required: this.restartRequired});
    }

    @bind async deviceRemove(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/device/remove">> {
        return await this.removeEntity("device", message);
    }

    @bind async groupRemove(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/group/remove">> {
        return await this.removeEntity("group", message);
    }

    // biome-ignore lint/suspicious/useAwait: API
    @bind async healthCheck(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/health_check">> {
        return utils.getResponse(message, {healthy: true});
    }

    @bind async coordinatorCheck(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/coordinator_check">> {
        const result = await this.zigbee.coordinatorCheck();
        const missingRouters = result.missingRouters.map((d) => {
            return {ieee_address: d.ieeeAddr, friendly_name: d.name};
        });
        return utils.getResponse(message, {missing_routers: missingRouters});
    }

    @bind async groupAdd(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/group/add">> {
        if (typeof message === "object" && message.friendly_name === undefined) {
            throw new Error("Invalid payload");
        }

        const friendlyName = typeof message === "object" ? message.friendly_name : message;
        const ID = typeof message === "object" && message.id !== undefined ? message.id : null;
        const group = settings.addGroup(friendlyName, ID);
        this.zigbee.createGroup(group.ID);
        await this.publishGroups();
        return utils.getResponse(message, {friendly_name: group.friendly_name, id: group.ID});
    }

    @bind async deviceRename(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/device/rename">> {
        return await this.renameEntity("device", message);
    }

    @bind async groupRename(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/group/rename">> {
        return await this.renameEntity("group", message);
    }

    // biome-ignore lint/suspicious/useAwait: API
    @bind async restart(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/restart">> {
        // Wait 500 ms before restarting so response can be send.
        setTimeout(this.restartCallback, 500);
        logger.info("Restarting Zigbee2MQTT");
        return utils.getResponse(message, {});
    }

    @bind async backup(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/backup">> {
        await this.zigbee.backup();
        const dataPath = data.getPath();
        const files = utils
            .getAllFiles(dataPath)
            .map((f) => [f, f.substring(dataPath.length + 1)])
            .filter((f) => !f[1].startsWith("log"));
        const zip = new JSZip();

        for (const f of files) {
            zip.file(f[1], fs.readFileSync(f[0]));
        }

        const base64Zip = await zip.generateAsync({type: "base64"});
        return utils.getResponse(message, {zip: base64Zip});
    }

    @bind async installCodeAdd(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/install_code/add">> {
        if (typeof message === "object" && message.value === undefined) {
            throw new Error("Invalid payload");
        }

        const value = typeof message === "object" ? message.value : message;
        await this.zigbee.addInstallCode(value);
        logger.info("Successfully added new install code");
        return utils.getResponse(message, {value});
    }

    @bind async permitJoin(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/permit_join">> {
        let time: number | undefined;
        let device: Device | undefined;

        if (typeof message === "object") {
            if (message.time === undefined) {
                throw new Error("Invalid payload");
            }

            time = Number.parseInt(message.time, 10);

            if (message.device) {
                const resolved = this.zigbee.resolveEntity(message.device);

                if (resolved instanceof Device) {
                    device = resolved;
                } else {
                    throw new Error(`Device '${message.device}' does not exist`);
                }
            }
        } else {
            time = Number.parseInt(message, 10);
        }

        await this.zigbee.permitJoin(time, device);

        const response: {time: number; device?: string} = {time};

        if (device) {
            response.device = device.name;
        }

        return utils.getResponse(message, response);
    }

    @bind async touchlinkIdentify(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/touchlink/identify">> {
        if (typeof message !== "object" || message.ieee_address === undefined || message.channel === undefined) {
            throw new Error("Invalid payload");
        }

        logger.info(`Start Touchlink identify of '${message.ieee_address}' on channel ${message.channel}`);
        await this.zigbee.touchlinkIdentify(message.ieee_address, message.channel);
        return utils.getResponse(message, {ieee_address: message.ieee_address, channel: message.channel});
    }

    @bind async touchlinkFactoryReset(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/touchlink/factory_reset">> {
        let result = false;
        let payload: Zigbee2MQTTAPI["bridge/response/touchlink/factory_reset"] = {};

        if (typeof message === "object" && message.ieee_address !== undefined && message.channel !== undefined) {
            logger.info(`Start Touchlink factory reset of '${message.ieee_address}' on channel ${message.channel}`);

            result = await this.zigbee.touchlinkFactoryReset(message.ieee_address, message.channel);
            payload = {
                ieee_address: message.ieee_address,
                channel: message.channel,
            };
        } else {
            logger.info("Start Touchlink factory reset of first found device");
            result = await this.zigbee.touchlinkFactoryResetFirst();
        }

        if (result) {
            logger.info("Successfully factory reset device through Touchlink");
            return utils.getResponse(message, payload);
        }

        logger.error("Failed to factory reset device through Touchlink");
        throw new Error("Failed to factory reset device through Touchlink");
    }

    @bind async touchlinkScan(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/touchlink/scan">> {
        logger.info("Start Touchlink scan");
        const result = await this.zigbee.touchlinkScan();
        const found = result.map((r) => {
            return {ieee_address: r.ieeeAddr, channel: r.channel};
        });
        logger.info("Finished Touchlink scan");
        return utils.getResponse(message, {found});
    }

    /**
     * Utils
     */

    async changeEntityOptions<T extends "device" | "group">(
        entityType: T,
        message: KeyValue | string,
    ): Promise<Zigbee2MQTTResponse<T extends "device" ? "bridge/response/device/options" : "bridge/response/group/options">> {
        if (typeof message !== "object" || message.id === undefined || message.options === undefined) {
            throw new Error("Invalid payload");
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

        if (message.options.icon) {
            const base64Match = utils.matchBase64File(message.options.icon);
            if (base64Match) {
                const fileSettings = utils.saveBase64DeviceIcon(base64Match);
                message.options.icon = fileSettings;
                logger.debug(`Saved base64 image as file to '${fileSettings}'`);
            }
        }

        const restartRequired = settings.changeEntityOptions(ID, message.options);
        if (restartRequired) this.restartRequired = true;
        const newOptions = cleanup(entity.options);
        await this.publishInfo();

        logger.info(`Changed config for ${entityType} ${ID}`);

        this.eventBus.emitEntityOptionsChanged({from: oldOptions, to: newOptions, entity});
        return utils.getResponse(message, {from: oldOptions, to: newOptions, id: ID, restart_required: this.restartRequired});
    }

    @bind async deviceConfigureReporting(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/device/configure_reporting">> {
        if (
            typeof message !== "object" ||
            message.id === undefined ||
            message.endpoint === undefined ||
            message.cluster === undefined ||
            message.maximum_report_interval === undefined ||
            message.minimum_report_interval === undefined ||
            message.reportable_change === undefined ||
            message.attribute === undefined
        ) {
            throw new Error("Invalid payload");
        }

        const device = this.getEntity("device", message.id);
        const endpoint = device.endpoint(message.endpoint);

        if (!endpoint) {
            throw new Error(`Device '${device.ID}' does not have endpoint '${message.endpoint}'`);
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
            endpoint: message.endpoint,
            cluster: message.cluster,
            maximum_report_interval: message.maximum_report_interval,
            minimum_report_interval: message.minimum_report_interval,
            reportable_change: message.reportable_change,
            attribute: message.attribute,
        });
    }

    @bind async deviceInterview(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/device/interview">> {
        if (typeof message !== "object" || message.id === undefined) {
            throw new Error("Invalid payload");
        }

        const device = this.getEntity("device", message.id);
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

    @bind async deviceGenerateExternalDefinition(
        message: string | KeyValue,
    ): Promise<Zigbee2MQTTResponse<"bridge/response/device/generate_external_definition">> {
        if (typeof message !== "object" || message.id === undefined) {
            throw new Error("Invalid payload");
        }

        const device = this.getEntity("device", message.id);
        const source = await zhc.generateExternalDefinitionSource(device.zh);

        return utils.getResponse(message, {id: message.id, source});
    }

    async renameEntity<T extends "device" | "group">(
        entityType: T,
        message: string | KeyValue,
    ): Promise<Zigbee2MQTTResponse<T extends "device" ? "bridge/response/device/rename" : "bridge/response/group/rename">> {
        const deviceAndHasLast = entityType === "device" && typeof message === "object" && message.last === true;

        if (typeof message !== "object" || (message.from === undefined && !deviceAndHasLast) || message.to === undefined) {
            throw new Error("Invalid payload");
        }

        if (deviceAndHasLast && !this.lastJoinedDeviceIeeeAddr) {
            throw new Error("No device has joined since start");
        }

        const from = deviceAndHasLast ? this.lastJoinedDeviceIeeeAddr : message.from;
        assertString(message.to, "to");
        const to = message.to.trim();
        const homeAssisantRename = message.homeassistant_rename !== undefined ? message.homeassistant_rename : false;
        const entity = this.getEntity(entityType, from);
        const oldFriendlyName = entity.options.friendly_name;

        settings.changeFriendlyName(from, to);

        // Clear retained messages
        await this.mqtt.publish(oldFriendlyName, "", {clientOptions: {retain: true}});

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

    async removeEntity<T extends "device" | "group">(
        entityType: T,
        message: string | KeyValue,
    ): Promise<Zigbee2MQTTResponse<T extends "device" ? "bridge/response/device/remove" : "bridge/response/group/remove">> {
        const ID = typeof message === "object" ? message.id : message.trim();
        const entity = this.getEntity(entityType, ID);
        // note: entity.name is dynamically retrieved, will change once device is removed (friendly => ieee)
        const friendlyName = entity.name;
        let block = false;
        let force = false;
        let blockForceLog = "";

        if (entityType === "device" && typeof message === "object") {
            block = !!message.block;
            force = !!message.force;
            blockForceLog = ` (block: ${block}, force: ${force})`;
        } else if (entityType === "group" && typeof message === "object") {
            force = !!message.force;
            blockForceLog = ` (force: ${force})`;
        }

        try {
            logger.info(`Removing ${entityType} '${friendlyName}'${blockForceLog}`);

            if (entity instanceof Device) {
                if (block) {
                    settings.blockDevice(entity.ieeeAddr);
                }

                if (force) {
                    entity.zh.removeFromDatabase();
                } else {
                    await entity.zh.removeFromNetwork();
                }

                this.eventBus.emitEntityRemoved({id: entity.ID, name: friendlyName, type: "device"});
                settings.removeDevice(entity.ID as string);
            } else {
                if (force) {
                    entity.zh.removeFromDatabase();
                } else {
                    await entity.zh.removeFromNetwork();
                }

                this.eventBus.emitEntityRemoved({id: entity.ID, name: friendlyName, type: "group"});
                settings.removeGroup(entity.ID);
            }

            // Remove from state
            this.state.remove(entity.ID);

            // Clear any retained messages
            await this.mqtt.publish(friendlyName, "", {clientOptions: {retain: true}});

            logger.info(`Successfully removed ${entityType} '${friendlyName}'${blockForceLog}`);

            if (entity instanceof Device) {
                await this.publishGroups();
                await this.publishDevices();
                // Refresh Cluster definition
                await this.publishDefinitions();

                const responseData: Zigbee2MQTTAPI["bridge/response/device/remove"] = {id: ID, block, force};

                return utils.getResponse(message, responseData);
            }

            await this.publishGroups();

            const responseData: Zigbee2MQTTAPI["bridge/response/group/remove"] = {id: ID, force};

            return utils.getResponse(
                message,
                // @ts-expect-error typing infer does not work here
                responseData,
            );
        } catch (error) {
            throw new Error(`Failed to remove ${entityType} '${friendlyName}'${blockForceLog} (${error})`);
        }
    }

    getEntity(type: "group", id: string): Group;
    getEntity(type: "device", id: string): Device;
    getEntity(type: "group" | "device", id: string): Device | Group;
    getEntity(type: "group" | "device", id: string): Device | Group {
        const entity = this.zigbee.resolveEntity(id);
        if (!entity || entity.constructor.name.toLowerCase() !== type) {
            throw new Error(`${utils.capitalize(type)} '${id}' does not exist`);
        }
        return entity;
    }

    async publishInfo(): Promise<void> {
        const config = objectAssignDeep({}, settings.get());
        // @ts-expect-error hidden from publish
        delete config.advanced.network_key;
        delete config.mqtt.password;
        delete config.frontend.auth_token;

        const networkParams = await this.zigbee.getNetworkParameters();
        const payload: Zigbee2MQTTAPI["bridge/info"] = {
            os: this.#osInfo,
            mqtt: this.mqtt.info,
            version: this.zigbee2mqttVersion.version,
            commit: this.zigbee2mqttVersion.commitHash,
            zigbee_herdsman_converters: this.zigbeeHerdsmanConvertersVersion,
            zigbee_herdsman: this.zigbeeHerdsmanVersion,
            coordinator: {
                ieee_address: this.zigbee.firstCoordinatorEndpoint().deviceIeeeAddress,
                ...this.coordinatorVersion,
            },
            network: {
                pan_id: networkParams.panID,
                extended_pan_id: networkParams.extendedPanID,
                channel: networkParams.channel,
            },
            log_level: logger.getLevel(),
            permit_join: this.zigbee.getPermitJoin(),
            permit_join_end: this.zigbee.getPermitJoinEnd(),
            restart_required: this.restartRequired,
            config,
            config_schema: settings.schemaJson,
        };

        await this.mqtt.publish("bridge/info", stringify(payload), {clientOptions: {retain: true}, skipLog: true});
    }

    async publishDevices(): Promise<void> {
        const devices: Zigbee2MQTTAPI["bridge/devices"] = [];

        for (const device of this.zigbee.devicesIterator()) {
            const endpoints: (typeof devices)[number]["endpoints"] = {};

            for (const endpoint of device.zh.endpoints) {
                const data: (typeof endpoints)[keyof typeof endpoints] = {
                    name: device.endpointName(endpoint),
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
                        ? {type: "endpoint" as const, ieee_address: bind.target.deviceIeeeAddress, endpoint: bind.target.ID}
                        : {type: "group" as const, id: bind.target.groupID};
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
                /** @deprecated interviewing and interview_completed are superceded by interview_state */
                interviewing: device.zh.interviewState === InterviewState.InProgress,
                interview_completed: device.zh.interviewState === InterviewState.Successful,
                interview_state: device.zh.interviewState,
                manufacturer: device.zh.manufacturerName,
                endpoints,
            });
        }

        await this.mqtt.publish("bridge/devices", stringify(devices), {clientOptions: {retain: true}, skipLog: true});
    }

    async publishGroups(): Promise<void> {
        const groups: Zigbee2MQTTAPI["bridge/groups"] = [];

        for (const group of this.zigbee.groupsIterator()) {
            const members = [];

            for (const member of group.zh.members) {
                members.push({ieee_address: member.deviceIeeeAddress, endpoint: member.ID});
            }

            groups.push({
                id: group.ID,
                friendly_name: group.ID === DEFAULT_BIND_GROUP_ID ? "default_bind_group" : group.name,
                description: group.options.description,
                scenes: utils.getScenes(group.zh),
                members,
            });
        }

        await this.mqtt.publish("bridge/groups", stringify(groups), {clientOptions: {retain: true}, skipLog: true});
    }

    async publishDefinitions(): Promise<void> {
        const data: Zigbee2MQTTAPI["bridge/definitions"] = {
            clusters: Zcl.Clusters,
            custom_clusters: {},
        };

        for (const device of this.zigbee.devicesIterator((d) => !utils.objectIsEmpty(d.customClusters))) {
            data.custom_clusters[device.ieeeAddr] = device.customClusters;
        }

        await this.mqtt.publish("bridge/definitions", stringify(data), {clientOptions: {retain: true}, skipLog: true});
    }

    getDefinitionPayload(device: Device): Zigbee2MQTTDevice["definition"] | undefined {
        if (!device.definition) {
            return undefined;
        }

        // TODO: better typing to avoid @ts-expect-error
        // @ts-expect-error icon is valid for external definitions
        const definitionIcon = device.definition.icon;
        let icon = device.options.icon ?? definitionIcon;

        if (icon) {
            /* v8 ignore next */
            icon = icon.replace("$zigbeeModel", utils.sanitizeImageParameter(device.zh.modelID ?? ""));
            icon = icon.replace("$model", utils.sanitizeImageParameter(device.definition.model));
        }

        const payload: Zigbee2MQTTDevice["definition"] = {
            source: device.definition.externalConverterName ? "external" : device.definition.generated ? "generated" : "native",
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
