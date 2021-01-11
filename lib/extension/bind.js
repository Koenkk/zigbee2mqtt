const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');
const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/(bind|unbind)/.+$`);
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/(bind|unbind)`);
const Extension = require('./extension');
const stringify = require('json-stable-stringify-without-jsonify');

const clusterCandidates = ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl', 'closuresWindowCovering'];

// See zigbee-herdsman-converters devices.js
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

class Bind extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.legacyApi = settings.get().advanced.legacy_api;
        this.eventBus.on(`groupMembersChanged`, (d) => this.groupMembersChanged(d.group));
    }

    parseMQTTMessage(topic, message) {
        let type = null;
        let sourceKey = null;
        let targetKey = null;
        let clusters = null;

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
        }

        return {type, sourceKey, targetKey, clusters};
    }

    async onMQTTMessage(topic, message) {
        const {type, sourceKey, targetKey, clusters} = this.parseMQTTMessage(topic, message);
        if (!type) return null;

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

            // Find which clusters are supported by both the source and target.
            // Groups are assumed to support all clusters.
            for (const cluster of clusterCandidates) {
                if (clusters && !clusters.includes(cluster)) continue;

                const targetValid = target.type === 'group' || target.type === 'group_number' ||
                    target.device.type === 'Coordinator' || target.endpoint.supportsInputCluster(cluster);

                if (source.endpoint.supportsOutputCluster(cluster) && targetValid) {
                    logger.debug(`${type}ing cluster '${cluster}' from '${sourceName}' to '${targetName}'`);
                    attemptedClusters.push(cluster);

                    try {
                        let bindTarget = null;
                        if (target.type === 'group') bindTarget = target.group;
                        else if (target.type === 'group_number') bindTarget = target.ID;
                        else bindTarget = target.endpoint;

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
                await this.setupReporting(source.endpoint);
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

    async groupMembersChanged(group) {
        const boundRemoteEndpoints = this.zigbee.getClients().map((c) => c.endpoints).flat()
            .filter((e) => e.binds.find((b) => b.target === group.group));

        for (const endpoint of boundRemoteEndpoints) {
            await this.setupReporting(endpoint);
        }
    }

    getSetupReportingEndpoints(bind, coordinatorEp) {
        const endpoints = bind.target.constructor.name === 'Group' ? bind.target.members : [bind.target];
        return endpoints.filter((e) => {
            const supportsInputCluster = e.supportsInputCluster(bind.cluster.name);
            const hasConfiguredReporting = e.configuredReportings.find((c) => c.cluster.name === bind.cluster.name);
            const hasBind = e.binds.find((b) => b.cluster.name === bind.cluster.name && b.target === coordinatorEp);
            return supportsInputCluster && !(hasBind && hasConfiguredReporting);
        });
    }

    async setupReporting(remoteEndpoint) {
        let didSomething = false;
        const coordinator = this.zigbee.getDevicesByType('Coordinator')[0];
        const coordinatorEndpoint = coordinator.getEndpoint(1);
        const binds = remoteEndpoint.binds.filter((b) => b.cluster.name in reportClusters &&
            (b.target.constructor.name === 'Group' || b.target.getDevice() !== coordinator));
        for (const bind of binds) {
            for (const target of this.getSetupReportingEndpoints(bind, coordinatorEndpoint)) {
                const entity = `${this.zigbee.resolveEntity(target.getDevice()).name}/${target.ID}`;
                try {
                    await target.bind(bind.cluster.name, coordinatorEndpoint);
                    didSomething = true;
                    const items = await reportClusters[bind.cluster.name]
                        .filter(async (a) => !a.condition || await a.condition(target))
                        .map((a) => {
                            const result = {...a};
                            delete result.condition;
                            return result;
                        });
                    await target.configureReporting(bind.cluster.name, items);
                    logger.info(`Succesfully setup reporting for '${entity}' cluster '${bind.cluster.name}'`);
                } catch (error) {
                    logger.warn(`Failed to setup reporting for '${entity}' cluster '${bind.cluster.name}'`);
                }
            }
        }

        if (didSomething) {
            this.eventBus.emit(`devicesChanged`);
        }
    }

    // TODO, remove report poll to here
}

module.exports = Bind;
