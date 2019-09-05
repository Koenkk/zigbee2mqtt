/* istanbul ignore file */
// todo
const settings = require('../util/settings');
const logger = require('../util/logger');
const data = require('../util/data');
const utils = require('../util/utils');
const fs = require('fs');
const diff = require('deep-diff');

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/.+/(remove|add|remove_all)$`);
const topicRegexRemoveAll = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/(remove|add|remove_all)$`);

class Groups {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;

        this.groupsCacheFile = data.joinPathStorage('groups_cache.json');
        this.groupsCache = this.readGroupsCache();
    }

    readGroupsCache() {
        return fs.existsSync(this.groupsCacheFile) ? JSON.parse(fs.readFileSync(this.groupsCacheFile, 'utf8')) : {};
    }

    writeGroupsCache() {
        fs.writeFileSync(this.groupsCacheFile, JSON.stringify(this.groupsCache), 'utf8');
    }

    onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/+/remove`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/+/add`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/+/remove_all`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/remove_all`);
    }

    apply(from, to) {
        const sortGroups = (obj) => Object.keys(obj).forEach((key) => obj[key] = obj[key].sort());

        sortGroups(from);
        sortGroups(to);

        const differences = diff(from, to);
        if (differences) {
            differences.forEach((diff) => {
                const groupID = diff.path[0];

                if (diff.kind === 'N') {
                    diff.rhs.forEach((ID) => this.updateDeviceGroup(ID, 'add', groupID));
                } else if (diff.kind === 'A') {
                    if (diff.item.lhs) {
                        this.updateDeviceGroup(diff.item.lhs, 'remove', groupID);
                    } else {
                        this.updateDeviceGroup(diff.item.rhs, 'add', groupID);
                    }
                } else if (diff.kind === 'D') {
                    diff.lhs.forEach((ID) => this.updateDeviceGroup(ID, 'remove', groupID));
                } else if (diff.kind === 'E') {
                    this.updateDeviceGroup(diff.rhs, 'add', groupID);
                    this.updateDeviceGroup(diff.lhs, 'remove', groupID);
                }
            });
        }
    }

    async parseID(ID) {
        let entityID = ID;
        const postfix = utils.getPostfixes().find((p) => entityID.endsWith(`/${p}`));
        if (postfix) {
            // Found a postfix, retrieve the endpoint which correspodns to the postfix
            entityID = entityID.substring(0, entityID.length - (postfix.length + 1));
        }

        return {entityID, postfix};
    }

    getGroupsOfDevice(entityID) {
        return settings.getGroups().filter((group) => {
            return group.devices.includes(entityID);
        });
    }

    onZigbeeStarted() {
        const settingsGroups = {};
        settings.getGroups().forEach((group) => {
            settingsGroups[group.ID] = group.devices ? group.devices : [];
        });

        this.apply(this.groupsCache, settingsGroups);
    }

    parseTopic(topic) {
        if (!topic.match(topicRegex) && !topic.match(topicRegexRemoveAll)) {
            return null;
        }

        // Remove base from topic
        topic = topic.replace(`${settings.get().mqtt.base_topic}/bridge/group/`, '');

        // Parse type from topic
        const type = topic.substr(topic.lastIndexOf('/') + 1, topic.length);

        // Remove type from topic
        topic = topic.replace(`/${type}`, '');

        return {friendly_name: type === 'remove_all' ? null : topic, type};
    }

    async updateDeviceGroup(ID, cmd, groupID) {
        // let payload = null;

        const {entityID, postfix} = await this.parseID(ID);
        const device = await this.zigbee.getEntityByIDOrFriendlyName(entityID);
        const endpoint = utils.getEndpoint(device, postfix);
        const group = groupID ?
            (await this.zigbee.getGroup({groupID}) || await this.zigbee.createGroup(groupID)) : null;

        try {
            if (cmd === 'add') {
                await endpoint.addToGroup(group);
            } else if (cmd === 'remove') {
                await endpoint.removeFromGroup(group);
            } else if (cmd === 'remove_all') {
                await endpoint.removeFromAllGroups();
            }

            logger.info(`Successfully ${cmd} ${device.ieeeAddr} to ${groupID}`);

            // Log to MQTT
            const lookup = {
                'add': 'device_group_add',
                'remove': 'device_group_remove',
                'remove_all': 'device_group_remove_all',
            };

            this.mqtt.log({
                type: lookup[cmd],
                message: {
                    device: settings.getDevice(device.ieeeAddr).friendly_name,
                    group: groupID,
                },
            });

            // Update group cache
            if (cmd === 'add') {
                if (!this.groupsCache[groupID]) {
                    this.groupsCache[groupID] = [];
                }

                if (!this.groupsCache[groupID].includes(device.ieeeAddr)) {
                    this.groupsCache[groupID].push(device.ieeeAddr);
                }
            } else if (cmd === 'remove') {
                if (this.groupsCache[groupID]) {
                    this.groupsCache[groupID] = this.groupsCache[groupID].filter((d) =>
                        d != device.ieeeAddr
                    );
                }
            } else if (cmd === 'remove_all') {
                Object.keys(this.groupsCache).forEach((groupID_) => {
                    this.groupsCache[groupID_] = this.groupsCache[groupID_].filter((d) =>
                        d != device.ieeeAddr
                    );
                });
            }

            this.writeGroupsCache();

            // Update settings
            if (cmd === 'add') {
                settings.addDeviceToGroup(groupID, device.ieeeAddr);
            } else if (cmd === 'remove') {
                settings.removeDeviceFromGroup(groupID, device.ieeeAddr);
            } else if (cmd === 'remove_all') {
                Object.keys(settings.get().groups).forEach((groupID_) => {
                    settings.removeDeviceFromGroup(groupID_, device.ieeeAddr);
                });
            }
        } catch (error) {
            logger.error(`Failed to ${cmd} ${device.ieeeAddr} from ${groupID} (${error})`);
        }
    }

    async onMQTTMessage(topic, message) {
        topic = this.parseTopic(topic);

        if (!topic) {
            return false;
        }

        // Find ID of this group.
        let groupID = null;
        if (topic.type !== 'remove_all') {
            groupID = settings.getGroup(topic.friendly_name).ID;
            if (!groupID) {
                logger.error(`Group with friendly_name '${topic.friendly_name}' doesn't exist`);
                return;
            }

            groupID = groupID.toString();
        }

        // Send command to the device.
        await this.updateDeviceGroup(message.toString(), topic.type, groupID);

        return true;
    }
}

module.exports = Groups;
