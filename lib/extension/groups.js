const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/.+/(remove|add|remove_all)$`);
const topicRegexRemoveAll = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/(remove|add|remove_all)$`);

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
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/remove_all`);
    }

    async onZigbeeStarted() {
        await this.syncGroupsWithSettings();
    }

    async syncGroupsWithSettings() {
        const settingsGroups = settings.getGroups();
        const zigbeeGroups = await this.zigbee.getGroups({});
        for (const settingGroup of settingsGroups) {
            const groupID = settingGroup.ID;
            const zigbeeGroup = zigbeeGroups.find((g) => g.groupID === groupID) ||
                (await this.zigbee.createGroup(groupID));
            const settingsEndpoint = (await Promise.all(settingGroup.devices.map(async (d) => {
                const entity = await this.zigbee.resolveEntity(d);
                if (!entity) logger.error(`Cannot find '${d}' of group '${settingGroup.friendlyName}'`);
                return entity;
            }))).filter((e) => e != null).map((e) => e.endpoint);

            // In settings but not in zigbee
            for (const endpoint of settingsEndpoint) {
                if (!zigbeeGroup.hasMember(endpoint)) {
                    logger.info(`Adding '${endpoint.name}' to group ${settingGroup.friendlyName}`);
                    await endpoint.addToGroup(zigbeeGroup);
                }
            }

            // In zigbee but not in settings
            for (const endpoint of zigbeeGroup.getMembers()) {
                if (!settingsEndpoint.includes(endpoint)) {
                    logger.info(`Removing '${endpoint.name}' from group ${settingGroup.friendlyName}`);
                    await endpoint.removeFromGroup(zigbeeGroup);
                }
            }
        }

        // eslint-disable-next-line
        for (const zigbeeGroup of zigbeeGroups) {
            if (!settingsGroups.find((g) => g.ID === zigbeeGroup.groupID)) {
                for (const endpoint of zigbeeGroup.getMembers()) {
                    logger.info(`Removing '${endpoint.name}' from group ${zigbeeGroup.groupID}`);
                    await endpoint.removeFromGroup(zigbeeGroup);
                }
            }
        }
    }

    // async parseID(ID) {
    //     let entityID = ID;
    //     const postfix = utils.getPostfixes().find((p) => entityID.endsWith(`/${p}`));
    //     if (postfix) {
    //         // Found a postfix, retrieve the endpoint which correspodns to the postfix
    //         entityID = entityID.substring(0, entityID.length - (postfix.length + 1));
    //     }

    //     return {entityID, postfix};
    // }


    // parseTopic(topic) {
    //     if (!topic.match(topicRegex) && !topic.match(topicRegexRemoveAll)) {
    //         return null;
    //     }

    //     // Remove base from topic
    //     topic = topic.replace(`${settings.get().mqtt.base_topic}/bridge/group/`, '');

    //     // Parse type from topic
    //     const type = topic.substr(topic.lastIndexOf('/') + 1, topic.length);

    //     // Remove type from topic
    //     topic = topic.replace(`/${type}`, '');

    //     return {friendly_name: type === 'remove_all' ? null : topic, type};
    // }

    // async updateDeviceGroup(ID, cmd, groupID) {
    //     // let payload = null;

    //     const {entityID, postfix} = await this.parseID(ID);
    //     const device = await this.zigbee.getEntityByIDOrFriendlyName(entityID);
    //     const endpoint = utils.getEndpoint(device, postfix);
    //     const group = groupID ?
    //         (await this.zigbee.getGroup({groupID}) || await this.zigbee.createGroup(groupID)) : null;

    //     try {
    //         if (cmd === 'add') {
    //             await endpoint.addToGroup(group);
    //         } else if (cmd === 'remove') {
    //             await endpoint.removeFromGroup(group);
    //         } else if (cmd === 'remove_all') {
    //             await endpoint.removeFromAllGroups();
    //         }

    //         logger.info(`Successfully ${cmd} ${device.ieeeAddr} to ${groupID}`);

    //         // Log to MQTT
    //         const lookup = {
    //             'add': 'device_group_add',
    //             'remove': 'device_group_remove',
    //             'remove_all': 'device_group_remove_all',
    //         };

    //         this.mqtt.log({
    //             type: lookup[cmd],
    //             message: {
    //                 device: settings.getDevice(device.ieeeAddr).friendly_name,
    //                 group: groupID,
    //             },
    //         });

    //         // Update group cache
    //         if (cmd === 'add') {
    //             if (!this.groupsCache[groupID]) {
    //                 this.groupsCache[groupID] = [];
    //             }

    //             if (!this.groupsCache[groupID].includes(device.ieeeAddr)) {
    //                 this.groupsCache[groupID].push(device.ieeeAddr);
    //             }
    //         } else if (cmd === 'remove') {
    //             if (this.groupsCache[groupID]) {
    //                 this.groupsCache[groupID] = this.groupsCache[groupID].filter((d) =>
    //                     d != device.ieeeAddr
    //                 );
    //             }
    //         } else if (cmd === 'remove_all') {
    //             Object.keys(this.groupsCache).forEach((groupID_) => {
    //                 this.groupsCache[groupID_] = this.groupsCache[groupID_].filter((d) =>
    //                     d != device.ieeeAddr
    //                 );
    //             });
    //         }

    //         this.writeGroupsCache();

    //         // Update settings
    //         if (cmd === 'add') {
    //             settings.addDeviceToGroup(groupID, device.ieeeAddr);
    //         } else if (cmd === 'remove') {
    //             settings.removeDeviceFromGroup(groupID, device.ieeeAddr);
    //         } else if (cmd === 'remove_all') {
    //             Object.keys(settings.get().groups).forEach((groupID_) => {
    //                 settings.removeDeviceFromGroup(groupID_, device.ieeeAddr);
    //             });
    //         }
    //     } catch (error) {
    //         logger.error(`Failed to ${cmd} ${device.ieeeAddr} from ${groupID} (${error})`);
    //     }
    // }

    // async onMQTTMessage(topic, message) {
    //     topic = this.parseTopic(topic);

    //     if (!topic) {
    //         return false;
    //     }

    //     // Find ID of this group.
    //     let groupID = null;
    //     if (topic.type !== 'remove_all') {
    //         groupID = settings.getGroup(topic.friendly_name).ID;
    //         if (!groupID) {
    //             logger.error(`Group with friendly_name '${topic.friendly_name}' doesn't exist`);
    //             return;
    //         }

    //         groupID = groupID.toString();
    //     }

    //     // Send command to the device.
    //     await this.updateDeviceGroup(message.toString(), topic.type, groupID);

    //     return true;
    // }
}

module.exports = Groups;
