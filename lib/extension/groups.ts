import assert from 'assert';

import bind from 'bind-decorator';
import equals from 'fast-deep-equal/es6';
import stringify from 'json-stable-stringify-without-jsonify';

import * as zhc from 'zigbee-herdsman-converters';

import Device from '../model/device';
import Group from '../model/group';
import logger from '../util/logger';
import * as settings from '../util/settings';
import utils, {isLightExpose} from '../util/utils';
import Extension from './extension';

const TOPIC_REGEX = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/group/members/(remove|add|remove_all)$`);

const STATE_PROPERTIES: Readonly<Record<string, (value: string, exposes: zhc.Expose[]) => boolean>> = {
    state: () => true,
    brightness: (value, exposes) => exposes.some((e) => isLightExpose(e) && e.features.some((f) => f.name === 'brightness')),
    color_temp: (value, exposes) => exposes.some((e) => isLightExpose(e) && e.features.some((f) => f.name === 'color_temp')),
    color: (value, exposes) => exposes.some((e) => isLightExpose(e) && e.features.some((f) => f.name === 'color_xy' || f.name === 'color_hs')),
    color_mode: (value, exposes) =>
        exposes.some(
            (e) =>
                isLightExpose(e) &&
                (e.features.some((f) => f.name === `color_${value}`) || (value === 'color_temp' && e.features.some((f) => f.name === 'color_temp'))),
        ),
};

interface ParsedMQTTMessage {
    type: 'remove' | 'add' | 'remove_all';
    resolvedEntityGroup?: Group;
    resolvedEntityDevice: Device;
    error?: string;
    groupKey?: string;
    deviceKey?: string;
    skipDisableReporting: boolean;
    resolvedEntityEndpoint?: zh.Endpoint;
}

export default class Groups extends Extension {
    private lastOptimisticState: {[s: string]: KeyValue} = {};

    override async start(): Promise<void> {
        this.eventBus.onStateChange(this, this.onStateChange);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
    }

    @bind async onStateChange(data: eventdata.StateChange): Promise<void> {
        const reason = 'groupOptimistic';

        if (data.reason === reason || data.reason === 'publishCached') {
            return;
        }

        const payload: KeyValue = {};
        let endpointName: string | undefined;
        const endpointNames: string[] = data.entity instanceof Device ? data.entity.getEndpointNames() : [];

        for (let prop of Object.keys(data.update)) {
            const value = data.update[prop];
            const endpointNameMatch = endpointNames.find((n) => prop.endsWith(`_${n}`));

            if (endpointNameMatch) {
                prop = prop.substring(0, prop.length - endpointNameMatch.length - 1);
                endpointName = endpointNameMatch;
            }

            if (prop in STATE_PROPERTIES) {
                payload[prop] = value;
            }
        }

        const payloadKeys = Object.keys(payload);

        if (payloadKeys.length) {
            const entity = data.entity;
            const groups = [];

            for (const group of this.zigbee.groupsIterator()) {
                if (group.options && (group.options.optimistic == undefined || group.options.optimistic)) {
                    groups.push(group);
                }
            }

            if (entity instanceof Device) {
                const endpoint = entity.endpoint(endpointName);

                /* istanbul ignore else */
                if (endpoint) {
                    for (const group of groups) {
                        if (
                            group.zh.hasMember(endpoint) &&
                            !equals(this.lastOptimisticState[group.ID], payload) &&
                            this.shouldPublishPayloadForGroup(group, payload)
                        ) {
                            this.lastOptimisticState[group.ID] = payload;

                            await this.publishEntityState(group, payload, reason);
                        }
                    }
                }
            } else {
                // Invalidate the last optimistic group state when group state is changed directly.
                delete this.lastOptimisticState[entity.ID];

                const groupsToPublish: Set<Group> = new Set();

                for (const member of entity.zh.members) {
                    const device = this.zigbee.resolveEntity(member.getDevice()) as Device;

                    if (device.options.disabled) {
                        continue;
                    }

                    const exposes = device.exposes();
                    const memberPayload: KeyValue = {};

                    for (const key of payloadKeys) {
                        if (STATE_PROPERTIES[key](payload[key], exposes)) {
                            memberPayload[key] = payload[key];
                        }
                    }

                    const endpointName = device.endpointName(member);

                    if (endpointName) {
                        for (const key of Object.keys(memberPayload)) {
                            memberPayload[`${key}_${endpointName}`] = memberPayload[key];
                            delete memberPayload[key];
                        }
                    }

                    await this.publishEntityState(device, memberPayload, reason);

                    for (const zigbeeGroup of groups) {
                        if (zigbeeGroup.zh.hasMember(member) && this.shouldPublishPayloadForGroup(zigbeeGroup, payload)) {
                            groupsToPublish.add(zigbeeGroup);
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

    private shouldPublishPayloadForGroup(group: Group, payload: KeyValue): boolean {
        return (
            group.options.off_state === 'last_member_state' ||
            !payload ||
            (payload.state !== 'OFF' && payload.state !== 'CLOSE') ||
            this.areAllMembersOffOrClosed(group)
        );
    }

    private areAllMembersOffOrClosed(group: Group): boolean {
        for (const member of group.zh.members) {
            const device = this.zigbee.resolveEntity(member.getDevice())!;

            if (this.state.exists(device)) {
                const state = this.state.get(device);

                if (state.state === 'ON' || state.state === 'OPEN') {
                    return false;
                }
            }
        }

        return true;
    }

    private async parseMQTTMessage(data: eventdata.MQTTMessage): Promise<ParsedMQTTMessage | undefined> {
        let type: ParsedMQTTMessage['type'] | undefined;
        let resolvedEntityGroup: ParsedMQTTMessage['resolvedEntityGroup'] | undefined;
        let resolvedEntityDevice: ParsedMQTTMessage['resolvedEntityDevice'] | undefined;
        let resolvedEntityEndpoint: ParsedMQTTMessage['resolvedEntityEndpoint'] | undefined;
        let error: ParsedMQTTMessage['error'] | undefined;
        let groupKey: ParsedMQTTMessage['groupKey'] | undefined;
        let deviceKey: ParsedMQTTMessage['deviceKey'] | undefined;
        let skipDisableReporting: ParsedMQTTMessage['skipDisableReporting'] = false;

        /* istanbul ignore else */
        const topicRegexMatch = data.topic.match(TOPIC_REGEX);

        if (topicRegexMatch) {
            type = topicRegexMatch[1] as 'remove' | 'add' | 'remove_all';
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

            const parsed = this.zigbee.resolveEntityAndEndpoint(message.device);
            resolvedEntityDevice = parsed?.entity as Device;

            if (!error && (!resolvedEntityDevice || !(resolvedEntityDevice instanceof Device))) {
                error = `Device '${message.device}' does not exist`;
            }

            if (!error) {
                resolvedEntityEndpoint = parsed.endpoint;

                if (parsed.endpointID && !resolvedEntityEndpoint) {
                    error = `Device '${parsed.ID}' does not have endpoint '${parsed.endpointID}'`;
                }
            }
        } else {
            return undefined;
        }

        return {
            resolvedEntityGroup,
            resolvedEntityDevice,
            type,
            error,
            groupKey,
            deviceKey,
            skipDisableReporting,
            resolvedEntityEndpoint,
        };
    }

    @bind private async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const parsed = await this.parseMQTTMessage(data);

        if (!parsed || !parsed.type) {
            return;
        }

        const {resolvedEntityGroup, resolvedEntityDevice, type, groupKey, deviceKey, skipDisableReporting, resolvedEntityEndpoint} = parsed;
        let error = parsed.error;
        const changedGroups: Group[] = [];

        if (!error) {
            assert(resolvedEntityEndpoint, '`resolvedEntityEndpoint` is missing');
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
                    assert(resolvedEntityGroup, '`resolvedEntityGroup` is missing');
                    logger.info(`Adding '${resolvedEntityDevice.name}' to '${resolvedEntityGroup.name}'`);
                    await resolvedEntityEndpoint.addToGroup(resolvedEntityGroup.zh);
                    settings.addDeviceToGroup(resolvedEntityGroup.ID.toString(), keys);
                    changedGroups.push(resolvedEntityGroup);
                } else if (type === 'remove') {
                    assert(resolvedEntityGroup, '`resolvedEntityGroup` is missing');
                    logger.info(`Removing '${resolvedEntityDevice.name}' from '${resolvedEntityGroup.name}'`);
                    await resolvedEntityEndpoint.removeFromGroup(resolvedEntityGroup.zh);
                    settings.removeDeviceFromGroup(resolvedEntityGroup.ID.toString(), keys);
                    changedGroups.push(resolvedEntityGroup);
                } else {
                    // remove_all
                    logger.info(`Removing '${resolvedEntityDevice.name}' from all groups`);

                    for (const group of this.zigbee.groupsIterator((g) => g.members.includes(resolvedEntityEndpoint))) {
                        changedGroups.push(group);
                    }

                    await resolvedEntityEndpoint.removeFromAllGroups();

                    for (const settingsGroup of settings.getGroups()) {
                        settings.removeDeviceFromGroup(settingsGroup.ID.toString(), keys);
                    }
                }
            } catch (e) {
                error = `Failed to ${type} from group (${(e as Error).message})`;
                logger.debug((e as Error).stack!);
            }
        }

        const message = utils.parseJSON(data.message, data.message);
        const responseData: KeyValue = {device: deviceKey};

        if (groupKey) {
            responseData.group = groupKey;
        }

        await this.mqtt.publish(`bridge/response/group/members/${type}`, stringify(utils.getResponse(message, responseData, error)));

        if (error) {
            logger.error(error);
        } else {
            assert(resolvedEntityEndpoint, '`resolvedEntityEndpoint` is missing');
            for (const group of changedGroups) {
                this.eventBus.emitGroupMembersChanged({group, action: type, endpoint: resolvedEntityEndpoint, skipDisableReporting});
            }
        }
    }
}
