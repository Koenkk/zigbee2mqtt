const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');
const zigbee2mqttVersion = require('../../package.json').version;
const Extension = require('./extension');
const stringify = require('json-stable-stringify-without-jsonify');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const assert = require('assert');

const cfg = {
    // Binary sensor
    'binary_sensor_water_leak': {
        type: 'binary_sensor',
        object_id: 'water_leak',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.water_leak }}',
            device_class: 'moisture',
        },
    },
    'binary_sensor_battery_low': {
        type: 'binary_sensor',
        object_id: 'battery_low',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.battery_low}}',
            device_class: 'battery',
        },
    },
    'binary_sensor_update_available': {
        type: 'binary_sensor',
        object_id: 'update_available',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.update_available}}',
        },
    },

    // Sensor
    'sensor_update_state': {
        type: 'sensor',
        object_id: 'update_state',
        discovery_payload: {
            icon: 'mdi:update',
            value_template: `{{ value_json['update']['state'] }}`,
        },
    },
    'sensor_local_temperature': {
        type: 'sensor',
        object_id: 'local_temperature',
        discovery_payload: {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            value_template: '{{ value_json.local_temperature }}',
        },
    },
    'sensor_click': {
        type: 'sensor',
        object_id: 'click',
        discovery_payload: {
            icon: 'mdi:toggle-switch',
            value_template: '{{ value_json.click }}',
        },
    },
    'sensor_power': {
        type: 'sensor',
        object_id: 'power',
        discovery_payload: {
            unit_of_measurement: 'W',
            icon: 'mdi:flash',
            value_template: '{{ value_json.power }}',
        },
    },
    'sensor_energy': {
        type: 'sensor',
        object_id: 'energy',
        discovery_payload: {
            unit_of_measurement: 'kWh',
            icon: 'mdi:power-plug',
            value_template: '{{ value_json.energy }}',
        },
    },
    'sensor_brightness': {
        type: 'sensor',
        object_id: 'brightness',
        discovery_payload: {
            unit_of_measurement: 'brightness',
            icon: 'mdi:brightness-5',
            value_template: '{{ value_json.brightness }}',
        },
    },
    'sensor_battery': {
        type: 'sensor',
        object_id: 'battery',
        discovery_payload: {
            unit_of_measurement: '%',
            device_class: 'battery',
            value_template: '{{ value_json.battery }}',
        },
    },
    'sensor_linkquality': {
        type: 'sensor',
        object_id: 'linkquality',
        discovery_payload: {
            icon: 'mdi:signal',
            unit_of_measurement: 'lqi',
            value_template: '{{ value_json.linkquality }}',
        },
    },

    // Switch
    'switch_window_detection': {
        type: 'switch',
        object_id: 'window_detection',
        discovery_payload: {
            state_topic: true,
            command_topic: true,
            command_topic_postfix: 'window_detection',
            payload_off: 'OFF',
            payload_on: 'ON',
            state_off: 'OFF',
            state_on: 'ON',
            value_template: '{{ value_json.window_detection }}',
            icon: 'mdi:window-open-variant',
        },
    },
    'switch_valve_detection': {
        type: 'switch',
        object_id: 'valve_detection',
        discovery_payload: {
            state_topic: true,
            command_topic: true,
            command_topic_postfix: 'valve_detection',
            payload_off: 'OFF',
            payload_on: 'ON',
            state_off: 'OFF',
            state_on: 'ON',
            value_template: '{{ value_json.valve_detection }}',
        },
    },

    // Lock
    'lock_keypad_lockout': {
        type: 'lock',
        object_id: 'keypad_lock',
        discovery_payload: {
            state_topic: true,
            command_topic: true,
            command_topic_postfix: 'keypad_lockout',
            payload_unlock: '0',
            payload_lock: '1',
            value_template: '{{ value_json.keypad_lockout }}',
        },
    },
    'lock_child_lock': {
        type: 'lock',
        object_id: 'child_lock',
        discovery_payload: {
            state_topic: true,
            command_topic: true,
            command_topic_postfix: 'child_lock',
            payload_lock: 'LOCK',
            payload_unlock: 'UNLOCK',
            state_locked: 'LOCKED',
            state_unlocked: 'UNLOCKED',
            value_template: '{{ value_json.child_lock }}',
        },
    },

    // Trigger
    'trigger_action': {
        type: 'device_automation',
        discovery_payload: {
            automation_type: 'trigger',
            type: 'action',
        },
    },
    'trigger_click': {
        type: 'device_automation',
        discovery_payload: {
            automation_type: 'trigger',
            type: 'click',
        },
    },
};

