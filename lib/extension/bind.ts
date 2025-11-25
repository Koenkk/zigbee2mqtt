import assert from "node:assert";
import bind from "bind-decorator";
import debounce from "debounce";
import stringify from "json-stable-stringify-without-jsonify";
import {Zcl} from "zigbee-herdsman";
import type {TClusterAttributeKeys} from "zigbee-herdsman/dist/zspec/zcl/definition/clusters-types";
import type {ClusterName} from "zigbee-herdsman/dist/zspec/zcl/definition/tstype";
import Device from "../model/device";
import Group from "../model/group";
import type {Zigbee2MQTTAPI, Zigbee2MQTTResponseEndpoints} from "../types/api";
import logger from "../util/logger";
import * as settings from "../util/settings";
import utils, {DEFAULT_BIND_GROUP_ID} from "../util/utils";
import Extension from "./extension";

const ALL_CLUSTER_CANDIDATES: readonly ClusterName[] = [
    "genScenes",
    "genOnOff",
    "genLevelCtrl",
    "lightingColorCtrl",
    "closuresWindowCovering",
    "hvacThermostat",
    "msIlluminanceMeasurement",
    "msTemperatureMeasurement",
    "msRelativeHumidity",
    "msSoilMoisture",
    "msCO2",
];

// See zigbee-herdsman-converters
const DEFAULT_BIND_GROUP = {type: "group_number", ID: DEFAULT_BIND_GROUP_ID, name: "default_bind_group"};
const DEFAULT_REPORT_CONFIG = {minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1};

const getColorCapabilities = async (endpoint: zh.Endpoint): Promise<{colorTemperature: boolean; colorXY: boolean}> => {
    if (endpoint.getClusterAttributeValue("lightingColorCtrl", "colorCapabilities") == null) {
        await endpoint.read("lightingColorCtrl", ["colorCapabilities"]);
    }

    const value = endpoint.getClusterAttributeValue("lightingColorCtrl", "colorCapabilities") as number;

    return {
        colorTemperature: (value & (1 << 4)) > 0,
        colorXY: (value & (1 << 3)) > 0,
    };
};

const REPORT_CLUSTERS = {
    genOnOff: [{attribute: "onOff" as const, ...DEFAULT_REPORT_CONFIG, minimumReportInterval: 0, reportableChange: 0}],
    genLevelCtrl: [{attribute: "currentLevel" as const, ...DEFAULT_REPORT_CONFIG}],
    lightingColorCtrl: [
        {
            attribute: "colorTemperature" as const,
            ...DEFAULT_REPORT_CONFIG,
            condition: async (endpoint: zh.Endpoint): Promise<boolean> => (await getColorCapabilities(endpoint)).colorTemperature,
        },
        {
            attribute: "currentX" as const,
            ...DEFAULT_REPORT_CONFIG,
            condition: async (endpoint: zh.Endpoint): Promise<boolean> => (await getColorCapabilities(endpoint)).colorXY,
        },
        {
            attribute: "currentY" as const,
            ...DEFAULT_REPORT_CONFIG,
            condition: async (endpoint: zh.Endpoint): Promise<boolean> => (await getColorCapabilities(endpoint)).colorXY,
        },
    ],
    closuresWindowCovering: [
        {attribute: "currentPositionLiftPercentage" as const, ...DEFAULT_REPORT_CONFIG},
        {attribute: "currentPositionTiltPercentage" as const, ...DEFAULT_REPORT_CONFIG},
    ],
};

