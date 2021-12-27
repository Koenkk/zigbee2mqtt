import * as settings from '../util/settings';
import logger from '../util/logger';
import utils from '../util/utils';
import Extension from './extension';
import stringify from 'json-stable-stringify-without-jsonify';
import debounce from 'debounce';
import * as zigbeeHersdman from 'zigbee-herdsman/dist';
import bind from 'bind-decorator';
import Device from '../model/device';
import Group from '../model/group';

const legacyApi = settings.get().advanced.legacy_api;
const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/(bind|unbind)/.+$`);
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/(bind|unbind)`);
const clusterCandidates = ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl', 'closuresWindowCovering',
    'hvacThermostat', 'msTemperatureMeasurement'];

// See zigbee-herdsman-converters
const defaultBindGroup = {type: 'group_number', ID: 901, name: 'default_bind_group'};

const defaultReportConfiguration = {
    minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1,
};

const getColorCapabilities = async (endpoint: zh.Endpoint): Promise<{colorTemperature: boolean, colorXY: boolean}> => {
    if (endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities') == null) {
        await endpoint.read('lightingColorCtrl', ['colorCapabilities']);
    }

    const value = endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities') as number;
    return {
        colorTemperature: (value & 1<<4) > 0,
        colorXY: (value & 1<<3) > 0,
    };
};

const reportClusters: {[s: string]:
    {attribute: string, minimumReportInterval: number, maximumReportInterval: number, reportableChange: number
        condition?: (endpoint: zh.Endpoint) => Promise<boolean>}[]} =
{
    'genOnOff': [
        {attribute: 'onOff', ...defaultReportConfiguration, minimumReportInterval: 0, reportableChange: 0},
    ],
    'genLevelCtrl': [
        {attribute: 'currentLevel', ...defaultReportConfiguration},
    ],
    'lightingColorCtrl': [
        {
            attribute: 'colorTemperature', ...defaultReportConfiguration,
            condition: async (endpoint): Promise<boolean> => (await getColorCapabilities(endpoint)).colorTemperature,
        },
        {
            attribute: 'currentX', ...defaultReportConfiguration,
            condition: async (endpoint): Promise<boolean> => (await getColorCapabilities(endpoint)).colorXY,
        },
        {
            attribute: 'currentY', ...defaultReportConfiguration,
            condition: async (endpoint): Promise<boolean> => (await getColorCapabilities(endpoint)).colorXY,
        },
    ],
    'closuresWindowCovering': [
        {attribute: 'currentPositionLiftPercentage', ...defaultReportConfiguration},
        {attribute: 'currentPositionTiltPercentage', ...defaultReportConfiguration},
    ],
};

type PollOnMessage = {
    cluster: {[s: string]: {type: string, data: KeyValue}[]}
    read: {cluster: string, attributes: string[], attributesForEndpoint?: (endpoint: zh.Endpoint) => Promise<string[]>}
    manufacturerIDs: number[]
}[];

