const settings = require('../util/settings');
const logger = require('../util/logger');

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/group/.+/set$`);

class Groups {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishDeviceState = publishDeviceState;
    }

    onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/group/+/set`);
    }

    onZigbeeStarted() {
        const groups = settings.get().groups;

        Object.keys(groups).forEach((name) => {
            const group = groups[name];

            const callback = (device, error, rsp) => {
                if (!error) {
                    logger.info(`Added '${device}' to group '${name}' (${group.ID})`);
                } else {
                    logger.error(`Failed to add '${device}' to group '${name}' (${group.ID})`);
                }
            };

            group.devices.forEach((device) => {
                const ieeeAddr = settings.getIeeeAddrByFriendlyName(device) || device;
                this.zigbee.publish(
                    ieeeAddr,
                    'genGroups',
                    'add',
                    'functional',
                    {groupid: group.ID, groupname: name},
                    null,
                    null,
                    (error, rsp) => callback(device, error, rsp),
                );
            });
        });
    }

    parseTopic(topic) {
        if (!topic.match(topicRegex)) {
            return null;
        }

        // Remove base from topic
        topic = topic.replace(`${settings.get().mqtt.base_topic}/group/`, '');

        // Parse type from topic
        const type = topic.substr(topic.lastIndexOf('/') + 1, topic.length);

        // Remove type from topic
        topic = topic.replace(`/${type}`, '');

        const name = topic;

        return {type: type, name: name};
    }

    onMQTTMessage(topic, message) {
        topic = this.parseTopic(topic);

        if (!topic) {
            return false;
        }

        if (!settings.get().groups.hasOwnProperty(topic.name)) {
            logger.error(`Group '${topic.name}' doesn't exist`);
            return false;
        }

        const groupID = settings.get().groups[topic.name].ID;
        logger.info(groupID, message.toString());

        return true;
    }
}

module.exports = Groups;
