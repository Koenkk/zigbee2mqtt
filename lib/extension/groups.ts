import * as settings from '../util/settings';
import logger from '../util/logger';
import * as utils from '../util/utils';
// @ts-ignore
import stringify from 'json-stable-stringify-without-jsonify';
import equals from 'fast-deep-equal/es6';
import bind from 'bind-decorator';
import Extension from './extension';
import Device from '../model/device';
import Group from '../model/group';

const topicRegex =
    new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/group/members/(remove|add|remove_all)$`);
const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/(.+)/(remove|add|remove_all)$`);
const legacyTopicRegexRemoveAll = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/remove_all$`);

const stateProperties: {[s: string]: (value: string, definition: Definition) => boolean} = {
    'state': () => true,
    'brightness': (value, definition) =>
        !!definition.exposes.find((e) => e.type === 'light' && e.features.find((f) => f.name === 'brightness')),
    'color_temp': (value, definition) =>
        !!definition.exposes.find((e) => e.type === 'light' && e.features.find((f) => f.name === 'color_temp')),
    'color': (value, definition) =>
        !!definition.exposes.find((e) => e.type === 'light' &&
            e.features.find((f) => f.name === 'color_xy' || f.name === 'color_hs')),
    'color_mode': (value, definition) =>
        !!definition.exposes.find((e) => e.type === 'light' && (
            (e.features.find((f) => f.name === `color_${value}`)) ||
            (value === 'color_temp' && e.features.find((f) => f.name === 'color_temp')) )),
};

interface ParsedMQTTMessage {
    type: 'remove' | 'add' | 'remove_all', resolvedEntityGroup: Group, resolvedEntityDevice: Device,
    error: string, groupKey: string, deviceKey: string, triggeredViaLegacyApi: boolean,
    skipDisableReporting: boolean, resolvedEntityEndpoint: zh.Endpoint,
}

export default class Groups extends Extension {
    private legacyApi = settings.get().advanced.legacy_api;
    private lastOptimisticState: {[s: string]: KeyValue} = {};

    override async start(): Promise<void> {
        this.eventBus.onStateChange(this, this.onStateChange);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage_);
        await this.syncGroupsWithSettings();
    }

    private async syncGroupsWithSettings(): Promise<void> {
        const settingsGroups = settings.getGroups();
        const zigbeeGroups = this.zigbee.getGroups();

        const addRemoveFromGroup = async (action: 'add' | 'remove', deviceName: string,
            groupName: string | number, endpoint: zh.Endpoint, group: Group): Promise<void> => {
            try {
                logger.info(`${action === 'add' ? 'Adding' : 'Removing'} '${deviceName}' to group '${groupName}'`);
                if (action === 'remove') {
                    await endpoint.removeFromGroup(group.zhGroup);
                } else {
                    await endpoint.addToGroup(group.zhGroup);
                }
            } catch (error) {
                logger.error(`Failed to ${action} '${deviceName}' from '${groupName}'`);
                logger.debug(error.stack);
            }
        };

        for (const settingGroup of settingsGroups) {
            const groupID = settingGroup.ID;
            const zigbeeGroup = zigbeeGroups.find((g) => g.ID === groupID) || this.zigbee.createGroup(groupID);
            const settingsEndpoint = settingGroup.devices.map((d) => {
                const parsed = utils.parseEntityID(d);
                const entity = this.zigbee.resolveEntity(parsed.ID) as Device;
                if (!entity) logger.error(`Cannot find '${d}' of group '${settingGroup.friendlyName}'`);
                return {'endpoint': entity?.endpoint(parsed.endpoint), 'name': entity?.name};
            }).filter((e) => e.endpoint != null);

            // In settings but not in zigbee
            for (const entity of settingsEndpoint) {
                if (!zigbeeGroup.zhGroup.hasMember(entity.endpoint)) {
                    addRemoveFromGroup('add', entity.name, settingGroup.friendlyName, entity.endpoint, zigbeeGroup);
                }
            }

            // In zigbee but not in settings
            for (const endpoint of zigbeeGroup.members) {
                if (!settingsEndpoint.find((e) => e.endpoint === endpoint)) {
                    const deviceName = settings.getDevice(endpoint.getDevice().ieeeAddr).friendlyName;
                    addRemoveFromGroup('remove', deviceName, settingGroup.friendlyName, endpoint, zigbeeGroup);
                }
            }
        }

        for (const zigbeeGroup of zigbeeGroups) {
            if (!settingsGroups.find((g) => g.ID === zigbeeGroup.ID)) {
                for (const endpoint of zigbeeGroup.members) {
                    const deviceName = settings.getDevice(endpoint.getDevice().ieeeAddr).friendlyName;
                    addRemoveFromGroup('remove', deviceName, zigbeeGroup.ID, endpoint, zigbeeGroup);
                }
            }
        }
    }

    @bind async onStateChange(data: EventStateChange): Promise<void> {
        const reason = 'group_optimistic';
        if (data.reason === reason) {
            return;
        }

        const payload: KeyValue = {};

        let endpointName: string = null;
        for (let [prop, value] of Object.entries(data.update)) {
            const endpointNameMatch = utils.endpointNames.find((n) => prop.endsWith(`_${n}`));
            if (endpointNameMatch) {
                prop = prop.substring(0, prop.length - endpointNameMatch.length - 1);
                endpointName = endpointNameMatch;
            }

            if (prop in stateProperties) {
                payload[prop] = value;
            }
        }

        if (Object.keys(payload).length) {
            const entity = this.zigbee.resolveEntity(data.ID);
            const groups = this.zigbee.getGroups().filter((g) => {
                return g.settings && (!g.settings.hasOwnProperty('optimistic') || g.settings.optimistic);
            });

            if (entity instanceof Device) {
                for (const group of groups) {
                    if (group.zhGroup.hasMember(entity.endpoint(endpointName)) &&
                        !equals(this.lastOptimisticState[group.ID], payload)) {
                        if (!payload || payload.state !== 'OFF' || this.areAllMembersOff(group)) {
                            this.lastOptimisticState[group.ID] = payload;
                            await this.publishEntityState(group, payload, reason);
                        }
                    }
                }
            } else {
                // Invalidate the last optimistic group state when group state is changed directly.
                delete this.lastOptimisticState[entity.ID];

                const groupsToPublish: Set<Group> = new Set();
                for (const member of entity.members) {
                    const device = this.zigbee.resolveEntity(member.getDevice()) as Device;
                    const memberPayload: KeyValue = {};
                    Object.keys(payload).forEach((key) => {
                        if (stateProperties[key](payload[key], device.definition)) {
                            memberPayload[key] = payload[key];
                        }
                    });

                    const endpointName = device.endpointName(member);
                    if (endpointName) {
                        Object.keys(memberPayload).forEach((key) => {
                            memberPayload[`${key}_${endpointName}`] = memberPayload[key];
                            delete memberPayload[key];
                        });
                    }

                    await this.publishEntityState(device, memberPayload, reason);
                    for (const zigbeeGroup of groups) {
                        if (zigbeeGroup.zhGroup.hasMember(member)) {
                            if (!payload || payload.state !== 'OFF' || this.areAllMembersOff(zigbeeGroup)) {
                                groupsToPublish.add(zigbeeGroup);
                            }
                        }
                    }
                }
                groupsToPublish.delete(entity);
                for (const group of groupsToPublish) {
                    await this.publishEntityState(group, payload, reason);
                }
            }
        }
    }

    private areAllMembersOff(group: Group): boolean {
        for (const member of group.members) {
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

    private parseMQTTMessage(data: EventMQTTMessage): ParsedMQTTMessage {
        let type: 'remove' | 'add' | 'remove_all' = null;
        let resolvedEntityGroup: Group = null;
        let resolvedEntityDevice: Device = null;
        let resolvedEntityEndpoint: zh.Endpoint = null;
        let error: string = null;
        let groupKey: string = null;
        let deviceKey: string = null;
        let triggeredViaLegacyApi = false;
        let skipDisableReporting = false;

        /* istanbul ignore else */
        const topicRegexMatch = data.topic.match(topicRegex);
        const legacyTopicRegexRemoveAllMatch = data.topic.match(legacyTopicRegexRemoveAll);
        const legacyTopicRegexMatch = data.topic.match(legacyTopicRegex);

        if (this.legacyApi && (legacyTopicRegexMatch || legacyTopicRegexRemoveAllMatch)) {
            triggeredViaLegacyApi = true;
            if (legacyTopicRegexMatch) {
                resolvedEntityGroup = this.zigbee.resolveEntity(legacyTopicRegexMatch[1]) as Group;
                // @ts-ignore
                type = legacyTopicRegexMatch[2];

                if (!resolvedEntityGroup || !(resolvedEntityGroup instanceof Group)) {
                    logger.error(`Group '${legacyTopicRegexMatch[1]}' does not exist`);

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const payload = {friendly_name: data.message,
                            group: legacyTopicRegexMatch[1], error: 'group doesn\'t exists'};
                        this.mqtt.publish(
                            'bridge/log',
                            stringify({type: `device_group_${type}_failed`, message: payload}),
                        );
                    }

                    return null;
                }
            } else {
                type = 'remove_all';
            }

            const parsedEntity = utils.parseEntityID(data.message);
            resolvedEntityDevice = this.zigbee.resolveEntity(parsedEntity.ID) as Device;
            if (!resolvedEntityDevice || !(resolvedEntityDevice instanceof Device)) {
                logger.error(`Device '${data.message}' does not exist`);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const payload = {
                        friendly_name: data.message, group: legacyTopicRegexMatch[1], error: 'entity doesn\'t exists',
                    };
                    this.mqtt.publish(
                        'bridge/log',
                        stringify({type: `device_group_${type}_failed`, message: payload}),
                    );
                }

                return null;
            }
            resolvedEntityEndpoint = resolvedEntityDevice.endpoint(parsedEntity.endpoint);
        } else if (topicRegexMatch) {
            // @ts-ignore
            type = topicRegexMatch[1];
            const message = JSON.parse(data.message);
            deviceKey = message.device;
            skipDisableReporting = 'skip_disable_reporting' in message ? message.skip_disable_reporting : false;

            if (type !== 'remove_all') {
                groupKey = message.group;
                resolvedEntityGroup = this.zigbee.resolveEntity(message.group) as Group;
                if (!resolvedEntityGroup || !(resolvedEntityGroup instanceof Group)) {
                    error = `Group '${message.group}' does not exist`;
                }
            }

            const parsed = utils.parseEntityID(message.device);
            resolvedEntityDevice = this.zigbee.resolveEntity(parsed.ID) as Device;
            if (!error && (!resolvedEntityDevice || !(resolvedEntityDevice instanceof Device))) {
                error = `Device '${message.device}' does not exist`;
            }
            if (!error) {
                resolvedEntityEndpoint = resolvedEntityDevice.endpoint(parsed.endpoint);
            }
        }

        return {
            resolvedEntityGroup, resolvedEntityDevice, type, error, groupKey, deviceKey,
            triggeredViaLegacyApi, skipDisableReporting, resolvedEntityEndpoint,
        };
    }

    @bind private async onMQTTMessage_(data: EventMQTTMessage): Promise<void> {
        const parsed = this.parseMQTTMessage(data);
        if (!parsed || !parsed.type) return;
        let {
            resolvedEntityGroup, resolvedEntityDevice, type, error, triggeredViaLegacyApi,
            groupKey, deviceKey, skipDisableReporting, resolvedEntityEndpoint,
        } = parsed;
        const message = utils.parseJSON(data.message, data.message);

        const responseData: KeyValue = {device: deviceKey};
        if (groupKey) {
            responseData.group = groupKey;
        }

        if (!error) {
            try {
                const keys = [
                    `${resolvedEntityDevice.ieeeAddr}/${resolvedEntityEndpoint.ID}`,
                    `${resolvedEntityDevice.name}/${resolvedEntityEndpoint.ID}`,
                ];

                const endpointNameLocal = resolvedEntityDevice.endpointName(resolvedEntityEndpoint);
                if (endpointNameLocal) {
                    keys.push(`${resolvedEntityDevice.ieeeAddr}/${endpointNameLocal}`);
                    keys.push(`${resolvedEntityDevice.name}/${endpointNameLocal}`);
                }

                if (!endpointNameLocal) {
                    keys.push(resolvedEntityDevice.name);
                    keys.push(resolvedEntityDevice.ieeeAddr);
                }

                if (type === 'add') {
                    logger.info(`Adding '${resolvedEntityDevice.name}' to '${resolvedEntityGroup.name}'`);
                    await resolvedEntityEndpoint.addToGroup(resolvedEntityGroup.zhGroup);
                    settings.addDeviceToGroup(resolvedEntityGroup.ID.toString(), keys);

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
                    await resolvedEntityEndpoint.removeFromGroup(resolvedEntityGroup.zhGroup);
                    settings.removeDeviceFromGroup(resolvedEntityGroup.ID.toString(), keys);

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
                    await resolvedEntityEndpoint.removeFromAllGroups();
                    for (const settingsGroup of settings.getGroups()) {
                        settings.removeDeviceFromGroup(settingsGroup.ID.toString(), keys);

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
                logger.debug(e.stack);
            }
        }

        if (!triggeredViaLegacyApi) {
            const response = utils.getResponse(message, responseData, error);
            await this.mqtt.publish(`bridge/response/group/members/${type}`, stringify(response));
        }

        if (error) {
            logger.error(error);
        } else {
            this.eventBus.emitGroupMembersChanged({
                group: resolvedEntityGroup, action: type, endpoint: resolvedEntityEndpoint, skipDisableReporting});
        }
    }
}
