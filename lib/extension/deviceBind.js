const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');

const postfixes = utils.getPostfixes();
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/(bind|unbind)/.+$`);

const allowedClusters = [
    5, // genScenes
    6, // genOnOff
    8, // genLevelCtrl
    768, // lightingColorCtrl
];

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

    onMQTTMessage(topic, message) {
        topic = this.parseTopic(topic);

        if (!topic) {
            return false;
        }

        // Find source; can only be a device.
        const sourceEntity = settings.resolveEntity(topic.ID);
        const source = utils.getEndpointByEntityID(this.zigbee, topic.ID, topic.postfix);

        const targetEntityIDPostfix= this.getIDAndPostfix(message.toString());
        const targetEntity = settings.resolveEntity(targetEntityIDPostfix.ID);
        let target = null;
        if (targetEntity.type === 'device') {
            target = utils.getEndpointByEntityID(this.zigbee, targetEntity.ID, targetEntityIDPostfix.postfix);
        } else if (targetEntity.type === 'group') {
            target = targetEntity.ID;
        }

        if (!source || !target) {
            return false;
        }

        // Find which clusters are supported by both the source and target.
        // Groups are assumed to support all clusters (as we don't know which devices are in)
        let supported = [];
        if (targetEntity.type === 'device') {
            supported = target.getSimpleDesc().inClusterList.filter((cluster) => {
                return allowedClusters.includes(cluster);
            });
        } else if (targetEntity.type === 'group') {
            supported = allowedClusters;
        }

        const clusters = source.getSimpleDesc().outClusterList.filter((cluster) => {
            return supported.includes(cluster);
        });

        // Bind
        clusters.forEach((cluster) => {
            logger.debug(`${topic.type}ing cluster '${cluster}' from ${sourceEntity.ID}' to '${targetEntity.ID}'`);

            this.zigbee[topic.type](source, cluster, target, (error) => {
                if (error) {
                    logger.error(
                        `Failed to ${topic.type} cluster '${cluster}' from ${sourceEntity.ID}' to ` +
                        `'${targetEntity.ID}' (${error})`
                    );
                } else {
                    logger.info(
                        `Successfully ${topic.type === 'bind' ? 'bound' : 'unbound'} cluster '${cluster}' from ` +
                        `${sourceEntity.ID}' to '${targetEntity.ID}'`
                    );

                    this.mqtt.log(
                        `device_${topic.type}`,
                        {from: sourceEntity.ID, to: targetEntity.ID, cluster}
                    );
                }
            });
        });

        return true;
    }
}

module.exports = DeviceBind;
