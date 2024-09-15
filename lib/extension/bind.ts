import assert from 'assert';

import bind from 'bind-decorator';
import debounce from 'debounce';
import stringify from 'json-stable-stringify-without-jsonify';

import {Zcl} from 'zigbee-herdsman';
import {ClusterName} from 'zigbee-herdsman/dist/zspec/zcl/definition/tstype';

import Device from '../model/device';
import Group from '../model/group';
import logger from '../util/logger';
import * as settings from '../util/settings';
import utils from '../util/utils';
import Extension from './extension';

const LEGACY_API = settings.get().advanced.legacy_api;
const LEGACY_TOPIC_REGEX = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/(bind|unbind)/.+$`);
const TOPIC_REGEX = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/(bind|unbind)`);
const ALL_CLUSTER_CANDIDATES: readonly ClusterName[] = [
    'genScenes',
    'genOnOff',
    'genLevelCtrl',
    'lightingColorCtrl',
    'closuresWindowCovering',
    'hvacThermostat',
    'msIlluminanceMeasurement',
    'msTemperatureMeasurement',
    'msRelativeHumidity',
    'msSoilMoisture',
    'msCO2',
];

// See zigbee-herdsman-converters
const DEFAULT_BIND_GROUP = {type: 'group_number', ID: 901, name: 'default_bind_group'};
const DEFAULT_REPORT_CONFIG = {minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1};

const getColorCapabilities = async (endpoint: zh.Endpoint): Promise<{colorTemperature: boolean; colorXY: boolean}> => {
    if (endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities') == null) {
        await endpoint.read('lightingColorCtrl', ['colorCapabilities']);
    }

    const value = endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities') as number;

    return {
        colorTemperature: (value & (1 << 4)) > 0,
        colorXY: (value & (1 << 3)) > 0,
    };
};

const REPORT_CLUSTERS: Readonly<
    Partial<
        Record<
            ClusterName,
            Readonly<{
                attribute: string;
                minimumReportInterval: number;
                maximumReportInterval: number;
                reportableChange: number;
                condition?: (endpoint: zh.Endpoint) => Promise<boolean>;
            }>[]
        >
    >
> = {
    genOnOff: [{attribute: 'onOff', ...DEFAULT_REPORT_CONFIG, minimumReportInterval: 0, reportableChange: 0}],
    genLevelCtrl: [{attribute: 'currentLevel', ...DEFAULT_REPORT_CONFIG}],
    lightingColorCtrl: [
        {
            attribute: 'colorTemperature',
            ...DEFAULT_REPORT_CONFIG,
            condition: async (endpoint): Promise<boolean> => (await getColorCapabilities(endpoint)).colorTemperature,
        },
        {
            attribute: 'currentX',
            ...DEFAULT_REPORT_CONFIG,
            condition: async (endpoint): Promise<boolean> => (await getColorCapabilities(endpoint)).colorXY,
        },
        {
            attribute: 'currentY',
            ...DEFAULT_REPORT_CONFIG,
            condition: async (endpoint): Promise<boolean> => (await getColorCapabilities(endpoint)).colorXY,
        },
    ],
    closuresWindowCovering: [
        {attribute: 'currentPositionLiftPercentage', ...DEFAULT_REPORT_CONFIG},
        {attribute: 'currentPositionTiltPercentage', ...DEFAULT_REPORT_CONFIG},
    ],
};

type PollOnMessage = {
    cluster: Readonly<Partial<Record<ClusterName, {type: string; data: KeyValue}[]>>>;
    read: Readonly<{cluster: string; attributes: string[]; attributesForEndpoint?: (endpoint: zh.Endpoint) => Promise<string[]>}>;
    manufacturerIDs: readonly Zcl.ManufacturerCode[];
    manufacturerNames: readonly string[];
}[];

