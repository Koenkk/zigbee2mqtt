import bind from "bind-decorator";
import stringify from "json-stable-stringify-without-jsonify";
import type * as zhc from "zigbee-herdsman-converters";

import Device from "../model/device";
import Group from "../model/group";
import type {CommandResponse, CommandResponseStatus} from "../types/api";
import logger from "../util/logger";
import * as settings from "../util/settings";
import utils from "../util/utils";
import Extension from "./extension";

// TODO: get rid of this, use class member
let topicGetSetRegex: RegExp;
// Used by `publish.test.ts` to reload regex when changing `mqtt.base_topic`.
export const loadTopicGetSetRegex = (): void => {
    topicGetSetRegex = new RegExp(`^${settings.get().mqtt.base_topic}/(?!bridge)(.+?)/(get|set)(?:/(.+))?$`);
};

const STATE_VALUES: ReadonlyArray<string> = ["on", "off", "toggle", "open", "close", "stop", "lock", "unlock"];
const SCENE_CONVERTER_KEYS: ReadonlyArray<string> = ["scene_store", "scene_add", "scene_remove", "scene_remove_all", "scene_rename"];

interface ParsedTopic {
    ID: string;
    endpoint: string | undefined;
    attribute: string;
    type: "get" | "set";
}

export default class Publish extends Extension {
    // biome-ignore lint/suspicious/useAwait: API
    override async start(): Promise<void> {
        loadTopicGetSetRegex();
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
    }

    parseTopic(topic: string): ParsedTopic | undefined {
        // The function supports the following topic formats (below are for 'set'. 'get' will look the same):
        // - <base_topic>/device_name/set (auto-matches endpoint and attribute is defined in the payload)
        // - <base_topic>/device_name/set/attribute (default endpoint used)
        // - <base_topic>/device_name/endpoint/set (attribute is defined in the payload)
        // - <base_topic>/device_name/endpoint/set/attribute (payload is the value)

        // Make the rough split on get/set keyword.
        // Before the get/set is the device name and optional endpoint name.
        // After it there will be an optional attribute name.
        const match = topic.match(topicGetSetRegex);

        if (!match) {
            return undefined;
        }

        const deviceNameAndEndpoint = match[1];
        const attribute = match[3];

        // Now parse the device/group name, and endpoint name
        const entity = this.zigbee.resolveEntityAndEndpoint(deviceNameAndEndpoint);
        return {ID: entity.ID, endpoint: entity.endpointID, type: match[2] as "get" | "set", attribute: attribute};
    }

    parseMessage(parsedTopic: ParsedTopic, data: eventdata.MQTTMessage): KeyValue | undefined {
        if (parsedTopic.attribute) {
            try {
                return {[parsedTopic.attribute]: JSON.parse(data.message)};
            } catch {
                return {[parsedTopic.attribute]: data.message};
            }
        } else {
            try {
                return JSON.parse(data.message);
            } catch {
                return STATE_VALUES.includes(data.message.toLowerCase()) ? {state: data.message} : undefined;
            }
        }
    }

