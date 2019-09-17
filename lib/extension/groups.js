const settings = require('../util/settings');
const logger = require('../util/logger');
const BaseExtension = require('./baseExtension');

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/(.+)/(remove|add|remove_all)$`);
const topicRegexRemoveAll = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/remove_all$`);

class Groups extends BaseExtension {
    constructor(zigbee, mqtt, state, publishEntityState) {
        super(zigbee, mqtt, state, publishEntityState);
        this.onStateChange = this.onStateChange.bind(this);
    }

    onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/+/remove`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/+/add`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/+/remove_all`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/remove_all`);
    }

    async onZigbeeStarted() {
        await this.syncGroupsWithSettings();
        this.state.on('stateChange', this.onStateChange);
    }

    async syncGroupsWithSettings() {
        const settingsGroups = settings.getGroups();
        const zigbeeGroups = await this.zigbee.getGroups({});
        for (const settingGroup of settingsGroups) {
            const groupID = settingGroup.ID;
            const zigbeeGroup = zigbeeGroups.find((g) => g.groupID === groupID) ||
                (await this.zigbee.createGroup(groupID));
            const settingsEntity = (await Promise.all(settingGroup.devices.map(async (d) => {
                const entity = await this.zigbee.resolveEntity(d);
                if (!entity) logger.error(`Cannot find '${d}' of group '${settingGroup.friendlyName}'`);
                return entity;
            }))).filter((e) => e != null);

            // In settings but not in zigbee
            for (const entity of settingsEntity) {
                if (!zigbeeGroup.hasMember(entity.endpoint)) {
                    logger.info(`Adding '${entity.name}' to group '${settingGroup.friendlyName}'`);
                    await entity.endpoint.addToGroup(zigbeeGroup);
                }
            }

            // In zigbee but not in settings
            for (const endpoint of zigbeeGroup.getMembers()) {
                if (!settingsEntity.find((e) => e.endpoint === endpoint)) {
                    const deviceSettings = settings.getDevice(endpoint.deviceIeeeAddress);
                    logger.info(`Removing '${deviceSettings.friendlyName}' from group '${settingGroup.friendlyName}'`);
                    await endpoint.removeFromGroup(zigbeeGroup);
                }
            }
        }

        // eslint-disable-next-line
        for (const zigbeeGroup of zigbeeGroups) {
            if (!settingsGroups.find((g) => g.ID === zigbeeGroup.groupID)) {
                for (const endpoint of zigbeeGroup.getMembers()) {
                    const deviceSettings = settings.getDevice(endpoint.deviceIeeeAddress);
                    logger.info(`Removing '${deviceSettings.friendlyName}' from group ${zigbeeGroup.groupID}`);
                    await endpoint.removeFromGroup(zigbeeGroup);
                }
            }
        }
    }

    async onStateChange(data) {
        const properties = ['state', 'brightness', 'color_temp', 'color'];
        const payload = {};

        properties.forEach((prop) => {
            if (data.to.hasOwnProperty(prop) && (!data.from || data.from[prop] != data.to[prop])) {
                payload[prop] = data.to[prop];
            }
        });

        if (Object.keys(payload).length) {
            const entity = await this.zigbee.resolveEntity(data.ID);
            if (entity.type !== 'device') {
                return;
            }

            const zigbeeGroups = await this.zigbee.getGroups({});
            for (const zigbeeGroup of zigbeeGroups) {
                if (zigbeeGroup.hasMember(entity.endpoint)) {
                    await this.publishEntityState(zigbeeGroup.groupID, payload);
                }
            }
        }
    }

    async onMQTTMessage(topic, message) {
        let type;
        let group;
        const topicMatch = topic.match(topicRegex);
        if (topicMatch) {
            group = await this.zigbee.resolveEntity(topicMatch[1]);
            type = topicMatch[2];

            if (!group || group.type !== 'group') {
                logger.error(`Group '${topicMatch[1]}' does not exist`);
                return;
            }
        } else if (topic.match(topicRegexRemoveAll)) {
            type = 'remove_all';
        } else {
            return;
        }

        const entity = await this.zigbee.resolveEntity(message);
        if (!entity || !entity.type === 'device') {
            logger.error(`Device '${message}' does not exist`);
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