const pollOnMessage: PollOnMessage = [
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
            genScenes: [
                {type: 'commandRecall', data: {}},
            ],
        },
        // Read the following attributes
        read: {cluster: 'genLevelCtrl', attributes: ['currentLevel']},
        // When the bound devices/members of group have the following manufacturerIDs
        manufacturerIDs: [
            zigbeeHersdman.Zcl.ManufacturerCode.Philips,
            zigbeeHersdman.Zcl.ManufacturerCode.ATMEL,
            zigbeeHersdman.Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            zigbeeHersdman.Zcl.ManufacturerCode.MUELLER_LICHT_INT,
            zigbeeHersdman.Zcl.ManufacturerCode.TELINK,
        ],
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
            genScenes: [
                {type: 'commandRecall', data: {}},
            ],
            manuSpecificPhilips: [
                {type: 'commandHueNotification', data: {button: 1}},
                {type: 'commandHueNotification', data: {button: 4}},
            ],
        },
        read: {cluster: 'genOnOff', attributes: ['onOff']},
        manufacturerIDs: [
            zigbeeHersdman.Zcl.ManufacturerCode.Philips,
            zigbeeHersdman.Zcl.ManufacturerCode.ATMEL,
            zigbeeHersdman.Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            zigbeeHersdman.Zcl.ManufacturerCode.MUELLER_LICHT_INT,
            zigbeeHersdman.Zcl.ManufacturerCode.TELINK,
        ],
    },
    {
        cluster: {
            genScenes: [
                {type: 'commandRecall', data: {}},
            ],
        },
        read: {
            cluster: 'lightingColorCtrl',
            attributes: [] as string[],
            // Since not all devices support the same attributes they need to be calculated dynamically
            // depending on the capabilities of the endpoint.
            attributesForEndpoint: async (endpoint): Promise<string[]> => {
                const supportedAttrs = await getColorCapabilities(endpoint);
                const readAttrs: string[] = [];
                supportedAttrs.colorXY && readAttrs.push('currentX', 'currentY');
                supportedAttrs.colorTemperature && readAttrs.push('colorTemperature');
                return readAttrs;
            },
        },
        manufacturerIDs: [
            zigbeeHersdman.Zcl.ManufacturerCode.Philips,
            zigbeeHersdman.Zcl.ManufacturerCode.ATMEL,
            zigbeeHersdman.Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            zigbeeHersdman.Zcl.ManufacturerCode.MUELLER_LICHT_INT,
            zigbeeHersdman.Zcl.ManufacturerCode.TELINK,
        ],
    },
];

interface ParsedMQTTMessage {
    type: 'bind' | 'unbind', sourceKey: string, targetKey: string, clusters: string[], skipDisableReporting: boolean
}

export default class Bind extends Extension {
    private pollDebouncers: {[s: string]: () => void} = {};

    override async start(): Promise<void> {
        this.eventBus.onDeviceMessage(this, this.poll);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onGroupMembersChanged(this, this.onGroupMembersChanged);
    }

    private parseMQTTMessage(data: eventdata.MQTTMessage): ParsedMQTTMessage {
        let type: 'bind' | 'unbind' = null;
        let sourceKey = null;
        let targetKey = null;
        let clusters = null;
        let skipDisableReporting = false;

        if (legacyApi && data.topic.match(legacyTopicRegex)) {
            const topic = data.topic.replace(`${settings.get().mqtt.base_topic}/bridge/`, '');
            type = topic.split('/')[0] as 'bind' | 'unbind';
            sourceKey = topic.replace(`${type}/`, '');
            targetKey = data.message;
        } else if (data.topic.match(topicRegex)) {
            type = data.topic.endsWith('unbind') ? 'unbind' : 'bind';
            const message = JSON.parse(data.message);
            sourceKey = message.from;
            targetKey = message.to;
            clusters = message.clusters;
            skipDisableReporting = 'skip_disable_reporting' in message ? message.skip_disable_reporting : false;
        }

        return {type, sourceKey, targetKey, clusters, skipDisableReporting};
    }

    @bind private async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const {type, sourceKey, targetKey, clusters, skipDisableReporting} = this.parseMQTTMessage(data);
        if (!type) return null;
        const message = utils.parseJSON(data.message, data.message);

        let error = null;
        const parsedSource = utils.parseEntityID(sourceKey);
        const parsedTarget = utils.parseEntityID(targetKey);
        const source = this.zigbee.resolveEntity(parsedSource.ID);
        const target = targetKey === 'default_bind_group' ?
            defaultBindGroup : this.zigbee.resolveEntity(parsedTarget.ID);
        const responseData: KeyValue = {from: sourceKey, to: targetKey};

