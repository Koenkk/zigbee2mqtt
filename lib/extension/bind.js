const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/(bind|unbind)/.+$`);

const allowedClusters = [
    5, // genScenes
    6, // genOnOff
    8, // genLevelCtrl
    768, // lightingColorCtrl
];

class Bind {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishDeviceState = publishDeviceState;
    }

    onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/bind/+`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/unbind/+`);
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

        return {ID: topic, type: type};
    }

    onMQTTMessage(topic, message) {
        topic = this.parseTopic(topic);

        if (!topic) {
            return false;
        }

        // Find source; can only be a device.
        const sourceEntity = utils.resolveEntity(topic.ID);
        const source = this.zigbee.getDevice(sourceEntity.ID);

        if (!source) {
            logger.error(`Failed to find device '${sourceEntity.ID}'`);
            return false;
        }

        // Find target; can be a device or group.
        const targetEntity = utils.resolveEntity(message.toString());
        let target = null;
        if (targetEntity.type === 'device') {
            target = this.zigbee.getDevice(targetEntity.ID);

            if (!target) {
                logger.error(`Failed to find target device '${targetEntity.ID}'`);
                return false;
            }
        } else if (targetEntity.type === 'group') {
            target = targetEntity.ID;
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
        const actions = clusters.map((cluster) => {
            return (cb) => source.bind(cluster, target, cb);
        });

        const executeNext = (error) => {
            if (error) {
                logger.error(`Failed to bind '${sourceEntity.ID}' to '${targetEntity.ID}'`);
                return;
            }

            if (!actions.length) {
                logger.info(`Successfully bound '${sourceEntity.ID}' to '${targetEntity.ID}'`);
                return;
            }

            const action = actions.pop();
            action(executeNext);
        };

        executeNext(null);
    }
}

module.exports = Bind;
