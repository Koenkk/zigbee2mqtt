const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');
const assert = require('assert');

const postfixes = utils.getPostfixes();
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/(bind|unbind)/.+$`);

const clusters = ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl'];

class DeviceBind {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
    }

    onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/bind/+`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/bind/+/+`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/unbind/+`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/unbind/+/+`);
    }

    getIDAndPostfix(topic) {
        let postfix = null;
        if (postfixes.find((p) => topic.endsWith(`/${p}`))) {
            postfix = topic.substr(topic.lastIndexOf('/') + 1, topic.length);

            // Remove postfix from topic
            topic = topic.replace(`/${postfix}`, '');
        }

        return {ID: topic, postfix};
    }

    parseTopic(topic) {
        if (!topic.match(topicRegex)) {
            return null;
        }

        // Remove base from topic
        topic = topic.replace(`${settings.get().mqtt.base_topic}/bridge/`, '');

        // Parse type from topic
        const type = topic.split('/')[0];

        // Remove type from topic
        topic = topic.replace(`${type}/`, '');
        return {type, ...this.getIDAndPostfix(topic)};
    }

    async onMQTTMessage(topic, message) {
        topic = this.parseTopic(topic);

        if (!topic) {
            return false;
        }

        // Find source; can only be a device.
        let source = await this.zigbee.getEntityByIDOrFriendlyName(topic.ID);
        assert(source && source.isType('device'));
        source = utils.getEndpoint(source, topic.postfix);

        const targetEntityIDPostfix = this.getIDAndPostfix(message.toString());
        let target = await this.zigbee.getEntityByIDOrFriendlyName(targetEntityIDPostfix.ID);
        target = target.isType('device') ? utils.getEndpoint(target, topic.postfix) : target;


        // Find which clusters are supported by both the source and target.
        // Groups are assumed to support all clusters.
        for (const cluster of clusters) {
            const targetValid = target.isType('group') || target.supportsInputCluster(cluster);
            if (source.supportsOutputCluster(cluster) && targetValid) {
                logger.debug(
                    `${topic.type}ing cluster '${cluster}' from '${topic.ID}' ` +
                    `(${source.ID}) to '${targetEntityIDPostfix.ID}'`
                );

                try {
                    if (topic.type === 'bind') {
                        await source.bind(cluster, target);
                    } else {
                        await source.unbind(cluster, target);
                    }

                    logger.info(
                        `Successfully ${topic.type === 'bind' ? 'bound' : 'unbound'} cluster '${cluster}' from ` +
                        `'${topic.ID}' to '${targetEntityIDPostfix.ID}'`
                    );
                    this.mqtt.log(
                        `device_${topic.type}`,
                        {from: topic.ID, to: targetEntityIDPostfix.ID, cluster}
                    );
                } catch (error) {
                    logger.error(
                        `Failed to ${topic.type} cluster '${cluster}' from '${topic.ID}' to ` +
                        `'${targetEntityIDPostfix.ID}' (${error})`
                    );
                }
            }
        }
    }
}

module.exports = DeviceBind;
