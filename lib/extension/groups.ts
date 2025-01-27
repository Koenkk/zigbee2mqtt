import type {Zigbee2MQTTAPI, Zigbee2MQTTResponseEndpoints} from 'lib/types/api';

import assert from 'node:assert';

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
    resolvedGroup?: Group;
    resolvedDevice?: Device;
    resolvedEndpoint?: zh.Endpoint;
    groupKey?: string;
    deviceKey?: string;
    endpointKey?: string | number;
    skipDisableReporting: boolean;
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
                const endpointNames = device.isDevice() && device.getEndpointNames();
                const stateKey =
                    endpointNames &&
                    endpointNames.length >= member.ID &&
                    device.definition?.meta?.multiEndpoint &&
                    (!device.definition.meta.multiEndpointSkip || !device.definition.meta.multiEndpointSkip.includes('state'))
                        ? `state_${endpointNames[member.ID - 1]}`
                        : 'state';

                if (state[stateKey] === 'ON' || state[stateKey] === 'OPEN') {
                    return false;
                }
            }
        }

        return true;
    }

    private parseMQTTMessage(
        data: eventdata.MQTTMessage,
    ): [raw: KeyValue | undefined, parsed: ParsedMQTTMessage | undefined, error: string | undefined] {
        const topicRegexMatch = data.topic.match(TOPIC_REGEX);

        if (topicRegexMatch) {
            const type = topicRegexMatch[1] as 'remove' | 'add' | 'remove_all';
            let resolvedGroup;
            let groupKey;
            let skipDisableReporting = false;
            const message = JSON.parse(data.message) as Zigbee2MQTTAPI['bridge/request/group/members/add'];

            if (typeof message !== 'object' || message.device == undefined) {
                return [message, {type, skipDisableReporting}, 'Invalid payload'];
            }

            const deviceKey = message.device;
            skipDisableReporting = message.skip_disable_reporting != undefined ? message.skip_disable_reporting : false;

            if (type !== 'remove_all') {
                groupKey = message.group;

                if (message.group == undefined) {
                    return [message, {type, skipDisableReporting}, `Invalid payload`];
                }

                resolvedGroup = this.zigbee.resolveEntity(message.group);

                if (!resolvedGroup || !(resolvedGroup instanceof Group)) {
                    return [message, {type, skipDisableReporting}, `Group '${message.group}' does not exist`];
                }
            }

            const resolvedDevice = this.zigbee.resolveEntity(message.device);

            if (!resolvedDevice || !(resolvedDevice instanceof Device)) {
                return [message, {type, skipDisableReporting}, `Device '${message.device}' does not exist`];
            }

            const endpointKey = message.endpoint ?? 'default';
            const resolvedEndpoint = resolvedDevice.endpoint(message.endpoint);

            if (!resolvedEndpoint) {
                return [message, {type, skipDisableReporting}, `Device '${resolvedDevice.name}' does not have endpoint '${endpointKey}'`];
            }

            return [
                message,
                {
                    resolvedGroup,
                    resolvedDevice,
                    resolvedEndpoint,
                    type,
                    groupKey,
                    deviceKey,
                    endpointKey,
                    skipDisableReporting,
                },
                undefined,
            ];
        } else {
            return [undefined, undefined, undefined];
        }
    }

    @bind private async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const [raw, parsed, error] = this.parseMQTTMessage(data);

        if (!raw || !parsed) {
            return;
        }

        if (error) {
            await this.publishResponse(parsed.type, raw, {}, error);
            return;
        }

        const {resolvedGroup, resolvedDevice, resolvedEndpoint, type, groupKey, deviceKey, endpointKey, skipDisableReporting} = parsed;
        const changedGroups: Group[] = [];

        assert(resolvedDevice, '`resolvedDevice` is missing');
        assert(resolvedEndpoint, '`resolvedEndpoint` is missing');

        try {
            if (type === 'add') {
                assert(resolvedGroup, '`resolvedGroup` is missing');
                logger.info(`Adding '${resolvedDevice.name}' to '${resolvedGroup.name}'`);
                await resolvedEndpoint.addToGroup(resolvedGroup.zh);
                changedGroups.push(resolvedGroup);
                await this.publishResponse<'bridge/response/group/members/add'>(parsed.type, raw, {
                    device: deviceKey!, // valid from resolved asserts
                    endpoint: endpointKey!, // valid from resolved asserts
                    group: groupKey!, // valid from resolved asserts
                });
            } else if (type === 'remove') {
                assert(resolvedGroup, '`resolvedGroup` is missing');
                logger.info(`Removing '${resolvedDevice.name}' from '${resolvedGroup.name}'`);
                await resolvedEndpoint.removeFromGroup(resolvedGroup.zh);
                changedGroups.push(resolvedGroup);
                await this.publishResponse<'bridge/response/group/members/remove'>(parsed.type, raw, {
                    device: deviceKey!, // valid from resolved asserts
                    endpoint: endpointKey!, // valid from resolved asserts
                    group: groupKey!, // valid from resolved asserts
                });
            } else {
                // remove_all
                logger.info(`Removing '${resolvedDevice.name}' from all groups`);

                for (const group of this.zigbee.groupsIterator((g) => g.members.includes(resolvedEndpoint))) {
                    changedGroups.push(group);
                }

                await resolvedEndpoint.removeFromAllGroups();
                await this.publishResponse<'bridge/response/group/members/remove_all'>(parsed.type, raw, {
                    device: deviceKey!, // valid from resolved asserts
                    endpoint: endpointKey!, // valid from resolved asserts
                });
            }
        } catch (e) {
            const errorMsg = `Failed to ${type} from group (${(e as Error).message})`;
            await this.publishResponse(parsed.type, raw, {}, errorMsg);
            logger.debug((e as Error).stack!);
            return;
        }

        for (const group of changedGroups) {
            this.eventBus.emitGroupMembersChanged({group, action: type, endpoint: resolvedEndpoint, skipDisableReporting});
        }
    }

    private async publishResponse<T extends Zigbee2MQTTResponseEndpoints>(
        type: ParsedMQTTMessage['type'],
        request: KeyValue,
        data: Zigbee2MQTTAPI[T],
        error?: string,
    ): Promise<void> {
        const response = utils.getResponse(request, data, error);
        await this.mqtt.publish(`bridge/response/group/members/${type}`, stringify(response));

        if (error) {
            logger.error(error);
        }
    }
}