const POLL_ON_MESSAGE: Readonly<PollOnMessage> = [
    {
        // On messages that have the cluster and type of below
        cluster: {
            manuSpecificPhilips: [
                {type: 'commandHueNotification', data: {button: 2}},
                {type: 'commandHueNotification', data: {button: 3}},
            ],
            genLevelCtrl: [
                {type: 'commandStep', data: {}},
                {type: 'commandStepWithOnOff', data: {}},
                {type: 'commandStop', data: {}},
                {type: 'commandMoveWithOnOff', data: {}},
                {type: 'commandStopWithOnOff', data: {}},
                {type: 'commandMove', data: {}},
                {type: 'commandMoveToLevelWithOnOff', data: {}},
            ],
            genScenes: [{type: 'commandRecall', data: {}}],
        },
        // Read the following attributes
        read: {cluster: 'genLevelCtrl', attributes: ['currentLevel']},
        // When the bound devices/members of group have the following manufacturerIDs
        manufacturerIDs: [
            Zcl.ManufacturerCode.SIGNIFY_NETHERLANDS_B_V,
            Zcl.ManufacturerCode.ATMEL,
            Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            Zcl.ManufacturerCode.MUELLER_LICHT_INTERNATIONAL_INC,
            Zcl.ManufacturerCode.TELINK_MICRO,
            Zcl.ManufacturerCode.BUSCH_JAEGER_ELEKTRO,
        ],
        manufacturerNames: ['GLEDOPTO', 'Trust International B.V.\u0000'],
    },
    {
        cluster: {
            genLevelCtrl: [
                {type: 'commandStepWithOnOff', data: {}},
                {type: 'commandMoveWithOnOff', data: {}},
                {type: 'commandStopWithOnOff', data: {}},
                {type: 'commandMoveToLevelWithOnOff', data: {}},
            ],
            genOnOff: [
                {type: 'commandOn', data: {}},
                {type: 'commandOff', data: {}},
                {type: 'commandOffWithEffect', data: {}},
                {type: 'commandToggle', data: {}},
            ],
            genScenes: [{type: 'commandRecall', data: {}}],
            manuSpecificPhilips: [
                {type: 'commandHueNotification', data: {button: 1}},
                {type: 'commandHueNotification', data: {button: 4}},
            ],
        },
        read: {cluster: 'genOnOff', attributes: ['onOff']},
        manufacturerIDs: [
            Zcl.ManufacturerCode.SIGNIFY_NETHERLANDS_B_V,
            Zcl.ManufacturerCode.ATMEL,
            Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            Zcl.ManufacturerCode.MUELLER_LICHT_INTERNATIONAL_INC,
            Zcl.ManufacturerCode.TELINK_MICRO,
            Zcl.ManufacturerCode.BUSCH_JAEGER_ELEKTRO,
        ],
        manufacturerNames: ['GLEDOPTO', 'Trust International B.V.\u0000'],
    },
    {
        cluster: {
            genScenes: [{type: 'commandRecall', data: {}}],
        },
        read: {
            cluster: 'lightingColorCtrl',
            attributes: [] as string[],
            // Since not all devices support the same attributes they need to be calculated dynamically
            // depending on the capabilities of the endpoint.
            attributesForEndpoint: async (endpoint): Promise<string[]> => {
                const supportedAttrs = await getColorCapabilities(endpoint);
                const readAttrs: string[] = [];

                /* istanbul ignore else */
                if (supportedAttrs.colorXY) {
                    readAttrs.push('currentX', 'currentY');
                }

                /* istanbul ignore else */
                if (supportedAttrs.colorTemperature) {
                    readAttrs.push('colorTemperature');
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
        manufacturerNames: ['GLEDOPTO', 'Trust International B.V.\u0000'],
    },
];

interface ParsedMQTTMessage {
    type: 'bind' | 'unbind';
    sourceKey: string;
    targetKey: string;
    clusters?: string[];
    skipDisableReporting: boolean;
}

interface DataMessage {
    from: ParsedMQTTMessage['sourceKey'];
    to: ParsedMQTTMessage['targetKey'];
    clusters: ParsedMQTTMessage['clusters'];
    skip_disable_reporting?: ParsedMQTTMessage['skipDisableReporting'];
}

export default class Bind extends Extension {
    private pollDebouncers: {[s: string]: () => void} = {};

    override async start(): Promise<void> {
        this.eventBus.onDeviceMessage(this, this.poll);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onGroupMembersChanged(this, this.onGroupMembersChanged);
    }

    private parseMQTTMessage(data: eventdata.MQTTMessage): ParsedMQTTMessage | undefined {
        let type: ParsedMQTTMessage['type'] | undefined;
        let sourceKey: ParsedMQTTMessage['sourceKey'] | undefined;
        let targetKey: ParsedMQTTMessage['targetKey'] | undefined;
        let clusters: ParsedMQTTMessage['clusters'] | undefined;
        let skipDisableReporting: ParsedMQTTMessage['skipDisableReporting'] = false;

        if (LEGACY_API && data.topic.match(LEGACY_TOPIC_REGEX)) {
            const topic = data.topic.replace(`${settings.get().mqtt.base_topic}/bridge/`, '');
            type = topic.split('/')[0] as ParsedMQTTMessage['type'];
            sourceKey = topic.replace(`${type}/`, '');
            targetKey = data.message;
        } else if (data.topic.match(TOPIC_REGEX)) {
            type = data.topic.endsWith('unbind') ? 'unbind' : 'bind';
            const message: DataMessage = JSON.parse(data.message);
            sourceKey = message.from;
            targetKey = message.to;
            clusters = message.clusters;
            skipDisableReporting = message.skip_disable_reporting != undefined ? message.skip_disable_reporting : false;
        } else {
            return undefined;
        }

        return {type, sourceKey, targetKey, clusters, skipDisableReporting};
    }

    @bind private async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const parsed = this.parseMQTTMessage(data);

        if (!parsed || !parsed.type) {
            return;
        }

        const {type, sourceKey, targetKey, clusters, skipDisableReporting} = parsed;
        const message = utils.parseJSON(data.message, data.message);

        let error: string | undefined;
        const parsedSource = this.zigbee.resolveEntityAndEndpoint(sourceKey);
        const parsedTarget = this.zigbee.resolveEntityAndEndpoint(targetKey);
        const source = parsedSource.entity;
        const target = targetKey === DEFAULT_BIND_GROUP.name ? DEFAULT_BIND_GROUP : parsedTarget.entity;
        const responseData: KeyValue = {from: sourceKey, to: targetKey};

        if (!source || !(source instanceof Device)) {
            error = `Source device '${sourceKey}' does not exist`;
        } else if (parsedSource.endpointID && !parsedSource.endpoint) {
            error = `Source device '${parsedSource.ID}' does not have endpoint '${parsedSource.endpointID}'`;
        } else if (!target) {
            error = `Target device or group '${targetKey}' does not exist`;
        } else if (target instanceof Device && parsedTarget.endpointID && !parsedTarget.endpoint) {
            error = `Target device '${parsedTarget.ID}' does not have endpoint '${parsedTarget.endpointID}'`;
        } else {
            const successfulClusters: string[] = [];
            const failedClusters = [];
            const attemptedClusters = [];

            const bindSource = parsedSource.endpoint;
            const bindTarget = target instanceof Device ? parsedTarget.endpoint : target instanceof Group ? target.zh : Number(target.ID);

            assert(bindSource != undefined && bindTarget != undefined);

            // Find which clusters are supported by both the source and target.
            // Groups are assumed to support all clusters.
            const clusterCandidates = clusters ?? ALL_CLUSTER_CANDIDATES;

            for (const cluster of clusterCandidates) {
                let matchingClusters = false;

                const anyClusterValid = utils.isZHGroup(bindTarget) || typeof bindTarget === 'number' || (target as Device).zh.type === 'Coordinator';

                if (!anyClusterValid && utils.isZHEndpoint(bindTarget)) {
                    matchingClusters =
                        (bindTarget.supportsInputCluster(cluster) && bindSource.supportsOutputCluster(cluster)) ||
                        (bindSource.supportsInputCluster(cluster) && bindTarget.supportsOutputCluster(cluster));
                }

                const sourceValid = bindSource.supportsInputCluster(cluster) || bindSource.supportsOutputCluster(cluster);

                if (sourceValid && (anyClusterValid || matchingClusters)) {
                    logger.debug(`${type}ing cluster '${cluster}' from '${source.name}' to '${target.name}'`);
                    attemptedClusters.push(cluster);

                    try {
                        if (type === 'bind') {
                            await bindSource.bind(cluster, bindTarget);
                        } else {
                            await bindSource.unbind(cluster, bindTarget);
                        }

                        successfulClusters.push(cluster);
                        logger.info(
                            `Successfully ${type === 'bind' ? 'bound' : 'unbound'} cluster '${cluster}' from '${source.name}' to '${target.name}'`,
                        );

                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            await this.mqtt.publish(
                                'bridge/log',
                                stringify({type: `device_${type}`, message: {from: source.name, to: target.name, cluster}}),
                            );
                        }
                    } catch (error) {
                        failedClusters.push(cluster);
                        logger.error(`Failed to ${type} cluster '${cluster}' from '${source.name}' to '${target.name}' (${error})`);

                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            await this.mqtt.publish(
                                'bridge/log',
                                stringify({type: `device_${type}_failed`, message: {from: source.name, to: target.name, cluster}}),
                            );
                        }
                    }
                }
            }

            if (attemptedClusters.length === 0) {
                logger.error(`Nothing to ${type} from '${source.name}' to '${target.name}'`);
                error = `Nothing to ${type}`;

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    await this.mqtt.publish('bridge/log', stringify({type: `device_${type}_failed`, message: {from: source.name, to: target.name}}));
                }
            } else if (failedClusters.length === attemptedClusters.length) {
                error = `Failed to ${type}`;
            }

            responseData[`clusters`] = successfulClusters;
            responseData[`failed`] = failedClusters;

            if (successfulClusters.length !== 0) {
                if (type === 'bind') {
                    await this.setupReporting(bindSource.binds.filter((b) => successfulClusters.includes(b.cluster.name) && b.target === bindTarget));
                } else if (typeof bindTarget !== 'number' && !skipDisableReporting) {
                    await this.disableUnnecessaryReportings(bindTarget);
                }
            }
        }

        const triggeredViaLegacyApi = data.topic.match(LEGACY_TOPIC_REGEX);

        if (!triggeredViaLegacyApi) {
            const response = utils.getResponse(message, responseData, error);

            await this.mqtt.publish(`bridge/response/device/${type}`, stringify(response));
        }

        if (error) {
            logger.error(error);
        } else {
            this.eventBus.emitDevicesChanged();
        }
    }

    @bind async onGroupMembersChanged(data: eventdata.GroupMembersChanged): Promise<void> {
        if (data.action === 'add') {
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
            /* istanbul ignore else */
            if (bind.cluster.name in REPORT_CLUSTERS) {
                for (const endpoint of this.getSetupReportingEndpoints(bind, coordinatorEndpoint)) {
                    const entity = `${this.zigbee.resolveEntity(endpoint.getDevice())!.name}/${endpoint.ID}`;

                    try {
                        await endpoint.bind(bind.cluster.name, coordinatorEndpoint);

                        const items = [];

                        for (const c of REPORT_CLUSTERS[bind.cluster.name as ClusterName]!) {
                            /* istanbul ignore else */
                            if (!c.condition || (await c.condition(endpoint))) {
                                const i = {...c};
                                delete i.condition;

                                items.push(i);
                            }
                        }

                        await endpoint.configureReporting(bind.cluster.name, items);
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
                for (const bind of endpoint.binds) {
                    allBinds.push(bind);
                }
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
                /* istanbul ignore else */
                if (b.target === coordinator && !requiredClusters.includes(b.cluster.name) && b.cluster.name in REPORT_CLUSTERS) {
                    boundClusters.push(b.cluster.name);
                }
            }

            for (const cluster of boundClusters) {
                try {
                    await endpoint.unbind(cluster, coordinator);

                    const items = [];

                    for (const item of REPORT_CLUSTERS[cluster as ClusterName]!) {
                        /* istanbul ignore else */
                        if (!item.condition || (await item.condition(endpoint))) {
                            const i = {...item};
                            delete i.condition;

                            items.push({...i, maximumReportInterval: 0xffff});
                        }
                    }

                    await endpoint.configureReporting(cluster, items);
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
            p.cluster[data.cluster as ClusterName]?.some((c) => c.type === data.type && utils.equalsPartial(data.data, c.data)),
        );

        if (polls.length) {
            const toPoll: Set<zh.Endpoint> = new Set();

            // Add bound devices
            for (const endpoint of data.device.zh.endpoints) {
                for (const bind of endpoint.binds) {
                    if (utils.isZHEndpoint(bind.target) && bind.target.getDevice().type !== 'Coordinator') {
                        toPoll.add(bind.target);
                    }
                }
            }

            // If message is published to a group, add members of the group
            const group = data.groupID && data.groupID !== 0 && this.zigbee.groupByID(data.groupID);

            if (group) {
                for (const member of group.zh.members) {
                    toPoll.add(member);
                }
            }

            for (const endpoint of toPoll) {
                const device = endpoint.getDevice();
                for (const poll of polls) {
                    // XXX: manufacturerID/manufacturerName can be undefined and won't match `includes`, but TS enforces same-type
                    if (
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
                                logger.error(
                                    `Failed to poll ${readAttrs} from ${this.zigbee.resolveEntity(device)!.name} (${(error as Error).message})`,
                                );
                            }
                        }, 1000);
                    }

                    this.pollDebouncers[key]();
                }
            }
        }
    }
}
