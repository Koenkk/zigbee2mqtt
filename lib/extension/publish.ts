
import * as settings from '../util/settings';
import * as zhc from 'zigbee-herdsman-converters';
import * as philips from 'zigbee-herdsman-converters/lib/philips';
import logger from '../util/logger';
import utils from '../util/utils';
import Extension from './extension';
import stringify from 'json-stable-stringify-without-jsonify';
import Group from '../model/group';
import Device from '../model/device';
import bind from 'bind-decorator';

const topicGetSetRegex = new RegExp(`^(.+?)/(get|set)(?:/(.+))?`);
const stateValues = ['on', 'off', 'toggle', 'open', 'close', 'stop', 'lock', 'unlock'];
const sceneConverterKeys = ['scene_store', 'scene_add', 'scene_remove', 'scene_remove_all', 'scene_rename'];

// Legacy: don't provide default converters anymore, this is required by older z2m installs not saving group members
const defaultGroupConverters = [
    zhc.toZigbee.light_onoff_brightness,
    zhc.toZigbee.light_color_colortemp,
    philips.tz.effect, // Support Hue effects for groups
    zhc.toZigbee.ignore_transition,
    zhc.toZigbee.cover_position_tilt,
    zhc.toZigbee.thermostat_occupied_heating_setpoint,
    zhc.toZigbee.tint_scene,
    zhc.toZigbee.light_brightness_move,
    zhc.toZigbee.light_brightness_step,
    zhc.toZigbee.light_colortemp_step,
    zhc.toZigbee.light_colortemp_move,
    zhc.toZigbee.light_hue_saturation_move,
    zhc.toZigbee.light_hue_saturation_step,
];

interface ParsedTopic {ID: string, endpoint: string, attribute: string, type: 'get' | 'set'}

export default class Publish extends Extension {
    async start(): Promise<void> {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
    }

    parseTopic(topic: string): ParsedTopic | null {
        // The function supports the following topic formats (below are for 'set'. 'get' will look the same):
        // - <base_topic>/device_name/set (endpoint and attribute is defined in the payload)
        // - <base_topic>/device_name/set/attribute (default endpoint used)
        // - <base_topic>/device_name/endpoint/set (attribute is defined in the payload)
        // - <base_topic>/device_name/endpoint/set/attribute (payload is the value)

        // The first step is to get rid of base topic part
        topic = topic.replace(`${settings.get().mqtt.base_topic}/`, '');

        // Also bridge requests are something we don't care about
        if (topic.match(/bridge/)) return null;

        // Make the rough split on get/set keyword.
        // Before the get/set is the device name and optional endpoint name.
        // After it there will be an optional attribute name.
        const match = topic.match(topicGetSetRegex);
        if (!match) return null;

        const deviceNameAndEndpoint = match[1];
        const attribute = match[3];

        // Now parse the device/group name, and endpoint name
        const entity = this.zigbee.resolveEntityAndEndpoint(deviceNameAndEndpoint);
        return {ID: entity.ID, endpoint: entity.endpointID, type: match[2] as 'get' | 'set', attribute: attribute};
    }

    parseMessage(parsedTopic: ParsedTopic, data: eventdata.MQTTMessage): KeyValue | null {
        if (parsedTopic.attribute) {
            try {
                return {[parsedTopic.attribute]: JSON.parse(data.message)};
            } catch (e) {
                return {[parsedTopic.attribute]: data.message};
            }
        } else {
            try {
                return JSON.parse(data.message);
            } catch (e) {
                if (stateValues.includes(data.message.toLowerCase())) {
                    return {state: data.message};
                } else {
                    return null;
                }
            }
        }
    }

    legacyLog(payload: KeyValue): void {
        /* istanbul ignore else */
        if (settings.get().advanced.legacy_api) {
            this.mqtt.publish('bridge/log', stringify(payload));
        }
    }

    legacyRetrieveState(re: Device | Group, converter: zhc.Tz.Converter, result: zhc.Tz.ConvertSetResult,
        target: zh.Endpoint | zh.Group, key: string, meta: zhc.Tz.Meta): void {
        // It's possible for devices to get out of sync when writing an attribute that's not reportable.
        // So here we re-read the value after a specified timeout, this timeout could for example be the
        // transition time of a color change or for forcing a state read for devices that don't
        // automatically report a new state when set.
        // When reporting is requested for a device (report: true in device-specific settings) we won't
        // ever issue a read here, as we assume the device will properly report changes.
        // Only do this when the retrieve_state option is enabled for this device.
        // retrieve_state == deprecated
        if (re instanceof Device && result && result.hasOwnProperty('readAfterWriteTime') &&
            re.options.retrieve_state
        ) {
            setTimeout(() => converter.convertGet(target, key, meta), result.readAfterWriteTime);
        }
    }

