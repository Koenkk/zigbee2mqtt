const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');
const zigbee2mqttVersion = require('../../package.json').version;
const Extension = require('./extension');
const stringify = require('json-stable-stringify-without-jsonify');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const assert = require('assert');

const sensorClick = {
    type: 'sensor',
    object_id: 'click',
    discovery_payload: {
        icon: 'mdi:toggle-switch',
        value_template: '{{ value_json.click }}',
    },
};

const ACCESS_STATE = 1;
const defaultStatusTopic = 'homeassistant/status';

/**
 * This extensions handles integration with HomeAssistant
 */
class HomeAssistant extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);

        // A map of all discoverd devices
        this.discovered = {};
        this.mapping = {};
        this.discoveredTriggers = {};
        this.legacyApi = settings.get().advanced.legacy_api;

        if (!settings.get().advanced.cache_state) {
            logger.warn('In order for HomeAssistant integration to work properly set `cache_state: true');
        }

        if (settings.get().experimental.output === 'attribute') {
            throw new Error('Home Assitant integration is not possible with attribute output!');
        }

        this.discoveryTopic = settings.get().advanced.homeassistant_discovery_topic;
        this.statusTopic = settings.get().advanced.homeassistant_status_topic;

        this.eventBus.on('deviceRemoved', (data) => this.onDeviceRemoved(data.resolvedEntity), this.constructor.name);
        this.eventBus.on('publishEntityState', (data) => this.onPublishEntityState(data), this.constructor.name);
        this.eventBus.on('deviceRenamed', (data) =>
            this.onDeviceRenamed(data.device, data.homeAssisantRename), this.constructor.name,
        );

        this.populateMapping();
    }

    populateMapping() {
        for (const def of zigbeeHerdsmanConverters.definitions) {
            this.mapping[def.model] = [];

            if (['WXKG01LM', 'HS1EB/HS1EB-E', 'ICZB-KPD14S', 'TERNCY-SD01', 'TERNCY-PP01', 'ICZB-KPD18S',
                'E1766', 'ZWallRemote0', 'ptvo.switch', '2AJZ4KPKEY', 'ZGRC-KEY-013', 'HGZB-02S', 'HGZB-045',
                'HGZB-1S', 'AV2010/34', 'IM6001-BTP01', 'WXKG11LM', 'WXKG03LM', 'WXKG02LM_rev1', 'WXKG02LM_rev2',
                'QBKG04LM', 'QBKG03LM', 'QBKG11LM', 'QBKG21LM', 'QBKG22LM', 'WXKG12LM', 'QBKG12LM',
                'E1743'].includes(def.model)) {
                // deprecated
                this.mapping[def.model].push(sensorClick);
            }

            if (['ICTC-G-1'].includes(def.model)) {
                // deprecated
                this.mapping[def.model].push({
                    type: 'sensor',
                    object_id: 'brightness',
                    discovery_payload: {
                        unit_of_measurement: 'brightness',
                        icon: 'mdi:brightness-5',
                        value_template: '{{ value_json.brightness }}',
                    },
                });
            }

            for (const expose of def.exposes) {
                let discoveryEntry = null;
                /* istanbul ignore else */
                if (expose.type === 'light') {
                    const colorXY = expose.features.find((e) => e.name === 'color_xy');
                    const colorHS = expose.features.find((e) => e.name === 'color_hs');
                    const brightness = expose.features.find((e) => e.name === 'brightness');
                    const colorTemp = expose.features.find((e) => e.name === 'color_temp');

                    discoveryEntry = {
                        type: 'light',
                        object_id: expose.endpoint ? `light_${expose.endpoint}` : 'light',
                        discovery_payload: {
                            brightness: !!brightness,
                            schema: 'json',
                            command_topic: true,
                            brightness_scale: 254,
                            command_topic_prefix: expose.endpoint ? expose.endpoint : undefined,
                            state_topic_postfix: expose.endpoint ? expose.endpoint : undefined,
                        },
                    };

                    const colorModes = [
                        colorXY ? 'xy' : null,
                        !colorXY && colorHS ? 'hs' : null,
                        colorTemp ? 'color_temp' : null,
                    ].filter((c) => c);

                    if (colorModes.length) {
                        discoveryEntry.discovery_payload.color_mode = true;
                        discoveryEntry.discovery_payload.supported_color_modes = colorModes;
                    }


                    if (colorTemp) {
                        discoveryEntry.discovery_payload.max_mireds = colorTemp.value_max;
                        discoveryEntry.discovery_payload.min_mireds = colorTemp.value_min;
                    }

                    const effect = def.exposes.find((e) => e.type === 'enum' && e.name === 'effect');
                    if (effect) {
                        discoveryEntry.discovery_payload.effect = true;
                        discoveryEntry.discovery_payload.effect_list = effect.values;
                    }
                } else if (expose.type === 'switch') {
                    const state = expose.features.find((f) => f.name === 'state');
                    discoveryEntry = {
                        type: 'switch',
                        object_id: expose.endpoint ? `switch_${expose.endpoint}` : 'switch',
                        discovery_payload: {
                            payload_off: state.value_off,
                            payload_on: state.value_on,
                            value_template: `{{ value_json.${state.property} }}`,
                            command_topic: true,
                            command_topic_prefix: expose.endpoint ? expose.endpoint : undefined,
                        },
                    };

                    const different = ['valve_detection', 'window_detection', 'auto_lock', 'away_mode'];
                    if (different.includes(state.property)) {
                        discoveryEntry.discovery_payload.command_topic_postfix = state.property;
                        discoveryEntry.discovery_payload.state_off = state.value_off;
                        discoveryEntry.discovery_payload.state_on = state.value_on;
                        discoveryEntry.discovery_payload.state_topic = true;
                        discoveryEntry.object_id = state.property;

                        if (state.property === 'window_detection') {
                            discoveryEntry.discovery_payload.icon = 'mdi:window-open-variant';
                        }
                    }
                } else if (expose.type === 'climate') {
                    const setpointProperties = ['occupied_heating_setpoint', 'current_heating_setpoint'];
                    const setpoint = expose.features.find((f) => setpointProperties.includes(f.name));
                    assert(setpoint, 'No setpoint found');
                    const temperature = expose.features.find((f) => f.name === 'local_temperature');
                    assert(temperature, 'No temperature found');

                    discoveryEntry = {
                        type: 'climate',
                        object_id: expose.endpoint ? `climate_${expose.endpoint}` : 'climate',
                        discovery_payload: {
                            // Static
                            state_topic: false,
                            temperature_unit: 'C',
                            // Setpoint
                            temp_step: setpoint.value_step,
                            min_temp: setpoint.value_min.toString(),
                            max_temp: setpoint.value_max.toString(),
                            // Temperature
                            current_temperature_topic: true,
                            current_temperature_template: `{{ value_json.${temperature.property} }}`,
                        },
                    };

                    const mode = expose.features.find((f) => f.name === 'system_mode');
                    if (mode) {
                        if (mode.values.includes('sleep')) {
                            // 'sleep' is not supported by homeassistent, but is valid according to ZCL
                            // TRV that support sleep (e.g. Viessmann) will have it removed from here,
                            // this allows other expose consumers to still use it, e.g. the frontend.
                            mode.values.splice(mode.values.indexOf('sleep'), 1);
                        }
                        discoveryEntry.discovery_payload.mode_state_topic = true;
                        discoveryEntry.discovery_payload.mode_state_template = `{{ value_json.${mode.property} }}`;
                        discoveryEntry.discovery_payload.modes = mode.values;
                        discoveryEntry.discovery_payload.mode_command_topic = true;
                    }

                    const state = expose.features.find((f) => f.name === 'running_state');
                    if (state) {
                        discoveryEntry.discovery_payload.action_topic = true;
                        discoveryEntry.discovery_payload.action_template = `{% set values = ` +
                                `{'idle':'off','heat':'heating','cool':'cooling','fan only':'fan'}` +
                                ` %}{{ values[value_json.${state.property}] }}`;
                    }

                    const coolingSetpoint = expose.features.find((f) => f.name === 'occupied_cooling_setpoint');
                    if (coolingSetpoint) {
                        discoveryEntry.discovery_payload.temperature_low_command_topic = setpoint.name;
                        discoveryEntry.discovery_payload.temperature_low_state_template =
                            `{{ value_json.${setpoint.property} }}`;
                        discoveryEntry.discovery_payload.temperature_low_state_topic = true;
                        discoveryEntry.discovery_payload.temperature_high_command_topic = coolingSetpoint.name;
                        discoveryEntry.discovery_payload.temperature_high_state_template =
                            `{{ value_json.${coolingSetpoint.property} }}`;
                        discoveryEntry.discovery_payload.temperature_high_state_topic = true;
                    } else {
                        discoveryEntry.discovery_payload.temperature_command_topic = setpoint.name;
                        discoveryEntry.discovery_payload.temperature_state_template =
                            `{{ value_json.${setpoint.property} }}`;
                        discoveryEntry.discovery_payload.temperature_state_topic = true;
                    }

                    const fanMode = expose.features.find((f) => f.name === 'fan_mode');
                    if (fanMode) {
                        discoveryEntry.discovery_payload.fan_modes = fanMode.values;
                        discoveryEntry.discovery_payload.fan_mode_command_topic = true;
                        discoveryEntry.discovery_payload.fan_mode_state_template =
                            `{{ value_json.${fanMode.property} }}`;
                        discoveryEntry.discovery_payload.fan_mode_state_topic = true;
                    }

                    const preset = expose.features.find((f) => f.name === 'preset');
                    if (preset) {
                        discoveryEntry.discovery_payload.hold_modes = preset.values;
                        discoveryEntry.discovery_payload.hold_command_topic = true;
                        discoveryEntry.discovery_payload.hold_state_template =
                            `{{ value_json.${preset.property} }}`;
                        discoveryEntry.discovery_payload.hold_state_topic = true;
                    }

                    const awayMode = expose.features.find((f) => f.name === 'away_mode');
                    if (awayMode) {
                        discoveryEntry.discovery_payload.away_mode_command_topic = true;
                        discoveryEntry.discovery_payload.away_mode_state_topic = true;
                        discoveryEntry.discovery_payload.away_mode_state_template =
                            `{{ value_json.${awayMode.property} }}`;
                    }

                    if (expose.endpoint) {
                        discoveryEntry.discovery_payload.state_topic_postfix = expose.endpoint;
                    }
                } else if (expose.type === 'lock') {
                    assert(!expose.endpoint, `Endpoint not supported for lock type`);
                    const state = expose.features.find((f) => f.name === 'state');
                    assert(state, 'No state found');
                    discoveryEntry = {
                        type: 'lock',
                        object_id: 'lock',
                        discovery_payload: {
                            command_topic: true,
                            value_template: `{{ value_json.${state.property} }}`,
                        },
                    };

                    if (state.property === 'keypad_lockout') {
                        // deprecated: keypad_lockout is messy, but changing is breaking
                        discoveryEntry.discovery_payload.payload_lock = state.value_on;
                        discoveryEntry.discovery_payload.payload_unlock = state.value_off;
                        discoveryEntry.discovery_payload.state_topic = true;
                        discoveryEntry.object_id = 'keypad_lock';
                    } else if (state.property === 'child_lock') {
                        // deprecated: child_lock is messy, but changing is breaking
                        discoveryEntry.discovery_payload.payload_lock = state.value_on;
                        discoveryEntry.discovery_payload.payload_unlock = state.value_off;
                        discoveryEntry.discovery_payload.state_locked = 'LOCK';
                        discoveryEntry.discovery_payload.state_unlocked = 'UNLOCK';
                        discoveryEntry.discovery_payload.state_topic = true;
                        discoveryEntry.object_id = 'child_lock';
                    } else {
                        discoveryEntry.discovery_payload.state_locked = state.value_on;
                        discoveryEntry.discovery_payload.state_unlocked = state.value_off;
                    }

                    if (state.property !== 'state') {
                        discoveryEntry.discovery_payload.command_topic_postfix = state.property;
                    }
                } else if (expose.type === 'cover') {
                    assert(!expose.endpoint, `Endpoint not supported for cover type`);
                    const hasPosition = expose.features.find((e) => e.name === 'position');
                    const hasTilt = expose.features.find((e) => e.name === 'tilt');

                    discoveryEntry = {
                        type: 'cover',
                        object_id: 'cover',
                        discovery_payload: {
                            command_topic: true,
                            state_topic: !hasPosition,
                        },
                    };

                    if (!hasPosition && !hasTilt) {
                        discoveryEntry.discovery_payload.optimistic = true;
                    }

                    if (hasPosition) {
                        discoveryEntry.discovery_payload = {...discoveryEntry.discovery_payload,
                            position_template: '{{ value_json.position }}',
                            set_position_template: '{ "position": {{ position }} }',
                            set_position_topic: true,
                            position_topic: true,
                        };
                    }

                    if (hasTilt) {
                        discoveryEntry.discovery_payload = {...discoveryEntry.discovery_payload,
                            tilt_command_topic: true,
                            tilt_status_topic: true,
                            tilt_status_template: '{{ value_json.tilt }}',
                        };
                    }
                } else if (expose.type === 'fan') {
                    assert(!expose.endpoint, `Endpoint not supported for fan type`);
                    discoveryEntry = {
                        type: 'fan',
                        object_id: 'fan',
                        discovery_payload: {
                            state_topic: true,
                            state_value_template: '{{ value_json.fan_state }}',
                            command_topic: true,
                            command_topic_postfix: 'fan_state',
                        },
                    };

                    const speed = expose.features.find((e) => e.name === 'mode');
                    if (speed) {
                        discoveryEntry.discovery_payload.speed_state_topic = true;
                        discoveryEntry.discovery_payload.speed_command_topic = true;
                        discoveryEntry.discovery_payload.speed_value_template = '{{ value_json.fan_mode }}';
                        discoveryEntry.discovery_payload.speeds = speed.values;
                    }
                } else if (expose.type === 'binary') {
                    const lookup = {
                        occupancy: {device_class: 'motion'},
                        battery_low: {device_class: 'battery'},
                        water_leak: {device_class: 'moisture'},
                        vibration: {device_class: 'vibration'},
                        contact: {device_class: 'door'},
                        smoke: {device_class: 'smoke'},
                        gas: {device_class: 'gas'},
                        carbon_monoxide: {device_class: 'safety'},
                        presence: {device_class: 'presence'},
                    };

                    discoveryEntry = {
                        type: 'binary_sensor',
                        object_id: expose.endpoint ? `${expose.name}_${expose.endpoint}` : `${expose.name}`,
                        discovery_payload: {
                            value_template: `{{ value_json.${expose.property} }}`,
                            payload_on: expose.value_on,
                            payload_off: expose.value_off,
                            ...(lookup[expose.name] || {}),
                        },
                    };
                } else if (expose.type === 'numeric') {
                    const lookup = {
                        battery: {device_class: 'battery'},
                        temperature: {device_class: 'temperature'},
                        humidity: {device_class: 'humidity'},
                        illuminance_lux: {device_class: 'illuminance'},
                        illuminance: {device_class: 'illuminance'},
                        soil_moisture: {icon: 'mdi:water-percent'},
                        position: {icon: 'mdi:valve'},
                        pressure: {device_class: 'pressure'},
                        power: {device_class: 'power'},
                        linkquality: {icon: 'mdi:signal'},
                        current: {device_class: 'current'},
                        voltage: {device_class: 'voltage'},
                        current_phase_b: {device_class: 'current'},
                        voltage_phase_b: {device_class: 'voltage'},
                        current_phase_c: {device_class: 'current'},
                        voltage_phase_c: {device_class: 'voltage'},
                        energy: {device_class: 'energy'},
                        smoke_density: {icon: 'mdi:google-circles-communities'},
                        gas_density: {icon: 'mdi:google-circles-communities'},
                        pm25: {icon: 'mdi:air-filter'},
                        pm10: {icon: 'mdi:air-filter'},
                        voc: {icon: 'mdi:air-filter'},
                        aqi: {icon: 'mdi:air-filter'},
                        hcho: {icon: 'mdi:air-filter'},
                        requested_brightness_level: {icon: 'mdi:brightness-5'},
                        requested_brightness_percent: {icon: 'mdi:brightness-5'},
                        eco2: {icon: 'mdi:molecule-co2'},
                        co2: {icon: 'mdi:molecule-co2'},
                        local_temperature: {device_class: 'temperature'},
                        x_axis: {icon: 'mdi:axis-x-arrow'},
                        y_axis: {icon: 'mdi:axis-y-arrow'},
                        z_axis: {icon: 'mdi:axis-z-arrow'},
                    };

                    discoveryEntry = {
                        type: 'sensor',
                        object_id: expose.endpoint ? `${expose.name}_${expose.endpoint}` : `${expose.name}`,
                        discovery_payload: {
                            value_template: `{{ value_json.${expose.property} }}`,
                            ...(expose.unit && {unit_of_measurement: expose.unit}),
                            ...lookup[expose.name],
                        },
                    };
                } else if (expose.type === 'enum' || expose.type === 'text' || expose.type === 'composite') {
                    if (expose.access & ACCESS_STATE) {
                        const lookup = {
                            action: {icon: 'mdi:gesture-double-tap'},
                        };

                        discoveryEntry = {
                            type: 'sensor',
                            object_id: expose.property,
                            discovery_payload: {
                                value_template: `{{ value_json.${expose.property} }}`,
                                ...lookup[expose.name],
                            },
                        };
                    }
                } else {
                    throw new Error(`Unsupported exposes type: '${expose.type}'`);
                }

                if (discoveryEntry) {
                    this.mapping[def.model].push(discoveryEntry);
                }
            }
        }

        for (const definition of utils.getExternalConvertersDefinitions(settings)) {
            if (definition.hasOwnProperty('homeassistant')) {
                this.mapping[definition.model] = definition.homeassistant;
            }
        }
    }

    onDeviceRemoved(resolvedEntity) {
        logger.debug(`Clearing Home Assistant discovery topic for '${resolvedEntity.name}'`);
        delete this.discovered[resolvedEntity.device.ieeeAddr];
        for (const config of this.getConfigs(resolvedEntity)) {
            const topic = this.getDiscoveryTopic(config, resolvedEntity.device);
            this.mqtt.publish(topic, null, {retain: true, qos: 0}, this.discoveryTopic, false, false);
        }
    }

    async onPublishEntityState(data) {
        /**
         * In case we deal with a lightEndpoint configuration Zigbee2MQTT publishes
         * e.g. {state_l1: ON, brightness_l1: 250} to zigbee2mqtt/mydevice.
         * As the Home Assistant MQTT JSON light cannot be configured to use state_l1/brightness_l1
         * as the state variables, the state topic is set to zigbee2mqtt/mydevice/l1.
         * Here we retrieve all the attributes with the _l1 values and republish them on
         * zigbee2mqtt/mydevice/l1.
         */
        if (data.entity.definition && this.mapping[data.entity.definition.model]) {
            for (const config of this.mapping[data.entity.definition.model]) {
                const match = /light_(.*)/.exec(config['object_id']);
                if (match) {
                    const endpoint = match[1];
                    const endpointRegExp = new RegExp(`(.*)_${endpoint}`);
                    const payload = {};
                    for (const key of Object.keys(data.messagePayload)) {
                        const keyMatch = endpointRegExp.exec(key);
                        if (keyMatch) {
                            payload[keyMatch[1]] = data.messagePayload[key];
                        }
                    }

                    await this.mqtt.publish(
                        `${data.entity.name}/${endpoint}`, stringify(payload), {},
                    );
                }
            }
        }

        /**
         * Publish an empty value for click and action payload, in this way Home Assistant
         * can use Home Assistant entities in automations.
         * https://github.com/Koenkk/zigbee2mqtt/issues/959#issuecomment-480341347
         */
        if (settings.get().advanced.homeassistant_legacy_triggers) {
            const keys = ['action', 'click'].filter((k) => data.messagePayload[k]);
            for (const key of keys) {
                this.publishEntityState(data.entity.device.ieeeAddr, {[key]: ''});
            }
        }

        /**
         * Implements the MQTT device trigger (https://www.home-assistant.io/integrations/device_trigger.mqtt/)
         * The MQTT device trigger does not support JSON parsing, so it cannot listen to zigbee2mqtt/my_device
         * Whenever a device publish an {action: *} we discover an MQTT device trigger sensor
         * and republish it to zigbee2mqtt/my_devic/action
         */
        if (data.entity.definition) {
            const keys = ['action', 'click'].filter((k) => data.messagePayload[k]);
            for (const key of keys) {
                const value = data.messagePayload[key].toString();
                await this.publishDeviceTriggerDiscover(data.entity, key, value);
                await this.mqtt.publish(`${data.entity.name}/${key}`, value, {});
            }
        }
    }

    onDeviceRenamed(device, homeAssisantRename) {
        logger.debug(`Refreshing Home Assistant discovery topic for '${device.ieeeAddr}'`);
        const resolvedEntity = this.zigbee.resolveEntity(device);

        // Clear before rename so Home Assistant uses new friendly_name
        // https://github.com/Koenkk/zigbee2mqtt/issues/4096#issuecomment-674044916
        if (homeAssisantRename) {
            for (const config of this.getConfigs(resolvedEntity)) {
                const topic = this.getDiscoveryTopic(config, device);
                this.mqtt.publish(topic, null, {retain: true, qos: 0}, this.discoveryTopic, false, false);
            }
        }

        this.discover(resolvedEntity, true);

        if (this.discoveredTriggers[device.ieeeAddr]) {
            for (const config of this.discoveredTriggers[device.ieeeAddr]) {
                const key = config.substring(0, config.indexOf('_'));
                const value = config.substring(config.indexOf('_') + 1);
                this.publishDeviceTriggerDiscover(resolvedEntity, key, value, true);
            }
        }
    }

    async onMQTTConnected() {
        this.mqtt.subscribe(this.statusTopic);
        this.mqtt.subscribe(defaultStatusTopic);
        this.mqtt.subscribe(`${this.discoveryTopic}/#`);

        // MQTT discovery of all paired devices on startup.
        for (const device of this.zigbee.getClients()) {
            const resolvedEntity = this.zigbee.resolveEntity(device);
            this.discover(resolvedEntity, true);
        }
    }

    getConfigs(resolvedEntity) {
        if (!resolvedEntity || !resolvedEntity.definition || !this.mapping[resolvedEntity.definition.model]) return [];

        let configs = this.mapping[resolvedEntity.definition.model].slice();
        if (resolvedEntity.definition.hasOwnProperty('ota')) {
            const updateStateSensor = {
                type: 'sensor',
                object_id: 'update_state',
                discovery_payload: {
                    icon: 'mdi:update',
                    value_template: `{{ value_json['update']['state'] }}`,
                },
            };

            configs.push(updateStateSensor);
            if (this.legacyApi) {
                const updateAvailableSensor = {
                    type: 'binary_sensor',
                    object_id: 'update_available',
                    discovery_payload: {
                        payload_on: true,
                        payload_off: false,
                        value_template: '{{ value_json.update_available}}',
                    },
                };
                configs.push(updateAvailableSensor);
            }
        }

        if (resolvedEntity.settings.hasOwnProperty('legacy') && !resolvedEntity.settings.legacy) {
            configs = configs.filter((c) => c !== sensorClick);
        }

        if (!settings.get().advanced.homeassistant_legacy_triggers) {
            configs = configs.filter((c) => c.object_id !== 'action' && c.object_id !== 'click');
        }

        // deep clone of the config objects
        configs = JSON.parse(JSON.stringify(configs));

        if (resolvedEntity.settings.homeassistant) {
            const s = resolvedEntity.settings.homeassistant;
            configs = configs.filter((config) => !s.hasOwnProperty(config.object_id) || s[config.object_id] != null);
            configs.forEach((config) => {
                const configOverride = s[config.object_id];
                if (configOverride) {
                    config.object_id = configOverride.object_id || config.object_id;
                    config.type = configOverride.type || config.type;
                }
            });
        }

        return configs;
    }

    discover(resolvedEntity, force=false) {
        // Check if already discoverd and check if there are configs.
        const {device, definition} = resolvedEntity;
        const discover = force || !this.discovered[device.ieeeAddr];
        if (!discover || !device || !definition || !this.mapping[definition.model] || device.interviewing ||
            (resolvedEntity.settings.hasOwnProperty('homeassistant') && !resolvedEntity.settings.homeassistant)) {
            return;
        }

        const friendlyName = resolvedEntity.settings.friendlyName;
        this.getConfigs(resolvedEntity).forEach((config) => {
            const payload = {...config.discovery_payload};
            let stateTopic = `${settings.get().mqtt.base_topic}/${friendlyName}`;
            if (payload.state_topic_postfix) {
                stateTopic += `/${payload.state_topic_postfix}`;
                delete payload.state_topic_postfix;
            }

            if (!payload.hasOwnProperty('state_topic') || payload.state_topic) {
                payload.state_topic = stateTopic;
            } else {
                /* istanbul ignore else */
                if (payload.hasOwnProperty('state_topic')) {
                    delete payload.state_topic;
                }
            }

            if (payload.position_topic) {
                payload.position_topic = stateTopic;
            }

            if (payload.tilt_status_topic) {
                payload.tilt_status_topic = stateTopic;
            }

            payload.json_attributes_topic = stateTopic;

            // Set (unique) name, separate by space if friendlyName contains space.
            const nameSeparator = friendlyName.includes('_') ? '_' : ' ';
            payload.name = friendlyName;
            if (config.object_id.startsWith(config.type) && config.object_id.includes('_')) {
                payload.name += `${nameSeparator}${config.object_id.split(/_(.+)/)[1]}`;
            } else if (!config.object_id.startsWith(config.type)) {
                payload.name += `${nameSeparator}${config.object_id.replace(/_/g, nameSeparator)}`;
            }

            // Set unique_id
            payload.unique_id = `${resolvedEntity.settings.ID}_${config.object_id}_${settings.get().mqtt.base_topic}`;

            // Attributes for device registry
            payload.device = this.getDevicePayload(resolvedEntity);

            // Availability payload
            payload.availability = [{topic: `${settings.get().mqtt.base_topic}/bridge/state`}];
            if (settings.get().advanced.availability_timeout) {
                payload.availability.push({topic: `${settings.get().mqtt.base_topic}/${friendlyName}/availability`});
            }

            if (payload.command_topic) {
                payload.command_topic = `${settings.get().mqtt.base_topic}/${friendlyName}/`;

                if (payload.command_topic_prefix) {
                    payload.command_topic += `${payload.command_topic_prefix}/`;
                    delete payload.command_topic_prefix;
                }

                payload.command_topic += 'set';

                if (payload.command_topic_postfix) {
                    payload.command_topic += `/${payload.command_topic_postfix}`;
                    delete payload.command_topic_postfix;
                }
            }

            if (payload.set_position_topic && payload.command_topic) {
                payload.set_position_topic = payload.command_topic;
            }

            if (payload.tilt_command_topic && payload.command_topic) {
                // Home Assistant does not support templates to set tilt (as of 2019-08-17),
                // so we (have to) use a subtopic.
                payload.tilt_command_topic = payload.command_topic + '/tilt';
            }

            if (payload.mode_state_topic) {
                payload.mode_state_topic = stateTopic;
            }

            if (payload.mode_command_topic) {
                payload.mode_command_topic = `${stateTopic}/set/system_mode`;
            }

            if (payload.hold_command_topic) {
                payload.hold_command_topic = `${stateTopic}/set/preset`;
            }

            if (payload.hold_state_topic) {
                payload.hold_state_topic = stateTopic;
            }

            if (payload.away_mode_state_topic) {
                payload.away_mode_state_topic = stateTopic;
            }

            if (payload.away_mode_command_topic) {
                payload.away_mode_command_topic = `${stateTopic}/set/away_mode`;
            }

            if (payload.current_temperature_topic) {
                payload.current_temperature_topic = stateTopic;
            }

            if (payload.temperature_state_topic) {
                payload.temperature_state_topic = stateTopic;
            }

            if (payload.temperature_low_state_topic) {
                payload.temperature_low_state_topic = stateTopic;
            }

            if (payload.temperature_high_state_topic) {
                payload.temperature_high_state_topic = stateTopic;
            }

            if (payload.speed_state_topic) {
                payload.speed_state_topic = stateTopic;
            }

            if (payload.temperature_command_topic) {
                payload.temperature_command_topic = `${stateTopic}/set/${payload.temperature_command_topic}`;
            }

            if (payload.temperature_low_command_topic) {
                payload.temperature_low_command_topic = `${stateTopic}/set/${payload.temperature_low_command_topic}`;
            }

            if (payload.temperature_high_command_topic) {
                payload.temperature_high_command_topic = `${stateTopic}/set/${payload.temperature_high_command_topic}`;
            }

            if (payload.fan_mode_state_topic) {
                payload.fan_mode_state_topic = stateTopic;
            }

            if (payload.fan_mode_command_topic) {
                payload.fan_mode_command_topic = `${stateTopic}/set/fan_mode`;
            }

            if (payload.speed_command_topic) {
                payload.speed_command_topic = `${stateTopic}/set/fan_mode`;
            }

            if (payload.action_topic) {
                payload.action_topic = stateTopic;
            }

            // Override configuration with user settings.
            if (resolvedEntity.settings.hasOwnProperty('homeassistant')) {
                const add = (obj) => {
                    Object.keys(obj).forEach((key) => {
                        if (['type', 'object_id'].includes(key)) {
                            return;
                        } else if (['number', 'string', 'boolean'].includes(typeof obj[key])) {
                            payload[key] = obj[key];
                        } else if (obj[key] === null) {
                            delete payload[key];
                        } else if (key === 'device' && typeof obj[key] === 'object') {
                            Object.keys(obj['device']).forEach((key) => {
                                payload['device'][key] = obj['device'][key];
                            });
                        }
                    });
                };

                add(resolvedEntity.settings.homeassistant);

                if (resolvedEntity.settings.homeassistant.hasOwnProperty(config.object_id)) {
                    add(resolvedEntity.settings.homeassistant[config.object_id]);
                }
            }

            const topic = this.getDiscoveryTopic(config, device);
            this.mqtt.publish(topic, stringify(payload), {retain: true, qos: 0}, this.discoveryTopic, false, false);
        });

        this.discovered[device.ieeeAddr] = true;
    }

    onMQTTMessage(topic, message) {
        const discoveryRegex = new RegExp(`${this.discoveryTopic}/(.*)/(.*)/(.*)/config`);
        const discoveryMatch = topic.match(discoveryRegex);
        const isDeviceAutomation = discoveryMatch && discoveryMatch[1] === 'device_automation';
        if (discoveryMatch) {
            // Clear outdated discovery configs and remember already discoverd device_automations
            try {
                message = JSON.parse(message);
                const baseTopic = settings.get().mqtt.base_topic + '/';
                if (isDeviceAutomation && (!message.topic || !message.topic.startsWith(baseTopic))) {
                    return;
                }

                if (!isDeviceAutomation &&
                    (!message.availability || !message.availability[0].topic.startsWith(baseTopic))) {
                    return;
                }
            } catch (e) {
                return;
            }

            const ieeeAddr = discoveryMatch[2];
            const resolvedEntity = this.zigbee.resolveEntity(ieeeAddr);
            let clear = !resolvedEntity || !resolvedEntity.definition;

            // Only save when topic matches otherwise config is not updated when renamed by editing configuration.yaml
            if (resolvedEntity) {
                const key = `${discoveryMatch[3].substring(0, discoveryMatch[3].indexOf('_'))}`;
                const triggerTopic = `${settings.get().mqtt.base_topic}/${resolvedEntity.name}/${key}`;
                if (isDeviceAutomation && message.topic === triggerTopic) {
                    if (!this.discoveredTriggers[ieeeAddr]) {
                        this.discoveredTriggers[ieeeAddr] = new Set();
                    }
                    this.discoveredTriggers[ieeeAddr].add(discoveryMatch[3]);
                }
            }

            if (!clear && !isDeviceAutomation) {
                const type = discoveryMatch[1];
                const objectID = discoveryMatch[3];
                clear = !this.getConfigs(resolvedEntity).find((c) => c.type === type && c.object_id === objectID);
            }
            // Device was flagged to be excluded from homeassistant discovery
            clear = clear || (resolvedEntity.settings.hasOwnProperty('homeassistant') &&
                                !resolvedEntity.settings.homeassistant);

            if (clear) {
                logger.debug(`Clearing Home Assistant config '${topic}'`);
                topic = topic.substring(this.discoveryTopic.length + 1);
                this.mqtt.publish(topic, null, {retain: true, qos: 0}, this.discoveryTopic, false, false);
            }
        } else if ((topic === this.statusTopic || topic === defaultStatusTopic) && message.toLowerCase() === 'online') {
            const timer = setTimeout(async () => {
                // Publish all device states.
                for (const device of this.zigbee.getClients()) {
                    if (this.state.exists(device.ieeeAddr)) {
                        this.publishEntityState(device.ieeeAddr, this.state.get(device.ieeeAddr));
                    }
                }

                clearTimeout(timer);
            }, 30000);
        }
    }

    onZigbeeEvent(type, data, resolvedEntity) {
        if (resolvedEntity && type !== 'deviceLeave' && this.mqtt.isConnected()) {
            this.discover(resolvedEntity);
        }
    }

    getDevicePayload(resolvedEntity) {
        return {
            identifiers: [`zigbee2mqtt_${resolvedEntity.settings.ID}`],
            name: resolvedEntity.settings.friendlyName,
            sw_version: `Zigbee2MQTT ${zigbee2mqttVersion}`,
            model: `${resolvedEntity.definition.description} (${resolvedEntity.definition.model})`,
            manufacturer: resolvedEntity.definition.vendor,
        };
    }

    adjustMessagePayloadBeforePublish(resolvedEntity, messagePayload) {
        // Set missing values of state to 'null': https://github.com/Koenkk/zigbee2mqtt/issues/6987
        if (!resolvedEntity || !resolvedEntity.definition) return null;

        const add = (expose) => {
            if (!messagePayload.hasOwnProperty(expose.property) && expose.access & ACCESS_STATE) {
                messagePayload[expose.property] = null;
            }
        };

        for (const expose of resolvedEntity.definition.exposes) {
            if (expose.hasOwnProperty('features')) {
                for (const feature of expose.features) {
                    if (feature.name === 'state') {
                        add(feature);
                    }
                }
            } else {
                add(expose);
            }
        }

        // Copy hue -> h, saturation -> s to make homeassitant happy
        if (messagePayload.hasOwnProperty('color')) {
            if (messagePayload.color.hasOwnProperty('hue')) {
                messagePayload.color.h = messagePayload.color.hue;
            }
            if (messagePayload.color.hasOwnProperty('saturation')) {
                messagePayload.color.s = messagePayload.color.saturation;
            }
        }
    }

    getDiscoveryTopic(config, device) {
        return `${config.type}/${device.ieeeAddr}/${config.object_id}/config`;
    }

    async publishDeviceTriggerDiscover(entity, key, value, force=false) {
        const haConfig = entity.settings.homeassistant;
        if (entity.settings.hasOwnProperty('homeassistant') && (haConfig == null ||
                (haConfig.hasOwnProperty('device_automation') && haConfig.device_automation == null))) {
            return;
        }

        const device = entity.device;
        if (!this.discoveredTriggers[device.ieeeAddr]) {
            this.discoveredTriggers[device.ieeeAddr] = new Set();
        }

        const discoveredKey = `${key}_${value}`;
        if (this.discoveredTriggers[device.ieeeAddr].has(discoveredKey) && !force) {
            return;
        }

        const config = {
            type: 'device_automation',
            object_id: `${key}_${value}`,
            discovery_payload: {
                automation_type: 'trigger',
                type: key,
            },
        };

        const topic = this.getDiscoveryTopic(config, device);
        const payload = {
            ...config.discovery_payload,
            subtype: value,
            payload: value,
            topic: `${settings.get().mqtt.base_topic}/${entity.name}/${key}`,
            device: this.getDevicePayload(entity),
        };

        await this.mqtt.publish(topic, stringify(payload), {retain: true, qos: 0}, this.discoveryTopic, false, false);
        this.discoveredTriggers[device.ieeeAddr].add(discoveredKey);
    }

    // Only for homeassistant.test.js
    _getMapping() {
        return this.mapping;
    }

    _clearDiscoveredTrigger() {
        this.discoveredTriggers = new Set();
    }
}

module.exports = HomeAssistant;
