const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');
const zigbee2mqttVersion = require('../../package.json').version;
const Extension = require('./extension');
const objectAssignDeep = require(`object-assign-deep`);
const stringify = require('json-stable-stringify');
const discoveryRegex = new RegExp(`homeassistant/(.*)/(.*)/(.*)/config`);

const cfg = {
    // Binary sensor
    'binary_sensor_occupancy': {
        type: 'binary_sensor',
        object_id: 'occupancy',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.occupancy }}',
            device_class: 'motion',
        },
    },
    'binary_sensor_sos': {
        type: 'binary_sensor',
        object_id: 'sos',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.sos }}',
        },
    },
    'binary_sensor_alarm': {
        type: 'binary_sensor',
        object_id: 'alarm',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.alarm }}',
        },
    },
    'binary_sensor_temperature_alarm': {
        type: 'binary_sensor',
        object_id: 'temperature_alarm',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.temperature_alarm }}',
        },
    },
    'binary_sensor_humidity_alarm': {
        type: 'binary_sensor',
        object_id: 'humidity_alarm',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.humidity_alarm }}',
        },
    },
    'binary_sensor_presence': {
        type: 'binary_sensor',
        object_id: 'presence',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.presence }}',
            device_class: 'presence',
        },
    },
    'binary_sensor_tamper': {
        type: 'binary_sensor',
        object_id: 'tamper',
        discovery_payload: {
            payload_on: false,
            payload_off: true,
            value_template: '{{ value_json.tamper }}',
        },
    },
    'binary_sensor_contact': {
        type: 'binary_sensor',
        object_id: 'contact',
        discovery_payload: {
            payload_on: false,
            payload_off: true,
            value_template: '{{ value_json.contact }}',
            device_class: 'door',
        },
    },
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
    'binary_sensor_smoke': {
        type: 'binary_sensor',
        object_id: 'smoke',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.smoke }}',
            device_class: 'smoke',
        },
    },
    'binary_sensor_gas': {
        type: 'binary_sensor',
        object_id: 'gas',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.gas }}',
            device_class: 'gas',
        },
    },
    'binary_sensor_carbon_monoxide': {
        type: 'binary_sensor',
        object_id: 'carbon_monoxide',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.carbon_monoxide }}',
            device_class: 'safety',
        },
    },
    'binary_sensor_led': {
        type: 'binary_sensor',
        object_id: 'led',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.led }}',
            device_class: 'light',
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
    'binary_sensor_moving': {
        type: 'binary_sensor',
        object_id: 'moving',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.moving}}',
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
    'binary_sensor_lock': {
        type: 'binary_sensor',
        object_id: 'lock',
        discovery_payload: {
            payload_on: 'UNLOCK',
            payload_off: 'LOCK',
            value_template: '{{ value_json.state}}',
            device_class: 'lock',
        },
    },
    'binary_sensor_lock_reverse': {
        type: 'binary_sensor',
        object_id: 'lock_reverse',
        discovery_payload: {
            payload_on: 'UNLOCK',
            payload_off: 'LOCK',
            value_template: '{{ value_json.reverse}}',
            device_class: 'lock',
        },
    },
    'binary_sensor_power_alarm_active': {
        type: 'binary_sensor',
        object_id: 'power_alarm_active',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.power_alarm_active}}',
            device_class: 'power',
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
    'sensor_illuminance': {
        type: 'sensor',
        object_id: 'illuminance',
        discovery_payload: {
            unit_of_measurement: '-',
            device_class: 'illuminance',
            value_template: '{{ value_json.illuminance }}',
        },
    },
    'sensor_illuminance_lux_unit': {
        type: 'sensor',
        object_id: 'illuminance',
        discovery_payload: {
            unit_of_measurement: 'lx',
            device_class: 'illuminance',
            value_template: '{{ value_json.illuminance }}',
        },
    },
    'sensor_illuminance_lux': {
        type: 'sensor',
        object_id: 'illuminance_lux',
        discovery_payload: {
            unit_of_measurement: 'lx',
            device_class: 'illuminance',
            value_template: '{{ value_json.illuminance_lux }}',
        },
    },
    'sensor_humidity': {
        type: 'sensor',
        object_id: 'humidity',
        discovery_payload: {
            unit_of_measurement: '%',
            device_class: 'humidity',
            value_template: '{{ value_json.humidity }}',
        },
    },
    'sensor_eco2': {
        type: 'sensor',
        object_id: 'eco2',
        discovery_payload: {
            unit_of_measurement: 'ppm',
            icon: 'mdi:air-filter',
            value_template: '{{ value_json.eco2 }}',
        },
    },
    'sensor_voc': {
        type: 'sensor',
        object_id: 'voc',
        discovery_payload: {
            unit_of_measurement: 'ppb',
            icon: 'mdi:air-filter',
            value_template: '{{ value_json.voc }}',
        },
    },
    'sensor_temperature': {
        type: 'sensor',
        object_id: 'temperature',
        discovery_payload: {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            value_template: '{{ value_json.temperature }}',
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
    'sensor_pressure': {
        type: 'sensor',
        object_id: 'pressure',
        discovery_payload: {
            unit_of_measurement: 'hPa',
            device_class: 'pressure',
            value_template: '{{ value_json.pressure }}',
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
    'sensor_current': {
        type: 'sensor',
        object_id: 'current',
        discovery_payload: {
            unit_of_measurement: 'A',
            icon: 'mdi:current-ac',
            value_template: '{{ value_json.current }}',
        },
    },
    'sensor_voltage': {
        type: 'sensor',
        object_id: 'voltage',
        discovery_payload: {
            unit_of_measurement: 'V',
            icon: 'mdi:alpha-v',
            value_template: '{{ value_json.voltage }}',
        },
    },
    'sensor_current_phase_b': {
        type: 'sensor',
        object_id: 'current_phase_b',
        discovery_payload: {
            unit_of_measurement: 'A',
            icon: 'mdi:current-ac',
            value_template: '{{ value_json.current_phase_b }}',
        },
    },
    'sensor_voltage_phase_b': {
        type: 'sensor',
        object_id: 'voltage_phase_b',
        discovery_payload: {
            unit_of_measurement: 'V',
            icon: 'mdi:alpha-v',
            value_template: '{{ value_json.voltage_phase_b }}',
        },
    },
    'sensor_current_phase_c': {
        type: 'sensor',
        object_id: 'current_phase_c',
        discovery_payload: {
            unit_of_measurement: 'A',
            icon: 'mdi:current-ac',
            value_template: '{{ value_json.current_phase_c }}',
        },
    },
    'sensor_voltage_phase_c': {
        type: 'sensor',
        object_id: 'voltage_phase_c',
        discovery_payload: {
            unit_of_measurement: 'V',
            icon: 'mdi:alpha-v',
            value_template: '{{ value_json.voltage_phase_c }}',
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
    'sensor_action': {
        type: 'sensor',
        object_id: 'action',
        discovery_payload: {
            icon: 'mdi:gesture-double-tap',
            value_template: '{{ value_json.action }}',
        },
    },
    'sensor_action_color': {
        type: 'sensor',
        object_id: 'action_color',
        discovery_payload: {
            value_template: '{{ value_json.action_color }}',
            icon: 'mdi:palette',
        },
    },
    'sensor_action_color_temperature': {
        type: 'sensor',
        object_id: 'action_color_temperature',
        discovery_payload: {
            value_template: '{{ value_json.action_color_temperature }}',
            icon: 'hass:thermometer',
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
    'sensor_lock': {
        type: 'sensor',
        object_id: 'lock',
        discovery_payload: {
            icon: 'mdi:lock',
            value_template: '{{ value_json.inserted }}',
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
    'sensor_gas_density': {
        type: 'sensor',
        object_id: 'gas_density',
        discovery_payload: {
            value_template: '{{ value_json.gas_density }}',
            icon: 'mdi:google-circles-communities',
        },
    },
    'sensor_smoke_density': {
        type: 'sensor',
        object_id: 'smoke_density',
        discovery_payload: {
            value_template: '{{ value_json.smoke_density }}',
            icon: 'mdi:google-circles-communities',
        },
    },
    'sensor_cover': {
        type: 'sensor',
        object_id: 'cover',
        discovery_payload: {
            value_template: '{{ value_json.position }}',
            icon: 'mdi:view-array',
        },
    },
    'sensor_consumption': {
        type: 'sensor',
        object_id: 'consumption',
        discovery_payload: {
            unit_of_measurement: 'kWh',
            value_template: '{{ value_json.consumption }}',
            icon: 'mdi:flash',
        },
    },
    'sensor_sensitivity': {
        type: 'sensor',
        object_id: 'sensitivity',
        discovery_payload: {
            value_template: '{{ value_json.sensitivity }}',
            icon: 'mdi:filter-variant',
        },
    },
    'sensor_strength': {
        type: 'sensor',
        object_id: 'strength',
        discovery_payload: {
            value_template: '{{ value_json.strength }}',
            icon: 'mdi:weight',
        },
    },
    'sensor_requested_brightness_level': {
        type: 'sensor',
        object_id: 'requested_brightness_level',
        discovery_payload: {
            value_template: '{{ value_json.requested_brightness_level }}',
            icon: 'mdi:brightness-5',
        },
    },
    'sensor_requested_brightness_percent': {
        type: 'sensor',
        object_id: 'requested_brightness_percent',
        discovery_payload: {
            value_template: '{{ value_json.requested_brightness_percent }}',
            icon: 'mdi:brightness-5',
        },
    },
    'sensor_radioactive_events_per_minute': {
        type: 'sensor',
        object_id: 'radioactive_events_per_minute',
        discovery_payload: {
            value_template: '{{ value_json.radioactive_events_per_minute }}',
        },
    },
    'sensor_radiation_dose_per_hour': {
        type: 'sensor',
        object_id: 'radiation_dose_per_hour',
        discovery_payload: {
            value_template: '{{ value_json.radiation_dose_per_hour }}',
        },
    },
    'sensor_direction': {
        type: 'sensor',
        object_id: 'direction',
        discovery_payload: {
            value_template: '{{ value_json.direction }}',
            icon: 'mdi:rotate-3d-variant',
        },
    },
    'sensor_co2': {
        type: 'sensor',
        object_id: 'co2',
        discovery_payload: {
            unit_of_measurement: 'ppm',
            value_template: '{{ value_json.co2 }}',
            icon: 'mdi:molecule-co2',
        },
    },

    // Light
    'light_brightness_colortemp_colorxy': {
        type: 'light',
        object_id: 'light',
        discovery_payload: {
            brightness: true,
            color_temp: true,
            xy: true,
            schema: 'json',
            command_topic: true,
            brightness_scale: 254,
        },
    },
    'light_brightness_colorxy': {
        type: 'light',
        object_id: 'light',
        discovery_payload: {
            brightness: true,
            xy: true,
            schema: 'json',
            command_topic: true,
            brightness_scale: 254,
        },
    },
    'light_brightness_colortemp_colorhs': {
        type: 'light',
        object_id: 'light',
        discovery_payload: {
            brightness: true,
            color_temp: true,
            hs: true,
            schema: 'json',
            command_topic: true,
            brightness_scale: 254,
        },
    },
    'light_colorhs': {
        type: 'light',
        object_id: 'light',
        discovery_payload: {
            hs: true,
            schema: 'json',
            command_topic: true,
        },
    },
    'light_brightness_colortemp': {
        type: 'light',
        object_id: 'light',
        discovery_payload: {
            brightness: true,
            color_temp: true,
            schema: 'json',
            command_topic: true,
            brightness_scale: 254,
        },
    },
    'light_brightness': {
        type: 'light',
        object_id: 'light',
        discovery_payload: {
            brightness: true,
            schema: 'json',
            command_topic: true,
            brightness_scale: 254,
        },
    },

    // Switch
    'switch': {
        type: 'switch',
        object_id: 'switch',
        discovery_payload: {
            payload_off: 'OFF',
            payload_on: 'ON',
            value_template: '{{ value_json.state }}',
            command_topic: true,
        },
    },
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

    // Cover
    'cover': {
        type: 'cover',
        object_id: 'cover',
        discovery_payload: {
            command_topic: true,
            optimistic: true,
        },
    },
    'cover_position': {
        type: 'cover',
        object_id: 'cover',
        discovery_payload: {
            command_topic: true,
            position_topic: true,
            set_position_topic: true,
            set_position_template: '{ "position": {{ position }} }',
            value_template: '{{ value_json.position }}',
            state_topic: false,
        },
    },
    'cover_position_tilt': {
        type: 'cover',
        object_id: 'cover',
        discovery_payload: {
            state_topic: false,
            command_topic: true,
            set_position_topic: true,
            set_position_template: '{ "position": {{ position }} }',
            tilt_command_topic: true,
            position_topic: true,
            value_template: '{{ value_json.position }}',
            tilt_status_topic: true,
            tilt_status_template: '{{ value_json.tilt }}',
        },
    },

    // Lock
    'lock': {
        type: 'lock',
        object_id: 'lock',
        discovery_payload: {
            command_topic: true,
            value_template: '{{ value_json.state }}',
            state_locked: 'LOCK',
            state_unlocked: 'UNLOCK',
        },
    },
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

    // Fan
    'fan': {
        type: 'fan',
        object_id: 'fan',
        discovery_payload: {
            state_topic: true,
            state_value_template: '{{ value_json.fan_state }}',
            command_topic: true,
            command_topic_postfix: 'fan_state',
            speed_state_topic: true,
            speed_command_topic: true,
            speed_value_template: '{{ value_json.fan_mode }}',
            speeds: ['off', 'low', 'medium', 'high', 'on', 'auto', 'smart'],
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

const switchEndpoint = (endpointName) => {
    return {
        type: 'switch',
        object_id: `switch_${endpointName}`,
        discovery_payload: {
            payload_off: 'OFF',
            payload_on: 'ON',
            value_template: `{{ value_json.state_${endpointName} }}`,
            command_topic: true,
            command_topic_prefix: endpointName,
        },
    };
};

const lightEndpoint = (configType, endpointName) => {
    const config = objectAssignDeep.noMutate(cfg[configType]);
    config['object_id'] = `light_${endpointName}`;
    config['discovery_payload']['command_topic_prefix'] = endpointName;
    config['discovery_payload']['state_topic_postfix'] = endpointName;
    return config;
};

const sensorEndpoint = (endpointName) => {
    return {
        type: 'sensor',
        object_id: `sensor_${endpointName}`,
        discovery_payload: {
            value_template: `{{ value_json.${endpointName} }}`,
        },
    };
};


const climate = (minTemp=7, maxTemp=30, temperatureStateProperty='occupied_heating_setpoint',
    tempStep=1, systemModes=['off', 'auto', 'heat'], fanModes=[], holdModes=[],
    temperatureLowStateTopic=false, temperatureHighStateTopic=false ) => {
    const retVal = {
        type: 'climate',
        object_id: 'climate',
        discovery_payload: {
            state_topic: false,
            temperature_unit: 'C',
            min_temp: `${minTemp}`,
            max_temp: `${maxTemp}`,
            mode_state_topic: true,
            mode_state_template: '{{ value_json.system_mode }}',
            mode_command_topic: true,
            current_temperature_topic: true,
            current_temperature_template: '{{ value_json.local_temperature }}',
            temp_step: tempStep,
            action_topic: true,
            action_template:
                '{% set values = {\'idle\':\'off\',\'heat\':\'heating\',\'cool\':\'cooling\',\'fan only\':\'fan\'}'+
                ' %}{{ values[value_json.running_state] }}',
        },
    };
    // system_modes empty <=> use auto (in other case ha ui is showing all modes)
    if (systemModes.length > 0) {
        retVal.discovery_payload.modes = systemModes;
    } else {
        retVal.discovery_payload.modes = ['auto'];
    }
    // hold_modes empty <=> don't use presets
    if (holdModes.length > 0) {
        retVal.discovery_payload.hold_modes = holdModes;
        retVal.discovery_payload.hold_command_topic = true;
        retVal.discovery_payload.hold_state_template = `{{ value_json.preset }}`;
        retVal.discovery_payload.hold_state_topic = true;
    }
    // fan_modes empty <=> don't use fan modes
    if (fanModes.length > 0) {
        retVal.discovery_payload.fan_modes = fanModes;
        retVal.discovery_payload.fan_mode_command_topic = true;
        retVal.discovery_payload.fan_mode_state_template = `{{ value_json.fan_mode }}`;
        retVal.discovery_payload.fan_mode_state_topic = true;
    }
    // if no high and low temp used then use temperature_state_topic
    if (!temperatureHighStateTopic && !temperatureLowStateTopic) {
        retVal.discovery_payload.temperature_state_topic = true;
        retVal.discovery_payload.temperature_state_template = `{{ value_json.${temperatureStateProperty} }}`;
        retVal.discovery_payload.temperature_command_topic = temperatureStateProperty;
    }
    // use low target temperature
    if (temperatureLowStateTopic) {
        retVal.discovery_payload.temperature_low_state_topic = temperatureLowStateTopic;
        retVal.discovery_payload.temperature_low_state_template = `{{ value_json.occupied_heating_setpoint }}`;
        retVal.discovery_payload.temperature_low_command_topic = 'occupied_heating_setpoint';
    }
    // use high target temperature
    if (temperatureHighStateTopic) {
        retVal.discovery_payload.temperature_high_state_topic = temperatureHighStateTopic;
        retVal.discovery_payload.temperature_high_state_template = `{{ value_json.occupied_cooling_setpoint }}`;
        retVal.discovery_payload.temperature_high_command_topic = 'occupied_cooling_setpoint';
    }
    return retVal;
};


// Map Home Assistant configurations to devices.
const mapping = {
    'WXKG01LM': [cfg.sensor_click, cfg.sensor_action, cfg.sensor_battery],
    'WXKG11LM': [cfg.sensor_click, cfg.sensor_action, cfg.sensor_battery],
    'WXKG12LM': [cfg.sensor_click, cfg.sensor_action, cfg.sensor_battery],
    'WXKG03LM': [cfg.sensor_click, cfg.sensor_action, cfg.sensor_battery],
    'WXKG06LM': [cfg.sensor_battery, cfg.sensor_action],
    'WXKG02LM': [cfg.sensor_click, cfg.sensor_action, cfg.sensor_battery],
    'QBKG04LM': [cfg.switch, cfg.sensor_click, cfg.sensor_action],
    'QBKG03LM': [
        switchEndpoint('left'), switchEndpoint('right'), cfg.sensor_click, cfg.sensor_action, cfg.sensor_temperature,
    ],
    'WSDCGQ01LM': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'WSDCGQ11LM': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_pressure, cfg.sensor_battery],
    'RTCGQ01LM': [cfg.binary_sensor_occupancy, cfg.sensor_battery],
    'RTCGQ11LM': [cfg.binary_sensor_occupancy, cfg.sensor_illuminance_lux_unit, cfg.sensor_battery],
    'MCCGQ01LM': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'MCCGQ11LM': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'SJCGQ11LM': [cfg.binary_sensor_water_leak, cfg.sensor_battery],
    'MFKZQ01LM': [cfg.sensor_action, cfg.sensor_battery],
    'ZNCZ02LM': [cfg.switch, cfg.sensor_power, cfg.sensor_temperature, cfg.sensor_consumption, cfg.sensor_voltage],
    'QBCZ11LM': [cfg.switch, cfg.sensor_power],
    'LED1545G12': [cfg.light_brightness_colortemp],
    'LED1623G12': [cfg.light_brightness],
    'LED1622G12': [cfg.light_brightness],
    'LED1537R6/LED1739R5': [cfg.light_brightness_colortemp],
    'LED1650R5': [cfg.light_brightness],
    'LED1536G5': [cfg.light_brightness_colortemp],
    '7299760PH': [cfg.light_brightness_colorxy],
    '7146060PH': [cfg.light_brightness_colortemp_colorxy],
    '7602031P7': [cfg.light_brightness_colortemp_colorxy],
    '046677476816': [cfg.light_brightness],
    'F7C033': [cfg.light_brightness],
    'JTYJ-GD-01LM/BW': [cfg.binary_sensor_smoke, cfg.sensor_battery, cfg.sensor_sensitivity, cfg.sensor_smoke_density],
    'PLUG EDP RE:DY': [cfg.switch, cfg.sensor_power],
    'SWITCH EDP RE:DY': [cfg.switch],
    'CC2530.ROUTER': [cfg.binary_sensor_led],
    'AA70155': [cfg.light_brightness_colortemp],
    'A9A19A60WESDZ02': [cfg.light_brightness_colortemp],
    'A9BR3065WESDZ02': [cfg.light_brightness_colortemp],
    '4058075816718': [cfg.light_brightness_colortemp_colorxy],
    'AA69697': [cfg.light_brightness_colortemp_colorxy],
    'HALIGHTDIMWWE27': [cfg.light_brightness],
    'HALIGHTDIMWWB22': [cfg.light_brightness],
    'AB3257001NJ': [cfg.switch],
    'AC10691': [cfg.switch],
    '8718696449691': [cfg.light_brightness],
    'RB 185 C': [cfg.light_brightness_colortemp_colorxy],
    'BY 185 C': [cfg.light_brightness_colortemp_colorxy],
    '9290012573A': [cfg.light_brightness_colortemp_colorxy],
    'LED1624G9': [cfg.light_brightness_colorxy],
    'LED1837R5': [cfg.light_brightness],
    '73742': [cfg.light_brightness_colortemp],
    '73740': [cfg.light_brightness_colortemp],
    '73739': [cfg.light_brightness_colortemp_colorxy],
    '72569': [cfg.light_brightness_colortemp],
    '72567': [cfg.light_brightness_colortemp],
    '75541': [cfg.light_brightness_colortemp_colorxy],
    '22670': [cfg.light_brightness],
    'ICTC-G-1': [cfg.sensor_brightness, cfg.sensor_battery, cfg.sensor_action],
    'ICPSHC24-30EU-IL-1': [cfg.light_brightness],
    '45852GE': [cfg.light_brightness],
    'E11-G13': [cfg.light_brightness],
    'LED1649C5': [cfg.light_brightness],
    'ICPSHC24-10EU-IL-1': [cfg.light_brightness],
    'LED1546G12': [cfg.light_brightness_colortemp],
    'L1527': [cfg.light_brightness_colortemp],
    'L1529': [cfg.light_brightness_colortemp],
    'L1528': [cfg.light_brightness_colortemp],
    'L1531': [cfg.light_brightness_colortemp],
    'RB 165': [cfg.light_brightness],
    'RB 175 W': [cfg.light_brightness],
    'RS 125': [cfg.light_brightness],
    'RS 225': [cfg.light_brightness],
    'RB 145': [cfg.light_brightness],
    'RB 245': [cfg.light_brightness],
    'PL 110': [cfg.light_brightness],
    'ST 110': [cfg.light_brightness],
    'UC 110': [cfg.light_brightness],
    'DL 110 N': [cfg.light_brightness],
    'DL 110 W': [cfg.light_brightness],
    'SL 110 N': [cfg.light_brightness],
    'SL 110 M': [cfg.light_brightness],
    'SL 110 W': [cfg.light_brightness],
    'AE 260': [cfg.light_brightness],
    'AA68199': [cfg.light_brightness_colortemp],
    'QBKG11LM': [cfg.switch, cfg.sensor_power, cfg.sensor_click, cfg.sensor_action, cfg.sensor_temperature],
    'QBKG21LM': [cfg.switch, cfg.sensor_click, cfg.sensor_action],
    'QBKG22LM': [switchEndpoint('left'), switchEndpoint('right'), cfg.sensor_action, cfg.sensor_click],
    'QBKG12LM': [
        switchEndpoint('left'), switchEndpoint('right'), cfg.sensor_power, cfg.sensor_click,
        cfg.sensor_temperature, cfg.sensor_action,
    ],
    'K2RGBW01': [cfg.light_brightness_colortemp_colorxy],
    '9290011370': [cfg.light_brightness],
    'Z809A': [cfg.switch, cfg.sensor_power],
    'NL08-0800': [cfg.light_brightness],
    '98425031': [cfg.light_brightness],
    '915005106701': [cfg.light_brightness_colortemp_colorxy],
    'Aj_Zigbee_Led_Strip': [cfg.light_brightness_colortemp_colorxy],
    'AB32840': [cfg.light_brightness_colortemp],
    '8718696485880': [cfg.light_brightness_colortemp_colorxy],
    '8718696598283': [cfg.light_brightness_colortemp],
    '8718696695203': [cfg.light_brightness_colortemp],
    '73693': [cfg.light_brightness_colortemp_colorxy],
    '324131092621': [cfg.sensor_action, cfg.sensor_battery],
    '9290012607': [
        cfg.binary_sensor_occupancy, cfg.sensor_temperature, cfg.sensor_illuminance, cfg.sensor_illuminance_lux,
        cfg.sensor_battery,
    ],
    'GL-C-008-1ID': [cfg.light_brightness_colortemp_colorxy],
    'GL-C-009': [cfg.light_brightness],
    'STSS-MULT-001': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'E11-G23/E11-G33': [cfg.light_brightness],
    'E11-N13/E11-N13A/E11-N14/E11-N14A': [cfg.light_brightness],
    'E1ACA4ABE38A': [cfg.light_brightness],
    'AC03645': [cfg.light_brightness_colortemp_colorhs],
    'AC03641': [cfg.light_brightness],
    'AC03648': [cfg.light_brightness_colortemp],
    'FB56+ZSW05HG1.2': [cfg.switch],
    '72922-A': [cfg.switch],
    'AC03642': [cfg.light_brightness_colortemp],
    'AC08560': [cfg.light_brightness],
    'AC10786-DIM': [cfg.light_brightness],
    'DNCKATSD001': [cfg.light_brightness],
    'DNCKATSW001': [cfg.switch],
    'DNCKATSW002': [switchEndpoint('left'), switchEndpoint('right')],
    'DNCKATSW003': [switchEndpoint('left'), switchEndpoint('right'), switchEndpoint('center')],
    'DNCKATSW004': [
        switchEndpoint('bottom_left'), switchEndpoint('bottom_right'),
        switchEndpoint('top_left'), switchEndpoint('top_right'),
    ],
    'BY 165': [cfg.light_brightness],
    'ZLED-2709': [cfg.light_brightness],
    '8718696548738': [cfg.light_brightness_colortemp],
    '915005587401': [cfg.light_brightness_colortemp],
    '3435011P7': [cfg.light_brightness_colortemp],
    '4052899926110': [cfg.light_brightness_colortemp_colorxy],
    'Z01-CIA19NAE26': [cfg.light_brightness],
    'E11-N1EA': [cfg.light_brightness_colortemp_colorxy],
    'E11-U2E': [cfg.light_brightness_colortemp_colorxy],
    '74283': [cfg.light_brightness],
    'JTQJ-BF-01LM/BW': [cfg.binary_sensor_gas, cfg.sensor_gas_density, cfg.sensor_sensitivity],
    '50043': [cfg.switch],
    '50044/50045': [cfg.light_brightness],
    'AV2010/22': [cfg.binary_sensor_occupancy, cfg.sensor_battery],
    '3210-L': [cfg.switch, cfg.sensor_power, cfg.sensor_current, cfg.sensor_voltage],
    '3320-L': [cfg.binary_sensor_contact, cfg.sensor_temperature, cfg.sensor_battery],
    '3326-L': [cfg.binary_sensor_occupancy, cfg.sensor_temperature, cfg.sensor_battery],
    '7299355PH': [cfg.light_brightness_colorxy],
    '45857GE': [cfg.light_brightness],
    'A6121': [cfg.sensor_lock],
    '433714': [cfg.light_brightness_colortemp],
    '3261030P7': [cfg.light_brightness_colortemp],
    '3216431P5': [cfg.light_brightness_colortemp],
    'DJT11LM': [cfg.sensor_action, cfg.sensor_battery, cfg.sensor_sensitivity, cfg.sensor_strength],
    'E1603/E1702': [cfg.switch],
    '7199960PH': [cfg.light_brightness_colorxy],
    '74696': [cfg.light_brightness],
    'AB35996': [cfg.light_brightness_colortemp_colorxy],
    'AB401130055': [cfg.light_brightness_colortemp],
    '74282': [cfg.light_brightness_colortemp],
    'RS 128 T': [cfg.light_brightness_colortemp],
    '53170161': [cfg.light_brightness_colortemp],
    '4058075036147': [cfg.light_brightness_colortemp_colorxy],
    'KS-SM001': [cfg.switch],
    'MG-AUWS01': [switchEndpoint('left'), switchEndpoint('right')],
    '9290002579A': [cfg.light_brightness_colortemp_colorxy],
    '4256251-RZHAC': [cfg.switch, cfg.sensor_power],
    '4257050-ZHAC': [cfg.light_brightness, cfg.sensor_power, cfg.sensor_current, cfg.sensor_voltage],
    'STS-PRS-251': [cfg.binary_sensor_presence, cfg.sensor_battery],
    'STSS-PRES-001': [cfg.binary_sensor_presence, cfg.sensor_battery],
    '4058075816794': [cfg.light_brightness_colortemp],
    '4052899926158': [cfg.light_brightness],
    '4058075036185': [cfg.light_brightness_colortemp_colorxy],
    '50049': [cfg.light_brightness_colortemp_colorxy],
    '500.47': [cfg.light_brightness_colortemp_colorxy],
    '915005733701': [cfg.light_brightness_colortemp_colorxy],
    'RB 285 C': [cfg.light_brightness_colortemp_colorxy],
    '3216331P5': [cfg.light_brightness_colortemp],
    'AC08562': [cfg.light_brightness],
    '900008-WW': [cfg.light_brightness],
    'Mega23M12': [lightEndpoint('light_brightness_colortemp_colorxy', 'rgb'),
        lightEndpoint('light_brightness', 'white')],
    'PSS-23ZBS': [cfg.switch],
    'HS1SA-M': [cfg.binary_sensor_smoke, cfg.binary_sensor_battery_low],
    'Z01-A19NAE26': [cfg.light_brightness_colortemp],
    'Z01-A60EAE27': [cfg.light_brightness_colortemp],
    'AC01353010G': [
        cfg.binary_sensor_occupancy, cfg.binary_sensor_tamper,
        cfg.sensor_temperature, cfg.binary_sensor_battery_low,
    ],
    'SP 120': [cfg.switch, cfg.sensor_power, cfg.sensor_energy],
    'SP 222': [cfg.switch],
    'RB 248 T': [cfg.light_brightness_colortemp],
    'HS3SA': [cfg.binary_sensor_smoke, cfg.binary_sensor_battery_low],
    'HS1DS/HS3DS': [cfg.binary_sensor_contact],
    'HS1WL/HS3WL': [cfg.binary_sensor_water_leak],
    'HS1-WL-E': [cfg.binary_sensor_water_leak],
    '421786': [cfg.light_brightness],
    'ICZB-IW11D': [cfg.light_brightness],
    '3321-S': [cfg.binary_sensor_contact, cfg.sensor_temperature, cfg.sensor_battery],
    'ZPIR-8000': [cfg.binary_sensor_occupancy, cfg.sensor_battery],
    'ZCTS-808': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'ZNLDP12LM': [cfg.light_brightness_colortemp],
    'XDD12LM': [cfg.light_brightness_colortemp],
    'XDD13LM': [cfg.light_brightness_colortemp],
    'D1821': [cfg.light_brightness_colortemp_colorxy],
    'ZNCLDJ11LM': [cfg.cover_position, cfg.sensor_cover],
    'TS0601_curtain': [cfg.cover_position],
    'LTFY004': [cfg.light_brightness_colorxy],
    'GL-S-007Z': [cfg.light_brightness_colortemp_colorxy],
    '3325-S': [cfg.sensor_temperature, cfg.binary_sensor_occupancy],
    '4713407': [cfg.light_brightness],
    '464800': [cfg.light_brightness_colortemp],
    '3261331P7': [cfg.light_brightness_colortemp],
    '4033930P7': [cfg.light_brightness_colortemp],
    '4023330P7': [cfg.light_brightness_colortemp],
    'GL-B-008Z': [cfg.light_brightness_colortemp_colorxy],
    'AV2010/25': [cfg.switch, cfg.sensor_power],
    'E12-N14': [cfg.light_brightness],
    '1TST-EU': [climate(), cfg.sensor_battery],
    'RB 178 T': [cfg.light_brightness_colortemp],
    '45856GE': [cfg.switch],
    'GL-D-003Z': [cfg.light_brightness_colortemp_colorxy],
    'GL-D-005Z': [cfg.light_brightness_colortemp_colorxy],
    'GD-CZ-006': [cfg.light_brightness],
    'AIRAM-CTR.U': [],
    'HGZB-20-DE': [cfg.switch],
    'D1531': [cfg.light_brightness],
    'D1532': [cfg.light_brightness],
    'D1533': [cfg.light_brightness],
    'AV2010/32': [climate(7, 30, 'occupied_heating_setpoint', 0.5), cfg.sensor_battery],
    'HGZB-07A': [cfg.light_brightness_colortemp_colorxy],
    'E1524/E1810': [cfg.sensor_action, cfg.sensor_battery],
    'GL-C-006': [cfg.light_brightness_colortemp],
    'GL-C-007-1ID': [cfg.light_brightness_colortemp_colorxy],
    'GL-C-007-2ID': [lightEndpoint('light_brightness_colortemp_colorxy', 'rgb'),
        lightEndpoint('light_brightness', 'white')],
    'GL-C-008-2ID': [lightEndpoint('light_brightness_colorxy', 'rgb'),
        lightEndpoint('light_brightness_colortemp', 'cct')],
    'GL-C-007S': [cfg.light_brightness_colorxy],
    'NLG-CCT light': [cfg.light_brightness_colortemp],
    'AC0251100NJ/AC0251700NJ': [cfg.sensor_action, cfg.sensor_battery],
    '71831': [cfg.light_brightness_colortemp],
    '404000/404005/404012': [cfg.light_brightness_colortemp_colorxy],
    '44435': [cfg.light_brightness_colortemp_colorxy],
    '404006/404008/404004': [cfg.light_brightness_colortemp],
    'MLI-404011': [cfg.sensor_action],
    'GL-S-003Z': [cfg.light_brightness_colorxy],
    'GL-S-005Z': [cfg.light_brightness_colortemp_colorxy],
    'HS1DS-E': [cfg.binary_sensor_contact],
    'SP600': [cfg.switch, cfg.sensor_power, cfg.sensor_energy],
    '1613V': [cfg.switch, cfg.sensor_power],
    'XVV-Mega23M12': [cfg.light_brightness_colortemp],
    'GL-B-007Z': [cfg.light_brightness_colortemp_colorxy],
    '81809/81813': [cfg.light_brightness_colortemp_colorxy],
    '4090130P7': [cfg.light_brightness_colortemp_colorxy],
    'NLG-RGBW light': [cfg.light_brightness_colortemp_colorxy],
    'NLG-RGBW light ': [cfg.light_brightness_colortemp_colorxy],
    'NLG-RGB-TW light': [cfg.light_brightness_colortemp_colorxy],
    'TI0001': [switchEndpoint('left'), switchEndpoint('right')],
    'SPZB0001': [climate(5, 30, 'current_heating_setpoint', 0.5), cfg.sensor_battery],
    'HS3CG': [cfg.binary_sensor_gas],
    '81825': [cfg.sensor_action],
    'Z809AF': [cfg.switch, cfg.sensor_power],
    'RADON TriTech ZB': [
        cfg.binary_sensor_occupancy, cfg.sensor_temperature, cfg.sensor_battery, cfg.binary_sensor_battery_low,
    ],
    '07005B': [cfg.light_brightness],
    '07004D': [cfg.light_brightness_colortemp_colorxy],
    '07008L': [cfg.light_brightness_colortemp_colorxy],
    'E1746': [],
    'LED1836G9': [cfg.light_brightness],
    'YRD426NRSC': [cfg.lock, cfg.sensor_battery],
    'BE468': [cfg.lock, cfg.sensor_battery],
    'YRD246HA20BP': [cfg.lock, cfg.sensor_battery],
    'E1743': [cfg.sensor_click, cfg.sensor_action, cfg.sensor_battery],
    'LED1732G11': [cfg.light_brightness_colortemp],
    'LED1736G9': [cfg.light_brightness_colortemp],
    'RB 265': [cfg.light_brightness],
    '9290019758': [
        cfg.binary_sensor_occupancy, cfg.sensor_temperature,
        cfg.sensor_illuminance, cfg.sensor_illuminance_lux, cfg.sensor_battery,
    ],
    'HGZB-042': [switchEndpoint('top'), switchEndpoint('bottom')],
    'HGZB-42': [switchEndpoint('top'), switchEndpoint('bottom')],
    'GL-FL-004TZ': [cfg.light_brightness_colortemp_colorxy],
    'GL-FL-004TZS': [cfg.light_brightness_colortemp_colorxy],
    'IM6001-OTP05': [cfg.switch],
    'SV01': [
        cfg.cover_position, cfg.sensor_temperature, cfg.sensor_pressure,
        cfg.sensor_battery,
    ],
    'SV02': [
        cfg.cover_position, cfg.sensor_temperature, cfg.sensor_pressure,
        cfg.sensor_battery,
    ],
    '316GLEDRF': [cfg.light_brightness],
    'LVS-ZB500D': [cfg.light_brightness],
    'ST218': [
        climate(5, 30, 'occupied_heating_setpoint', 0.5),
        cfg.sensor_local_temperature,
        cfg.lock_keypad_lockout,
    ],
    'E1525/E1745': [
        cfg.binary_sensor_occupancy, cfg.sensor_battery, cfg.sensor_requested_brightness_level,
        cfg.sensor_requested_brightness_percent,
    ],
    'ZYCT-202': [cfg.sensor_action],
    'GR-ZB01-W': [cfg.cover_position],
    '4090531P7': [cfg.light_brightness_colortemp_colorxy],
    'HGZB-42-UK / HGZB-41 / HGZB-41-UK': [cfg.switch],
    'ISW-ZPR1-WP13': [
        cfg.binary_sensor_occupancy, cfg.sensor_temperature,
        cfg.sensor_battery, cfg.binary_sensor_battery_low,
    ],
    '9290018195': [cfg.light_brightness],
    'HGZB-04D / HGZB-4D-UK': [cfg.light_brightness],
    'HGZB-043': [switchEndpoint('top'), switchEndpoint('bottom'), switchEndpoint('center')],
    'HGZB-44': [
        switchEndpoint('top_left'), switchEndpoint('top_right'), switchEndpoint('bottom_left'),
        switchEndpoint('bottom_right'),
    ],
    'NCZ-3043-HA': [
        cfg.binary_sensor_occupancy, cfg.sensor_temperature,
        cfg.sensor_battery, cfg.binary_sensor_battery_low,
    ],
    'NCZ-3041-HA': [
        cfg.binary_sensor_occupancy, cfg.sensor_temperature,
        cfg.sensor_battery, cfg.binary_sensor_battery_low,
    ],
    'NCZ-3045-HA': [
        cfg.binary_sensor_occupancy, cfg.sensor_temperature,
        cfg.sensor_battery, cfg.binary_sensor_battery_low,
    ],
    'STS-IRM-250': [
        cfg.binary_sensor_occupancy, cfg.sensor_temperature,
        cfg.sensor_battery, cfg.binary_sensor_battery_low,
    ],
    '3305-S': [
        cfg.binary_sensor_occupancy, cfg.sensor_temperature,
        cfg.sensor_battery, cfg.binary_sensor_battery_low,
    ],
    '3300-S': [
        cfg.sensor_temperature, cfg.binary_sensor_contact,
        cfg.sensor_battery, cfg.binary_sensor_battery_low,
    ],
    'IM6001-BTP01': [cfg.sensor_click, cfg.sensor_action, cfg.sensor_temperature, cfg.sensor_battery],
    'AV2010/34': [cfg.sensor_click, cfg.sensor_action],
    'PP-WHT-US': [
        cfg.switch, cfg.sensor_power,
        cfg.sensor_current, cfg.sensor_voltage,
    ],
    'CR701-YZ': [
        cfg.binary_sensor_battery_low, cfg.binary_sensor_carbon_monoxide,
        cfg.binary_sensor_gas,
    ],
    'HGZB-1S': [cfg.switch, cfg.sensor_click, cfg.sensor_action],
    'HGZB-045': [cfg.switch, cfg.sensor_click, cfg.sensor_action],
    'HGZB-43': [switchEndpoint('top'), switchEndpoint('bottom'), switchEndpoint('center')],
    'HGZB-01A': [cfg.switch],
    'HGZB-02A': [cfg.light_brightness],
    'MCT-350 SMA': [cfg.binary_sensor_contact],
    '3310-S': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'IM6001-WLP01': [
        cfg.sensor_temperature, cfg.binary_sensor_water_leak,
        cfg.sensor_battery,
    ],
    'WTR-UK-V2': [
        cfg.sensor_temperature, cfg.binary_sensor_water_leak,
        cfg.sensor_battery,
    ],
    '3315-S': [
        cfg.sensor_temperature, cfg.binary_sensor_water_leak,
        cfg.sensor_battery,
    ],
    'F-MLT-US-2': [
        cfg.sensor_temperature, cfg.binary_sensor_contact,
        cfg.sensor_battery, cfg.binary_sensor_battery_low, cfg.binary_sensor_moving,
    ],
    'SWO-KEF1PA': [cfg.sensor_action],
    'HGZB-02S': [cfg.sensor_click, cfg.sensor_action, cfg.switch],
    'HGZB-41': [cfg.switch],
    'ZG9101SAC-HP': [cfg.light_brightness],
    'RS 122': [cfg.light_brightness],
    'GL-B-001Z': [cfg.light_brightness_colortemp_colorxy],
    'IM6001-MTP01': [cfg.sensor_temperature, cfg.sensor_battery, cfg.binary_sensor_occupancy],
    'U86K31ND6': [switchEndpoint('left'), switchEndpoint('right'), switchEndpoint('center')],
    'HLD812-Z-SC': [cfg.light_brightness],
    'HLC610-Z': [cfg.light_brightness],
    'BY 285 C': [cfg.light_brightness_colortemp_colorxy],
    'HS1RC-M': [cfg.sensor_action, cfg.sensor_battery],
    'SWO-WDS1PA': [cfg.binary_sensor_contact],
    'LLKZMK11LM': [
        switchEndpoint('l1'), switchEndpoint('l2'),
        cfg.sensor_power, cfg.sensor_temperature, cfg.sensor_consumption,
    ],
    'T18W3Z': [switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3')],
    'LVS-SM10ZW': [cfg.binary_sensor_contact, cfg.binary_sensor_battery_low],
    'HS2SK': [cfg.switch, cfg.sensor_power],
    '45853GE': [cfg.switch, cfg.sensor_power],
    '50064': [cfg.light_brightness_colortemp],
    '9290011998B': [cfg.light_brightness_colortemp],
    '9290022167': [cfg.light_brightness_colortemp],
    '4096730U7': [cfg.light_brightness_colortemp],
    'RB 278 T': [cfg.light_brightness_colortemp],
    '3315-G': [
        cfg.sensor_temperature, cfg.sensor_battery, cfg.binary_sensor_water_leak,
    ],
    'N2G-SP': [cfg.sensor_power, cfg.switch, cfg.sensor_energy],
    'AC0363900NJ': [cfg.light_brightness_colortemp_colorxy],
    'LXZB-02A': [cfg.light_brightness],
    'GL-S-004Z': [cfg.light_brightness_colortemp],
    'SCM-5ZBS': [cfg.cover_position],
    'YRD226HA2619': [cfg.sensor_battery, cfg.lock],
    'YMF40/YDM4109+': [cfg.lock, cfg.sensor_battery],
    'V3-BTZB': [cfg.lock, cfg.sensor_battery],
    '3RSS008Z': [cfg.switch, cfg.sensor_battery],
    '3RSS007Z': [cfg.switch],
    '99432': [cfg.fan, cfg.light_brightness],
    '511.10': [cfg.light_brightness],
    'IM6001-MPP01': [
        cfg.sensor_temperature, cfg.binary_sensor_contact, cfg.sensor_battery,
    ],
    'HLC821-Z-SC': [cfg.light_brightness],
    'RS 228 T': [cfg.light_brightness_colortemp],
    'RS 229 T': [cfg.light_brightness_colortemp],
    '67200BL': [cfg.switch],
    'InstaRemote': [cfg.sensor_action],
    '100.425.90': [cfg.switch],
    '74580': [cfg.light_brightness],
    'HS1CA-E': [
        cfg.binary_sensor_carbon_monoxide, cfg.binary_sensor_battery_low,
        cfg.sensor_battery,
    ],
    'MCT-340 E': [cfg.binary_sensor_contact, cfg.sensor_temperature, cfg.sensor_battery],
    'MCT-340 SMA': [cfg.binary_sensor_contact, cfg.sensor_temperature, cfg.sensor_battery],
    'D1542': [cfg.light_brightness_colortemp],
    'ZGRC-KEY-013': [cfg.sensor_click, cfg.sensor_action],
    'ZigUP': [cfg.switch],
    'YRD256HA20BP': [cfg.sensor_battery, cfg.lock],
    'SZ-ESW01-AU': [cfg.sensor_power, cfg.switch],
    'PSM-29ZBSR': [cfg.switch, cfg.sensor_power],
    'ZM350STW1TCF': [cfg.light_brightness_colortemp],
    'M350STW1': [cfg.light_brightness],
    'A806S-Q1R': [cfg.light_brightness],
    'XY12S-15': [cfg.light_brightness_colortemp_colorxy],
    'B07KG5KF5R': [cfg.light_brightness_colortemp],
    'SCM-S1': [cfg.cover_position],
    'HEIMAN-M1': [cfg.binary_sensor_contact],
    '3216131P5': [cfg.light_brightness_colortemp],
    'ST8AU-CON': [cfg.light_brightness],
    'HS3MS': [cfg.binary_sensor_occupancy],
    'DIYRUZ_R4_5': [
        switchEndpoint('bottom_left'), switchEndpoint('bottom_right'), switchEndpoint('center'),
        switchEndpoint('top_left'), switchEndpoint('top_right'),
    ],
    'NCZ-3011-HA': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'MEAZON_BIZY_PLUG': [cfg.sensor_power, cfg.switch, cfg.sensor_temperature],
    'MEAZON_DINRAIL': [cfg.sensor_power, cfg.switch, cfg.sensor_temperature],
    'HS1CA-M': [cfg.binary_sensor_carbon_monoxide, cfg.binary_sensor_battery_low],
    '7099860PH': [cfg.light_brightness_colorxy],
    'HV-GSCXZB269': [cfg.light_brightness_colortemp],
    '3216231P5': [cfg.light_brightness_colortemp],
    'AC03647': [cfg.light_brightness_colortemp_colorhs],
    '12031': [cfg.cover_position],
    'LS12128': [cfg.cover_position],
    '421792': [cfg.light_brightness_colortemp_colorxy],
    'HGZB-06A': [cfg.light_brightness_colortemp_colorxy],
    'LED1733G7': [cfg.light_brightness_colortemp],
    '9290011370B': [cfg.light_brightness],
    'RB 250 C': [cfg.light_brightness_colortemp_colorxy],
    '8718696170625': [cfg.light_brightness],
    'GL-G-001Z': [cfg.light_brightness_colortemp_colorxy],
    'HV-GSCXZB279_HV-GSCXZB229': [cfg.light_brightness_colortemp],
    'HS2WD-E': [cfg.sensor_battery],
    'ZNMS12LM': [
        cfg.sensor_action, cfg.binary_sensor_lock, cfg.binary_sensor_lock_reverse,
    ],
    'ZNMS13LM': [
        cfg.sensor_action, cfg.binary_sensor_lock, cfg.binary_sensor_lock_reverse,
    ],
    'ZNMS11LM': [
        cfg.sensor_action, cfg.binary_sensor_lock, cfg.binary_sensor_lock_reverse,
    ],
    '12050': [cfg.switch, cfg.sensor_power],
    'ROB_200-004-0': [cfg.light_brightness],
    '4512700': [cfg.light_brightness],
    'RH3040': [cfg.sensor_battery, cfg.binary_sensor_occupancy],
    'DZ4743-00B': [cfg.switch],
    'GLSK3ZB-1711': [cfg.switch],
    'GLSK3ZB-1712': [switchEndpoint('top'), switchEndpoint('bottom')],
    'GLSK3ZB-1713': [switchEndpoint('top'), switchEndpoint('center'), switchEndpoint('bottom')],
    'GLSK6ZB-1714': [
        switchEndpoint('top_left'), switchEndpoint('bottom_left'),
        switchEndpoint('top_right'), switchEndpoint('bottom_right'),
    ],
    'GLSK6ZB-1715': [
        switchEndpoint('top_left'), switchEndpoint('center_left'), switchEndpoint('bottom_left'),
        switchEndpoint('top_right'), switchEndpoint('bottom_right'),
    ],
    'GLSK6ZB-1716': [
        switchEndpoint('top_left'), switchEndpoint('center_left'), switchEndpoint('bottom_left'),
        switchEndpoint('top_right'), switchEndpoint('center_right'), switchEndpoint('bottom_right'),
    ],
    '3306431P7': [cfg.light_brightness_colortemp],
    'AC08559': [cfg.light_brightness_colortemp_colorxy],
    'LVS-ZB15S': [cfg.switch],
    'LZL4BWHL01': [cfg.sensor_action],
    '2AJZ4KPKEY': [cfg.sensor_click, cfg.sensor_action, cfg.sensor_battery],
    '2AJZ4KPFT': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'TT001ZAV20': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'TS0002': [switchEndpoint('l1'), switchEndpoint('l2')],
    'LVS-SN10ZW': [cfg.sensor_battery, cfg.binary_sensor_occupancy],
    'LVS-ZB15R': [cfg.switch],
    'TH1123ZB': [
        climate(7, 30, 'occupied_heating_setpoint', 1.0), cfg.sensor_local_temperature,
        cfg.lock_keypad_lockout, cfg.sensor_power,
    ],
    'TH1124ZB': [climate()],
    'TH1400ZB': [climate()],
    'TH1500ZB': [climate()],
    'Zen-01-W': [climate(10, 30, 'occupied_heating_setpoint', 0.5)],
    '9290022166': [cfg.light_brightness_colortemp_colorxy],
    'PM-C140-ZB': [cfg.sensor_power, cfg.switch],
    'PM-B530-ZB': [cfg.sensor_power, cfg.switch],
    'PM-B540-ZB': [cfg.sensor_power, cfg.switch],
    'PM-B430-ZB': [cfg.sensor_power, cfg.switch],
    'ptvo.switch': [
        switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3'),
        switchEndpoint('l4'), switchEndpoint('l5'), switchEndpoint('l6'),
        switchEndpoint('l7'), switchEndpoint('l8'),
        sensorEndpoint('l1'), sensorEndpoint('l2'), sensorEndpoint('l3'),
        sensorEndpoint('l4'), sensorEndpoint('l5'), sensorEndpoint('l6'),
        sensorEndpoint('l7'), sensorEndpoint('l8'),
        cfg.sensor_click, cfg.sensor_temperature, cfg.sensor_voltage,
        cfg.sensor_pressure, cfg.sensor_humidity, cfg.sensor_action,
    ],
    'DIYRuZ_R4_5': [
        switchEndpoint('bottom_left'), switchEndpoint('bottom_right'), switchEndpoint('top_left'),
        switchEndpoint('top_right'), switchEndpoint('center'),
    ],
    'DIYRuZ_KEYPAD20': [],
    'DTB190502A1': [],
    'FL 130 C': [cfg.light_brightness_colortemp_colorxy],
    'OFL 120 C': [cfg.light_brightness_colortemp_colorxy],
    'OFL 140 C': [cfg.light_brightness_colortemp_colorxy],
    'OSL 130 C': [cfg.light_brightness_colortemp_colorxy],
    'BF 263': [cfg.light_brightness],
    'RF 263': [cfg.light_brightness],
    'HS1CG-M': [cfg.binary_sensor_gas],
    'HS1CG_M': [cfg.binary_sensor_gas],
    'LVS-SN10ZW_SN11': [cfg.sensor_battery, cfg.binary_sensor_occupancy],
    'B00TN589ZG': [cfg.light_brightness],
    'PSB19-SW27': [cfg.light_brightness],
    'S1': [cfg.switch, cfg.sensor_power],
    'S2': [switchEndpoint('l1'), switchEndpoint('l2'), cfg.sensor_power],
    'ZWallRemote0': [cfg.sensor_click, cfg.sensor_action],
    'D1': [cfg.light_brightness, cfg.sensor_power],
    'J1': [cfg.cover_position_tilt, cfg.sensor_power],
    '73741': [cfg.light_brightness_colortemp_colorxy],
    'ZA806SQ1TCF': [cfg.light_brightness_colortemp],
    'RF 265': [cfg.light_brightness],
    'ZNCZ03LM': [cfg.switch, cfg.sensor_power],
    '17436/30/P7': [cfg.light_brightness],
    '17435/30/P7': [cfg.light_brightness_colorxy],
    '9290018187B': [cfg.light_brightness_colortemp_colorxy],
    '1746330P7': [cfg.light_brightness_colortemp_colorxy],
    '1741830P7': [cfg.light_brightness_colortemp_colorxy],
    'Z3-1BRL': [cfg.sensor_action, cfg.sensor_brightness],
    'HS1CG-E': [cfg.binary_sensor_gas],
    'LED1842G3': [cfg.light_brightness],
    'ROB_200-008-0': [cfg.sensor_battery, cfg.sensor_click, cfg.sensor_action],
    'ICZB-IW11SW': [cfg.switch],
    'HV-GUCXZB5': [cfg.light_brightness_colortemp],
    'HGZB-20A': [cfg.switch],
    'SZ-ESW01': [cfg.switch, cfg.sensor_power],
    'LXZB-12A': [cfg.light_brightness_colortemp_colorxy],
    '2AJZ4KPBS': [cfg.sensor_battery, cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    '2AJZ4KPDR': [cfg.sensor_battery, cfg.binary_sensor_contact, cfg.binary_sensor_battery_low],
    '6717-84': [cfg.switch],
    'ICZB-KPD18S': [cfg.sensor_battery, cfg.sensor_click, cfg.sensor_action],
    'NLG-TW light': [cfg.light_brightness_colortemp],
    'E1757': [cfg.cover_position, cfg.sensor_battery],
    'E1926': [cfg.cover_position, cfg.sensor_battery],
    'LWG004': [cfg.light_brightness],
    '54668161': [cfg.light_brightness_colortemp],
    '8718699688820': [cfg.light_brightness],
    'GL-W-001Z': [cfg.switch],
    'E1766': [cfg.sensor_click, cfg.sensor_battery, cfg.sensor_action],
    '929001953101': [cfg.light_brightness_colortemp_colorxy],
    '8718699673147': [cfg.light_brightness],
    '3300-P': [cfg.sensor_temperature, cfg.binary_sensor_contact, cfg.sensor_battery],
    'GL-B-008ZS': [cfg.light_brightness_colortemp_colorxy],
    'T1828': [cfg.light_brightness_colortemp],
    'T1829': [cfg.light_brightness_colortemp],
    '929002240401': [cfg.switch],
    'HGZB-20-UK': [cfg.switch],
    'PTAPT-WH02': [cfg.switch],
    '929001953301': [cfg.light_brightness_colortemp],
    'DIYRuZ_magnet': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'ZLED-TUNE9': [cfg.light_brightness_colortemp],
    'XHS2-SE': [cfg.binary_sensor_contact, cfg.sensor_temperature, cfg.sensor_battery],
    '4000116784070': [cfg.switch],
    '9290020399': [cfg.light_brightness],
    '929002241201': [cfg.light_brightness],
    'YRD210-HA-605': [cfg.lock, cfg.sensor_battery],
    'YRD220/YRD221': [cfg.lock, cfg.sensor_battery],
    'ZM-CSW032-D': [cfg.cover_position],
    'LH-32ZB': [cfg.sensor_humidity, cfg.sensor_temperature, cfg.sensor_battery],
    '511.201': [cfg.light_brightness],
    'ZNCLDJ12LM': [cfg.cover_position, cfg.sensor_battery],
    '046677552343': [cfg.switch],
    '3115331PH': [cfg.light_brightness_colortemp_colorxy],
    'ZWLD-100': [cfg.binary_sensor_water_leak, cfg.binary_sensor_battery_low, cfg.sensor_battery],
    'GL-MC-001': [cfg.light_brightness_colortemp_colorxy],
    'YRD226/246 TSDB': [cfg.lock, cfg.sensor_battery],
    'T1820': [cfg.light_brightness_colortemp],
    'BASICZBR3': [cfg.switch],
    'E1744': [cfg.sensor_action, cfg.sensor_battery],
    'TS0201': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'LH07321': [cfg.binary_sensor_water_leak, cfg.binary_sensor_battery_low],
    'GL-C-008S': [cfg.light_brightness_colortemp_colorxy],
    'BY 178 T': [cfg.light_brightness_colortemp],
    '8718699688882': [cfg.light_brightness],
    'LED1738G7': [cfg.light_brightness_colortemp],
    '9290022169': [cfg.light_brightness_colortemp],
    'TERNCY-PP01': [
        cfg.sensor_temperature, cfg.binary_sensor_occupancy, cfg.sensor_illuminance, cfg.sensor_illuminance_lux,
        cfg.sensor_click, cfg.sensor_action,
    ],
    'CR11S8UZ': [cfg.sensor_action],
    'RB 148 T': [cfg.light_brightness_colortemp],
    'STS-OUT-US-2': [cfg.switch, cfg.sensor_power],
    'UK7004240': [climate(), cfg.sensor_battery],
    'S31ZB': [cfg.switch],
    'SA-003-Zigbee': [cfg.switch],
    'SZ-DWS04': [cfg.binary_sensor_contact, cfg.sensor_temperature, cfg.sensor_battery],
    'ICZB-B1FC60/B3FC64/B2FC95/B2FC125': [cfg.light_brightness_colortemp],
    'TS0203': [cfg.sensor_battery, cfg.binary_sensor_contact],
    'TS0204': [cfg.binary_sensor_gas],
    'TS0205': [cfg.binary_sensor_smoke, cfg.sensor_battery],
    'TS0111': [cfg.switch],
    'TS0001': [cfg.switch],
    'TS0207': [cfg.binary_sensor_water_leak, cfg.sensor_battery],
    'iL07_1': [cfg.binary_sensor_occupancy, cfg.binary_sensor_tamper, cfg.binary_sensor_battery_low],
    'S31 Lite zb': [cfg.switch],
    'LH-992ZB': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    '548727': [cfg.light_brightness_colortemp_colorxy],
    'TS0202': [cfg.binary_sensor_occupancy, cfg.sensor_battery],
    'TS0218': [cfg.sensor_action, cfg.sensor_battery],
    '404021': [cfg.switch],
    'Eco-Dim.07': [cfg.light_brightness],
    'DIYRuZ_rspm': [cfg.switch, cfg.sensor_action, cfg.sensor_power, cfg.sensor_current],
    'ZG9101SAC-HP-Switch': [cfg.switch],
    'ZNCZ04LM': [
        cfg.switch, cfg.sensor_power, cfg.sensor_consumption,
        cfg.sensor_current, cfg.sensor_voltage, cfg.sensor_temperature,
    ],
    'ZNCZ12LM': [cfg.switch, cfg.sensor_power],
    'GL-S-007ZS': [cfg.light_brightness_colortemp_colorxy],
    '4058075816732': [cfg.light_brightness_colortemp_colorxy],
    'GL-B-007ZS': [cfg.light_brightness_colortemp_colorxy],
    'GL-G-007Z': [cfg.light_brightness_colortemp_colorxy],
    'WXCJKG11LM': [cfg.sensor_action, cfg.sensor_battery],
    'WXCJKG12LM': [cfg.sensor_action, cfg.sensor_battery],
    'WXCJKG13LM': [cfg.sensor_action, cfg.sensor_battery],
    '8718699693985': [cfg.sensor_action, cfg.sensor_battery],
    'GL-D-004ZS': [cfg.light_brightness_colortemp_colorxy],
    'GL-D-005ZS': [cfg.light_brightness_colortemp_colorxy],
    'AC10787': [cfg.light_brightness_colortemp],
    'F-APP-UK-V2': [cfg.switch, cfg.sensor_power],
    'TS0043': [cfg.sensor_action, cfg.sensor_battery],
    'TS0041': [cfg.sensor_action, cfg.sensor_battery],
    'SP-EUC01': [cfg.switch, cfg.sensor_power],
    '511.012': [cfg.light_brightness],
    'GL-S-008Z': [cfg.light_brightness_colortemp_colorxy],
    'TZSW22FW-L4': [switchEndpoint('top'), switchEndpoint('bottom')],
    'TS0011': [cfg.switch],
    'TS0012': [switchEndpoint('left'), switchEndpoint('right')],
    'TS0013': [switchEndpoint('left'), switchEndpoint('center'), switchEndpoint('right')],
    '6735/6736/6737': [cfg.switch, cfg.sensor_action],
    '4034031P7': [cfg.light_brightness_colortemp],
    '5900131C5': [cfg.light_brightness_colortemp],
    'SZ-SRN12N': [],
    'ML-ST-D200': [cfg.light_brightness],
    '7099930PH': [cfg.light_brightness_colorxy],
    '9GED18000-009': [cfg.lock, cfg.sensor_battery],
    '9GED21500-005': [cfg.lock, cfg.sensor_battery],
    'MP-841': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'MCT-370 SMA': [cfg.binary_sensor_contact, cfg.binary_sensor_battery_low],
    'RB 162': [cfg.light_brightness],
    'SOHM-I1': [cfg.binary_sensor_contact, cfg.binary_sensor_battery_low],
    'SWHM-I1': [cfg.binary_sensor_water_leak, cfg.binary_sensor_battery_low],
    'SMHM-I1': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'SKHMP30-I1': [cfg.switch, cfg.sensor_power],
    '404028': [cfg.light_brightness_colortemp_colorxy],
    '595UGR22': [cfg.light_brightness_colortemp],
    '6ARCZABZH': [cfg.sensor_battery, cfg.sensor_action],
    'ZK-EU-2U': [cfg.switch],
    '511.202': [cfg.switch],
    'SP 224': [cfg.switch],
    '9290022411': [cfg.light_brightness],
    'E1C-NB6': [cfg.switch],
    'LVS-SC7': [cfg.sensor_action],
    '1742930P7': [cfg.light_brightness_colortemp_colorxy],
    'ZM-L03E-Z': [switchEndpoint('left'), switchEndpoint('center'), switchEndpoint('right')],
    'DL15S-1BZ': [cfg.switch],
    'E1D-G73WNA': [cfg.binary_sensor_contact, cfg.binary_sensor_battery_low],
    'WV704R0A0902': [climate()],
    '067776': [cfg.cover_position],
    '067773': [cfg.sensor_action, cfg.sensor_battery],
    '067771': [cfg.light_brightness],
    '064873': [cfg.sensor_action],
    'K4003C/L4003C/N4003C/NT4003C': [cfg.switch, cfg.sensor_action],
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
    '046677551780': [cfg.light_brightness],
    '798.15': [cfg.light_brightness],
    '12126': [cfg.switch],
    '067775': [cfg.switch, cfg.sensor_power],
    '064888': [cfg.switch],
    '412015': [cfg.sensor_power, cfg.binary_sensor_power_alarm_active],
    'gq8b1uv': [cfg.light_brightness],
    'GZCGQ01LM': [cfg.sensor_battery, cfg.sensor_illuminance, cfg.sensor_illuminance_lux],
    '9290018215': [cfg.light_brightness],
    '1743230P7': [cfg.light_brightness_colortemp_colorxy],
    '1744130P7': [cfg.light_brightness_colortemp_colorxy],
    '1743130P7': [cfg.light_brightness_colortemp_colorxy],
    '100.110.51': [cfg.light_brightness_colortemp],
    'ZL1000100-CCT-US-V1A02': [cfg.light_brightness_colortemp],
    'ZL1000701-27-EU-V1A02': [cfg.light_brightness],
    'HGZB-DLC4-N12B': [cfg.light_brightness_colortemp_colorxy],
    'U86KCJ-ZP': [cfg.sensor_action],
    'HS1HT': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'HS2ESK-E': [cfg.switch, cfg.sensor_power],
    'B01M7Y8BP9': [cfg.sensor_action],
    'GP-WOU019BBDWG': [cfg.switch, cfg.sensor_power, cfg.sensor_energy],
    'AV2010/21A': [cfg.binary_sensor_battery_low, cfg.binary_sensor_contact, cfg.binary_sensor_tamper],
    'AL-PIR02': [cfg.binary_sensor_occupancy, cfg.binary_sensor_tamper, cfg.sensor_battery],
    'MKS-CM-W5': [
        switchEndpoint('l1'), switchEndpoint('l2'),
        switchEndpoint('l3'), switchEndpoint('l4'),
    ],
    'STS-WTR-250': [cfg.binary_sensor_water_leak, cfg.sensor_battery, cfg.sensor_temperature],
    'ZG2835RAC': [cfg.light_brightness, cfg.sensor_power, cfg.sensor_energy],
    'BW-IS2': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'BW-IS3': [cfg.binary_sensor_occupancy],
    'SLR1b': [climate()],
    'WPT1': [],
    '4058075047853': [cfg.light_brightness_colortemp_colorxy],
    'ROB_200-003-0': [cfg.switch],
    '4512704': [cfg.switch],
    'AV2010/24A': [cfg.binary_sensor_smoke, cfg.binary_sensor_battery_low, cfg.binary_sensor_tamper],
    '902010/24': [cfg.binary_sensor_smoke, cfg.binary_sensor_battery_low, cfg.binary_sensor_tamper],
    'ROB_200-014-0': [cfg.light_brightness],
    '4090631P7': [cfg.light_brightness_colortemp_colorxy],
    'SGMHM-I1': [cfg.binary_sensor_gas, cfg.binary_sensor_battery_low, cfg.binary_sensor_tamper],
    'STHM-I1H': [cfg.sensor_humidity, cfg.sensor_temperature, cfg.sensor_battery],
    'BDHM8E27W70-I1': [cfg.light_brightness_colortemp],
    'M420': [cfg.sensor_battery],
    '8718696167991': [cfg.light_brightness_colortemp_colorxy],
    'GP-LBU019BBAWU': [cfg.light_brightness],
    '371000001': [cfg.light_brightness_colortemp],
    '10011725': [cfg.light_brightness_colortemp_colorxy],
    '929002277501': [cfg.light_brightness],
    'RS 230 C': [cfg.light_brightness_colortemp_colorxy],
    'LED1903C5/LED1835C6': [cfg.light_brightness_colortemp],
    '1402755': [cfg.light_brightness],
    '4503848C5': [cfg.light_brightness_colortemp],
    '500.48': [cfg.light_brightness],
    'TS0042': [cfg.sensor_action, cfg.sensor_battery],
    'SNZB-04': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'SNZB-01': [cfg.sensor_action, cfg.sensor_battery],
    'SNZB-02': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'SNZB-03': [cfg.binary_sensor_occupancy, cfg.sensor_battery],
    '07046L': [cfg.sensor_action],
    '07045L': [cfg.binary_sensor_contact, cfg.binary_sensor_tamper, cfg.binary_sensor_battery_low],
    '3402831P7': [cfg.light_brightness_colortemp],
    'TERNCY-SD01': [cfg.sensor_click, cfg.sensor_battery, cfg.sensor_action, cfg.sensor_direction],
    '07048L': [cfg.switch, cfg.sensor_power],
    'ICZB-KPD14S': [cfg.sensor_battery, cfg.sensor_click, cfg.sensor_action],
    '73743': [cfg.sensor_action, cfg.sensor_battery],
    'C4': [cfg.sensor_action],
    'GL-D-003ZS': [cfg.light_brightness_colortemp_colorxy],
    '66492-001': [cfg.lock, cfg.sensor_battery],
    '371000002': [cfg.light_brightness_colortemp_colorxy],
    'U202DST600ZB': [lightEndpoint('light_brightness', 'l1'), lightEndpoint('light_brightness', 'l2')],
    'SM10ZW': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'ICZB-R11D': [cfg.light_brightness],
    'SW2500ZB': [cfg.switch],
    '4512703': [cfg.sensor_action, cfg.sensor_battery],
    '4512721': [cfg.sensor_action, cfg.sensor_battery],
    '4512702': [cfg.sensor_action, cfg.sensor_battery],
    '4090331P9': [cfg.light_brightness_colortemp_colorxy],
    'HS1EB': [cfg.sensor_click, cfg.sensor_action],
    'HS2SW1A-N': [cfg.switch],
    'HS2SW2A-N': [switchEndpoint('left'), switchEndpoint('right')],
    'HS2SW3A-N': [switchEndpoint('left'), switchEndpoint('right'), switchEndpoint('center')],
    'MCLH-07': [cfg.binary_sensor_water_leak, cfg.sensor_battery],
    'MCLH-04': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'MCLH-02': [cfg.light_brightness_colortemp_colorxy],
    '3323-G': [cfg.binary_sensor_contact, cfg.sensor_temperature, cfg.binary_sensor_battery_low],
    'ZL1000400-CCT-EU-2-V1A02': [cfg.light_brightness_colortemp],
    'ROB_200-007-0': [cfg.sensor_action, cfg.sensor_battery],
    'PM-S140-ZB': [cfg.switch],
    'PM-S240-ZB': [switchEndpoint('top'), switchEndpoint('bottom')],
    'PM-S340-ZB': [switchEndpoint('top'), switchEndpoint('center'), switchEndpoint('bottom')],
    'PM-S140R-ZB': [cfg.switch],
    'PM-S240R-ZB': [switchEndpoint('top'), switchEndpoint('bottom')],
    'PM-S340R-ZB': [switchEndpoint('top'), switchEndpoint('center'), switchEndpoint('bottom')],
    'U201DST600ZB': [cfg.light_brightness],
    'U201SRY2KWZB': [cfg.switch],
    'U202SRY2KWZB': [switchEndpoint('l1'), switchEndpoint('l2')],
    '93999': [cfg.light_brightness],
    'ZHS-15': [cfg.switch, cfg.sensor_power, cfg.sensor_current, cfg.sensor_voltage],
    'GS361A-H04': [
        cfg.lock_child_lock,
        cfg.switch_window_detection,
        cfg.switch_valve_detection,
        climate(5, 30, 'current_heating_setpoint', 0.5),
        cfg.sensor_battery,
    ],
    'HLC614-ZLL': [switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3')],
    'EMIZB-132': [
        cfg.sensor_power, cfg.sensor_voltage, cfg.sensor_current, cfg.sensor_energy, cfg.sensor_current_phase_b,
        cfg.sensor_current_phase_c, cfg.sensor_voltage_phase_b, cfg.sensor_voltage_phase_c,
    ],
    'S9ZGBRC01': [cfg.sensor_action, cfg.sensor_battery],
    '511.557': [cfg.sensor_action],
    'RL804CZB': [cfg.light_brightness_colortemp_colorxy],
    '3420-G': [cfg.light_brightness],
    'U02I007C.01': [
        cfg.sensor_action, cfg.binary_sensor_contact, cfg.binary_sensor_water_leak,
        cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery,
    ],
    '4080248P9': [cfg.light_brightness_colortemp_colorxy],
    '4080148P9': [cfg.light_brightness_colortemp_colorxy],
    '4058075148338': [cfg.light_brightness_colortemp],
    '4058075181472': [cfg.light_brightness_colortemp],
    '484719': [cfg.light_brightness],
    'SEB01ZB': [cfg.binary_sensor_sos, cfg.sensor_battery],
    'SBM01ZB': [cfg.binary_sensor_occupancy, cfg.sensor_battery],
    'STH01ZB': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'SSA01ZB': [cfg.binary_sensor_smoke, cfg.sensor_battery],
    'SCA01ZB': [cfg.binary_sensor_carbon_monoxide, cfg.sensor_battery],
    'SGA01ZB': [cfg.binary_sensor_gas, cfg.sensor_battery],
    'SWA01ZB': [cfg.binary_sensor_water_leak, cfg.sensor_battery],
    'SDM01ZB': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'SFS01ZB': [cfg.switch],
    'SLS301ZB_2': [switchEndpoint('left'), switchEndpoint('right')],
    'SLS301ZB_3': [switchEndpoint('left'), switchEndpoint('right'), switchEndpoint('center')],
    'SSS401ZB': [cfg.switch, cfg.sensor_action],
    'E12-N1E': [cfg.light_brightness_colortemp_colorxy],
    '4040B': [cfg.sensor_power, switchEndpoint('l1'), switchEndpoint('l2')],
    '3460-L': [cfg.sensor_action, cfg.sensor_temperature, cfg.sensor_battery],
    '3157100': [climate(10, 30, 'occupied_heating_setpoint', 1, ['off', 'heat', 'cool'],
        ['auto', 'on'], [], true, true), cfg.sensor_battery],
    '4257050-RZHAC': [cfg.switch, cfg.sensor_power],
    '27087-03': [cfg.switch, cfg.sensor_battery],
    '99140-002': [cfg.lock, cfg.sensor_battery],
    '4512706': [cfg.sensor_battery, cfg.sensor_action],
    'GL-S-004ZS': [cfg.light_brightness_colortemp_colorxy],
    '7121131PU': [cfg.light_brightness_colortemp_colorxy],
    'RL804QZB': [switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3')],
    'RC-2000WH': [climate(10, 30, 'occupied_heating_setpoint', 1, ['off', 'auto', 'heat', 'cool'],
        ['auto', 'on', 'smart'], [], true, true)],
    'TH1300ZB': [climate()],
    'SP 220': [cfg.switch],
    '511.040': [cfg.light_brightness_colortemp_colorxy],
    '511.344': [cfg.sensor_battery, cfg.sensor_action, cfg.sensor_action_color, cfg.sensor_action_color_temperature],
    'SMSZB-120': [cfg.binary_sensor_smoke, cfg.sensor_temperature, cfg.sensor_battery],
    'DWS003': [cfg.binary_sensor_contact, cfg.sensor_battery, cfg.binary_sensor_battery_low, cfg.sensor_temperature],
    'MOT003': [cfg.binary_sensor_occupancy, cfg.sensor_temperature, cfg.sensor_battery, cfg.binary_sensor_battery_low],
    'HALIGHTDIMWWE14': [cfg.light_brightness],
    'GreenPower_On_Off_Switch': [cfg.sensor_action],
    'GreenPower_7': [cfg.sensor_action],
    '3RSL011Z': [cfg.light_brightness_colortemp],
    '3RSL012Z': [cfg.light_brightness_colortemp],
    '1746130P7': [cfg.light_brightness_colortemp_colorxy],
    '1745630P7': [cfg.light_brightness_colortemp_colorxy],
    '6xy-M350ST-W1Z': [cfg.light_brightness_colortemp],
    'AU-A1GUZBCX5': [cfg.light_brightness_colortemp],
    'AU-A1GUZB5/30': [cfg.light_brightness],
    'AU-A1GUZBRGBW': [cfg.light_brightness_colortemp_colorxy],
    'AU-A1GSZ9RGBW': [cfg.light_brightness_colortemp_colorxy],
    'AU-A1ZB2WDM': [cfg.light_brightness],
    'RF 261': [cfg.light_brightness],
    'RF 264': [cfg.light_brightness],
    'TS0601_thermostat': [
        cfg.lock_child_lock, cfg.switch_window_detection, cfg.switch_valve_detection, cfg.sensor_battery,
        climate(5, 30, 'current_heating_setpoint', 0.5, [], [],
            ['schedule', 'manual', 'away', 'boost', 'complex', 'comfort', 'eco']),
    ],
    'WXKG07LM': [cfg.sensor_action, cfg.sensor_battery],
    'MCLH-03': [cfg.switch, cfg.sensor_voltage, cfg.sensor_power, cfg.sensor_current],
    '752189': [cfg.sensor_action, cfg.sensor_battery],
    '676-00301024955Z': [cfg.light_brightness],
    '151570': [cfg.light_brightness],
    '1743030P7': [cfg.light_brightness_colortemp_colorxy],
    'XBee': [],
    'ZBHT-1': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'rgbw2.zbee27': [cfg.light_brightness_colortemp_colorxy],
    'MCLH-05': [cfg.binary_sensor_occupancy, cfg.sensor_battery],
    '5045148P7': [cfg.light_brightness_colortemp_colorxy],
    'GL-FL-006TZ': [cfg.light_brightness_colortemp_colorxy],
    '5AA-SS-ZA-H0': [cfg.binary_sensor_occupancy, cfg.sensor_illuminance, cfg.sensor_illuminance_lux],
    'MOSZB-130': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'AU-A1ZBRC': [cfg.sensor_action, cfg.sensor_battery],
    'AU-A1ZBPIRS': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low, cfg.sensor_illuminance_lux],
    'TS0121_plug': [cfg.switch, cfg.sensor_voltage, cfg.sensor_power, cfg.sensor_current],
    'ZK03840': [climate()],
    'ZS1100400-IN-V1A02': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'MCLH-08': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_eco2, cfg.sensor_voc],
    'GL-FL-005TZ': [cfg.light_brightness_colortemp_colorxy],
    'ED2004-012': [cfg.switch],
    'ZG192910-4': [cfg.light_brightness_colortemp],
    'SLT2': [],
    'ZL1000700-22-EU-V1A02': [cfg.light_brightness],
    'SLB2': [],
    '8840100H': [cfg.binary_sensor_water_leak, cfg.sensor_temperature, cfg.sensor_battery],
    '404037': [cfg.light_brightness_colortemp],
    '9290022408': [cfg.switch],
    'HGZB-14A': [cfg.binary_sensor_water_leak, cfg.sensor_battery],
    'TERNCY-DC01': [cfg.sensor_temperature, cfg.binary_sensor_contact],
    'ZS110050078': [cfg.binary_sensor_contact, cfg.binary_sensor_battery_low],
    'HGZB-DLC4-N15B': [cfg.light_brightness_colortemp_colorxy],
    'ECW-100-A03': [switchEndpoint('top'), switchEndpoint('center'), switchEndpoint('bottom')],
    '4098430P7': [cfg.light_brightness_colortemp],
    'PQC19-DY01': [cfg.light_brightness],
    'DIYRuZ_FreePad': [cfg.sensor_action, cfg.sensor_battery],
    'ST20': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'ST21': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'T30W3Z': [switchEndpoint('top'), switchEndpoint('center'), switchEndpoint('bottom')],
    'T21W2Z': [switchEndpoint('top'), switchEndpoint('bottom')],
    'T21W1Z': [cfg.switch],
    'W40CZ': [cfg.cover_position],
    'R11W2Z': [switchEndpoint('l1'), switchEndpoint('l2')],
    'R20W2Z': [switchEndpoint('l1'), switchEndpoint('l2')],
    'SW21': [cfg.binary_sensor_water_leak, cfg.binary_sensor_battery_low],
    'SE21': [cfg.sensor_action],
    '4052899926127': [cfg.light_brightness],
    'GL-B-001ZS': [cfg.light_brightness_colortemp_colorxy],
    'LH-990ZB': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'HO-09ZB': [cfg.binary_sensor_contact, cfg.binary_sensor_battery_low],
    '500.67': [cfg.sensor_action],
    'E1E-G7F': [cfg.sensor_action],
    'LH-990F': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'QBKG25LM': [switchEndpoint('left'), switchEndpoint('center'), switchEndpoint('right'), cfg.sensor_action],
    'QBKG23LM': [cfg.switch, cfg.sensor_power, cfg.sensor_temperature],
    'QBKG24LM': [switchEndpoint('left'), switchEndpoint('right'), cfg.sensor_power],
    'WS-USC01': [cfg.switch],
    'WS-USC02': [switchEndpoint('top'), switchEndpoint('bottom')],
    'WS-USC04': [switchEndpoint('top'), switchEndpoint('bottom')],
    '100.462.31': [cfg.sensor_action],
    'SN10ZW': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'AU-A1ZBPIAB': [cfg.switch, cfg.sensor_voltage, cfg.sensor_current, cfg.sensor_power],
    'AU-A1ZBDWS': [cfg.binary_sensor_contact, cfg.sensor_battery],
    '4058075816459': [cfg.sensor_action, cfg.sensor_battery],
    '14592.0': [cfg.switch],
    '73699': [cfg.light_brightness_colorxy],
    'SAGE206612': [cfg.sensor_action, cfg.sensor_battery],
    'TI0001-switch': [cfg.switch],
    'TI0001-socket': [cfg.switch],
    '9290022891': [cfg.light_brightness_colortemp_colorxy],
    '160-01': [cfg.switch, cfg.sensor_power],
    'ZS232000178': [cfg.sensor_action],
    'mcdj3aq': [cfg.cover_position],
    'DIYRuZ_Geiger': [cfg.sensor_radioactive_events_per_minute, cfg.sensor_radiation_dose_per_hour, cfg.sensor_action],
    '8718696170557': [cfg.light_brightness_colortemp_colorxy],
    '12127': [switchEndpoint('l1'), switchEndpoint('l2')],
    'SWO-MOS1PA': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'STS-IRM-251': [cfg.sensor_temperature, cfg.binary_sensor_occupancy, cfg.sensor_battery],
    'WSDCGQ12LM': [cfg.sensor_temperature, cfg.sensor_pressure, cfg.sensor_humidity, cfg.sensor_battery],
    'SJCGQ12LM': [cfg.sensor_battery, cfg.binary_sensor_water_leak],
    'DJT12LM': [cfg.sensor_action],
    'AV2010/22A': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'D1523': [cfg.light_brightness],
    'RS-23ZBS': [cfg.sensor_temperature, cfg.sensor_humidity],
    'E11-U3E': [cfg.light_brightness_colortemp_colorxy],
    '5062231P7': [cfg.light_brightness_colortemp_colorxy],
    '5062431P7': [cfg.light_brightness_colortemp_colorxy],
    '5062131P7': [cfg.light_brightness_colortemp_colorxy],
    '5062331P7': [cfg.light_brightness_colortemp_colorxy],
    'GL-D-004Z': [cfg.light_brightness_colortemp_colorxy],
    '9290022268': [cfg.light_brightness],
    '73773': [cfg.light_brightness_colortemp_colorxy],
    'KMPCIL_RES005': [
        cfg.sensor_battery, cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_pressure, cfg.sensor_illuminance,
        cfg.sensor_illuminance_lux, cfg.binary_sensor_occupancy, cfg.switch,
    ],
    'DIYRuZ_R8_8': [
        switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3'), switchEndpoint('l4'),
        switchEndpoint('l5'), switchEndpoint('l6'), switchEndpoint('l7'), switchEndpoint('l8'),
    ],
    '511.010': [cfg.light_brightness],
    '43080': [cfg.light_brightness],
    'DIYRuZ_RT': [cfg.switch, cfg.sensor_temperature],
    '929002039801': [cfg.light_brightness],
    'DM2500ZB': [cfg.light_brightness],
    '99100-006': [cfg.lock, cfg.sensor_battery],
    'SPE600': [cfg.switch, cfg.sensor_power],
    '067774': [cfg.sensor_action, cfg.sensor_battery],
    '067694': [cfg.sensor_action, cfg.sensor_battery],
    '170-33505': [cfg.switch, cfg.sensor_voltage, cfg.sensor_current, cfg.sensor_power],
    '07115L': [cfg.light_brightness_colortemp_colorxy],
    'A806S-Q1G': [cfg.light_brightness_colortemp_colorxy],
    'YRL-220L': [cfg.lock, cfg.sensor_battery],
    'YSR-MINI-01': [cfg.light_brightness_colortemp_colorxy],
    '9290023349': [cfg.light_brightness],
    'TS0115': [
        switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3'), switchEndpoint('l4'),
        switchEndpoint('l5'),
    ],
    'WL4200': [cfg.binary_sensor_water_leak, cfg.binary_sensor_battery_low],
    '404031': [cfg.light_brightness_colortemp],
    'AE 280 C': [cfg.light_brightness_colortemp_colorxy],
    'HLC833-Z-SC': [cfg.light_brightness],
    '5996411U5': [cfg.light_brightness_colortemp],
    'LXN59-2S7LX1.0': [switchEndpoint('left'), switchEndpoint('right')],
    'X711A': [cfg.switch],
    'X712A': [switchEndpoint('l1'), switchEndpoint('l2')],
    'X713A': [switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3')],
    'TYZS1L': [cfg.light_colorhs],
    '43102': [cfg.switch],
    '1746430P7': [cfg.light_brightness_colortemp_colorxy],
    'ROB_200-010-0': [cfg.cover_position],
    '1743830P7': [cfg.light_brightness_colortemp_colorxy],
    'ZB-CT01': [cfg.light_brightness_colortemp_colorxy],
    '8718699703424': [cfg.light_brightness_colortemp_colorxy],
    'AM25': [cfg.cover_position, cfg.sensor_battery],
    '43076': [cfg.switch],
    'ZSTY-SM-11ZG-US-W': [cfg.switch],
    'ZSTY-SM-1CTZG-US-W': [cfg.cover_position],
    'ZSTY-SM-1DMZG-US-W': [cfg.light_brightness],
    'SNTZ009': [cfg.binary_sensor_water_leak],
    '4058075208414': [cfg.light_brightness_colortemp],
    '4058075208339': [cfg.light_brightness_colortemp_colorxy],
    'NAS-AB02B0': [
        cfg.sensor_temperature, cfg.sensor_humidity, cfg.binary_sensor_humidity_alarm,
        cfg.binary_sensor_temperature_alarm, cfg.binary_sensor_alarm,
    ],
    'FL 120 C': [cfg.light_brightness_colortemp_colorxy],
    '9290022267': [cfg.light_brightness_colortemp],
    'ZNTGMK11LM': [cfg.light_brightness_colortemp_colorxy],
    'HLQDQ01LM': [cfg.light_brightness],
    'TS0502A': [cfg.light_brightness_colortemp],
    'TS0004': [switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3'), switchEndpoint('l4')],
    'U86KWF-ZPSJ': [climate(5, 30, 'current_heating_setpoint', 0.5)],
    'D3-DPWK-TY': [climate(5, 30, 'current_heating_setpoint', 0.5)],
    '100.075.74': [cfg.light_brightness_colortemp_colorxy],
    '9290019534': [cfg.light_brightness_colortemp],
    '98423051': [cfg.switch],
    'SM309': [cfg.light_brightness],
    'QS-Zigbee-D02-TRIAC-LN': [cfg.light_brightness],
    'QS-Zigbee-D02-TRIAC-2C-LN': [lightEndpoint('light_brightness', 'l1'), lightEndpoint('light_brightness', 'l2')],
    'BE 220': [cfg.light_brightness],
    'TS0215A': [cfg.sensor_battery, cfg.sensor_action],
    '4713406': [cfg.light_brightness],
    '3216131P6': [cfg.light_brightness_colortemp],
    'GWA1521': [cfg.switch],
    'GWA1522': [switchEndpoint('l1'), switchEndpoint('l2')],
    'GWA1531': [cfg.cover_position],
    'TPZRCO2HT-Z3': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery, cfg.sensor_co2],
    '43100': [cfg.switch],
    '3400-D': [cfg.sensor_action, cfg.sensor_battery],
    'GL-FL-006TZS': [cfg.light_brightness_colortemp_colorxy],
    'TS0121_switch': [cfg.switch],
    'ED-10011': [cfg.sensor_action],
    'ED-10012': [cfg.sensor_action],
    'QS-Zigbee-S04-2C-LN': [switchEndpoint('l1'), switchEndpoint('l2')],
    'SM308': [cfg.switch],
    'SR-ZG9001T4-DIM-EU': [cfg.sensor_action],
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

        this.eventBus.on('deviceRemoved', (data) => this.onDeviceRemoved(data.device), this.constructor.name);
        this.eventBus.on('publishEntityState', (data) => this.onPublishEntityState(data), this.constructor.name);
        this.eventBus.on('deviceRenamed', (data) => this.onDeviceRenamed(data.device), this.constructor.name);

        for (const definition of utils.getExternalConvertersDefinitions(settings)) {
            if (definition.hasOwnProperty('homeassistant')) {
                mapping[definition.model] = definition.homeassistant;
            }
        }
    }

    onDeviceRemoved(device) {
        logger.debug(`Clearing Home Assistant discovery topic for '${device.ieeeAddr}'`);
        delete this.discovered[device.ieeeAddr];
        const resolvedEntity = this.zigbee.resolveEntity(device);
        for (const config of this.getConfigs(resolvedEntity)) {
            const topic = this.getDiscoveryTopic(config, device);
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
        if (data.entity.definition && mapping[data.entity.definition.model]) {
            for (const config of mapping[data.entity.definition.model]) {
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
                const device = data.entity.device;
                if (!this.discoveredTriggers[device.ieeeAddr]) {
                    this.discoveredTriggers[device.ieeeAddr] = new Set();
                }

                const value = data.payload[key].toString();
                const discoveredKey = `${key}_${value}`;

                if (!this.discoveredTriggers[device.ieeeAddr].has(discoveredKey)) {
                    const config = cfg[`trigger_${key}`];
                    config.object_id = `${key}_${value}`;
                    const topic = this.getDiscoveryTopic(config, device);
                    const payload = {
                        ...config.discovery_payload,
                        subtype: value,
                        payload: value,
                        topic: `${settings.get().mqtt.base_topic}/${data.entity.name}/${key}`,
                        device: this.getDevicePayload(data.entity),
                    };

                    await this.mqtt.publish(topic, stringify(payload), {retain: true, qos: 0}, this.discoveryTopic);
                    this.discoveredTriggers[device.ieeeAddr].add(discoveredKey);
                }

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
                condition: data.entity.device && data.entity.definition && mapping[data.entity.definition.model] &&
                    mapping[data.entity.definition.model].includes(cfg.binary_sensor_water_leak),
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

    onDeviceRenamed(device) {
        logger.debug(`Refreshing Home Assistant discovery topic for '${device.ieeeAddr}'`);

        // Clear before rename so Home Assistant uses new friendly_name
        // https://github.com/Koenkk/zigbee2mqtt/issues/4096#issuecomment-674044916
        const resolvedEntity = this.zigbee.resolveEntity(device);
        for (const config of this.getConfigs(resolvedEntity)) {
            const topic = this.getDiscoveryTopic(config, device);
            this.mqtt.publish(topic, null, {retain: true, qos: 0}, this.discoveryTopic);
        }

        this.discover(resolvedEntity, true);
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
        if (!resolvedEntity || !resolvedEntity.definition) return [];

        let configs = mapping[resolvedEntity.definition.model].slice();
        configs.push(cfg.sensor_linkquality);

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
            configs = configs.filter((c) => c !== cfg.sensor_action && c !== cfg.sensor_click);
        }

        return configs;
    }

    discover(resolvedEntity, force=false) {
        // Check if already discoverd and check if there are configs.
        const {device, definition} = resolvedEntity;
        const discover = force || !this.discovered[device.ieeeAddr];
        if (!discover || !device || !definition || !mapping[definition.model] ||
            (resolvedEntity.settings.hasOwnProperty('homeassistant') && !resolvedEntity.settings.homeassistant)) {
            return;
        }

        const friendlyName = resolvedEntity.settings.friendlyName;
        this.getConfigs(resolvedEntity).forEach((config) => {
            const topic = this.getDiscoveryTopic(config, device);
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

            // Set availability payload
            // When using availability_timeout each device has it's own availability topic.
            // If not, use the availability topic of Zigbee2MQTT.
            if (settings.get().advanced.availability_timeout) {
                payload.availability_topic = `${settings.get().mqtt.base_topic}/${friendlyName}/availability`;
            } else {
                payload.availability_topic = `${settings.get().mqtt.base_topic}/bridge/state`;
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
                        if (['number', 'string', 'boolean'].includes(typeof obj[key])) {
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

            this.mqtt.publish(topic, stringify(payload), {retain: true, qos: 0}, this.discoveryTopic);
        });

        this.discovered[device.ieeeAddr] = true;
    }

    onMQTTMessage(topic, message) {
        const discoveryMatch = topic.match(discoveryRegex);
        if (discoveryMatch) {
            // Clear outdated discovery configs.
            try {
                message = JSON.parse(message);
                if (!message || !message.availability_topic ||
                    !message.availability_topic.startsWith(settings.get().mqtt.base_topic + '/')) {
                    // Base topic is different, probably different Zigbee2MQTT instance.
                    return;
                }
            } catch (e) {
                return;
            }

            const ieeeAddr = discoveryMatch[2];
            const resolvedEntity = this.zigbee.resolveEntity(ieeeAddr);
            let clear = !resolvedEntity || !resolvedEntity.definition;

            if (!clear) {
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

    // Only for homeassistant.test.js
    _getMapping() {
        return mapping;
    }
}

module.exports = HomeAssistant;
