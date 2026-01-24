import bind from "bind-decorator";
import stringify from "json-stable-stringify-without-jsonify";
import {setLogger as zhSetLogger} from "zigbee-herdsman";
import {access, setLogger as zhcSetLogger} from "zigbee-herdsman-converters";
import EventBus from "./eventBus";
// Extensions
import ExtensionAvailability from "./extension/availability";
import ExtensionBind from "./extension/bind";
import ExtensionBridge from "./extension/bridge";
import ExtensionConfigure from "./extension/configure";
import type Extension from "./extension/extension";
import ExtensionExternalConverters from "./extension/externalConverters";
import ExtensionExternalExtensions from "./extension/externalExtensions";
import ExtensionGroups from "./extension/groups";
import ExtensionHealth from "./extension/health";
import ExtensionNetworkMap from "./extension/networkMap";
import ExtensionOnEvent from "./extension/onEvent";
import ExtensionOTAUpdate from "./extension/otaUpdate";
import ExtensionPublish from "./extension/publish";
import ExtensionReceive from "./extension/receive";
import Mqtt, {type MqttPublishOptions} from "./mqtt";
import State from "./state";
import type {Zigbee2MQTTAPI} from "./types/api";
import logger from "./util/logger";
import {initSdNotify} from "./util/sd-notify";
import * as settings from "./util/settings";
import utils from "./util/utils";
import Zigbee from "./zigbee";

export class Controller {
    public readonly eventBus: EventBus;
    public readonly zigbee: Zigbee;
    public readonly state: State;
    public readonly mqtt: Mqtt;
    private restartCallback: () => Promise<void>;
    private exitCallback: (code: number, restart: boolean) => Promise<void>;
    public readonly extensions: Set<Extension>;
    public readonly extensionArgs: ConstructorParameters<typeof Extension>;
    private sdNotify: Awaited<ReturnType<typeof initSdNotify>>;

    constructor(restartCallback: () => Promise<void>, exitCallback: (code: number, restart: boolean) => Promise<void>) {
        logger.init();
        zhSetLogger(logger);
        zhcSetLogger(logger);
        this.eventBus = new EventBus();
        this.zigbee = new Zigbee(this.eventBus);
        this.mqtt = new Mqtt(this.eventBus);
        this.state = new State(this.eventBus, this.zigbee);
        this.restartCallback = restartCallback;
        this.exitCallback = exitCallback;

        // Initialize extensions.
        this.extensionArgs = [
            this.zigbee,
            this.mqtt,
            this.state,
            this.publishEntityState,
            this.eventBus,
            this.enableDisableExtension,
            this.restartCallback,
            this.addExtension,
        ];

        this.extensions = new Set([
            new ExtensionExternalConverters(...this.extensionArgs),
            new ExtensionOnEvent(...this.extensionArgs),
            new ExtensionBridge(...this.extensionArgs),
            new ExtensionPublish(...this.extensionArgs),
            new ExtensionReceive(...this.extensionArgs),
            new ExtensionConfigure(...this.extensionArgs),
            new ExtensionNetworkMap(...this.extensionArgs),
            new ExtensionGroups(...this.extensionArgs),
            new ExtensionBind(...this.extensionArgs),
            new ExtensionOTAUpdate(...this.extensionArgs),
            new ExtensionExternalExtensions(...this.extensionArgs),
            new ExtensionAvailability(...this.extensionArgs),
            new ExtensionHealth(...this.extensionArgs),
        ]);
    }

