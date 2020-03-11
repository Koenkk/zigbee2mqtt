const settings = require('../util/settings');
const logger = require('../util/logger');
const BaseExtension = require('./baseExtension');

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/(.+)/(remove|add|remove_all)$`);
const topicRegexRemoveAll = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/remove_all$`);

class Groups extends BaseExtension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.onStateChange = this.onStateChange.bind(this);
    }

    onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/remove_all`);

        for (let step = 1; step < 20; step++) {
            const topic = `${settings.get().mqtt.base_topic}/bridge/group/${'+/'.repeat(step)}`;
            this.mqtt.subscribe(`${topic}remove`);
            this.mqtt.subscribe(`${topic}add`);
            this.mqtt.subscribe(`${topic}remove_all`); // DEPRECATED
        }
    }

    async onZigbeeStarted() {
        await this.syncGroupsWithSettings();
        this.state.on('stateChange', this.onStateChange);
    }

    async syncGroupsWithSettings() {
        const settingsGroups = settings.getGroups();
        const zigbeeGroups = this.zigbee.getGroups();
        for (const settingGroup of settingsGroups) {
            const groupID = settingGroup.ID;
            const zigbeeGroup = zigbeeGroups.find((g) => g.groupID === groupID) || this.zigbee.createGroup(groupID);
            const settingsEntity = settingGroup.devices.map((d) => {
                const entity = this.zigbee.resolveEntity(d);
                if (!entity) logger.error(`Cannot find '${d}' of group '${settingGroup.friendlyName}'`);
                return entity;
            }).filter((e) => e != null);

            // In settings but not in zigbee
            for (const entity of settingsEntity) {
                if (!zigbeeGroup.hasMember(entity.endpoint)) {
                    logger.info(`Adding '${entity.name}' to group '${settingGroup.friendlyName}'`);
                    await entity.endpoint.addToGroup(zigbeeGroup);
                }
            }

            // In zigbee but not in settings
            for (const endpoint of zigbeeGroup.members) {
                if (!settingsEntity.find((e) => e.endpoint === endpoint)) {
                    const deviceSettings = settings.getDevice(endpoint.getDevice().ieeeAddr);
                    logger.info(`Removing '${deviceSettings.friendlyName}' from group '${settingGroup.friendlyName}'`);
                    await endpoint.removeFromGroup(zigbeeGroup);
                }
            }
        }

        // eslint-disable-next-line
        for (const zigbeeGroup of zigbeeGroups) {
            if (!settingsGroups.find((g) => g.ID === zigbeeGroup.groupID)) {
                for (const endpoint of zigbeeGroup.members) {
                    const deviceSettings = settings.getDevice(endpoint.getDevice().ieeeAddr);
                    logger.info(`Removing '${deviceSettings.friendlyName}' from group ${zigbeeGroup.groupID}`);
                    await endpoint.removeFromGroup(zigbeeGroup);
                }
            }
        }
    }

    async onStateChange(data) {
        const reason = 'group_optimistic';
        if (data.reason === reason) {
            return;
        }

        const properties = ['state', 'brightness', 'color_temp', 'color'];
        const payload = {};

        properties.forEach((prop) => {
            if (data.to.hasOwnProperty(prop)) {
                payload[prop] = data.to[prop];
            }
        });

        if (Object.keys(payload).length) {
            const entity = this.zigbee.resolveEntity(data.ID);
            const zigbeeGroups = this.zigbee.getGroups().filter((zigbeeGroup) => {
                const settingsGroup = settings.getGroup(zigbeeGroup.groupID);
                return settingsGroup && settingsGroup.optimistic;
            });

            if (entity.type === 'device') {
                for (const zigbeeGroup of zigbeeGroups) {
                    if (zigbeeGroup.hasMember(entity.endpoint)) {
                        if (!payload || payload.state !== 'OFF' || this.allMembersOff(zigbeeGroup)) {
                            await this.publishEntityState(zigbeeGroup.groupID, payload, reason);
                        }
                    }
                }
            } else {
                const groupIDsToPublish = new Set();
                for (const member of entity.group.members) {
                    await this.publishEntityState(member.getDevice().ieeeAddr, payload, reason);
                    for (const zigbeeGroup of zigbeeGroups) {
                        if (zigbeeGroup.hasMember(member)) {
                            if (!payload || payload.state !== 'OFF' || this.allMembersOff(zigbeeGroup)) {
                                groupIDsToPublish.add(zigbeeGroup.groupID);
                            }
                        }
                    }
                }
                groupIDsToPublish.delete(entity.group.groupID);
                for (const groupID of groupIDsToPublish) {
                    await this.publishEntityState(groupID, payload, reason);
                }
            }
        }
    }

    allMembersOff(zigbeeGroup) {
        for (const member of zigbeeGroup.members) {
            const device = member.getDevice();
            if (this.state.exists(device.ieeeAddr)) {
                const state = this.state.get(device.ieeeAddr);
                if (state && state.state === 'ON') {
                    return false;
                }
            }
        }
        return true;
    }

    async onMQTTMessage(topic, message) {
        let type;
        let group;
        const topicMatch = topic.match(topicRegex);
        if (topicMatch) {
            group = this.zigbee.resolveEntity(topicMatch[1]);
            type = topicMatch[2];

            if (!group || group.type !== 'group') {
                logger.error(`Group '${topicMatch[1]}' does not exist`);
                this.mqtt.log(
                    `device_group_${type}_failed`,
                    {friendly_name: message, group: topicMatch[1], error: 'group doesn\'t exists'});
                return;
            }
        } else if (topic.match(topicRegexRemoveAll)) {
            type = 'remove_all';
        } else {
            return;
        }

        const entity = this.zigbee.resolveEntity(message);
        if (!entity || !entity.type === 'device') {
            logger.error(`Device '${message}' does not exist`);
            this.mqtt.log(
                `device_group_${type}_failed`,
                {friendly_name: message, group: topicMatch[1], error: 'entity doesn\'t exists'});
            return;
        }

        const keys = [
            `${entity.device.ieeeAddr}/${entity.endpoint.ID}`,
            `${entity.name}/${entity.endpoint.ID}`,
        ];

        if (entity.endpointName) {
            keys.push(`${entity.device.ieeeAddr}/${entity.endpointName}`);
            keys.push(`${entity.name}/${entity.endpointName}`);
        }

        if (entity.isDefaultEndpoint) {
            keys.push(entity.name);
            keys.push(entity.device.ieeeAddr);
        }

        if (type === 'add') {
            logger.info(`Adding '${entity.name}' to '${group.name}'`);
            await entity.endpoint.addToGroup(group.group);
            settings.addDeviceToGroup(group.settings.ID, keys);
            this.mqtt.log('device_group_add', {friendly_name: entity.name, group: group.name});
        } else if (type === 'remove') {
            logger.info(`Removing '${entity.name}' from '${group.name}'`);
            await entity.endpoint.removeFromGroup(group.group);
            settings.removeDeviceFromGroup(group.settings.ID, keys);
            this.mqtt.log('device_group_remove', {friendly_name: entity.name, group: group.name});
        } else { // remove_all
            logger.info(`Removing '${entity.name}' from all groups`);
            await entity.endpoint.removeFromAllGroups();
            for (const settingsGroup of settings.getGroups()) {
                settings.removeDeviceFromGroup(settingsGroup.ID, keys);
                this.mqtt.log('device_group_remove_all', {friendly_name: entity.name});
            }
        }
    }
}

module.exports = Groups;
