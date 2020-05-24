const settings = require('../util/settings');
const logger = require('../util/logger');
const Extension = require('./extension');
const utils = require('../util/utils');
const postfixes = utils.getEndpointNames();

const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/(.+)/(remove|add|remove_all)$`);
const legacyTopicRegexRemoveAll = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/remove_all$`);

class Groups extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.onStateChange = this.onStateChange.bind(this);
        this.legacyApi = settings.get().advanced.legacy_api;
    }

    onMQTTConnected() {
        /* istanbul ignore else */
        if (this.legacyApi) {
            this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/remove_all`);

            for (let step = 1; step < 20; step++) {
                const topic = `${settings.get().mqtt.base_topic}/bridge/group/${'+/'.repeat(step)}`;
                this.mqtt.subscribe(`${topic}remove`);
                this.mqtt.subscribe(`${topic}add`);
                this.mqtt.subscribe(`${topic}remove_all`);
            }
        }
    }

    async onZigbeeStarted() {
        await this.syncGroupsWithSettings();
        this.eventBus.on('stateChange', this.onStateChange);
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
            const resolvedEntity = this.zigbee.resolveEntity(data.ID);
            const zigbeeGroups = this.zigbee.getGroups().filter((zigbeeGroup) => {
                const settingsGroup = settings.getGroup(zigbeeGroup.groupID);
                return settingsGroup && settingsGroup.optimistic;
            });

            if (resolvedEntity.type === 'device') {
                for (const zigbeeGroup of zigbeeGroups) {
                    if (zigbeeGroup.hasMember(resolvedEntity.endpoint)) {
                        if (!payload || payload.state !== 'OFF' || this.areAllMembersOff(zigbeeGroup)) {
                            await this.publishEntityState(zigbeeGroup.groupID, payload, reason);
                        }
                    }
                }
            } else {
                const groupIDsToPublish = new Set();
                for (const member of resolvedEntity.group.members) {
                    await this.publishEntityState(member.getDevice().ieeeAddr, payload, reason);
                    for (const zigbeeGroup of zigbeeGroups) {
                        if (zigbeeGroup.hasMember(member)) {
                            if (!payload || payload.state !== 'OFF' || this.areAllMembersOff(zigbeeGroup)) {
                                groupIDsToPublish.add(zigbeeGroup.groupID);
                            }
                        }
                    }
                }
                groupIDsToPublish.delete(resolvedEntity.group.groupID);
                for (const groupID of groupIDsToPublish) {
                    await this.publishEntityState(groupID, payload, reason);
                }
            }
        }
    }

    areAllMembersOff(zigbeeGroup) {
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

    parseMQTTMessage(topic, message) {
        let type = null;
        let resolvedEntityGroup = null;
        let resolvedEntityDevice = null;
        let hasEndpointName = null;

        /* istanbul ignore else */
        if (this.legacyApi) {
            const topicMatch = topic.match(legacyTopicRegex);
            if (topicMatch) {
                resolvedEntityGroup = this.zigbee.resolveEntity(topicMatch[1]);
                type = topicMatch[2];

                if (!resolvedEntityGroup || resolvedEntityGroup.type !== 'group') {
                    logger.error(`Group '${topicMatch[1]}' does not exist`);

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const payload = {friendly_name: message, group: topicMatch[1], error: 'group doesn\'t exists'};
                        this.mqtt.publish(
                            'bridge/log',
                            JSON.stringify({type: `device_group_${type}_failed`, message: payload}),
                        );
                    }

                    return {};
                }
            } else if (topic.match(legacyTopicRegexRemoveAll)) {
                type = 'remove_all';
            } else {
                return {};
            }

            resolvedEntityDevice = this.zigbee.resolveEntity(message);
            if (!resolvedEntityDevice || !resolvedEntityDevice.type === 'device') {
                logger.error(`Device '${message}' does not exist`);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const payload = {friendly_name: message, group: topicMatch[1], error: 'entity doesn\'t exists'};
                    this.mqtt.publish(
                        'bridge/log',
                        JSON.stringify({type: `device_group_${type}_failed`, message: payload}),
                    );
                }

                return {};
            }

            hasEndpointName = postfixes.find((p) => message.endsWith(`/${p}`));
        }

        return {resolvedEntityGroup, resolvedEntityDevice, type, hasEndpointName};
    }

    async onMQTTMessage(topic, message) {
        const {resolvedEntityGroup, resolvedEntityDevice, type, hasEndpointName} =
            this.parseMQTTMessage(topic, message);
        if (!type) return;

        const keys = [
            `${resolvedEntityDevice.device.ieeeAddr}/${resolvedEntityDevice.endpoint.ID}`,
            `${resolvedEntityDevice.name}/${resolvedEntityDevice.endpoint.ID}`,
        ];

        const definition = resolvedEntityDevice.definition;
        const endpoints = definition && definition.endpoint ? definition.endpoint(resolvedEntityDevice.device) : null;
        const endpointName = endpoints ?
            Object.entries(endpoints).find((e) => e[1] === resolvedEntityDevice.endpoint.ID)[0] : null;

        if (endpointName) {
            keys.push(`${resolvedEntityDevice.device.ieeeAddr}/${endpointName}`);
            keys.push(`${resolvedEntityDevice.name}/${endpointName}`);
        }

        if (!hasEndpointName) {
            keys.push(resolvedEntityDevice.name);
            keys.push(resolvedEntityDevice.device.ieeeAddr);
        }

        if (type === 'add') {
            logger.info(`Adding '${resolvedEntityDevice.name}' to '${resolvedEntityGroup.name}'`);
            await resolvedEntityDevice.endpoint.addToGroup(resolvedEntityGroup.group);
            settings.addDeviceToGroup(resolvedEntityGroup.settings.ID, keys);

            /* istanbul ignore else */
            if (settings.get().advanced.legacy_api) {
                const payload = {friendly_name: resolvedEntityDevice.name, group: resolvedEntityGroup.name};
                this.mqtt.publish(
                    'bridge/log',
                    JSON.stringify({type: `device_group_add`, message: payload}),
                );
            }
        } else if (type === 'remove') {
            logger.info(`Removing '${resolvedEntityDevice.name}' from '${resolvedEntityGroup.name}'`);
            await resolvedEntityDevice.endpoint.removeFromGroup(resolvedEntityGroup.group);
            settings.removeDeviceFromGroup(resolvedEntityGroup.settings.ID, keys);

            /* istanbul ignore else */
            if (settings.get().advanced.legacy_api) {
                const payload = {friendly_name: resolvedEntityDevice.name, group: resolvedEntityGroup.name};
                this.mqtt.publish(
                    'bridge/log',
                    JSON.stringify({type: `device_group_remove`, message: payload}),
                );
            }
        } else { // remove_all
            logger.info(`Removing '${resolvedEntityDevice.name}' from all groups`);
            await resolvedEntityDevice.endpoint.removeFromAllGroups();
            for (const settingsGroup of settings.getGroups()) {
                settings.removeDeviceFromGroup(settingsGroup.ID, keys);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const payload = {friendly_name: resolvedEntityDevice.name};
                    this.mqtt.publish(
                        'bridge/log',
                        JSON.stringify({type: `device_group_remove_all`, message: payload}),
                    );
                }
            }
        }
    }
}

module.exports = Groups;