const POLL_ON_MESSAGE = [
    {
        // On messages that have the cluster and type of below
        cluster: {
            manuSpecificPhilips: [
                {type: "commandHueNotification", data: {button: 2}},
                {type: "commandHueNotification", data: {button: 3}},
            ],
            genLevelCtrl: [
                {type: "commandStep", data: {}},
                {type: "commandStepWithOnOff", data: {}},
                {type: "commandStop", data: {}},
                {type: "commandMoveWithOnOff", data: {}},
                {type: "commandStopWithOnOff", data: {}},
                {type: "commandMove", data: {}},
                {type: "commandMoveToLevelWithOnOff", data: {}},
            ],
            genScenes: [{type: "commandRecall", data: {}}],
        },
        // Read the following attributes
        read: {cluster: "genLevelCtrl" as const, attributes: ["currentLevel"] as TClusterAttributeKeys<"genLevelCtrl">},
        // When the bound devices/members of group have the following manufacturerIDs
        manufacturerIDs: [
            Zcl.ManufacturerCode.SIGNIFY_NETHERLANDS_B_V,
            Zcl.ManufacturerCode.ATMEL,
            Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            Zcl.ManufacturerCode.MUELLER_LICHT_INTERNATIONAL_INC,
            Zcl.ManufacturerCode.TELINK_MICRO,
            Zcl.ManufacturerCode.BUSCH_JAEGER_ELEKTRO,
        ],
        manufacturerNames: ["GLEDOPTO", "Trust International B.V.\u0000"],
    },
    {
        cluster: {
            genLevelCtrl: [
                {type: "commandStepWithOnOff", data: {}},
                {type: "commandMoveWithOnOff", data: {}},
                {type: "commandStopWithOnOff", data: {}},
                {type: "commandMoveToLevelWithOnOff", data: {}},
            ],
            genOnOff: [
                {type: "commandOn", data: {}},
                {type: "commandOff", data: {}},
                {type: "commandOffWithEffect", data: {}},
                {type: "commandToggle", data: {}},
            ],
            genScenes: [{type: "commandRecall", data: {}}],
            manuSpecificPhilips: [
                {type: "commandHueNotification", data: {button: 1}},
                {type: "commandHueNotification", data: {button: 4}},
            ],
        },
        read: {cluster: "genOnOff" as const, attributes: ["onOff"] as TClusterAttributeKeys<"genOnOff">},
        manufacturerIDs: [
            Zcl.ManufacturerCode.SIGNIFY_NETHERLANDS_B_V,
            Zcl.ManufacturerCode.ATMEL,
            Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            Zcl.ManufacturerCode.MUELLER_LICHT_INTERNATIONAL_INC,
            Zcl.ManufacturerCode.TELINK_MICRO,
            Zcl.ManufacturerCode.BUSCH_JAEGER_ELEKTRO,
        ],
        manufacturerNames: ["GLEDOPTO", "Trust International B.V.\u0000"],
    },
    {
        cluster: {
            genScenes: [{type: "commandRecall", data: {}}],
        },
        read: {
            cluster: "lightingColorCtrl" as const,
            attributes: [] as TClusterAttributeKeys<"lightingColorCtrl">,
            // Since not all devices support the same attributes they need to be calculated dynamically
            // depending on the capabilities of the endpoint.
            attributesForEndpoint: async (endpoint: zh.Endpoint): Promise<TClusterAttributeKeys<"lightingColorCtrl">> => {
                const supportedAttrs = await getColorCapabilities(endpoint);
                const readAttrs: TClusterAttributeKeys<"lightingColorCtrl"> = [];

                if (supportedAttrs.colorXY) {
                    readAttrs.push("currentX", "currentY");
                }

                if (supportedAttrs.colorTemperature) {
                    readAttrs.push("colorTemperature");
                }

                return readAttrs;
            },
        },
        manufacturerIDs: [
            Zcl.ManufacturerCode.SIGNIFY_NETHERLANDS_B_V,
            Zcl.ManufacturerCode.ATMEL,
            Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            Zcl.ManufacturerCode.MUELLER_LICHT_INTERNATIONAL_INC,
            Zcl.ManufacturerCode.TELINK_MICRO,
            // Note: ManufacturerCode.BUSCH_JAEGER is left out intentionally here as their devices don't support colors
        ],
        manufacturerNames: ["GLEDOPTO", "Trust International B.V.\u0000"],
    },
];

interface ParsedMQTTMessage {
    type: "bind" | "unbind";
    sourceKey?: string;
    sourceEndpointKey?: string | number;
    targetKey?: string | number;
    targetEndpointKey?: string | number;
    clusters?: string[];
    skipDisableReporting: boolean;
    resolvedSource?: Device;
    resolvedTarget?: Device | Group | typeof DEFAULT_BIND_GROUP;
    resolvedSourceEndpoint?: zh.Endpoint;
    resolvedBindTarget?: number | zh.Endpoint | zh.Group;
}

export default class Bind extends Extension {
    #topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/(bind|unbind|binds/clear)`);
    private pollDebouncers: {[s: string]: () => void} = {};

