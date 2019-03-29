const settings = require('../util/settings');
const logger = require('../util/logger');

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/device/.+/get_group_membership$`);

class DeviceGroupMembership {
    constructor(zigbee, mqtt, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.publishEntityState = publishEntityState;
    }

    onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/device/+/get_group_membership`);
    }

    parseTopic(topic) {
        if (!topic.match(topicRegex)) {
            return null;
        }

        // Remove base from topic
        topic = topic.replace(`${settings.get().mqtt.base_topic}/bridge/device/`, '');

        // Remove command from topic
        topic = topic.replace(`/get_group_membership`, '');

        return {friendlyName: topic};
    }

    onMQTTMessage(topic, message) {
        topic = this.parseTopic(topic);

        if (!topic) {
            return false;
        }

        // Map message to ieeeAddr and check if device exist.
        const friendlyName = topic.friendlyName;
        const ieeeAddr = settings.getIeeeAddrByFriendlyName(friendlyName) || friendlyName;
        if (!this.zigbee.getDevice(ieeeAddr)) {
            logger.error(`Failed to find device '${friendlyName}'`);
            return;
        }

        const callback = (error, rsp) => {
            if (error) {
                logger.error(`Failed to get membership of ${ieeeAddr}`);
            } else {
                const {grouplist, capacity} = rsp;
                const msgGroupList = `${ieeeAddr} is in groups [${grouplist}]`;
                let msgCapacity;
                if (capacity === 254) {
                    msgCapacity = 'it can be a part of at least 1 more group';
                } else {
                    msgCapacity = `its remaining group capacity is ${capacity === 255 ? 'unknown' : capacity}`;
                }
                logger.info(`${msgGroupList} and ${msgCapacity}`);

                this.publishEntityState(ieeeAddr, {group_list: grouplist, group_capacity: capacity});
            }
        };

        this.zigbee.publish(
            ieeeAddr, 'device', 'genGroups', 'getMembership', 'functional',
            {groupcount: 0, grouplist: []}, null, null, callback,
        );

        return true;
    }
}

module.exports = DeviceGroupMembership;