const climate = (minTemp=7, maxTemp=30, temperatureStateProperty='occupied_heating_setpoint',
    tempStep=1, systemModes=['off', 'auto', 'heat'], fanModes=[], holdModes=[],
    temperatureLowStateTopic=false, temperatureHighStateTopic=false, endpoint=null ) => {
    const jsonProperty = (key) => `value_json.${key}${endpoint ? `_${endpoint}` : ''}`;
    const retVal = {
        type: 'climate',
        object_id: endpoint ? `climate_${endpoint}` : 'climate',
        discovery_payload: {
            state_topic: false,
            temperature_unit: 'C',
            min_temp: `${minTemp}`,
            max_temp: `${maxTemp}`,
            mode_state_topic: true,
            mode_state_template: `{{ ${jsonProperty('system_mode')} }}`,
            mode_command_topic: true,
            current_temperature_topic: true,
            current_temperature_template: `{{ ${jsonProperty('local_temperature')} }}`,
            temp_step: tempStep,
            action_topic: true,
            action_template:
                '{% set values = {\'idle\':\'off\',\'heat\':\'heating\',\'cool\':\'cooling\',\'fan only\':\'fan\'}'+
                ` %}{{ values[${jsonProperty('running_state')}] }}`,
        },
    };

    if (endpoint) {
        retVal.discovery_payload.state_topic_postfix = endpoint;
    }

    // system_modes empty <=> use auto (in other case ha ui is showing all modes)
    if (systemModes.length > 0) {
        retVal.discovery_payload.modes = systemModes;
    } else {
        retVal.discovery_payload.modes = ['auto'];
    }
    // hold_modes empty <=> don't use presets
    if (holdModes.length > 0) {
        // NOTE: Preset 'none' will be added as first item on HA side `mqtt/climate.py preset_modes()`
        const indexOfNone = holdModes.indexOf('none');
        if (indexOfNone > -1) holdModes.splice(indexOfNone, 1);

        // HA has special behaviour for the away mode
        // https://github.com/Koenkk/zigbee2mqtt/pull/4491#issuecomment-701550476
        const indexOfAway = holdModes.indexOf('away');
        /* istanbul ignore else */
        if (indexOfAway > -1) {
            holdModes.splice(indexOfAway, 1); // HA will add "Away" to modes by itself
            retVal.discovery_payload.away_mode_command_topic = true;
            retVal.discovery_payload.away_mode_state_topic = true;
            retVal.discovery_payload.away_mode_state_template =
                `{{ ${jsonProperty('away_mode')} }}`;
        }

        if (holdModes.length > 0) { // || indexOfAway > -1) {
            retVal.discovery_payload.hold_modes = holdModes;
            retVal.discovery_payload.hold_command_topic = true;
            retVal.discovery_payload.hold_state_template = `{{ ${jsonProperty('preset')} }}`;
            retVal.discovery_payload.hold_state_topic = true;
        }
    }
    // fan_modes empty <=> don't use fan modes
    if (fanModes.length > 0) {
        retVal.discovery_payload.fan_modes = fanModes;
        retVal.discovery_payload.fan_mode_command_topic = true;
        retVal.discovery_payload.fan_mode_state_template = `{{ ${jsonProperty('fan_mode')} }}`;
        retVal.discovery_payload.fan_mode_state_topic = true;
    }
    // if no high and low temp used then use temperature_state_topic
    if (!temperatureHighStateTopic && !temperatureLowStateTopic) {
        retVal.discovery_payload.temperature_state_topic = true;
        retVal.discovery_payload.temperature_state_template = `{{ ${jsonProperty(temperatureStateProperty)} }}`;
        retVal.discovery_payload.temperature_command_topic = temperatureStateProperty;
    }
    // use low target temperature
    if (temperatureLowStateTopic) {
        retVal.discovery_payload.temperature_low_state_topic = temperatureLowStateTopic;
        retVal.discovery_payload.temperature_low_state_template = `{{ ${jsonProperty('occupied_heating_setpoint')} }}`;
        retVal.discovery_payload.temperature_low_command_topic = 'occupied_heating_setpoint';
    }
    // use high target temperature
    if (temperatureHighStateTopic) {
        retVal.discovery_payload.temperature_high_state_topic = temperatureHighStateTopic;
        retVal.discovery_payload.temperature_high_state_template = `{{ ${jsonProperty('occupied_cooling_setpoint')} }}`;
        retVal.discovery_payload.temperature_high_command_topic = 'occupied_cooling_setpoint';
    }
    return retVal;
};


