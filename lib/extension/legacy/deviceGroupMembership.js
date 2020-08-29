/* istanbul ignore file */
const settings = require('../../util/settings');
const logger = require('../../util/logger');
const Extension = require('../extension');

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/device/(.+)/get_group_membership$`);

class DeviceGroupMembership extends Extension {
    onMQTTConnected() {
        for (let step = 1; step < 20; step++) {
            const topic = `${settings.get().mqtt.base_topic}/bridge/device/${'+/'.repeat(step)}get_group_membership`;
            this.mqtt.subscribe(topic);
        }
    }

    async onMQTTMessage(topic, message) {
        const match = topic.match(topicRegex);
        if (!match) {
            return null;
        }

        const entity = this.zigbee.resolveEntity(match[1]);
        if (!entity || entity.type !== 'device') {
            logger.error(`Device '${match[1]}' does not exist`);
            return;
        }

        const response = await entity.endpoint.command(
            `genGroups`, 'getMembership', {groupcount: 0, grouplist: []}, {}, true,
        );

        if (!response) {
            logger.warn(`Couldn't get group membership of ${entity.device.ieeeAddr}`);
            return;
        }

        let {grouplist, capacity} = response;

        grouplist = grouplist.map((gid) => {
            const g = settings.getGroup(gid);
            return g ? g.friendlyName : gid;
        });

        const msgGroupList = `${entity.device.ieeeAddr} is in groups [${grouplist}]`;
        let msgCapacity;
        if (capacity === 254) {
            msgCapacity = 'it can be a part of at least 1 more group';
        } else {
            msgCapacity = `its remaining group capacity is ${capacity === 255 ? 'unknown' : capacity}`;
        }
        logger.info(`${msgGroupList} and ${msgCapacity}`);

        this.publishEntityState(entity.device.ieeeAddr, {group_list: grouplist, group_capacity: capacity});
    }
}

module.exports = DeviceGroupMembership;