        if (!source || !(source instanceof Device)) {
            error = `Source device '${sourceKey}' does not exist`;
        } else if (!target) {
            error = `Target device or group '${targetKey}' does not exist`;
        } else {
            const successfulClusters: string[] = [];
            const failedClusters = [];
            const attemptedClusters = [];

            const bindSource: zh.Endpoint = source.endpoint(parsedSource.endpoint);
            let bindTarget: number | zh.Group | zh.Endpoint = null;
            if (target instanceof Device) bindTarget = target.endpoint(parsedTarget.endpoint);
            else if (target instanceof Group) bindTarget = target.zh;
            else bindTarget = Number(target.ID);

            // Find which clusters are supported by both the source and target.
            // Groups are assumed to support all clusters.
            for (const cluster of clusterCandidates) {
                if (clusters && !clusters.includes(cluster)) continue;
                let matchingClusters = false;

                const anyClusterValid = utils.isZHGroup(bindTarget) || typeof bindTarget === 'number' ||
                    (target as Device).zh.type === 'Coordinator';

                if (!anyClusterValid && utils.isEndpoint(bindTarget)) {
                    matchingClusters = ((bindTarget.supportsInputCluster(cluster) &&
                            bindSource.supportsOutputCluster(cluster)) ||
                            (bindSource.supportsInputCluster(cluster) &&
                            bindTarget.supportsOutputCluster(cluster)) );
                }

                const sourceValid = bindSource.supportsInputCluster(cluster) ||
                bindSource.supportsOutputCluster(cluster);

                if ( sourceValid && (anyClusterValid || matchingClusters)) {
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
                            `Successfully ${type === 'bind' ? 'bound' : 'unbound'} cluster '${cluster}' from ` +
                            `'${source.name}' to '${target.name}'`,
                        );

                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            this.mqtt.publish(
                                'bridge/log',
                                stringify({type: `device_${type}`,
                                    message: {from: source.name, to: target.name, cluster}}),
                            );
                        }
                    } catch (error) {
                        failedClusters.push(cluster);
                        logger.error(
                            `Failed to ${type} cluster '${cluster}' from '${source.name}' to ` +
                            `'${target.name}' (${error})`,
                        );

                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            this.mqtt.publish(
                                'bridge/log',
                                stringify({type: `device_${type}_failed`,
                                    message: {from: source.name, to: target.name, cluster}}),
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
                    this.mqtt.publish(
                        'bridge/log',
                        stringify({type: `device_${type}_failed`, message: {from: source.name, to: target.name}}),
                    );
                }
            } else if (failedClusters.length === attemptedClusters.length) {
                error = `Failed to ${type}`;
            }

            responseData[`clusters`] = successfulClusters;
            responseData[`failed`] = failedClusters;

