const settings = require('../util/settings');
const logger = require('../util/logger');
const assert = require('assert');
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/(bind|unbind)/.+$`);
const BaseExtension = require('./baseExtension');

const clusters = ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl', 'closuresWindowCovering'];

// See zigbee-herdsman-converters devices.js
const defaultBindGroup = {type: 'group_number', ID: 901};

class DeviceBind extends BaseExtension {
    onMQTTConnected() {
        for (let step = 1; step < 20; step++) {
            this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/bind${'/+'.repeat(step)}`);
            this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/unbind${'/+'.repeat(step)}`);
        }
    }

    async onMQTTMessage(topic, message) {
        if (!topic.match(topicRegex)) {
            return null;
        }

        // Parse topic, retrieve type (bind or unbind) and source
        topic = topic.replace(`${settings.get().mqtt.base_topic}/bridge/`, '');
        const type = topic.split('/')[0];
        const sourceKey = topic.replace(`${type}/`, '');
        const targetKey = message;

        // Find source; can only be a device and target
        const source = this.zigbee.resolveEntity(sourceKey);
        assert(source != null && source.type === 'device', 'Source undefined or not a device');
        const target = targetKey === 'default_bind_group' ? defaultBindGroup : this.zigbee.resolveEntity(targetKey);
        assert(target != null, 'Target is unknown');

        const sourceName = source.settings.friendlyName;
        const targetName = targetKey === 'default_bind_group' ? targetKey : target.settings.friendlyName;

        // Find which clusters are supported by both the source and target.
        // Groups are assumed to support all clusters.
        for (const cluster of clusters) {
            const targetValid = target.type === 'group' || target.type === 'group_number' ||
                target.device.type === 'Coordinator' || target.endpoint.supportsInputCluster(cluster);

            if (source.endpoint.supportsOutputCluster(cluster) && targetValid) {
                logger.debug(`${type}ing cluster '${cluster}' from '${sourceName}' to '${targetName}'`);
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
                    this.mqtt.log(
                        `device_${type}`,
                        {from: sourceName, to: targetName, cluster},
                    );
                } catch (error) {
                    logger.error(
                        `Failed to ${type} cluster '${cluster}' from '${sourceName}' to ` +
                        `'${targetName}' (${error})`,
                    );
                    this.mqtt.log(
                        `device_${type}_failed`,
                        {from: sourceName, to: targetName, cluster},
                    );
                }
            }
        }
    }
}

module.exports = DeviceBind;
