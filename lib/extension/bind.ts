import * as settings from '../util/settings';
import logger from '../util/logger';
import * as utils from '../util/utils';
import ExtensionTS from './extensionts';
// @ts-ignore
import stringify from 'json-stable-stringify-without-jsonify';
import debounce from 'debounce';
import zigbeeHersdman from 'zigbee-herdsman';
import bind from 'bind-decorator';

const legacyApi = settings.get().advanced.legacy_api;
const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/(bind|unbind)/.+$`);
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/(bind|unbind)`);
const clusterCandidates = ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl', 'closuresWindowCovering',
    'hvacThermostat', 'msTemperatureMeasurement'];

// See zigbee-herdsman-converters
const defaultBindGroup = {type: 'group_number', ID: 901};

const defaultReportConfiguration = {
    minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1,
};

const getColorCapabilities = async (endpoint: ZHEndpoint): Promise<{colorTemperature: boolean, colorXY: boolean}> => {
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
        condition?: (endpoint: ZHEndpoint) => Promise<boolean>}[]} =
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
    read: {cluster: string, attributes: string[], attributesForEndpoint?: (endpoint: ZHEndpoint) => Promise<string[]>}
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
        ],
    },
];

class Bind extends ExtensionTS {
    private pollDebouncers: {[s: string]: () => void} = {};

    override async start(): Promise<void> {
        this.eventBus.onDeviceMessage(this, this.poll);

        this.eventBus.onGroupMembersChanged(this, this.onGroupMembersChanged);
        this.eventBus.on(`groupMembersChanged`, (d) => this.groupMembersChanged(d), this.constructor.name);
    }

    parseMQTTMessage(topic, message) {
        let type = null;
        let sourceKey = null;
        let targetKey = null;
        let clusters = null;
        let skipDisableReporting = false;

        if (legacyApi && topic.match(legacyTopicRegex)) {
            topic = topic.replace(`${settings.get().mqtt.base_topic}/bridge/`, '');
            type = topic.split('/')[0];
            sourceKey = topic.replace(`${type}/`, '');
            targetKey = message;
        } else if (topic.match(topicRegex)) {
            type = topic.endsWith('unbind') ? 'unbind' : 'bind';
            message = JSON.parse(message);
            sourceKey = message.from;
            targetKey = message.to;
            clusters = message.clusters;
            skipDisableReporting = 'skip_disable_reporting' in message ? message.skip_disable_reporting : false;
        }

        return {type, sourceKey, targetKey, clusters, skipDisableReporting};
    }

    async onMQTTMessage(topic, message) {
        const {type, sourceKey, targetKey, clusters, skipDisableReporting} = this.parseMQTTMessage(topic, message);
        if (!type) return null;
        message = utils.parseJSON(message, message);

        let error = null;
        const source = this.zigbee.resolveEntityLegacy(sourceKey);
        const target = targetKey === 'default_bind_group' ?
            defaultBindGroup : this.zigbee.resolveEntityLegacy(targetKey);
        const responseData = {from: sourceKey, to: targetKey};

        if (!source || source.type !== 'device') {
            error = `Source device '${sourceKey}' does not exist`;
        } else if (!target) {
            error = `Target device or group '${targetKey}' does not exist`;
        } else {
            const sourceName = source.settings.friendlyName;
            const targetName = targetKey === 'default_bind_group' ? targetKey : target.settings.friendlyName;
            const successfulClusters = [];
            const failedClusters = [];
            const attemptedClusters = [];

            let bindTarget = null;
            if (target.type === 'group') bindTarget = target.group;
            else if (target.type === 'group_number') bindTarget = target.ID;
            else bindTarget = target.endpoint;

            // Find which clusters are supported by both the source and target.
            // Groups are assumed to support all clusters.
            for (const cluster of clusterCandidates) {
                if (clusters && !clusters.includes(cluster)) continue;
                let matchingClusters = false;

                const anyClusterValid = target.type === 'group' || target.type === 'group_number' ||
                    target.device.type === 'Coordinator';

                if (!anyClusterValid) {
                    matchingClusters = ((target.endpoint.supportsInputCluster(cluster) &&
                            source.endpoint.supportsOutputCluster(cluster)) ||
                            (source.endpoint.supportsInputCluster(cluster) &&
                            target.endpoint.supportsOutputCluster(cluster)) );
                }

                const sourceValid = source.endpoint.supportsInputCluster(cluster) ||
                source.endpoint.supportsOutputCluster(cluster);

                if ( sourceValid && (anyClusterValid || matchingClusters)) {
                    logger.debug(`${type}ing cluster '${cluster}' from '${sourceName}' to '${targetName}'`);
                    attemptedClusters.push(cluster);

                    try {
                        if (type === 'bind') {
                            await source.endpoint.bind(cluster, bindTarget);
                        } else {
                            await source.endpoint.unbind(cluster, bindTarget);
                        }

                        successfulClusters.push(cluster);
                        logger.info(
                            `Successfully ${type === 'bind' ? 'bound' : 'unbound'} cluster '${cluster}' from ` +
                            `'${sourceName}' to '${targetName}'`,
                        );

                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            this.mqtt.publish(
                                'bridge/log',
                                stringify({type: `device_${type}`,
                                    message: {from: sourceName, to: targetName, cluster}}),
                            );
                        }
                    } catch (error) {
                        failedClusters.push(cluster);
                        logger.error(
                            `Failed to ${type} cluster '${cluster}' from '${sourceName}' to ` +
                            `'${targetName}' (${error})`,
                        );

                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            this.mqtt.publish(
                                'bridge/log',
                                stringify({type: `device_${type}_failed`,
                                    message: {from: sourceName, to: targetName, cluster}}),
                            );
                        }
                    }
                }
            }