            if (successfulClusters.length !== 0) {
                if (type === 'bind') {
                    await this.setupReporting(bindSource.binds.filter((b) =>
                        successfulClusters.includes(b.cluster.name) && b.target === bindTarget));
                } else if ((typeof bindTarget !== 'number') && !skipDisableReporting) {
                    await this.disableUnnecessaryReportings(bindTarget);
                }
            }
        }

        const triggeredViaLegacyApi = data.topic.match(legacyTopicRegex);
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
            const bindsToGroup = this.zigbee.devices(false).map((c) => c.zh.endpoints)
                .reduce((a, v) => a.concat(v)).map((e) => e.binds)
                .reduce((a, v) => a.concat(v)).filter((b) => b.target === data.group.zh);
            await this.setupReporting(bindsToGroup);
        } else { // action === remove/remove_all
            if (!data.skipDisableReporting) {
                await this.disableUnnecessaryReportings(data.endpoint);
            }
        }
    }

    getSetupReportingEndpoints(bind: zh.Bind, coordinatorEp: zh.Endpoint): zh.Endpoint[] {
        const endpoints = utils.isEndpoint(bind.target) ? [bind.target] : bind.target.members;
        return endpoints.filter((e) => {
            const supportsInputCluster = e.supportsInputCluster(bind.cluster.name);
            const hasConfiguredReporting = !!e.configuredReportings.find((c) => c.cluster.name === bind.cluster.name);
            const hasBind = !!e.binds.find((b) => b.cluster.name === bind.cluster.name && b.target === coordinatorEp);
            return supportsInputCluster && !(hasBind && hasConfiguredReporting);
        });
    }

    async setupReporting(binds: zh.Bind[]): Promise<void> {
        const coordinatorEndpoint = this.zigbee.firstCoordinatorEndpoint();
        for (const bind of binds.filter((b) => b.cluster.name in reportClusters)) {
            for (const endpoint of this.getSetupReportingEndpoints(bind, coordinatorEndpoint)) {
                const entity = `${this.zigbee.resolveEntity(endpoint.getDevice()).name}/${endpoint.ID}`;
                try {
                    await endpoint.bind(bind.cluster.name, coordinatorEndpoint);
                    const items = [];
                    for (const c of reportClusters[bind.cluster.name]) {
                        /* istanbul ignore else */
                        if (!c.condition || await c.condition(endpoint)) {
                            const i = {...c};
                            delete i.condition;
                            items.push(i);
                        }
                    }

                    await endpoint.configureReporting(bind.cluster.name, items);
                    logger.info(`Succesfully setup reporting for '${entity}' cluster '${bind.cluster.name}'`);
                } catch (error) {
                    logger.warn(`Failed to setup reporting for '${entity}' cluster '${bind.cluster.name}'`);
                }
            }
        }

        this.eventBus.emitDevicesChanged();
    }

    async disableUnnecessaryReportings(target: zh.Group | zh.Endpoint): Promise<void> {
        const coordinator = this.zigbee.firstCoordinatorEndpoint();
        const endpoints = utils.isEndpoint(target) ? [target] : target.members;
        for (const endpoint of endpoints) {
            const device = this.zigbee.resolveEntity(endpoint.getDevice()) as Device;
            const entity = `${device.name}/${endpoint.ID}`;
            const boundClusters = endpoint.binds.filter((b) => b.target === coordinator)
                .map((b) => b.cluster.name);
            const requiredClusters = this.zigbee.devices(false).map((c) => c.zh.endpoints)
                .reduce((a, v) => a.concat(v))
                .map((e) => e.binds).reduce((a, v) => a.concat(v)).filter((bind) => {
                    if (utils.isEndpoint(bind.target)) {
                        return bind.target === endpoint;
                    } else {
                        return bind.target.members.includes(endpoint);
                    }
                }).map((b) => b.cluster.name).filter((v, i, a) => a.indexOf(v) === i);

            for (const cluster of boundClusters.filter((c) => !requiredClusters.includes(c) && c in reportClusters)) {
                try {
                    await endpoint.unbind(cluster, coordinator);
                    const items = [];
                    for (const item of reportClusters[cluster]) {
                        /* istanbul ignore else */
                        if (!item.condition || await item.condition(endpoint)) {
                            const i = {...item};
                            delete i.condition;
                            items.push({...i, maximumReportInterval: 0xFFFF});
                        }
                    }

                    await endpoint.configureReporting(cluster, items);
                    logger.info(`Succesfully disabled reporting for '${entity}' cluster '${cluster}'`);
                } catch (error) {
                    logger.warn(`Failed to disable reporting for '${entity}' cluster '${cluster}'`);
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
        const polls = pollOnMessage.filter((p) =>
            p.cluster[data.cluster]?.find((c) => c.type === data.type && utils.equalsPartial(data.data, c.data)));

        if (polls.length) {
            const toPoll: Set<zh.Endpoint> = new Set();
            // Add bound devices
            for (const endpoint of data.device.zh.endpoints) {
                for (const bind of endpoint.binds) {
                    if (utils.isEndpoint(bind.target) && bind.target.getDevice().type !== 'Coordinator') {
                        toPoll.add(bind.target);
                    }
                }
            }

            // If message is published to a group, add members of the group
            const group = data.groupID && data.groupID !== 0 && this.zigbee.groupByID(data.groupID);
            if (group) {
                group.zh.members.forEach((m) => toPoll.add(m));
            }

            for (const endpoint of toPoll) {
                for (const poll of polls) {
                    if (!poll.manufacturerIDs.includes(endpoint.getDevice().manufacturerID) ||
                        !endpoint.supportsInputCluster(poll.read.cluster)) {
                        continue;
                    }

                    let readAttrs = poll.read.attributes;
                    if (poll.read.attributesForEndpoint) {
                        const attrsForEndpoint = await poll.read.attributesForEndpoint(endpoint);
                        readAttrs = [...poll.read.attributes, ...attrsForEndpoint];
                    }

                    const key = `${endpoint.getDevice().ieeeAddr}_${endpoint.ID}_${pollOnMessage.indexOf(poll)}`;
                    if (!this.pollDebouncers[key]) {
                        this.pollDebouncers[key] = debounce(async () => {
                            await endpoint.read(poll.read.cluster, readAttrs);
                        }, 1000);
                    }

                    this.pollDebouncers[key]();
                }
            }
        }
    }
}