    // biome-ignore lint/suspicious/useAwait: API
    override async start(): Promise<void> {
        this.eventBus.onDeviceMessage(this, this.poll);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onGroupMembersChanged(this, this.onGroupMembersChanged);
    }

    private parseMQTTMessage(
        data: eventdata.MQTTMessage,
    ): [raw: KeyValue | undefined, parsed: ParsedMQTTMessage | undefined, error: string | undefined] {
        if (data.topic.match(this.#topicRegex)) {
            const type = data.topic.endsWith("unbind") ? "unbind" : "bind";
            let skipDisableReporting = false;
            const message = JSON.parse(data.message) as Zigbee2MQTTAPI["bridge/request/device/bind"];

            if (typeof message !== "object" || message.from == null || message.to == null) {
                return [message, {type, skipDisableReporting}, "Invalid payload"];
            }

            const sourceKey = message.from;
            const sourceEndpointKey = message.from_endpoint ?? "default";
            const targetKey = message.to;
            const targetEndpointKey = message.to_endpoint;
            const clusters = message.clusters;
            skipDisableReporting = message.skip_disable_reporting != null ? message.skip_disable_reporting : false;
            const resolvedSource = this.zigbee.resolveEntity(message.from) as Device;

            if (!resolvedSource || !(resolvedSource instanceof Device)) {
                return [message, {type, skipDisableReporting}, `Source device '${message.from}' does not exist`];
            }

            const resolvedTarget =
                message.to === DEFAULT_BIND_GROUP.name || message.to === DEFAULT_BIND_GROUP.ID
                    ? DEFAULT_BIND_GROUP
                    : this.zigbee.resolveEntity(message.to);

            if (!resolvedTarget) {
                return [message, {type, skipDisableReporting}, `Target device or group '${message.to}' does not exist`];
            }

            const resolvedSourceEndpoint = resolvedSource.endpoint(sourceEndpointKey);

            if (!resolvedSourceEndpoint) {
                return [
                    message,
                    {type, skipDisableReporting},
                    `Source device '${resolvedSource.name}' does not have endpoint '${sourceEndpointKey}'`,
                ];
            }

            // resolves to 'default' endpoint if targetEndpointKey is invalid (used by frontend for 'Coordinator')
            const resolvedBindTarget =
                resolvedTarget instanceof Device
                    ? resolvedTarget.endpoint(targetEndpointKey)
                    : resolvedTarget instanceof Group
                      ? resolvedTarget.zh
                      : Number(resolvedTarget.ID);

            if (resolvedTarget instanceof Device && !resolvedBindTarget) {
                return [
                    message,
                    {type, skipDisableReporting},
                    `Target device '${resolvedTarget.name}' does not have endpoint '${targetEndpointKey}'`,
                ];
            }

            return [
                message,
                {
                    type,
                    sourceKey,
                    sourceEndpointKey,
                    targetKey,
                    targetEndpointKey,
                    clusters,
                    skipDisableReporting,
                    resolvedSource,
                    resolvedTarget,
                    resolvedSourceEndpoint,
                    resolvedBindTarget,
                },
                undefined,
            ];
        }

        return [undefined, undefined, undefined];
    }

    @bind private async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        if (data.topic.endsWith("binds/clear")) {
            const message = JSON.parse(data.message) as Zigbee2MQTTAPI["bridge/request/device/binds/clear"];

            if (typeof message !== "object" || typeof message.target !== "string") {
                await this.publishResponse("binds/clear", message, {}, "Invalid payload");
                return;
            }

            const target = this.zigbee.resolveEntity(message.target);

            if (!(target instanceof Device)) {
                await this.publishResponse("binds/clear", message, {}, "Invalid target");
                return;
            }

            // this list is raw (not resolved) to allow clearing any specific target (not only currently known)
            const eui64List = message.ieee_list ?? ["0xffffffffffffffff"];

            await target.zh.clearAllBindings(eui64List);

            const responseData: Zigbee2MQTTAPI["bridge/response/device/binds/clear"] = {
                target: message.target,
                ieee_list: eui64List,
            };

            await this.publishResponse("binds/clear", message, responseData);
            this.eventBus.emitDevicesChanged();
            return;
        }

        const [raw, parsed, error] = this.parseMQTTMessage(data);

        if (!raw || !parsed) {
            return;
        }

        if (error) {
            await this.publishResponse(parsed.type, raw, {}, error);
            return;
        }

        const {
            type,
            sourceKey,
            sourceEndpointKey,
            targetKey,
            targetEndpointKey,
            clusters,
            skipDisableReporting,
            resolvedSource,
            resolvedTarget,
            resolvedSourceEndpoint,
            resolvedBindTarget,
        } = parsed;

        assert(resolvedSource, "`resolvedSource` is missing");
        assert(resolvedTarget, "`resolvedTarget` is missing");
        assert(resolvedSourceEndpoint, "`resolvedSourceEndpoint` is missing");
        assert(resolvedBindTarget !== undefined, "`resolvedBindTarget` is missing");

        const successfulClusters: string[] = [];
        const failedClusters = [];
        const attemptedClusters = [];
        // Find which clusters are supported by both the source and target.
        // Groups are assumed to support all clusters.
        const clusterCandidates = clusters ?? ALL_CLUSTER_CANDIDATES;

        for (const cluster of clusterCandidates) {
            let matchingClusters = false;

            const anyClusterValid =
                utils.isZHGroup(resolvedBindTarget) ||
                typeof resolvedBindTarget === "number" ||
                (resolvedTarget instanceof Device && resolvedTarget.zh.type === "Coordinator");

            if (!anyClusterValid && utils.isZHEndpoint(resolvedBindTarget)) {
                matchingClusters =
                    (resolvedBindTarget.supportsInputCluster(cluster) && resolvedSourceEndpoint.supportsOutputCluster(cluster)) ||
                    (resolvedSourceEndpoint.supportsInputCluster(cluster) && resolvedBindTarget.supportsOutputCluster(cluster));
            }

            const sourceValid = resolvedSourceEndpoint.supportsInputCluster(cluster) || resolvedSourceEndpoint.supportsOutputCluster(cluster);

            if (sourceValid && (anyClusterValid || matchingClusters)) {
                logger.debug(`${type}ing cluster '${cluster}' from '${resolvedSource.name}' to '${resolvedTarget.name}'`);
                attemptedClusters.push(cluster);

                try {
                    if (type === "bind") {
                        await resolvedSourceEndpoint.bind(cluster, resolvedBindTarget);
                    } else {
                        await resolvedSourceEndpoint.unbind(cluster, resolvedBindTarget);
                    }

                    successfulClusters.push(cluster);
                    logger.info(
                        `Successfully ${type === "bind" ? "bound" : "unbound"} cluster '${cluster}' from '${resolvedSource.name}' to '${resolvedTarget.name}'`,
                    );
                } catch (error) {
                    failedClusters.push(cluster);
                    logger.error(`Failed to ${type} cluster '${cluster}' from '${resolvedSource.name}' to '${resolvedTarget.name}' (${error})`);
                }
            }
        }

        if (attemptedClusters.length === 0) {
            logger.error(`Nothing to ${type} from '${resolvedSource.name}' to '${resolvedTarget.name}'`);
            await this.publishResponse(parsed.type, raw, {}, `Nothing to ${type}`);
            return;
        }

        if (failedClusters.length === attemptedClusters.length) {
            await this.publishResponse(parsed.type, raw, {}, `Failed to ${type}`);
            return;
        }

        const responseData: Zigbee2MQTTAPI["bridge/response/device/bind"] | Zigbee2MQTTAPI["bridge/response/device/unbind"] = {
            // biome-ignore lint/style/noNonNullAssertion: valid with assert above on `resolvedSource`
            from: sourceKey!,
            // biome-ignore lint/style/noNonNullAssertion: valid with assert above on `resolvedSourceEndpoint`
            from_endpoint: sourceEndpointKey!,
            // biome-ignore lint/style/noNonNullAssertion: valid with assert above on `resolvedTarget`
            to: targetKey!,
            to_endpoint: targetEndpointKey,
            clusters: successfulClusters,
            failed: failedClusters,
        };

        if (successfulClusters.length !== 0) {
            if (type === "bind") {
                await this.setupReporting(
                    resolvedSourceEndpoint.binds.filter((b) => successfulClusters.includes(b.cluster.name) && b.target === resolvedBindTarget),
                );
            } else if (typeof resolvedBindTarget !== "number" && !skipDisableReporting) {
                await this.disableUnnecessaryReportings(resolvedBindTarget);
            }
        }

        await this.publishResponse(parsed.type, raw, responseData);
        this.eventBus.emitDevicesChanged();
    }