    async start(): Promise<void> {
        if (settings.get().frontend.enabled) {
            const {Frontend} = await import("./extension/frontend.js");

            this.extensions.add(new Frontend(...this.extensionArgs));
        }

        if (settings.get().homeassistant.enabled) {
            const {HomeAssistant} = await import("./extension/homeassistant.js");

            this.extensions.add(new HomeAssistant(...this.extensionArgs));
        }

        this.state.start();

        const info = await utils.getZigbee2MQTTVersion();
        logger.info(`Starting Zigbee2MQTT version ${info.version} (commit #${info.commitHash})`);

        // Start zigbee
        try {
            await this.zigbee.start();

            this.eventBus.onAdapterDisconnected(this, async () => {
                logger.error("Adapter disconnected, stopping");
                await this.stop(false, 2);
            });
        } catch (error) {
            logger.error("Failed to start zigbee-herdsman");
            logger.error(
                "Check https://www.zigbee2mqtt.io/guide/installation/20_zigbee2mqtt-fails-to-start_crashes-runtime.html for possible solutions",
            );
            logger.error("Exiting...");
            // biome-ignore lint/style/noNonNullAssertion: always Error
            logger.error((error as Error).stack!);

            /* v8 ignore start */
            if ((error as Error).message.includes("USB adapter discovery error (No valid USB adapter found)")) {
                logger.error("If this happens after updating to Zigbee2MQTT 2.0.0, see https://github.com/Koenkk/zigbee2mqtt/discussions/24364");
            }
            /* v8 ignore stop */

            return await this.exit(1);
        }

        // Log zigbee clients on startup
        let deviceCount = 0;

        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            // `definition` validated by `isSupported`
            const model = device.isSupported
                ? // biome-ignore lint/style/noNonNullAssertion: valid from `isSupported`
                  `${device.definition!.model} - ${device.definition!.vendor} ${device.definition!.description}`
                : "Not supported";
            logger.info(`${device.name} (${device.ieeeAddr}): ${model} (${device.zh.type})`);

            deviceCount++;
        }

        logger.info(`Currently ${deviceCount} devices are joined.`);

        // MQTT
        try {
            await this.mqtt.connect();
        } catch (error) {
            logger.error(`MQTT failed to connect, exiting... (${(error as Error).message})`);
            await this.zigbee.stop();
            return await this.exit(1);
        }

        // copy current Set of extensions to ignore possible external extensions added while looping
        for (const extension of new Set(this.extensions)) {
            await this.startExtension(extension);
        }

        // Populate state.json with configuration values from database.db
        // This ensures config attributes (like sensitivity, thresholds) are available
        // even if the device hasn't reported them since startup
        await this.populateStateFromDatabase();

        // Send all cached states.
        if (settings.get().advanced.cache_state_send_on_startup && settings.get().advanced.cache_state) {
            for (const entity of this.zigbee.devicesAndGroupsIterator()) {
                if (this.state.exists(entity)) {
                    await this.publishEntityState(entity, this.state.get(entity), "publishCached");
                }
            }
        }

        this.eventBus.onLastSeenChanged(this, (data) => {
            utils.publishLastSeen(data, settings.get(), false, this.publishEntityState).catch(() => {});
        });

        logger.info("Zigbee2MQTT started!");

        this.sdNotify = await initSdNotify();