    updateMessageHomeAssistant(message: KeyValue, entityState: KeyValue): void {
        /**
         * Home Assistant always publishes 'state', even when e.g. only setting
         * the color temperature. This would lead to 2 zigbee publishes, where the first one
         * (state) is probably unnecessary.
         */
        if (settings.get().homeassistant.enabled) {
            const hasColorTemp = message.color_temp !== undefined;
            const hasColor = message.color !== undefined;
            const hasBrightness = message.brightness !== undefined;
            if (entityState.state === "ON" && (hasColorTemp || hasColor) && !hasBrightness) {
                delete message.state;
                logger.debug("Skipping state because of Home Assistant");
            }
        }
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const parsedTopic = this.parseTopic(data.topic);

        if (!parsedTopic) {
            return;
        }

        const startTime = Date.now();
        const re = this.zigbee.resolveEntity(parsedTopic.ID);

        if (!re) {
            logger.error(`Entity '${parsedTopic.ID}' is unknown`);
            return;
        }

        // Get entity details
        let definition: zhc.Definition | zhc.Definition[];
        if (re instanceof Device) {
            if (!re.definition) {
                logger.error(`Cannot publish to unsupported device '${re.name}'`);
                return;
            }
            definition = re.definition;
        } else {
            definition = re.membersDefinitions();
        }
        const target = re instanceof Group ? re.zh : re.endpoint(parsedTopic.endpoint);

        if (!target) {
            logger.error(`Device '${re.name}' has no endpoint '${parsedTopic.endpoint}'`);
            return;
        }

        // Convert the MQTT message to a Zigbee message.
        const message = this.parseMessage(parsedTopic, data);

        if (!message) {
            logger.error(`Invalid message '${message}', skipping...`);
            return;
        }

        // Extract z2m.request_id for response publishing (backward compatible - only responds if provided)
        // V2: Uses nested z2m namespace to avoid collision with device attributes like CSM-300ZB's "transaction"
        const z2mMetadata = message.z2m as {request_id?: string} | undefined;
        const requestId = z2mMetadata?.request_id;
        if (z2mMetadata !== undefined) {
            delete message.z2m;
        }

        // Capture QoS for response publishing - match request QoS or fallback to 1
        // Per V2 Feature Request (https://github.com/Koenkk/zigbee2mqtt/issues/30679):
        // "Response published with same QoS as incoming command. If incoming
        // QoS cannot be determined, defaults to QoS 1 (At Least Once) to guarantee delivery."
        // QoS 1 fallback is more reliable than mqtt.js default of QoS 0.
        const responseQos = data.qos ?? 1;

        // Ping pattern: z2m-only payload returns ok with no data (no Zigbee traffic)
        if (requestId && Object.keys(message).length === 0) {
            const response: CommandResponse = {
                type: parsedTopic.type,
                status: "ok",
                target: re.name,
                z2m: {
                    request_id: requestId,
                    final: true,
                    elapsed_ms: Date.now() - startTime,
                },
            };
            await this.mqtt.publish(`${re.name}/response`, stringify(response), {clientOptions: {qos: responseQos, retain: false}});
            return;
        }

        // Initialize result tracking for aggregated response
        const responseData: Record<string, unknown> = {};
        const responseFailed: Record<string, string> = {};

        // Track if we sent pending response for sleepy device
        let pendingResponseSent = false;

        const device = re instanceof Device ? re.zh : undefined;

        // Sleepy device check: return pending immediately for commands with request_id
        // Sleepy devices (battery-powered EndDevices) have their radios off most of the time.
        // Commands are buffered at the parent router and delivered when the device wakes.
        //
        // DESIGN NOTE: We send `final: true` immediately, meaning "stop your spinner, we've
        // queued the command but can't confirm delivery." This matches the V2 Feature Request
        // (https://github.com/Koenkk/zigbee2mqtt/issues/30679): "The request is closed; no
        // further confirmation will be sent."
        //
        // FUTURE ENHANCEMENT A: Could send `final: false` initially, then a follow-up message
        // with `final: true` when zigbee-herdsman confirms the parent router delivered the
        // message to the waking device. This would require:
        // - Tracking pending request_ids with timestamps
        // - Listening for delivery confirmation events from zigbee-herdsman (if exposed)
        // - Memory management for long-sleeping devices (hours/days)
        // - Timeout handling for devices that never wake
        // Current design chose simplicity over completeness.
        //
        // FUTURE ENHANCEMENT B: Optimistically update state.db when sending `pending + final`
        // for SET commands. Currently, state.db only updates when the device confirms. This
        // means if the backend/frontend restarts while a command is queued for a sleepy device,
        // the UI reverts to old values (though the queued command still executes when device
        // wakes). Optimistic state.db update would preserve the "expected" values across restarts.
        // Trade-off: state.db would contain unconfirmed values until device wakes.
        if (requestId && (parsedTopic.type === "set" || parsedTopic.type === "get") && re instanceof Device && this.isSleepyDevice(device)) {
            const response: CommandResponse = {
                type: parsedTopic.type,
                status: "pending",
                target: re.name,
                z2m: {
                    request_id: requestId,
                    final: true, // See DESIGN NOTE above for why this is immediately true
                    elapsed_ms: Date.now() - startTime,
                    transmission_type: "unicast",
                },
                // NO data field - command hasn't executed yet
            };
            await this.mqtt.publish(`${re.name}/response`, stringify(response), {clientOptions: {qos: responseQos, retain: false}});
            pendingResponseSent = true;
            // Continue processing - converters will queue the command through zigbee-herdsman
        }

        const entitySettings = re.options;
        const entityState = this.state.get(re);
        const membersState =
            re instanceof Group
                ? // biome-ignore lint/style/noNonNullAssertion: TODO: biome migration: might be a bit much assumed here?
                  Object.fromEntries(re.zh.members.map((e) => [e.deviceIeeeAddress, this.state.get(this.zigbee.resolveEntity(e.deviceIeeeAddress)!)]))
                : undefined;
        const converters = this.getDefinitionConverters(definition);

        this.updateMessageHomeAssistant(message, entityState);

        /**
         * Order state & brightness based on current bulb state
         *
         * Not all bulbs support setting the color/color_temp while it is off
         * this results in inconsistent behavior between different vendors.
         *
         * bulb on => move state & brightness to the back
         * bulb off => move state & brightness to the front
         */
        const entries = Object.entries(message);
        const sorter = typeof message.state === "string" && message.state.toLowerCase() === "off" ? 1 : -1;
        entries.sort((a) => (["state", "brightness", "brightness_percent"].includes(a[0]) ? sorter : sorter * -1));

        // For each attribute call the corresponding converter
        const usedConverters: {[s: number]: zhc.Tz.Converter[]} = {};
        const toPublish: {[s: number | string]: KeyValue} = {};
        const toPublishEntity: {[s: number | string]: Device | Group} = {};
        const addToToPublish = (entity: Device | Group, payload: KeyValue): void => {
            const ID = entity.ID;

            if (!(ID in toPublish)) {
                toPublish[ID] = {};
                toPublishEntity[ID] = entity;
            }

            toPublish[ID] = {...toPublish[ID], ...payload};
        };

        const endpointNames = re instanceof Device ? re.getEndpointNames() : [];
        const propertyEndpointRegex = new RegExp(`^(.*?)_(${endpointNames.join("|")})$`);
        let scenesChanged = false;

        for (const entry of entries) {
            const originalKey = entry[0];
            let key = entry[0];
            const value = entry[1];
            let endpointName = parsedTopic.endpoint;
            let localTarget = target;
            let endpointOrGroupID = utils.isZHEndpoint(target) ? target.ID : target.groupID;

            // When the key has a endpointName included (e.g. state_right), this will override the target.
            const propertyEndpointMatch = key.match(propertyEndpointRegex);

            if (re instanceof Device && propertyEndpointMatch) {
                endpointName = propertyEndpointMatch[2];
                key = propertyEndpointMatch[1];
                // biome-ignore lint/style/noNonNullAssertion: endpointName is always matched to an existing endpoint of the device since `propertyEndpointRegex` only contains valid endpoints for this device
                localTarget = re.endpoint(endpointName)!;
                endpointOrGroupID = localTarget.ID;
            }

            if (usedConverters[endpointOrGroupID] === undefined) usedConverters[endpointOrGroupID] = [];
            // Match any key if the toZigbee converter defines no key.
            const converter = converters.find(
                (c) =>
                    (!c.key || c.key.includes(key)) && (re instanceof Group || !c.endpoints || (endpointName && c.endpoints.includes(endpointName))),
            );

            if (parsedTopic.type === "set" && converter && usedConverters[endpointOrGroupID].includes(converter)) {
                // Use a converter for set only once
                // (e.g. light_onoff_brightness converters can convert state and brightness)
                continue;
            }

            if (!converter) {
                logger.error(`No converter available for '${key}' on '${re.name}': (${stringify(message[key])})`);
                continue;
            }

            // If the endpoint_name name is a number, try to map it to a friendlyName
            if (!Number.isNaN(Number(endpointName)) && re.isDevice() && utils.isZHEndpoint(localTarget) && re.endpointName(localTarget)) {
                endpointName = re.endpointName(localTarget);
            }

            // Converter didn't return a result, skip
            const entitySettingsKeyValue: KeyValue = entitySettings;
            const meta: zhc.Tz.Meta = {
                endpoint_name: endpointName,
                options: entitySettingsKeyValue,
                message: {...message},
                device,
                state: entityState,
                membersState,
                mapped: definition,
                /* v8 ignore next */
                publish: (payload: KeyValue) => this.publishEntityState(re, payload),
            };

            // Strip endpoint name from meta.message properties.
            if (endpointName) {
                for (const [key, value] of Object.entries(meta.message)) {
                    if (key.endsWith(endpointName)) {
                        delete meta.message[key];
                        const keyWithoutEndpoint = key.substring(0, key.length - endpointName.length - 1);
                        meta.message[keyWithoutEndpoint] = value;
                    }
                }
            }

            let attributeError: string | undefined;
            try {
                if (parsedTopic.type === "set" && converter.convertSet) {
                    logger.debug(`Publishing '${parsedTopic.type}' '${key}' to '${re.name}'`);
                    const result = await converter.convertSet(localTarget, key, value, meta);
                    const optimistic = entitySettings.optimistic === undefined || entitySettings.optimistic;

                    if (result?.state && optimistic) {
                        const msg = result.state;

                        if (endpointName) {
                            for (const key of Object.keys(msg)) {
                                msg[`${key}_${endpointName}`] = msg[key];
                                delete msg[key];
                            }
                        }

                        // filter out attribute listed in filtered_optimistic
                        utils.filterProperties(entitySettings.filtered_optimistic, msg);

                        addToToPublish(re, msg);
                    }

                    if (result?.membersState && optimistic) {
                        for (const [ieeeAddr, state] of Object.entries(result.membersState)) {
                            // biome-ignore lint/style/noNonNullAssertion: might be a bit much assumed here?
                            addToToPublish(this.zigbee.resolveEntity(ieeeAddr)!, state);
                        }
                    }
                } else if (parsedTopic.type === "get" && converter.convertGet) {
                    logger.debug(`Publishing get '${parsedTopic.type}' '${key}' to '${re.name}'`);
                    await converter.convertGet(localTarget, key, meta);
                } else {
                    logger.error(`No converter available for '${parsedTopic.type}' '${key}' (${message[key]})`);
                    continue;
                }
            } catch (error) {
                const message = `Publish '${parsedTopic.type}' '${key}' to '${re.name}' failed: '${error}'`;
                logger.error(message);
                // biome-ignore lint/style/noNonNullAssertion: always Error
                logger.debug((error as Error).stack!);
                attributeError = String(error);
            }

            // Track result for aggregated response (supports both SET and GET)
            if (requestId) {
                if (attributeError) {
                    responseFailed[key] = attributeError;
                } else if (parsedTopic.type === "get") {
                    // For GET, read the current value from device state cache.
                    // This is safe because: convertGet awaits entity.read() which awaits the ZCL response.
                    // When the response arrives, zigbee-herdsman calls resolveZCL() then emit("zclPayload").
                    // JavaScript event loop guarantees: emit() runs synchronously (updating this.state via
                    // fromZigbee), then microtasks run (resolving the await). So state is always updated
                    // before we reach this line. See emberAdapter.js onZclPayload() for the call order.
                    const currentState = this.state.get(re);
                    responseData[originalKey] = currentState?.[originalKey];
                } else {
                    // For SET, echo the requested value
                    responseData[originalKey] = value;
                }
            }

            usedConverters[endpointOrGroupID].push(converter);

            if (!scenesChanged && converter.key) {
                scenesChanged = converter.key.some((k) => SCENE_CONVERTER_KEYS.includes(k));
            }
        }

        // Publish aggregated response if request_id was provided.
        // Skip if pending already sent for sleepy device - see DESIGN NOTE above for future
        // enhancement that could send a follow-up response when delivery is confirmed.
        // V2: Supports both SET and GET operations on unified /response topic
        if (requestId && !pendingResponseSent) {
            const hasFailed = Object.keys(responseFailed).length > 0;
            const isGroup = re instanceof Group;

            if (isGroup) {
                // Group commands use standard Zigbee multicast - no individual ACKs from members.
                //
                // NOTE: Some advanced orchestration uses "group-leader" pattern where a unicast
                // is sent to one router that propagates locally. In that case transmission_type
                // would be "unicast" with member_count still populated. Current implementation
                // uses standard multicast; group-leader detection would require user configuration
                // to identify leader devices.
                //
                // The separation of transmission_type and member_count in the response schema
                // was designed to support future group-leader scenarios.
                //
                // Per spec: confirm transmission, omit data field, include member_count
                const status: CommandResponseStatus = hasFailed ? "error" : "ok";

                const response: CommandResponse = {
                    type: parsedTopic.type,
                    status,
                    target: re.name,
                    z2m: {
                        request_id: requestId,
                        final: true,
                        elapsed_ms: Date.now() - startTime,
                        transmission_type: "multicast",
                        member_count: re.zh.members.length,
                    },
                };

                // Add error for failure (e.g., multicast transmission failed)
                if (status === "error" && hasFailed) {
                    const firstError = Object.values(responseFailed)[0];
                    response.error = utils.normalizeHerdsmanError(firstError);
                }

                await this.mqtt.publish(`${re.name}/response`, stringify(response), {clientOptions: {qos: responseQos, retain: false}});
            } else {
                // Device (unicast) response - includes data field
                const hasData = Object.keys(responseData).length > 0;

                let status: CommandResponseStatus;
                if (hasFailed && hasData) {
                    status = "partial";
                } else if (hasFailed) {
                    status = "error";
                } else {
                    status = "ok";
                }

                const response: CommandResponse = {
                    type: parsedTopic.type,
                    status,
                    target: re.name,
                    z2m: {
                        request_id: requestId,
                        final: true,
                        elapsed_ms: Date.now() - startTime,
                    },
                };

                // Add data only if there are successful attributes
                if (hasData) {
                    response.data = responseData;
                }

                // Add failed only for partial status
                if (status === "partial") {
                    response.failed = responseFailed;
                }

                // Add error for complete failure (all attributes failed)
                if (status === "error" && hasFailed) {
                    // Use first error as the global error (most relevant for single-attribute case)
                    const firstError = Object.values(responseFailed)[0];
                    response.error = utils.normalizeHerdsmanError(firstError);
                }

                await this.mqtt.publish(`${re.name}/response`, stringify(response), {clientOptions: {qos: responseQos, retain: false}});
            }
        }

        for (const [ID, payload] of Object.entries(toPublish)) {
            if (!utils.objectIsEmpty(payload)) {
                await this.publishEntityState(toPublishEntity[ID], payload);
            }
        }

        if (scenesChanged) {
            this.eventBus.emitScenesChanged({entity: re});
        }
    }