    private async publishResponse<T extends Zigbee2MQTTResponseEndpoints>(
        type: ParsedMQTTMessage["type"] | "binds/clear",
        request: KeyValue,
        data: Zigbee2MQTTAPI[T],
        error?: string,
    ): Promise<void> {
        const response = utils.getResponse(request, data, error);
        await this.mqtt.publish(`bridge/response/device/${type}`, stringify(response));

        if (error) {
            logger.error(error);
        }
    }

    @bind async onGroupMembersChanged(data: eventdata.GroupMembersChanged): Promise<void> {
        if (data.action === "add") {
            const bindsToGroup: zh.Bind[] = [];

            for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
                for (const endpoint of device.zh.endpoints) {
                    for (const bind of endpoint.binds) {
                        if (bind.target === data.group.zh) {
                            bindsToGroup.push(bind);
                        }
                    }
                }
            }

            await this.setupReporting(bindsToGroup);
        } else {
            // action === remove/remove_all
            if (!data.skipDisableReporting) {
                await this.disableUnnecessaryReportings(data.endpoint);
            }
        }
    }

    getSetupReportingEndpoints(bind: zh.Bind, coordinatorEp: zh.Endpoint): zh.Endpoint[] {
        const endpoints = utils.isZHEndpoint(bind.target) ? [bind.target] : bind.target.members;

        return endpoints.filter((e) => {
            if (!e.supportsInputCluster(bind.cluster.name)) {
                return false;
            }

            const hasConfiguredReporting = e.configuredReportings.some((c) => c.cluster.name === bind.cluster.name);

            if (!hasConfiguredReporting) {
                return true;
            }

            const hasBind = e.binds.some((b) => b.cluster.name === bind.cluster.name && b.target === coordinatorEp);

            return !hasBind;
        });
    }

    async setupReporting(binds: zh.Bind[]): Promise<void> {
        const coordinatorEndpoint = this.zigbee.firstCoordinatorEndpoint();

        for (const bind of binds) {
            if (bind.cluster.name in REPORT_CLUSTERS) {
                for (const endpoint of this.getSetupReportingEndpoints(bind, coordinatorEndpoint)) {
                    // biome-ignore lint/style/noNonNullAssertion: TODO: biome migration: ???
                    const resolvedDevice = this.zigbee.resolveEntity(endpoint.getDevice())!;
                    const entity = `${resolvedDevice.name}/${endpoint.ID}`;

                    try {
                        await endpoint.bind(bind.cluster.name, coordinatorEndpoint);

                        const items = [];

                        // biome-ignore lint/style/noNonNullAssertion: valid from outer `if`
                        for (const c of REPORT_CLUSTERS[bind.cluster.name as keyof typeof REPORT_CLUSTERS]!) {
                            if (!("condition" in c) || !c.condition || (await c.condition(endpoint))) {
                                const {attribute, minimumReportInterval, maximumReportInterval, reportableChange} = c;

                                items.push({attribute, minimumReportInterval, maximumReportInterval, reportableChange});
                            }
                        }

                        await endpoint.configureReporting(bind.cluster.name as keyof typeof REPORT_CLUSTERS, items);
                        logger.info(`Successfully setup reporting for '${entity}' cluster '${bind.cluster.name}'`);
                    } catch (error) {
                        logger.warning(`Failed to setup reporting for '${entity}' cluster '${bind.cluster.name}' (${(error as Error).message})`);
                    }
                }
            }
        }

        this.eventBus.emitDevicesChanged();
    }

    async disableUnnecessaryReportings(target: zh.Group | zh.Endpoint): Promise<void> {
        const coordinator = this.zigbee.firstCoordinatorEndpoint();
        const endpoints = utils.isZHEndpoint(target) ? [target] : target.members;
        const allBinds: zh.Bind[] = [];

        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            for (const endpoint of device.zh.endpoints) {
                allBinds.push(...endpoint.binds);
            }
        }

        for (const endpoint of endpoints) {
            const device = this.zigbee.resolveEntity(endpoint.getDevice()) as Device;
            const entity = `${device.name}/${endpoint.ID}`;
            const requiredClusters: string[] = [];
            const boundClusters: string[] = [];

            for (const bind of allBinds) {
                if (utils.isZHEndpoint(bind.target) ? bind.target === endpoint : bind.target.members.includes(endpoint)) {
                    requiredClusters.push(bind.cluster.name);
                }
            }

            for (const b of endpoint.binds) {
                if (b.target === coordinator && !requiredClusters.includes(b.cluster.name) && b.cluster.name in REPORT_CLUSTERS) {
                    boundClusters.push(b.cluster.name);
                }
            }

            for (const cluster of boundClusters) {
                try {
                    await endpoint.unbind(cluster, coordinator);

                    const items = [];

                    // biome-ignore lint/style/noNonNullAssertion: valid from loop (pushed to array only if in)
                    for (const item of REPORT_CLUSTERS[cluster as keyof typeof REPORT_CLUSTERS]!) {
                        if (!("condition" in item) || !item.condition || (await item.condition(endpoint))) {
                            const {attribute, minimumReportInterval, reportableChange} = item;

                            items.push({attribute, minimumReportInterval, maximumReportInterval: 0xffff, reportableChange});
                        }
                    }

                    await endpoint.configureReporting(cluster as keyof typeof REPORT_CLUSTERS, items);
                    logger.info(`Successfully disabled reporting for '${entity}' cluster '${cluster}'`);
                } catch (error) {
                    logger.warning(`Failed to disable reporting for '${entity}' cluster '${cluster}' (${(error as Error).message})`);
                }
            }

            this.eventBus.emitReconfigure({device});
        }
    }

    @bind async poll(data: eventdata.DeviceMessage): Promise<void> {
        /**
         * This method poll bound endpoints and group members for state changes.
         *
         * A use case is e.g. a Hue Dimmer switch bound to a Hue bulb.
         * Hue bulbs only report their on/off state.
         * When dimming the bulb via the dimmer switch the state is therefore not reported.
         * When we receive a message from a Hue dimmer we read the brightness from the bulb (if bound).
         */
        const polls = POLL_ON_MESSAGE.filter((p) =>
            p.cluster[data.cluster as keyof (typeof p)["cluster"]]?.some((c) => c.type === data.type && utils.equalsPartial(data.data, c.data)),
        );

        if (polls.length) {
            const toPoll = new Set<zh.Endpoint>();

            // Add bound devices
            for (const endpoint of data.device.zh.endpoints) {
                for (const bind of endpoint.binds) {
                    if (utils.isZHEndpoint(bind.target) && bind.target.getDevice().type !== "Coordinator") {
                        toPoll.add(bind.target);
                    }
                }
            }

            if (data.groupID && data.groupID !== 0) {
                // If message is published to a group, add members of the group
                const group = this.zigbee.groupByID(data.groupID);

                if (group) {
                    for (const member of group.zh.members) {
                        toPoll.add(member);
                    }
                }
            }

            for (const endpoint of toPoll) {
                const device = endpoint.getDevice();
                for (const poll of polls) {
                    if (
                        // biome-ignore lint/style/noNonNullAssertion: manufacturerID/manufacturerName can be undefined and won't match `includes`, but TS enforces same-type
                        (!poll.manufacturerIDs.includes(device.manufacturerID!) && !poll.manufacturerNames.includes(device.manufacturerName!)) ||
                        !endpoint.supportsInputCluster(poll.read.cluster)
                    ) {
                        continue;
                    }

                    let readAttrs = poll.read.attributes;

                    if (poll.read.attributesForEndpoint) {
                        const attrsForEndpoint = await poll.read.attributesForEndpoint(endpoint);
                        readAttrs = [...poll.read.attributes, ...attrsForEndpoint];
                    }

                    const key = `${device.ieeeAddr}_${endpoint.ID}_${POLL_ON_MESSAGE.indexOf(poll)}`;

                    if (!this.pollDebouncers[key]) {
                        this.pollDebouncers[key] = debounce(async () => {
                            try {
                                await endpoint.read(poll.read.cluster, readAttrs);
                            } catch (error) {
                                // biome-ignore lint/style/noNonNullAssertion: TODO: biome migration: ???
                                const resolvedDevice = this.zigbee.resolveEntity(device)!;
                                logger.error(`Failed to poll ${readAttrs} from ${resolvedDevice.name} (${(error as Error).message})`);
                            }
                        }, 1000);
                    }

                    this.pollDebouncers[key]();
                }
            }
        }
    }
}
