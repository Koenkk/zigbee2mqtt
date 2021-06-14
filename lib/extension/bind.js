const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');
const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/(bind|unbind)/.+$`);
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/(bind|unbind)`);
const Extension = require('./extension');
const stringify = require('json-stable-stringify-without-jsonify');
const debounce = require('debounce');
const zigbeeHersdman = require('zigbee-herdsman');

const clusterCandidates = ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl', 'closuresWindowCovering',
    'hvacThermostat', 'msTemperatureMeasurement'];

// See zigbee-herdsman-converters
const defaultBindGroup = {type: 'group_number', ID: 901};

const defaultReportConfiguration = {
    minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1,
};

const getColorCapabilities = async (endpoint) => {
    if (endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities') == null) {
        await endpoint.read('lightingColorCtrl', ['colorCapabilities']);
    }

    const value = endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities');
    return {
        colorTemperature: (value & 1<<4) > 0,
        colorXY: (value & 1<<3) > 0,
    };
};

const reportClusters = {
    'genOnOff': [
        {attribute: 'onOff', ...defaultReportConfiguration, minimumReportInterval: 0, reportableChange: 0},
    ],
    'genLevelCtrl': [
        {attribute: 'currentLevel', ...defaultReportConfiguration},
    ],
    'lightingColorCtrl': [
        {
            attribute: 'colorTemperature', ...defaultReportConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorTemperature,
        },
        {
            attribute: 'currentX', ...defaultReportConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorXY,
        },
        {
            attribute: 'currentY', ...defaultReportConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorXY,
        },
    ],
    'closuresWindowCovering': [
        {attribute: 'currentPositionLiftPercentage', ...defaultReportConfiguration},
        {attribute: 'currentPositionTiltPercentage', ...defaultReportConfiguration},
    ],
};

const pollOnMessage = [
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
];

class Bind extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.legacyApi = settings.get().advanced.legacy_api;
        this.eventBus.on(`groupMembersChanged`, (d) => this.groupMembersChanged(d));
        this.pollDebouncers = {};
    }

    parseMQTTMessage(topic, message) {
        let type = null;
        let sourceKey = null;
        let targetKey = null;
        let clusters = null;
        let skipDisableReporting = false;

        if (this.legacyApi && topic.match(legacyTopicRegex)) {
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
        const source = this.zigbee.resolveEntity(sourceKey);
        const target = targetKey === 'default_bind_group' ? defaultBindGroup : this.zigbee.resolveEntity(targetKey);
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

    async groupMembersChanged(data) {
        if (data.action === 'add') {
            const bindsToGroup = this.zigbee.getClients().map((c) => c.endpoints).flat().map((e) => e.binds)
                .flat().filter((b) => b.target === data.group.group);
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
        const coordinator = this.zigbee.getDevicesByType('Coordinator')[0];
        const coordinatorEndpoint = coordinator.getEndpoint(1);
        for (const bind of binds.filter((b) => b.cluster.name in reportClusters)) {
            for (const endpoint of this.getSetupReportingEndpoints(bind, coordinatorEndpoint)) {
                const entity = `${this.zigbee.resolveEntity(endpoint.getDevice()).name}/${endpoint.ID}`;
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

    async disableUnnecessaryReportings(target) {
        const coordinator = this.zigbee.getDevicesByType('Coordinator')[0];
        const coordinatorEndpoint = coordinator.getEndpoint(1);
        const endpoints = target.constructor.name === 'Group' ? target.members : [target];
        for (const endpoint of endpoints) {
            const entity = `${this.zigbee.resolveEntity(endpoint.getDevice()).name}/${endpoint.ID}`;
            const boundClusters = endpoint.binds.filter((b) => b.target === coordinatorEndpoint)
                .map((b) => b.cluster.name);
            const requiredClusters = this.zigbee.getClients().map((c) => c.endpoints).flat().map((e) => e.binds)
                .flat().filter((bind) => {
                    if (bind.target.constructor.name === 'Group') {
                        return bind.target.members.includes(endpoint);
                    } else {
                        return bind.target === endpoint;
                    }
                }).map((b) => b.cluster.name).filter((v, i, a) => a.indexOf(v) === i);

            for (const cluster of boundClusters.filter((c) => !requiredClusters.includes(c) && c in reportClusters)) {
                try {
                    await endpoint.unbind(cluster, coordinatorEndpoint);
                    const items = await reportClusters[cluster]
                        .filter(async (a) => !a.condition || await a.condition(endpoint))
                        .map((a) => {
                            const result = {...a, maximumReportInterval: 0xFFFF};
                            delete result.condition;
                            return result;
                        });
                    await endpoint.configureReporting(cluster, items);
                    logger.info(`Succesfully disabled reporting for '${entity}' cluster '${cluster}'`);
                } catch (error) {
                    logger.warn(`Failed to disable reporting for '${entity}' cluster '${cluster}'`);
                }
            }

            this.eventBus.emit('reportingDisabled', {device: endpoint.getDevice()});
        }
    }

    async onZigbeeEvent(type, data, resolvedEntity) {
        if (type === 'message') {
            this.poll(data);
        }
    }

    poll(message) {
        /**
         * This method poll bound endpoints and group members for state changes.
         *
         * A use case is e.g. a Hue Dimmer switch bound to a Hue bulb.
         * Hue bulbs only report their on/off state.
         * When dimming the bulb via the dimmer switch the state is therefore not reported.
         * When we receive a message from a Hue dimmer we read the brightness from the bulb (if bound).
         */
        const polls = pollOnMessage.filter((p) =>
            p.cluster[message.cluster] && p.cluster[message.cluster].find((c) => c.type === message.type &&
            utils.equalsPartial(message.data, c.data)),
        );

        if (polls.length) {
            let toPoll = [];

            // Add bound devices
            toPoll = toPoll.concat([].concat(...message.device.endpoints.map((e) =>
                e.binds.map((e) => e).filter((e) => e.target))));
            toPoll = toPoll.filter((e) => e.target.constructor.name === 'Endpoint');
            toPoll = toPoll.filter((e) => e.target.getDevice().type !== 'Coordinator');
            toPoll = toPoll.map((e) => e.target);

            // If message is published to a group, add members of the group
            const group = message.groupID !== 0 ? this.zigbee.getGroupByID(message.groupID) : null;
            if (group) {
                toPoll = toPoll.concat(group.members);
            }

            toPoll = new Set(toPoll);

            for (const endpoint of toPoll) {
                for (const poll of polls) {
                    if (!poll.manufacturerIDs.includes(endpoint.getDevice().manufacturerID)) {
                        continue;
                    }

                    const key = `${endpoint.deviceIeeeAddress}_${endpoint.ID}_${pollOnMessage.indexOf(poll)}`;
                    if (!this.pollDebouncers[key]) {
                        this.pollDebouncers[key] = debounce(async () => {
                            await endpoint.read(poll.read.cluster, poll.read.attributes);
                        }, 1000);
                    }

                    this.pollDebouncers[key]();
                }
            }
        }
    }
}

module.exports = Bind;
