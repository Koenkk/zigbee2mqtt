const settings = require('../util/settings');
const logger = require('../util/logger');
const Extension = require('./extension');
const utils = require('../util/utils');
const postfixes = utils.getEndpointNames();
const stringify = require('json-stable-stringify-without-jsonify');
const equals = require('fast-deep-equal/es6');

const topicRegex =
    new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/group/members/(remove|add|remove_all)$`);
const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/(.+)/(remove|add|remove_all)$`);
const legacyTopicRegexRemoveAll = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/remove_all$`);

const stateProperties = {
    'state': (value, definition) => true,
    'brightness': (value, definition) =>
        definition.exposes.find((e) => e.type === 'light' && e.features.find((f) => f.name === 'brightness')),
    'color_temp': (value, definition) =>
        definition.exposes.find((e) => e.type === 'light' && e.features.find((f) => f.name === 'color_temp')),
    'color': (value, definition) =>
        definition.exposes.find((e) => e.type === 'light' &&
            e.features.find((f) => f.name === 'color_xy' || f.name === 'color_hs')),
    'color_mode': (value, definition) =>
        definition.exposes.find((e) => e.type === 'light' && (
            (e.features.find((f) => f.name === `color_${value}`)) ||
            (value === 'color_temp' && e.features.find((f) => f.name === 'color_temp')) )),
};

class Groups extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.onStateChange = this.onStateChange.bind(this);
        this.legacyApi = settings.get().advanced.legacy_api;
        this.lastOptimisticState = {};
    }

    async onZigbeeStarted() {
        this.eventBus.on('stateChange', this.onStateChange);
        await this.syncGroupsWithSettings();
    }

    async syncGroupsWithSettings() {
        const settingsGroups = settings.getGroups();
        const zigbeeGroups = this.zigbee.getGroups();

        const addRemoveFromGroup = async (action, deviceName, groupName, endpoint, group) => {
            try {
                logger.info(`${action === 'add' ? 'Adding' : 'Removing'} '${deviceName}' to group '${groupName}'`);
                if (action === 'remove') {
                    await endpoint.removeFromGroup(group);
                } else {
                    await endpoint.addToGroup(group);
                }
            } catch (error) {
                logger.error(`Failed to ${action} '${deviceName}' from '${groupName}'`);
            }
        };

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
                    addRemoveFromGroup('add', entity.name, settingGroup.friendlyName, entity.endpoint, zigbeeGroup);
                }
            }

            // In zigbee but not in settings
            for (const endpoint of zigbeeGroup.members) {
                if (!settingsEntity.find((e) => e.endpoint === endpoint)) {
                    const deviceName = settings.getDevice(endpoint.getDevice().ieeeAddr).friendlyName;
                    addRemoveFromGroup('remove', deviceName, settingGroup.friendlyName, endpoint, zigbeeGroup);
                }
            }
        }

        for (const zigbeeGroup of zigbeeGroups) {
            if (!settingsGroups.find((g) => g.ID === zigbeeGroup.groupID)) {
                for (const endpoint of zigbeeGroup.members) {
                    const deviceName = settings.getDevice(endpoint.getDevice().ieeeAddr).friendlyName;
                    addRemoveFromGroup('remove', deviceName, zigbeeGroup.groupID, endpoint, zigbeeGroup);
                }
            }
        }
    }

    async onStateChange(data) {
        const reason = 'group_optimistic';
        if (data.reason === reason) {
            return;
        }

        const payload = {};

        let endpointName;
        for (let [prop, value] of Object.entries(data.update)) {
            const endpointNameMatch = utils.getEndpointNames().find((n) => prop.endsWith(`_${n}`));
            if (endpointNameMatch) {
                prop = prop.substring(0, prop.length - endpointNameMatch.length - 1);
                endpointName = endpointNameMatch;
            }

            if (prop in stateProperties) {
                payload[prop] = value;
            }
        }

        if (Object.keys(payload).length) {
            const resolvedEntity = this.zigbee.resolveEntity(`${data.ID}${endpointName ? `/${endpointName}` : ''}`);
            const zigbeeGroups = this.zigbee.getGroups().filter((zigbeeGroup) => {
                const settingsGroup = settings.getGroup(zigbeeGroup.groupID);
                return settingsGroup && (!settingsGroup.hasOwnProperty('optimistic') || settingsGroup.optimistic);
            });

            if (resolvedEntity.type === 'device') {
                for (const zigbeeGroup of zigbeeGroups) {
                    if (zigbeeGroup.hasMember(resolvedEntity.endpoint) &&
                        !equals(this.lastOptimisticState[zigbeeGroup.groupID], payload)) {
                        if (!payload || payload.state !== 'OFF' || this.areAllMembersOff(zigbeeGroup)) {
                            this.lastOptimisticState[zigbeeGroup.groupID] = payload;
                            await this.publishEntityState(zigbeeGroup.groupID, payload, reason);
                        }
                    }
                }
            } else {
                // Invalidate the last optimistic group state when group state is changed directly.
                delete this.lastOptimisticState[resolvedEntity.group.groupID];

                const groupIDsToPublish = new Set();
                for (const member of resolvedEntity.group.members) {
                    const resolvedEntity = this.zigbee.resolveEntity(member);
                    const memberPayload = {};
                    Object.keys(payload).forEach((key) => {
                        if (stateProperties[key](payload[key], resolvedEntity.definition)) {
                            memberPayload[key] = payload[key];
                        }
                    });

                    const endpointName = resolvedEntity.endpointName;
                    if (endpointName) {
                        Object.keys(memberPayload).forEach((key) => {
                            memberPayload[`${key}_${endpointName}`] = memberPayload[key];
                            delete memberPayload[key];
                        });
                    }

                    await this.publishEntityState(member.getDevice().ieeeAddr, memberPayload, reason);
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
        let error = null;
        let groupKey = null;
        let deviceKey = null;
        let triggeredViaLegacyApi = false;
        let skipDisableReporting = false;

        /* istanbul ignore else */
        const topicRegexMatch = topic.match(topicRegex);
        const legacyTopicRegexRemoveAllMatch = topic.match(legacyTopicRegexRemoveAll);
        const legacyTopicRegexMatch = topic.match(legacyTopicRegex);

        if (this.legacyApi && (legacyTopicRegexMatch || legacyTopicRegexRemoveAllMatch)) {
            triggeredViaLegacyApi = true;
            if (legacyTopicRegexMatch) {
                resolvedEntityGroup = this.zigbee.resolveEntity(legacyTopicRegexMatch[1]);
                type = legacyTopicRegexMatch[2];

                if (!resolvedEntityGroup || resolvedEntityGroup.type !== 'group') {
                    logger.error(`Group '${legacyTopicRegexMatch[1]}' does not exist`);

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const payload = {
                            friendly_name: message, group: legacyTopicRegexMatch[1], error: 'group doesn\'t exists',
                        };
                        this.mqtt.publish(
                            'bridge/log',
                            stringify({type: `device_group_${type}_failed`, message: payload}),
                        );
                    }

                    return {};
                }
            } else {
                type = 'remove_all';
            }

            resolvedEntityDevice = this.zigbee.resolveEntity(message);
            if (!resolvedEntityDevice || !resolvedEntityDevice.type === 'device') {
                logger.error(`Device '${message}' does not exist`);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const payload = {
                        friendly_name: message, group: legacyTopicRegexMatch[1], error: 'entity doesn\'t exists',
                    };
                    this.mqtt.publish(
                        'bridge/log',
                        stringify({type: `device_group_${type}_failed`, message: payload}),
                    );
                }

                return {};
            }

            hasEndpointName = postfixes.find((p) => message.endsWith(`/${p}`));
        } else if (topicRegexMatch) {
            type = topicRegexMatch[1];
            message = JSON.parse(message);
            deviceKey = message.device;
            skipDisableReporting = 'skip_disable_reporting' in message ? message.skip_disable_reporting : false;

            if (type !== 'remove_all') {
                groupKey = message.group;
                resolvedEntityGroup = this.zigbee.resolveEntity(message.group);
                if (!resolvedEntityGroup || resolvedEntityGroup.type !== 'group') {
                    error = `Group '${message.group}' does not exist`;
                }
            }

            resolvedEntityDevice = this.zigbee.resolveEntity(message.device);
            if (!error && (!resolvedEntityDevice || !resolvedEntityDevice.type === 'device')) {
                error = `Device '${message.device}' does not exist`;
            }

            hasEndpointName = postfixes.find((p) => message.device.endsWith(`/${p}`));
        }

        return {
            resolvedEntityGroup, resolvedEntityDevice, type, hasEndpointName, error, groupKey, deviceKey,
            triggeredViaLegacyApi, skipDisableReporting,
        };
    }

    async onMQTTMessage(topic, message) {
        let {
            resolvedEntityGroup, resolvedEntityDevice, type, hasEndpointName, error, triggeredViaLegacyApi,
            groupKey, deviceKey, skipDisableReporting,
        } = this.parseMQTTMessage(topic, message);
        if (!type) return;
        message = utils.parseJSON(message, message);

        const responseData = {device: deviceKey};
        if (groupKey) {
            responseData.group = groupKey;
        }

        if (!error) {
            try {
                const keys = [
                    `${resolvedEntityDevice.device.ieeeAddr}/${resolvedEntityDevice.endpoint.ID}`,
                    `${resolvedEntityDevice.name}/${resolvedEntityDevice.endpoint.ID}`,
                ];

                const definition = resolvedEntityDevice.definition;
                const endpoints = definition && definition.endpoint ?
                    definition.endpoint(resolvedEntityDevice.device) : null;
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
                            stringify({type: `device_group_add`, message: payload}),
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
                            stringify({type: `device_group_remove`, message: payload}),
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
                                stringify({type: `device_group_remove_all`, message: payload}),
                            );
                        }
                    }
                }
            } catch (e) {
                error = `Failed to ${type} from group (${e.message})`;
            }
        }

        if (!triggeredViaLegacyApi) {
            const response = utils.getResponse(message, responseData, error);
            await this.mqtt.publish(`bridge/response/group/members/${type}`, stringify(response));
        }

        if (error) {
            logger.error(error);
        } else {
            this.eventBus.emit('groupMembersChanged',
                {group: resolvedEntityGroup, action: type, endpoint: resolvedEntityDevice.endpoint,
                    skipDisableReporting: skipDisableReporting});
        }
    }
}

module.exports = Groups;