// Map Home Assistant configurations to devices.
const manualMaping = {
    '1TST-EU': [climate(), cfg.sensor_battery],
    'AV2010/32': [climate(7, 30, 'occupied_heating_setpoint', 0.5), cfg.sensor_battery],
    'SPZB0001': [climate(5, 30, 'occupied_heating_setpoint', 0.5), cfg.sensor_battery],
    'ST218': [
        climate(5, 30, 'occupied_heating_setpoint', 0.5),
        cfg.sensor_local_temperature,
        cfg.lock_keypad_lockout,
    ],
    'TH1123ZB': [
        climate(7, 30, 'occupied_heating_setpoint', 0.5), cfg.sensor_local_temperature,
        cfg.lock_keypad_lockout, cfg.sensor_power, cfg.sensor_energy,
    ],
    'TH1124ZB': [
        climate(7, 30, 'occupied_heating_setpoint', 0.5), cfg.sensor_local_temperature,
        cfg.lock_keypad_lockout, cfg.sensor_power, cfg.sensor_energy,
    ],
    'TH1300ZB': [
        climate(7, 30, 'occupied_heating_setpoint', 0.5), cfg.sensor_local_temperature,
        cfg.lock_keypad_lockout,
    ],
    'TH1400ZB': [climate()],
    'TH1500ZB': [climate()],
    'Zen-01-W': [climate(10, 30, 'occupied_heating_setpoint', 0.5)],
    'UK7004240': [climate(), cfg.sensor_battery],
    'WV704R0A0902': [climate()],
    'STZB402': [
        climate(5, 30, 'occupied_heating_setpoint', 0.5),
        cfg.sensor_local_temperature,
        cfg.lock_keypad_lockout,
    ],
    'SMT402': [
        climate(5, 30, 'occupied_heating_setpoint', 0.5),
        cfg.sensor_local_temperature,
        cfg.lock_keypad_lockout,
    ],
    'SMT402AD': [
        climate(5, 30, 'occupied_heating_setpoint', 0.5),
        cfg.sensor_local_temperature,
        cfg.lock_keypad_lockout,
    ],
    'SLR1b': [climate()],
    'GS361A-H04': [
        cfg.lock_child_lock,
        cfg.switch_window_detection,
        cfg.switch_valve_detection,
        climate(5, 30, 'current_heating_setpoint', 0.5, ['off', 'auto', 'heat', 'manual']),
        cfg.sensor_battery,
    ],
    '3157100': [climate(10, 30, 'occupied_heating_setpoint', 1, ['off', 'heat', 'cool'],
        ['auto', 'on'], [], true, true), cfg.sensor_battery],
    'RC-2000WH': [climate(10, 30, 'occupied_heating_setpoint', 1, ['off', 'auto', 'heat', 'cool'],
        ['auto', 'on', 'smart'], [], true, true)],
    'TS0601_thermostat': [
        cfg.lock_child_lock, cfg.switch_window_detection, cfg.switch_valve_detection, cfg.sensor_battery,
        climate(5, 30, 'current_heating_setpoint', 0.5, [], [],
            ['schedule', 'manual', 'away', 'boost', 'complex', 'comfort', 'eco']),
    ],
    'HT-08': [
        cfg.lock_child_lock,
        climate(5, 35, 'current_heating_setpoint', 0.5,
            ['off', 'heat', 'auto'], [], ['none', 'away']),
    ],
    'HT-10': [
        cfg.lock_child_lock, cfg.binary_sensor_battery_low,
        climate(5, 35, 'current_heating_setpoint', 0.5,
            ['off', 'heat', 'auto'], [], ['none', 'away']),
    ],
    '07703L': [
        cfg.lock_child_lock, cfg.binary_sensor_battery_low,
        climate(5, 35, 'current_heating_setpoint', 0.5,
            ['off', 'heat', 'auto'], [], ['none', 'away']),
    ],
    'ZK03840': [climate()],
    'U86KWF-ZPSJ': [climate(5, 30, 'current_heating_setpoint', 0.5)],
    'D3-DPWK-TY': [climate(5, 30, 'current_heating_setpoint', 0.5)],
    'BHT-002-GCLZB': [
        cfg.lock_child_lock, climate(5, 30, 'current_heating_setpoint', 1, ['off', 'heat'], [], ['hold', 'program']),
    ],
    'SLR2': [
        climate(7, 30, 'occupied_heating_setpoint', 1, ['off', 'auto', 'heat'], [], [], false, false, 'heat'),
        climate(7, 30, 'occupied_heating_setpoint', 1, ['off', 'auto', 'heat'], [], [], false, false, 'cool'),
    ],
    'SEA801-Zigbee': [
        cfg.binary_sensor_battery_low,
        climate(5, 30, 'current_heating_setpoint', 0.5, ['off', 'heat'], [], ['manual', 'auto']),
    ],
    'SEA802-Zigbee': [
        cfg.binary_sensor_battery_low,
        climate(5, 30, 'current_heating_setpoint', 0.5, ['off', 'heat'], [], ['manual', 'auto']),
    ],
    'HY08WE': [climate(5, 30, 'current_heating_setpoint', 0.5)],
};

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
        this.newApi = settings.get().experimental.new_api;

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
            if (def.hasOwnProperty('exposes')) {
                assert(!manualMaping.hasOwnProperty(def.model), `'${def.model}' has manual mapping and exposes`);
                this.mapping[def.model] = [];

                if (['WXKG01LM', 'HS1EB/HS1EB-E', 'ICZB-KPD14S', 'TERNCY-SD01', 'TERNCY-PP01', 'ICZB-KPD18S',
                    'E1766', 'ZWallRemote0', 'ptvo.switch', '2AJZ4KPKEY', 'ZGRC-KEY-013', 'HGZB-02S', 'HGZB-045',
                    'HGZB-1S', 'AV2010/34', 'IM6001-BTP01', 'WXKG11LM', 'WXKG03LM', 'WXKG02LM', 'QBKG04LM', 'QBKG03LM',
                    'QBKG11LM', 'QBKG21LM', 'QBKG22LM', 'WXKG12LM', 'QBKG12LM', 'E1743'].includes(def.model)) {
                    // deprecated
                    this.mapping[def.model].push(cfg.sensor_click);
                }

                if (['ICTC-G-1'].includes(def.model)) {
                    // deprecated
                    this.mapping[def.model].push(cfg.sensor_brightness);
                }

                for (const expose of def.exposes) {
                    let discoveryEntry = null;
                    /* istanbul ignore else */
                    if (expose.type === 'light') {
                        discoveryEntry = {
                            type: 'light',
                            object_id: expose.endpoint ? `light_${expose.endpoint}` : 'light',
                            discovery_payload: {
                                brightness: !!expose.features.find((e) => e.name === 'brightness'),
                                color_temp: !!expose.features.find((e) => e.name === 'color_temp'),
                                xy: !!expose.features.find((e) => e.name === 'color_xy'),
                                hs: !!expose.features.find((e) => e.name === 'color_hs'),
                                schema: 'json',
                                command_topic: true,
                                brightness_scale: 254,
                                command_topic_prefix: expose.endpoint ? expose.endpoint : undefined,
                                state_topic_postfix: expose.endpoint ? expose.endpoint : undefined,
                            },
                        };

                        const effect = def.exposes.find((e) => e.type === 'enum' && e.name === 'effect');
                        if (effect) {
                            discoveryEntry.discovery_payload.effect = true;
                            discoveryEntry.discovery_payload.effect_list = effect.values;
                        }
                    } else if (expose.type === 'switch') {
                        discoveryEntry = {
                            type: 'switch',
                            object_id: expose.endpoint ? `switch_${expose.endpoint}` : 'switch',
                            discovery_payload: {
                                payload_off: 'OFF',
                                payload_on: 'ON',
                                value_template: `{{ value_json.state${expose.endpoint ? `_${expose.endpoint}` : ''} }}`,
                                command_topic: true,
                                command_topic_prefix: expose.endpoint ? expose.endpoint : undefined,
                            },
                        };
                    } else if (expose.type === 'lock') {
                        assert(!expose.endpoint, `Endpoint not supported for lock type`);
                        discoveryEntry = {
                            type: 'lock',
                            object_id: 'lock',
                            discovery_payload: {
                                command_topic: true,
                                value_template: '{{ value_json.state }}',
                                state_locked: 'LOCK',
                                state_unlocked: 'UNLOCK',
                            },
                        };
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
                                value_template: '{{ value_json.position }}',
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
                        };

                        assert(!expose.endpoint, `Endpoint not supported for binary type`);

                        discoveryEntry = {
                            type: 'binary_sensor',
                            object_id: expose.name,
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
                            pressure: {device_class: 'pressure'},
                            power: {icon: 'mdi:flash'},
                            linkquality: {icon: 'mdi:signal'},
                            current: {icon: 'mdi:current-ac'},
                            voltage: {icon: 'mdi:alpha-v'},
                            current_phase_b: {icon: 'mdi:current-ac'},
                            voltage_phase_b: {icon: 'mdi:alpha-v'},
                            current_phase_c: {icon: 'mdi:current-ac'},
                            voltage_phase_c: {icon: 'mdi:alpha-v'},
                            energy: {icon: 'mdi:power-plug'},
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
                        };

                        assert(!expose.endpoint, `Endpoint not supported for numeric type`);

                        discoveryEntry = {
                            type: 'sensor',
                            object_id: expose.name,
                            discovery_payload: {
                                unit_of_measurement: expose.unit ? expose.unit : '-',
                                value_template: `{{ value_json.${expose.property} }}`,
                                ...lookup[expose.name],
                            },
                        };
                    } else if (expose.type === 'enum' || expose.type === 'text') {
                        if (expose.access === 'r' || expose.access === 'rw') {
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
            } else if (manualMaping.hasOwnProperty(def.model)) {
                this.mapping[def.model] = manualMaping[def.model];
            } else {
                logger.warn(`Supported device '${def.model}' has no Home Assistant mapping`);
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
            this.mqtt.publish(topic, null, {retain: true, qos: 0}, this.discoveryTopic);
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
                    for (const key of Object.keys(data.payload)) {
                        const keyMatch = endpointRegExp.exec(key);
                        if (keyMatch) {
                            payload[keyMatch[1]] = data.payload[key];
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
            const keys = ['action', 'click'].filter((k) => data.payload.hasOwnProperty(k) && data.payload[k] !== '');
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
            const keys = ['action', 'click'].filter((k) => data.payload[k] && data.payload[k] !== '');
            for (const key of keys) {
                const value = data.payload[key].toString();
                await this.publishDeviceTriggerDiscover(data.entity, key, value);
                await this.mqtt.publish(`${data.entity.name}/${key}`, value, {});
            }
        }

        /**
         * Publish a value for update_available (if not there yet) to prevent Home Assistant generating warnings of
         * this value not being available.
         */
        const supportsOTA = data.entity.definition && data.entity.definition.hasOwnProperty('ota');
        const mockedValues = [
            {
                property: 'update_available',
                condition: supportsOTA && this.legacyApi,
                value: false,
            },
            {
                property: 'update',
                condition: supportsOTA && this.newApi,
                value: {state: 'idle'},
            },
            {
                property: 'water_leak',
                condition: data.entity.device && data.entity.definition && this.mapping[data.entity.definition.model] &&
                    this.mapping[data.entity.definition.model].filter((c) => c.object_id === 'water_leak').length === 1,
                value: false,
            },
        ];

        for (const entry of mockedValues) {
            if (entry.condition && !data.payload.hasOwnProperty(entry.property)) {
                logger.debug(`Mocking '${entry.property}' value for Home Assistant`);
                this.publishEntityState(data.entity.device.ieeeAddr, {[entry.property]: entry.value});
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
                this.mqtt.publish(topic, null, {retain: true, qos: 0}, this.discoveryTopic);
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
        if (!resolvedEntity.definition.hasOwnProperty('exposes')) {
            // Exposes already has linkquality.
            configs.push(cfg.sensor_linkquality);
        }

        if (resolvedEntity.definition.hasOwnProperty('ota')) {
            if (this.legacyApi) {
                configs.push(cfg.binary_sensor_update_available);
            }

            if (this.newApi) {
                configs.push(cfg.sensor_update_state);
            }
        }

        if (resolvedEntity.settings.hasOwnProperty('legacy') && !resolvedEntity.settings.legacy) {
            configs = configs.filter((c) => c !== cfg.sensor_click);
        }

        if (!settings.get().advanced.homeassistant_legacy_triggers) {
            configs = configs.filter((c) => c.object_id !== 'action' && c.object_id !== 'click');
        }

        // deep clone of the config objects
        configs = JSON.parse(JSON.stringify(configs));

        if (resolvedEntity.settings.hasOwnProperty('homeassistant')) {
            configs.forEach((config) => {
                const configOverride = resolvedEntity.settings.homeassistant[config.object_id];
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
            const nameSeparator = friendlyName.includes(' ') ? ' ' : '_';
            payload.name = `${friendlyName}${nameSeparator}${config.object_id}`;

            // Set unique_id
            payload.unique_id = `${resolvedEntity.settings.ID}_${config.object_id}_${settings.get().mqtt.base_topic}`;

            // Attributes for device registry
            payload.device = this.getDevicePayload(resolvedEntity);

            // Availability payload
            payload.availability = [
                {topic: `${settings.get().mqtt.base_topic}/bridge/state`},
                {topic: `${settings.get().mqtt.base_topic}/${friendlyName}/availability`},
            ];

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
            this.mqtt.publish(topic, stringify(payload), {retain: true, qos: 0}, this.discoveryTopic);
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

            if (clear) {
                logger.debug(`Clearing Home Assistant config '${topic}'`);
                topic = topic.substring(this.discoveryTopic.length + 1);
                this.mqtt.publish(topic, null, {retain: true, qos: 0}, this.discoveryTopic);
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

    getDiscoveryTopic(config, device) {
        return `${config.type}/${device.ieeeAddr}/${config.object_id}/config`;
    }

    async publishDeviceTriggerDiscover(entity, key, value, force=false) {
        const device = entity.device;
        if (!this.discoveredTriggers[device.ieeeAddr]) {
            this.discoveredTriggers[device.ieeeAddr] = new Set();
        }

        const discoveredKey = `${key}_${value}`;
        if (this.discoveredTriggers[device.ieeeAddr].has(discoveredKey) && !force) {
            return;
        }

        const config = cfg[`trigger_${key}`];
        config.object_id = `${key}_${value}`;
        const topic = this.getDiscoveryTopic(config, device);
        const payload = {
            ...config.discovery_payload,
            subtype: value,
            payload: value,
            topic: `${settings.get().mqtt.base_topic}/${entity.name}/${key}`,
            device: this.getDevicePayload(entity),
        };

        await this.mqtt.publish(topic, stringify(payload), {retain: true, qos: 0}, this.discoveryTopic);
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
