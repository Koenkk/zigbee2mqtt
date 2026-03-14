import bind from "bind-decorator";
import stringify from "json-stable-stringify-without-jsonify";
import type * as zhc from "zigbee-herdsman-converters";

import Device from "../model/device";
import Group from "../model/group";
import logger from "../util/logger";
import * as settings from "../util/settings";
import utils from "../util/utils";
import Extension from "./extension";

// TODO: get rid of this, use class member
let topicGetSetRegex: RegExp;
// Used by `publish.test.ts` to reload regex when changing `mqtt.base_topic`.
export const loadTopicGetSetRegex = (): void => {
    topicGetSetRegex = new RegExp(`^${settings.get().mqtt.base_topic}/(?!bridge)(.+?)/(request/)?(get|set)(?:/(.+))?$`);
};

const STATE_VALUES: ReadonlyArray<string> = ["on", "off", "toggle", "open", "close", "stop", "lock", "unlock"];
const SCENE_CONVERTER_KEYS: ReadonlyArray<string> = ["scene_store", "scene_add", "scene_remove", "scene_remove_all", "scene_rename"];

interface ParsedTopic {
    ID: string;
    endpoint: string | undefined;
    attribute: string;
    type: "get" | "set";
    isRequest: boolean;
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
        const isRequest = match[2] !== undefined;
        const type = match[3] as "get" | "set";
        const attribute = match[4];

        // Now parse the device/group name, and endpoint name
        const entity = this.zigbee.resolveEntityAndEndpoint(deviceNameAndEndpoint);
        return {ID: entity.ID, endpoint: entity.endpointID, type, attribute, isRequest};
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

        // Extract and strip z2m_transaction before forwarding to converters
        const z2mTransaction = parsedTopic.isRequest ? message.z2m_transaction : undefined;
        if (message.z2m_transaction !== undefined) {
            delete message.z2m_transaction;
        }

        // Ping: /request/ topic with empty payload after stripping z2m_transaction
        if (parsedTopic.isRequest && Object.keys(message).length === 0) {
            const response: KeyValue = {data: {}, status: "ok"};
            if (z2mTransaction !== undefined) response.z2m_transaction = z2mTransaction;
            await this.mqtt.publish(`${re.name}/response/${parsedTopic.type}`, stringify(response), {
                clientOptions: {qos: /* v8 ignore next */ data.qos ?? 0, retain: false},
            });
            return;
        }

        const device = re instanceof Device ? re.zh : undefined;
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
        const responseData: KeyValue = {};
        const supersededKeys: string[] = [];
        const failedKeys: string[] = [];

        // Future: send responses per attribute as each settles, rather than waiting for all.
        // Currently, multi-attribute requests to sleepy devices block sequentially per attribute.
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
                if (parsedTopic.isRequest) {
                    ((error as Error).message?.includes("Request superseded") ? supersededKeys : failedKeys).push(originalKey);
                }
            }

            // Track result for response (set echoes requested value; get returns status only)
            if (parsedTopic.isRequest && parsedTopic.type === "set" && !failedKeys.includes(originalKey) && !supersededKeys.includes(originalKey)) {
                responseData[originalKey] = value;
            }

            usedConverters[endpointOrGroupID].push(converter);

            if (!scenesChanged && converter.key) {
                scenesChanged = converter.key.some((k) => SCENE_CONVERTER_KEYS.includes(k));
            }
        }

        if (parsedTopic.isRequest) {
            const errorParts: string[] = [];
            if (supersededKeys.length > 0) errorParts.push(`superseded:${supersededKeys.join(",")}`);
            if (failedKeys.length > 0) errorParts.push(`failed:${failedKeys.join(",")}`);
            const response: KeyValue =
                errorParts.length > 0 ? {data: responseData, status: "error", error: errorParts.join("|")} : {data: responseData, status: "ok"};
            if (z2mTransaction !== undefined) response.z2m_transaction = z2mTransaction;
            await this.mqtt.publish(`${re.name}/response/${parsedTopic.type}`, stringify(response), {
                clientOptions: {qos: /* v8 ignore next */ data.qos ?? 0, retain: false},
            });
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
}
