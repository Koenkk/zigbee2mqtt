import assert from "node:assert";
import bind from "bind-decorator";
import equals from "fast-deep-equal/es6";
import stringify from "json-stable-stringify-without-jsonify";
import type * as zhc from "zigbee-herdsman-converters";
import Device from "../model/device";
import Group from "../model/group";
import type {Zigbee2MQTTAPI, Zigbee2MQTTResponseEndpoints} from "../types/api";
import logger from "../util/logger";
import * as settings from "../util/settings";
import utils, {isLightExpose} from "../util/utils";
import Extension from "./extension";

const STATE_PROPERTIES: Readonly<Record<string, (value: string, exposes: zhc.Expose[]) => boolean>> = {
    state: () => true,
    brightness: (_value, exposes) => exposes.some((e) => isLightExpose(e) && e.features.some((f) => f.name === "brightness")),
    color_temp: (_value, exposes) => exposes.some((e) => isLightExpose(e) && e.features.some((f) => f.name === "color_temp")),
    color: (_value, exposes) => exposes.some((e) => isLightExpose(e) && e.features.some((f) => f.name === "color_xy" || f.name === "color_hs")),
    color_mode: (value, exposes) =>
        exposes.some(
            (e) =>
                isLightExpose(e) &&
                (e.features.some((f) => f.name === `color_${value}`) || (value === "color_temp" && e.features.some((f) => f.name === "color_temp"))),
        ),
};

interface ParsedMQTTMessage {
    type: "remove" | "add" | "remove_all";
    resolvedGroup?: Group;
    resolvedDevice?: Device;
    resolvedEndpoint?: zh.Endpoint;
    groupKey?: string;
    deviceKey?: string;
    endpointKey?: string | number;
    skipDisableReporting: boolean;
}

export default class Groups extends Extension {
    #topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/group/members/(remove|add|remove_all)$`);
    private lastOptimisticState: {[s: string]: KeyValue} = {};

    // biome-ignore lint/suspicious/useAwait: API
    override async start(): Promise<void> {
        this.eventBus.onStateChange(this, this.onStateChange);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
    }