    updateMessageHomeAssistant(message: KeyValue, entityState: KeyValue): void {
        /**
         * Home Assistant always publishes 'state', even when e.g. only setting
         * the color temperature. This would lead to 2 zigbee publishes, where the first one
         * (state) is probably unnecessary.
         */
        if (settings.get().homeassistant) {
            const hasColorTemp = message.hasOwnProperty('color_temp');
            const hasColor = message.hasOwnProperty('color');
            const hasBrightness = message.hasOwnProperty('brightness');
            const isOn = entityState.state === 'ON' ? true : false;
            if (isOn && (hasColorTemp || hasColor) && !hasBrightness) {
                delete message.state;
                logger.debug('Skipping state because of Home Assistant');
            }
        }
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const parsedTopic = this.parseTopic(data.topic);
        if (!parsedTopic) return;

        const re = this.zigbee.resolveEntity(parsedTopic.ID);
        if (re == null) {
            this.legacyLog({type: `entity_not_found`, message: {friendly_name: parsedTopic.ID}});
            logger.error(`Entity '${parsedTopic.ID}' is unknown`);
            return;
        }

        // Get entity details
        const definition = re instanceof Device ? re.definition : re.membersDefinitions();
        const target = re instanceof Group ? re.zh : re.endpoint(parsedTopic.endpoint);
        if (target == null) {
            logger.error(`Device '${re.name}' has no endpoint '${parsedTopic.endpoint}'`);
            return;
        }
        const device = re instanceof Device ? re.zh : null;
        const entitySettings = re.options;
        const entityState = this.state.get(re);
        const membersState = re instanceof Group ?
            Object.fromEntries(re.zh.members.map((e) => [e.getDevice().ieeeAddr,
                this.state.get(this.zigbee.resolveEntity(e.getDevice().ieeeAddr))])) : null;
        let converters: zhc.Tz.Converter[];
        {
            if (Array.isArray(definition)) {
                const c = new Set(definition.map((d) => d.toZigbee).flat());
                if (c.size == 0) converters = defaultGroupConverters;
                else converters = Array.from(c);
            } else {
                converters = definition.toZigbee;
            }
        }

        // Convert the MQTT message to a Zigbee message.
        const message = this.parseMessage(parsedTopic, data);
        if (message == null) {
            logger.error(`Invalid message '${message}', skipping...`);
            return;
        }
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
        const sorter = typeof message.state === 'string' && message.state.toLowerCase() === 'off' ? 1 : -1;
        entries.sort((a) => (['state', 'brightness', 'brightness_percent'].includes(a[0]) ? sorter : sorter * -1));

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
        const propertyEndpointRegex = new RegExp(`^(.*?)_(${endpointNames.join('|')})$`);

        for (let [key, value] of entries) {
            let endpointName = parsedTopic.endpoint;
            let localTarget = target;
            let endpointOrGroupID = utils.isEndpoint(target) ? target.ID : target.groupID;

            // When the key has a endpointName included (e.g. state_right), this will override the target.
            const propertyEndpointMatch = key.match(propertyEndpointRegex);
            if (re instanceof Device && propertyEndpointMatch) {
                endpointName = propertyEndpointMatch[2];
                key = propertyEndpointMatch[1];
                localTarget = re.endpoint(endpointName);
                endpointOrGroupID = localTarget.ID;
            }

            if (!usedConverters.hasOwnProperty(endpointOrGroupID)) usedConverters[endpointOrGroupID] = [];
            /* istanbul ignore next */
            const converter = converters.find((c) =>
                c.key.includes(key) && (!c.endpoint || c.endpoint == endpointName));

            if (parsedTopic.type === 'set' && usedConverters[endpointOrGroupID].includes(converter)) {
                // Use a converter for set only once
                // (e.g. light_onoff_brightness converters can convert state and brightness)
                continue;
            }

            if (!converter) {
                logger.error(`No converter available for '${key}' (${stringify(message[key])})`);
                continue;
            }

            // If the endpoint_name name is a number, try to map it to a friendlyName
            if (!isNaN(Number(endpointName)) && re.isDevice() && utils.isEndpoint(localTarget) &&
                re.endpointName(localTarget)) {
                endpointName = re.endpointName(localTarget);
            }

            // Converter didn't return a result, skip
            const entitySettingsKeyValue: KeyValue = entitySettings;
            const meta = {
                endpoint_name: endpointName, options: entitySettingsKeyValue,
                message: {...message}, logger, device, state: entityState, membersState, mapped: definition,
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
                if (parsedTopic.type === 'set' && converter.convertSet) {
                    logger.debug(`Publishing '${parsedTopic.type}' '${key}' to '${re.name}'`);
                    const result = await converter.convertSet(localTarget, key, value, meta);
                    const optimistic = !entitySettings.hasOwnProperty('optimistic') || entitySettings.optimistic;
                    if (result && result.state && optimistic) {
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

                    if (result && result.membersState && optimistic) {
                        for (const [ieeeAddr, state] of Object.entries(result.membersState)) {
                            addToToPublish(this.zigbee.resolveEntity(ieeeAddr), state);
                        }
                    }

                    this.legacyRetrieveState(re, converter, result, localTarget, key, meta);
                } else if (parsedTopic.type === 'get' && converter.convertGet) {
                    logger.debug(`Publishing get '${parsedTopic.type}' '${key}' to '${re.name}'`);
                    await converter.convertGet(localTarget, key, meta);
                } else {
                    logger.error(`No converter available for '${parsedTopic.type}' '${key}' (${message[key]})`);
                    continue;
                }
            } catch (error) {
                const message =
                    `Publish '${parsedTopic.type}' '${key}' to '${re.name}' failed: '${error}'`;
                logger.error(message);
                logger.debug(error.stack);
                this.legacyLog({type: `zigbee_publish_error`, message, meta: {friendly_name: re.name}});
            }

            usedConverters[endpointOrGroupID].push(converter);
        }

        for (const [ID, payload] of Object.entries(toPublish)) {
            if (Object.keys(payload).length != 0) {
                this.publishEntityState(toPublishEntity[ID], payload);
            }
        }

        const scenesChanged = Object.values(usedConverters)
            .some((cl) => cl.some((c) => c.key.some((k) => sceneConverterKeys.includes(k))));
        if (scenesChanged) {
            this.eventBus.emitScenesChanged({entity: re});
        }
    }
}
