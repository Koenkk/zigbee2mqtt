const settings = require('../util/settings');
const logger = require('../util/logger');

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/.+/(remove|add|remove_all)$`);

class Groups {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
    }

    onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/+/remove`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/+/add`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/+/remove_all`);
    }

    parseTopic(topic) {
        if (!topic.match(topicRegex)) {
            return null;
        }

        // Remove base from topic
        topic = topic.replace(`${settings.get().mqtt.base_topic}/bridge/group/`, '');

        // Parse type from topic
        const type = topic.substr(topic.lastIndexOf('/') + 1, topic.length);

        // Remove type from topic
        topic = topic.replace(`/${type}`, '');

        return {friendly_name: topic, type};
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

        if (groupID === 99) {
            logger.error('Group 99 is reserved, please use a different groupID');
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
        let cmd = null;
        if (topic.type === 'add') {
            payload = {groupid: groupID, groupname: ''};
            cmd = 'add';
        } else if (topic.type === 'remove') {
            payload = {groupid: groupID};
            cmd = 'remove';
        } else if (topic.type === 'remove_all') {
            payload = {};
            cmd = 'removeAll';
        }

        const callback = (error, rsp) => {
            if (error) {
                logger.error(`Failed to ${topic.type} ${ieeeAddr} from ${topic.friendly_name}`);
            } else {
                logger.info(`Successfully ${topic.type} ${ieeeAddr} to ${topic.friendly_name}`);

                // Log to MQTT
                const log = {device: message};
                if (['remove', 'add'].includes(topic.type)) {
                    log.group = topic.friendly_name;
                }

                this.mqtt.log(log);
            }
        };

        this.zigbee.publish(
            ieeeAddr, 'device', 'genGroups', cmd, 'functional',
            payload, null, null, callback,
        );

        return true;
    }
}

module.exports = Groups;