    @bind async onStateChange(data: eventdata.StateChange): Promise<void> {
        const reason = "groupOptimistic";

        if (data.reason === reason || data.reason === "publishCached") {
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
                if (group.options && (group.options.optimistic == null || group.options.optimistic)) {
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

                const groupsToPublish = new Set<Group>();

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
            group.options.off_state === "last_member_state" ||
            !payload ||
            (payload.state !== "OFF" && payload.state !== "CLOSE") ||
            this.areAllMembersOffOrClosed(group)
        );
    }

    private areAllMembersOffOrClosed(group: Group): boolean {
        for (const member of group.zh.members) {
            // biome-ignore lint/style/noNonNullAssertion: TODO: biome migration: valid from loop?
            const device = this.zigbee.resolveEntity(member.getDevice())!;

            if (this.state.exists(device)) {
                const state = this.state.get(device);
                const endpointNames = device.isDevice() && device.getEndpointNames();
                const stateKey =
                    endpointNames &&
                    endpointNames.length >= member.ID &&
                    device.definition?.meta?.multiEndpoint &&
                    (!device.definition.meta.multiEndpointSkip || !device.definition.meta.multiEndpointSkip.includes("state"))
                        ? `state_${endpointNames[member.ID - 1]}`
                        : "state";

                if (state[stateKey] === "ON" || state[stateKey] === "OPEN") {
                    return false;
                }
            }
        }

        return true;
    }

    private parseMQTTMessage(
        data: eventdata.MQTTMessage,
    ): [raw: KeyValue | undefined, parsed: ParsedMQTTMessage | undefined, error: string | undefined] {
        const topicRegexMatch = data.topic.match(this.#topicRegex);

        if (topicRegexMatch) {
            const type = topicRegexMatch[1] as "remove" | "add" | "remove_all";
            let resolvedGroup: Group | undefined;
            let groupKey: string | undefined;
            let skipDisableReporting = false;
            const message = JSON.parse(data.message) as
                | Zigbee2MQTTAPI["bridge/request/group/members/add"]
                | Zigbee2MQTTAPI["bridge/request/group/members/remove"]
                | Zigbee2MQTTAPI["bridge/request/group/members/remove_all"];

            if (typeof message !== "object" || message.device == null) {
                return [message, {type, skipDisableReporting}, "Invalid payload"];
            }

            const deviceKey = message.device;
            skipDisableReporting = message.skip_disable_reporting != null ? message.skip_disable_reporting : false;

            if (type !== "remove_all") {
                if (!("group" in message) || message.group == null) {
                    return [message, {type, skipDisableReporting}, "Invalid payload"];
                }

                groupKey = message.group;

                const group = this.zigbee.resolveEntity(message.group);

                if (!group || !(group instanceof Group)) {
                    return [message, {type, skipDisableReporting}, `Group '${message.group}' does not exist`];
                }

                resolvedGroup = group;
            }

            const resolvedDevice = this.zigbee.resolveEntity(message.device);

            if (!resolvedDevice || !(resolvedDevice instanceof Device)) {
                return [message, {type, skipDisableReporting}, `Device '${message.device}' does not exist`];
            }

            const endpointKey = message.endpoint ?? "default";
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
        }

        return [undefined, undefined, undefined];
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

        assert(resolvedDevice, "`resolvedDevice` is missing");
        assert(resolvedEndpoint, "`resolvedEndpoint` is missing");

        try {
            if (type === "add") {
                assert(resolvedGroup, "`resolvedGroup` is missing");
                logger.info(`Adding endpoint '${resolvedEndpoint.ID}' of device '${resolvedDevice.name}' to group '${resolvedGroup.name}'`);
                await resolvedEndpoint.addToGroup(resolvedGroup.zh);
                changedGroups.push(resolvedGroup);
                // biome-ignore lint/style/noNonNullAssertion: valid from resolved asserts
                const respPayload = {device: deviceKey!, endpoint: endpointKey!, group: groupKey!};
                await this.publishResponse<"bridge/response/group/members/add">(parsed.type, raw, respPayload);
            } else if (type === "remove") {
                assert(resolvedGroup, "`resolvedGroup` is missing");
                logger.info(`Removing endpoint '${resolvedEndpoint.ID}' of device '${resolvedDevice.name}' from group '${resolvedGroup.name}'`);
                await resolvedEndpoint.removeFromGroup(resolvedGroup.zh);
                changedGroups.push(resolvedGroup);
                // biome-ignore lint/style/noNonNullAssertion: valid from resolved asserts
                const respPayload = {device: deviceKey!, endpoint: endpointKey!, group: groupKey!};
                await this.publishResponse<"bridge/response/group/members/remove">(parsed.type, raw, respPayload);
            } else {
                // remove_all
                logger.info(`Removing endpoint '${resolvedEndpoint.ID}' of device '${resolvedDevice.name}' from all groups`);

                for (const group of this.zigbee.groupsIterator((g) => g.members.includes(resolvedEndpoint))) {
                    changedGroups.push(group);
                }

                await resolvedEndpoint.removeFromAllGroups();
                // biome-ignore lint/style/noNonNullAssertion: valid from resolved asserts
                const respPayload = {device: deviceKey!, endpoint: endpointKey!};
                await this.publishResponse<"bridge/response/group/members/remove_all">(parsed.type, raw, respPayload);
            }
        } catch (e) {
            const errorMsg = `Failed to ${type} ${type === "add" ? "to" : "from"} group (${(e as Error).message})`;
            await this.publishResponse(parsed.type, raw, {}, errorMsg);
            // biome-ignore lint/style/noNonNullAssertion: always Error
            logger.debug((e as Error).stack!);
            return;
        }

        for (const group of changedGroups) {
            this.eventBus.emitGroupMembersChanged({group, action: type, endpoint: resolvedEndpoint, skipDisableReporting});
        }
    }

    private async publishResponse<T extends Zigbee2MQTTResponseEndpoints>(
        type: ParsedMQTTMessage["type"],
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