            if (attemptedClusters.length === 0) {
                logger.error(`Nothing to ${type} from '${sourceName}' to '${targetName}'`);
                error = `Nothing to ${type}`;

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    this.mqtt.publish(
                        'bridge/log',
                        stringify({type: `device_${type}_failed`, message: {from: sourceName, to: targetName}}),
                    );
                }
            } else if (failedClusters.length === attemptedClusters.length) {
                error = `Failed to ${type}`;
            }

            responseData[`clusters`] = successfulClusters;
            responseData[`failed`] = failedClusters;

            if (successfulClusters.length !== 0) {
                if (type === 'bind') {
                    await this.setupReporting(source.endpoint.binds.filter((b) =>
                        successfulClusters.includes(b.cluster.name) && b.target === bindTarget));
                } else if ((target.type !== 'group_number') && !skipDisableReporting) {
                    await this.disableUnnecessaryReportings(bindTarget);
                }
            }
        }

        const triggeredViaLegacyApi = topic.match(legacyTopicRegex);
        if (!triggeredViaLegacyApi) {
            const response = utils.getResponse(message, responseData, error);
            await this.mqtt.publish(`bridge/response/device/${type}`, stringify(response));
        }

        if (error) {
            logger.error(error);
        } else {
            this.eventBus.emit(`devicesChanged`);
        }
    }

    @bind async groupMembersChanged(data: EventGroupMembersChanged): Promise<void> {
        if (data.action === 'add') {
            const bindsToGroup = this.zigbee.getClientsLegacy().map((c) => c.endpoints)
                .reduce((a, v) => a.concat(v)).map((e) => e.binds)
                .reduce((a, v) => a.concat(v)).filter((b) => b.target === data.group.zhGroup);
            await this.setupReporting(bindsToGroup);
        } else { // action === remove/remove_all
            if (!data.skipDisableReporting) {
                await this.disableUnnecessaryReportings(data.endpoint);
            }
        }
    }

    getSetupReportingEndpoints(bind, coordinatorEp) {
        const endpoints = bind.target.constructor.name === 'Group' ? bind.target.members : [bind.target];
        return endpoints.filter((e) => {
            const supportsInputCluster = e.supportsInputCluster(bind.cluster.name);
            const hasConfiguredReporting = !!e.configuredReportings.find((c) => c.cluster.name === bind.cluster.name);
            const hasBind = !!e.binds.find((b) => b.cluster.name === bind.cluster.name && b.target === coordinatorEp);
            return supportsInputCluster && !(hasBind && hasConfiguredReporting);
        });
    }

    async setupReporting(binds) {
        const coordinator = this.zigbee.getDevicesByTypeLegacy('Coordinator')[0];
        const coordinatorEndpoint = coordinator.getEndpoint(1);
        for (const bind of binds.filter((b) => b.cluster.name in reportClusters)) {
            for (const endpoint of this.getSetupReportingEndpoints(bind, coordinatorEndpoint)) {
                const entity = `${this.zigbee.resolveEntityLegacy(endpoint.getDevice()).name}/${endpoint.ID}`;
                try {
                    await endpoint.bind(bind.cluster.name, coordinatorEndpoint);

                    const items = await reportClusters[bind.cluster.name]
                        .filter(async (a) => !a.condition || await a.condition(endpoint))
                        .map((a) => {
                            const result = {...a};
                            delete result.condition;
                            return result;
                        });
                    await endpoint.configureReporting(bind.cluster.name, items);
                    logger.info(`Succesfully setup reporting for '${entity}' cluster '${bind.cluster.name}'`);
                } catch (error) {
                    logger.warn(`Failed to setup reporting for '${entity}' cluster '${bind.cluster.name}'`);
                }
            }
        }

        this.eventBus.emit(`devicesChanged`);
    }

    async disableUnnecessaryReportings(target: Group | ZHEndpoint): Promise<void> {
        const coordinator = this.zigbee.getFirstCoordinatorEndpoint();
        const endpoints = utils.isEndpoint(target) ? [target] : target.members;
        for (const endpoint of endpoints) {
            const entity = `${this.zigbee.resolveEntity(endpoint.getDevice()).name}/${endpoint.ID}`;
            const boundClusters = endpoint.binds.filter((b) => b.target === coordinator)
                .map((b) => b.cluster.name);
            const requiredClusters = this.zigbee.getClients().map((c) => c.endpoints)
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
                        if (!item.condition || await item.condition(endpoint)) {
                            items.push({...item, maximumReportInterval: 0xFFFF});
                        }
                    }

                    await endpoint.configureReporting(cluster, items);
                    logger.info(`Succesfully disabled reporting for '${entity}' cluster '${cluster}'`);
                } catch (error) {
                    logger.warn(`Failed to disable reporting for '${entity}' cluster '${cluster}'`);
                }
            }

            this.eventBus.emit('reportingDisabled', {device: endpoint.getDevice()});
        }
    }

    @bind async poll(data: EventDeviceMessage): Promise<void> {
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
            const toPoll: Set<ZHEndpoint> = new Set();
            // Add bound devices
            for (const bind of data.endpoint.binds) {
                if (utils.isEndpoint(bind.target) && bind.target.getDevice().type !== 'Coordinator') {
                    toPoll.add(bind.target);
                }
            }

            // If message is published to a group, add members of the group
            const group = data.groupID !== 0 && this.zigbee.groupByID(data.groupID);
            group?.members.forEach((m) => toPoll.add(m));

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

module.exports = Bind;