    private getDefinitionConverters(definition: zhc.Definition | zhc.Definition[]): ReadonlyArray<zhc.Tz.Converter> {
        if (Array.isArray(definition)) {
            return definition.length ? Array.from(new Set(definition.flatMap((d) => d.toZigbee))) : [];
        }

        return definition?.toZigbee;
    }

    /**
     * Detect if a device is a sleepy (battery-powered) end device.
     *
     * Sleepy devices (Zigbee "Sleepy End Devices") spend 99% of their time with
     * radios OFF to conserve battery. Commands are buffered at the parent router
     * and delivered when the device wakes (typically every few seconds to poll).
     *
     * Heuristic: EndDevice + Battery power source
     * - EndDevice: Only end devices can sleep. Routers must stay awake to route.
     * - Battery: Battery-powered devices implement sleep to conserve power.
     *
     * Edge cases (rare, ~1% of devices):
     * - USB-powered EndDevice: Could be sleepy but powerSource is "Dcsource"
     * - Mains with battery backup: powerSource values 128-134 not matched
     * - Battery-powered with check-in: Some devices wake frequently enough to seem always-on
     *
     * For ~99% of real-world devices, this heuristic is accurate.
     *
     * Impact of inaccuracy (harmless):
     * - False negative (miss sleepy device): Client gets timeout/error instead of "pending".
     *   Command was still queued at parent router; just wrong status message.
     * - False positive (wrongly detect sleepy): Client gets "pending" but command succeeds
     *   immediately. Again just wrong status; functionality unaffected.
     *
     * @param device - zigbee-herdsman Device object
     * @returns true if device should be treated as sleepy (return pending immediately)
     */
    private isSleepyDevice(device: zh.Device | undefined): boolean {
        /* v8 ignore next - defensive check, device always exists in practice */
        if (!device) return false;
        return device.type === "EndDevice" && device.powerSource === "Battery";
    }
}
