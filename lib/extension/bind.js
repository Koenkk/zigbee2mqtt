const settings = require('../util/settings');
const logger = require('../util/logger');
const assert = require('assert');
const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/(bind|unbind)/.+$`);
const Extension = require('./extension');

const clusters = ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl', 'closuresWindowCovering'];

// See zigbee-herdsman-converters devices.js
const defaultBindGroup = {type: 'group_number', ID: 901};

class Bind extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.legacyApi = settings.get().advanced.legacy_api;
    }

    onMQTTConnected() {
        /* istanbul ignore else */
        if (this.legacyApi) {
            this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/bind/#`);
            this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/unbind/#`);
        }
    }

    parseMQTTMessage(topic, message) {
        let type = null;
        let sourceKey = null;
        let targetKey = null;

        if (this.legacyApi && topic.match(legacyTopicRegex)) {
            topic = topic.replace(`${settings.get().mqtt.base_topic}/bridge/`, '');
            type = topic.split('/')[0];
            sourceKey = topic.replace(`${type}/`, '');
            targetKey = message;
        }

        return {type, sourceKey, targetKey};
    }

    async onMQTTMessage(topic, message) {
        const {type, sourceKey, targetKey} = this.parseMQTTMessage(topic, message);
        if (!type) return null;

        // Find source; can only be a device and target
        const source = this.zigbee.resolveEntity(sourceKey);
        assert(source != null && source.type === 'device', 'Source undefined or not a device');
        const target = targetKey === 'default_bind_group' ? defaultBindGroup : this.zigbee.resolveEntity(targetKey);
        assert(target != null, 'Target is unknown');

        const sourceName = source.settings.friendlyName;
        const targetName = targetKey === 'default_bind_group' ? targetKey : target.settings.friendlyName;
        let attemptedToBindSomething = false;

        // Find which clusters are supported by both the source and target.
        // Groups are assumed to support all clusters.
        for (const cluster of clusters) {
            const targetValid = target.type === 'group' || target.type === 'group_number' ||
                target.device.type === 'Coordinator' || target.endpoint.supportsInputCluster(cluster);

            if (source.endpoint.supportsOutputCluster(cluster) && targetValid) {
                logger.debug(`${type}ing cluster '${cluster}' from '${sourceName}' to '${targetName}'`);
                attemptedToBindSomething = true;
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

                    logger.info(
                        `Successfully ${type === 'bind' ? 'bound' : 'unbound'} cluster '${cluster}' from ` +
                        `'${sourceName}' to '${targetName}'`,
                    );

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        this.mqtt.publish(
                            'bridge/log',
                            JSON.stringify({type: `device_${type}`,
                                message: {from: sourceName, to: targetName, cluster}}),
                        );
                    }
                } catch (error) {
                    logger.error(
                        `Failed to ${type} cluster '${cluster}' from '${sourceName}' to ` +
                        `'${targetName}' (${error})`,
                    );

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        this.mqtt.publish(
                            'bridge/log',
                            JSON.stringify({type: `device_${type}_failed`,
                                message: {from: sourceName, to: targetName, cluster}}),
                        );
                    }
                }
            }
        }

        if (!attemptedToBindSomething) {
            logger.error(`Nothing to ${type} from '${sourceName}' to '${targetName}'`);

            /* istanbul ignore else */
            if (settings.get().advanced.legacy_api) {
                this.mqtt.publish(
                    'bridge/log',
                    JSON.stringify({type: `device_${type}_failed`, message: {from: sourceName, to: targetName}}),
                );
            }
        }
    }
}

module.exports = Bind;
