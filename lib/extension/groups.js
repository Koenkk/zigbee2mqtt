const settings = require('../util/settings');
const logger = require('../util/logger');

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/groups/.+/(remove|add)$`);

class Groups {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishDeviceState = publishDeviceState;
    }

    onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/groups/+/remove`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/groups/+/add`);
    }

    parseTopic(topic) {
        if (!topic.match(topicRegex)) {
            return null;
        }

        // Remove base from topic
        topic = topic.replace(`${settings.get().mqtt.base_topic}/bridge/groups/`, '');

        // Parse type from topic
        const type = topic.substr(topic.lastIndexOf('/') + 1, topic.length);

        // Remove type from topic
        topic = topic.replace(`/${type}`, '');

        return {friendly_name: topic, type: type};
    }

    onMQTTMessage(topic, message) {
        topic = this.parseTopic(topic);

        if (!topic) {
            return false;
        }

        // Find ID of this group.
        const groupID = settings.getGroupIDByFriendlyName(topic.friendly_name);
        if (!groupID) {
            logger.error(`Group with friendly_name '${topic.friendly_name}' doesn't exist`);
            return;
        }

        // Map message to ieeeAddr and check if device exist.
        message = message.toString();
        const ieeeAddr = settings.getIeeeAddrByFriendlyName(message) || message;
        if (!this.zigbee.getDevice(ieeeAddr)) {
            logger.error(`Failed to find device '${message}'`);
            return;
        }

        // Send command to the device.
        let payload = null;
        if (topic.type === 'add') {
            payload = {groupid: groupID, groupname: ''};
        } else if (topic.type === 'remove') {
            payload = {groupid: groupID};
        }

        const callback = (error, rsp) => {
            if (error) {
                logger.error(`Failed to ${topic.type} ${ieeeAddr} from ${topic.friendly_name}`);
            } else {
                logger.info(`Successfully ${topic.type} ${ieeeAddr} to ${topic.friendly_name}`);
            }
        };

        this.zigbee.publish(
            ieeeAddr, 'device', 'genGroups', topic.type, 'functional',
            payload, null, null, callback,
        );

        return true;
    }
}

module.exports = Groups;