        settings.setOnboarding(false);
    }

    @bind async enableDisableExtension(enable: boolean, name: string): Promise<void> {
        if (enable) {
            switch (name) {
                case "Frontend": {
                    if (!settings.get().frontend.enabled) {
                        throw new Error("Tried to enable Frontend extension disabled in settings");
                    }

                    // this is not actually used, not tested either
                    /* v8 ignore start */
                    const {Frontend} = await import("./extension/frontend.js");

                    await this.addExtension(new Frontend(...this.extensionArgs));

                    break;
                    /* v8 ignore stop */
                }
                case "HomeAssistant": {
                    if (!settings.get().homeassistant.enabled) {
                        throw new Error("Tried to enable HomeAssistant extension disabled in settings");
                    }

                    const {HomeAssistant} = await import("./extension/homeassistant.js");

                    await this.addExtension(new HomeAssistant(...this.extensionArgs));

                    break;
                }
                default: {
                    throw new Error(
                        `Extension ${name} does not exist (should be added with 'addExtension') or is built-in that cannot be enabled at runtime`,
                    );
                }
            }
        } else {
            switch (name) {
                case "Frontend": {
                    if (settings.get().frontend.enabled) {
                        throw new Error("Tried to disable Frontend extension enabled in settings");
                    }

                    break;
                }
                case "HomeAssistant": {
                    if (settings.get().homeassistant.enabled) {
                        throw new Error("Tried to disable HomeAssistant extension enabled in settings");
                    }

                    break;
                }
                case "Availability":
                case "Bind":
                case "Bridge":
                case "Configure":
                case "ExternalConverters":
                case "ExternalExtensions":
                case "Groups":
                case "NetworkMap":
                case "OnEvent":
                case "OTAUpdate":
                case "Publish":
                case "Receive": {
                    throw new Error(`Built-in extension ${name} cannot be disabled at runtime`);
                }
            }

            const extension = this.getExtension(name);

            if (extension) {
                await this.removeExtension(extension);
            }
        }
    }

    public getExtension(name: string): Extension | undefined {
        for (const extension of this.extensions) {
            if (extension.constructor.name === name) {
                return extension;
            }
        }
    }

    @bind async addExtension(extension: Extension): Promise<void> {
        for (const ext of this.extensions) {
            if (ext.constructor.name === extension.constructor.name) {
                throw new Error(`Extension with name ${ext.constructor.name} already present`);
            }
        }

        this.extensions.add(extension);
        await this.startExtension(extension);
    }

    async removeExtension(extension: Extension): Promise<void> {
        if (this.extensions.delete(extension)) {
            await this.stopExtension(extension);
        }
    }

    private async startExtension(extension: Extension): Promise<void> {
        try {
            await extension.start();
        } catch (error) {
            logger.error(`Failed to start '${extension.constructor.name}' (${(error as Error).stack})`);
        }
    }

    private async stopExtension(extension: Extension): Promise<void> {
        try {
            await extension.stop();
        } catch (error) {
            logger.error(`Failed to stop '${extension.constructor.name}' (${(error as Error).stack})`);
        }
    }

    /**
     * Populate state.json with configuration values from database.db for attributes
     * that are currently null/missing.
     *
     * This solves the problem where sleepy devices have config values stored in
     * database.db (from interview) but state.json shows null (never received at runtime).
     *
     * Access flags determine what to populate:
     * ┌────────┬───────┬───────┬─────────────────────────────┬──────────┐
     * │ Binary │ STATE │  SET  │ GET │        Type           │ Populate │
     * ├────────┼───────┼───────┼─────┼───────────────────────┼──────────┤
     * │  000   │   -   │   -   │  -  │ Invalid               │    ❌    │
     * │  001   │   ✓   │   -   │  -  │ Sensor reading        │    ❌    │
     * │  010   │   -   │   ✓   │  -  │ Command/action        │    ❌    │
     * │  011   │   ✓   │   ✓   │  -  │ Config (device reports)│   ✅    │
     * │  100   │   -   │   -   │  ✓  │ Query-only (rare)     │    ❌    │
     * │  101   │   ✓   │   -   │  ✓  │ Pollable sensor       │    ❌    │
     * │  110   │   -   │   ✓   │  ✓  │ Config (no auto-report)│   ✅    │
     * │  111   │   ✓   │   ✓   │  ✓  │ Full config           │    ✅    │
     * └────────┴───────┴───────┴─────┴───────────────────────┴──────────┘
     *
     * Rule: Populate if has SET AND has at least STATE or GET
     *       isConfig = (access & SET) && (access & (STATE | GET))
     */
    private async populateStateFromDatabase(): Promise<void> {
        let populatedCount = 0;
        let deviceCount = 0;

        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            if (!device.definition || !device.interviewed) {
                continue;
            }

            deviceCount++;
            const currentState = this.state.get(device);
            const exposes = device.exposes();

            // Build set of config property names (properties with SET + (STATE or GET))
            const configProperties = new Set<string>();
            const processExpose = (expose: KeyValue): void => {
                if (expose.access !== undefined) {
                    const hasSet = (expose.access & access.SET) !== 0;
                    const hasStateOrGet = (expose.access & (access.STATE | access.GET)) !== 0;
                    if (hasSet && hasStateOrGet && expose.property) {
                        configProperties.add(expose.property);
                    }
                }
                // Process nested features (for composite exposes)
                if (expose.features) {
                    for (const feature of expose.features) {
                        processExpose(feature);
                    }
                }
            };

            for (const expose of exposes) {
                processExpose(expose);
            }

            // For each config property that's null/undefined in state, try to find in database
            // Try to populate each config property from stored cluster attributes
            let devicePopulatedCount = 0;
            for (const property of configProperties) {
                if (currentState[property] === undefined || currentState[property] === null) {
                    // Try to find this value via converters from stored cluster attributes
                    const value = await this.getStoredConfigValue(device, property);
                    /* v8 ignore next 4 - requires real zhc converters to return values */
                    if (value !== undefined && value !== null) {
                        currentState[property] = value;
                        devicePopulatedCount++;
                    }
                }
            }

            /* v8 ignore next 5 - requires real zhc converters to return values */
            // Update state if we found any values for this device
            if (devicePopulatedCount > 0) {
                this.state.set(device, currentState, "populateFromDatabase");
                populatedCount += devicePopulatedCount;
            }
        }

        /* v8 ignore next 3 - requires real zhc converters to return values */
        if (populatedCount > 0) {
            logger.info(`Populated ${populatedCount} config values from database for ${deviceCount} devices`);
        }
    }

    /**
     * Try to get a stored config value by running stored cluster attributes through converters
     */
    private async getStoredConfigValue(device: Device, property: string): Promise<unknown> {
        /* v8 ignore start - requires real zhc converters and cluster data setup */
        if (!device.definition) return undefined;

        // Iterate through device endpoints and their stored cluster attributes
        for (const endpoint of device.zh.endpoints) {
            if (!endpoint.clusters) continue;
            for (const [clusterName, cluster] of Object.entries(endpoint.clusters)) {
                const attributes = cluster.attributes;
                if (!attributes || Object.keys(attributes).length === 0) continue;

                // Convert serialized Buffers back to actual Buffer instances
                // Database stores Buffers as {"type": "Buffer", "data": [...]}
                const normalizedAttrs: KeyValue = {};
                for (const [attrName, attrValue] of Object.entries(attributes)) {
                    if (
                        attrValue &&
                        typeof attrValue === "object" &&
                        (attrValue as KeyValue).type === "Buffer" &&
                        Array.isArray((attrValue as KeyValue).data)
                    ) {
                        normalizedAttrs[attrName] = Buffer.from((attrValue as KeyValue).data as number[]);
                    } else {
                        normalizedAttrs[attrName] = attrValue;
                    }
                }

                // Find matching fromZigbee converters for this cluster
                const converters = device.definition.fromZigbee.filter(
                    (c) =>
                        c.cluster === clusterName && (c.type === "attributeReport" || (Array.isArray(c.type) && c.type.includes("attributeReport"))),
                );

                for (const converter of converters) {
                    try {
                        // Create synthetic message data
                        const convertData = {
                            type: "attributeReport" as const,
                            cluster: clusterName,
                            data: normalizedAttrs,
                            device: device.zh,
                            endpoint,
                            linkquality: 0,
                            groupID: 0,
                            meta: {rawData: Buffer.alloc(0)},
                        };

                        const options: KeyValue = device.options;
                        const meta = {
                            device: device.zh,
                            logger,
                            state: this.state.get(device),
                            deviceExposesChanged: (): void => {},
                        };

                        // Run converter (with no-op publish function)
                        const result = await converter.convert(
                            device.definition,
                            convertData,
                            async () => {}, // no-op publish
                            options,
                            meta,
                        );

                        if (result && property in result) {
                            return result[property];
                        }
                    } catch {
                        // Converter failed, try next
                    }
                }
            }
        }
        /* v8 ignore stop */

        return undefined;
    }

    async stop(restart = false, code = 0): Promise<void> {
        this.sdNotify?.notifyStopping();

        let localCode = 0;
        for (const extension of this.extensions) {
            try {
                await extension.stop();
            } catch (error) {
                logger.error(`Failed to stop '${extension.constructor.name}' (${(error as Error).stack})`);
                localCode = 1;
            }
        }

        this.eventBus.removeListeners(this);

        // Wrap-up
        this.state.stop();
        await this.mqtt.disconnect();

        try {
            await this.zigbee.stop();
            logger.info("Stopped Zigbee2MQTT");
        } catch (error) {
            logger.error(`Failed to stop Zigbee2MQTT (${(error as Error).stack})`);
            localCode = 1;
        }

        this.sdNotify?.stop();
        return await this.exit(code !== 0 ? code : localCode, restart);
    }

    async exit(code: number, restart = false): Promise<void> {
        await logger.end();
        return await this.exitCallback(code, restart);
    }

    @bind async publishEntityState(entity: Group | Device, payload: KeyValue, stateChangeReason?: StateChangeReason): Promise<void> {
        let message: Zigbee2MQTTAPI["{friendlyName}"] = {...payload};

        // Update state cache with new state.
        const newState = this.state.set(entity, payload, stateChangeReason);

        if (settings.get().advanced.cache_state) {
            // Add cached state to payload
            message = newState;
        }

        const options: MakePartialExcept<MqttPublishOptions, "clientOptions" | "meta"> = {
            clientOptions: {
                retain: utils.getObjectProperty(entity.options, "retain", false),
                qos: utils.getObjectProperty(entity.options, "qos", 0),
            },
            meta: {
                isEntityState: true,
            },
        };
        const retention = utils.getObjectProperty<number | false>(entity.options, "retention", false);

        if (retention !== false) {
            options.clientOptions.properties = {messageExpiryInterval: retention};
        }

        if (entity.isDevice() && settings.get().mqtt.include_device_information) {
            message.device = {
                friendlyName: entity.name,
                model: entity.definition?.model,
                ieeeAddr: entity.ieeeAddr,
                networkAddress: entity.zh.networkAddress,
                type: entity.zh.type,
                manufacturerID: entity.zh.manufacturerID,
                powerSource: entity.zh.powerSource,
                applicationVersion: entity.zh.applicationVersion,
                stackVersion: entity.zh.stackVersion,
                zclVersion: entity.zh.zclVersion,
                hardwareVersion: entity.zh.hardwareVersion,
                dateCode: entity.zh.dateCode,
                softwareBuildID: entity.zh.softwareBuildID,
                // Manufacturer name can contain \u0000, remove this.
                // https://github.com/home-assistant/core/issues/85691
                /* v8 ignore next */
                manufacturerName: entity.zh.manufacturerName?.split("\u0000")[0],
            };
        }

        // Add lastseen
        const lastSeen = settings.get().advanced.last_seen;
        if (entity.isDevice() && lastSeen !== "disable" && entity.zh.lastSeen) {
            message.last_seen = utils.formatDate(entity.zh.lastSeen, lastSeen);
        }

        // Add device linkquality.
        if (entity.isDevice() && entity.zh.linkquality !== undefined) {
            message.linkquality = entity.zh.linkquality;
        }

        for (const extension of this.extensions) {
            extension.adjustMessageBeforePublish?.(entity, message);
        }

        // Filter mqtt message attributes
        utils.filterProperties(entity.options.filtered_attributes, message);

        if (!utils.objectIsEmpty(message)) {
            const output = settings.get().advanced.output;
            if (output === "attribute_and_json" || output === "json") {
                await this.mqtt.publish(entity.name, stringify(message), options);
            }

            if (output === "attribute_and_json" || output === "attribute") {
                await this.iteratePayloadAttributeOutput(`${entity.name}/`, message, options);
            }
        }

        this.eventBus.emitPublishEntityState({entity, message, stateChangeReason, payload});
    }

    async iteratePayloadAttributeOutput(topicRoot: string, payload: KeyValue, options: Partial<MqttPublishOptions>): Promise<void> {
        for (const [key, value] of Object.entries(payload)) {
            let subPayload = value;
            let message = null;

            // Special cases
            if (key === "color" && utils.objectHasProperties(subPayload, ["r", "g", "b"])) {
                subPayload = [subPayload.r, subPayload.g, subPayload.b];
            }

            // Check Array first, since it is also an Object
            if (subPayload === null || subPayload === undefined) {
                message = "";
            } else if (Array.isArray(subPayload)) {
                message = subPayload.map((x) => `${x}`).join(",");
            } else if (typeof subPayload === "object") {
                await this.iteratePayloadAttributeOutput(`${topicRoot}${key}-`, subPayload, options);
            } else {
                message = typeof subPayload === "string" ? subPayload : stringify(subPayload);
            }

            if (message !== null) {
                await this.mqtt.publish(`${topicRoot}${key}`, message, options);
            }
        }
    }
}
