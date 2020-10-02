const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');
const zigbee2mqttVersion = require('../../package.json').version;
const Extension = require('./extension');
const objectAssignDeep = require(`object-assign-deep`);
const stringify = require('json-stable-stringify-without-jsonify');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const assert = require('assert');

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
    'binary_sensor_vibration': {
        type: 'binary_sensor',
        object_id: 'vibration',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.vibration }}',
            device_class: 'vibration',
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
    'sensor_pm25': {
        type: 'sensor',
        object_id: 'pm25',
        discovery_payload: {
            unit_of_measurement: 'µg/m³',
            icon: 'mdi:air-filter',
            value_template: '{{ value_json.pm25 }}',
        },
    },
    'sensor_pm10': {
        type: 'sensor',
        object_id: 'pm10',
        discovery_payload: {
            unit_of_measurement: 'µg/m³',
            icon: 'mdi:air-filter',
            value_template: '{{ value_json.pm10}}',
        },
    },
    'sensor_hcho': {
        type: 'sensor',
        object_id: 'hcho',
        discovery_payload: {
            unit_of_measurement: 'µg/m³',
            icon: 'mdi:air-filter',
            value_template: '{{ value_json.hcho }}',
        },
    },
    'sensor_aqi': {
        type: 'sensor',
        object_id: 'aqi',
        discovery_payload: {
            // unit_of_measurement: 'ppb',
            icon: 'mdi:air-filter',
            value_template: '{{ value_json.aqi }}',
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
    'sensor_device_temperature': {
        type: 'sensor',
        object_id: 'device_temperature',
        discovery_payload: {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            value_template: '{{ value_json.device_temperature }}',
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
    'sensor_battery_state': {
        type: 'sensor',
        object_id: 'battery_state',
        discovery_payload: {
            icon: 'mdi:battery-charging',
            value_template: '{{ value_json.battery_state }}',
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
        // NOTE: Preset 'none' will be added as first item on HA side `mqtt/climate.py preset_modes()`
        const indexOfNone = holdModes.indexOf('none');
        if (indexOfNone > -1) holdModes.splice(indexOfNone, 1);

        // HA has special behaviour for the away mode
        // https://github.com/Koenkk/zigbee2mqtt/pull/4491#issuecomment-701550476
        // const indexOfAway = holdModes.indexOf('away');
        // if (indexOfAway > -1) {
        //     holdModes.splice(indexOfAway, 1); // HA will add "Away" to modes by itself
        //     retVal.discovery_payload.away_mode_command_topic = true;
        //     retVal.discovery_payload.away_mode_state_topic = true;
        //     retVal.discovery_payload.away_mode_state_template =
        //         '{{ value_json.away_mode }}';
        // }
        /* istanbul ignore else */
        if (holdModes.length > 0) { // || indexOfAway > -1) {
            retVal.discovery_payload.hold_modes = holdModes;
            retVal.discovery_payload.hold_command_topic = true;
            retVal.discovery_payload.hold_state_template = `{{ value_json.preset }}`;
            retVal.discovery_payload.hold_state_topic = true;
        }
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
const manualMaping = {
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
    'JTYJ-GD-01LM/BW': [cfg.binary_sensor_smoke, cfg.sensor_battery, cfg.sensor_sensitivity, cfg.sensor_smoke_density],
    'PLUG EDP RE:DY': [cfg.switch, cfg.sensor_power],
    'SWITCH EDP RE:DY': [cfg.switch],
    'CC2530.ROUTER': [cfg.binary_sensor_led],
    'AB3257001NJ': [cfg.switch],
    'AC10691': [cfg.switch],
    'ICTC-G-1': [cfg.sensor_brightness, cfg.sensor_battery, cfg.sensor_action],
    'QBKG11LM': [cfg.switch, cfg.sensor_power, cfg.sensor_click, cfg.sensor_action, cfg.sensor_temperature],
    'QBKG21LM': [cfg.switch, cfg.sensor_click, cfg.sensor_action],
    'QBKG22LM': [switchEndpoint('left'), switchEndpoint('right'), cfg.sensor_action, cfg.sensor_click],
    'QBKG12LM': [
        switchEndpoint('left'), switchEndpoint('right'), cfg.sensor_power, cfg.sensor_click,
        cfg.sensor_temperature, cfg.sensor_action,
    ],
    'Z809A': [cfg.switch, cfg.sensor_power],
    '324131092621': [cfg.sensor_action, cfg.sensor_battery],
    '9290012607': [
        cfg.binary_sensor_occupancy, cfg.sensor_temperature, cfg.sensor_illuminance, cfg.sensor_illuminance_lux,
        cfg.sensor_battery,
    ],
    'STSS-MULT-001': [cfg.binary_sensor_contact, cfg.sensor_battery],
    '72922-A': [cfg.switch],
    'DNCKATSW001': [cfg.switch],
    'DNCKATSW002': [switchEndpoint('left'), switchEndpoint('right')],
    'DNCKATSW003': [switchEndpoint('left'), switchEndpoint('right'), switchEndpoint('center')],
    'DNCKATSW004': [
        switchEndpoint('bottom_left'), switchEndpoint('bottom_right'),
        switchEndpoint('top_left'), switchEndpoint('top_right'),
    ],
    'JTQJ-BF-01LM/BW': [cfg.binary_sensor_gas, cfg.sensor_gas_density, cfg.sensor_sensitivity],
    '50043': [cfg.switch],
    'AV2010/22': [cfg.binary_sensor_occupancy, cfg.sensor_battery],
    '3210-L': [cfg.switch, cfg.sensor_power, cfg.sensor_current, cfg.sensor_voltage],
    '3320-L': [cfg.binary_sensor_contact, cfg.sensor_temperature, cfg.sensor_battery],
    '3326-L': [cfg.binary_sensor_occupancy, cfg.sensor_temperature, cfg.sensor_battery],
    'A6121': [cfg.sensor_lock],
    'DJT11LM': [cfg.sensor_action, cfg.sensor_battery, cfg.sensor_sensitivity, cfg.sensor_strength],
    'E1603/E1702': [cfg.switch],
    'KS-SM001': [cfg.switch],
    'MG-AUWS01': [switchEndpoint('left'), switchEndpoint('right')],
    '4256251-RZHAC': [cfg.switch, cfg.sensor_power],
    '4257050-ZHAC': [cfg.light_brightness, cfg.sensor_power, cfg.sensor_current, cfg.sensor_voltage],
    'STS-PRS-251': [cfg.binary_sensor_presence, cfg.sensor_battery],
    'STSS-PRES-001': [cfg.binary_sensor_presence, cfg.sensor_battery],
    'PSS-23ZBS': [cfg.switch],
    'HS1SA-M': [cfg.binary_sensor_smoke, cfg.binary_sensor_battery_low],
    'AC01353010G': [
        cfg.binary_sensor_occupancy, cfg.binary_sensor_tamper,
        cfg.sensor_temperature, cfg.binary_sensor_battery_low,
    ],
    'SP 120': [cfg.switch, cfg.sensor_power, cfg.sensor_energy],
    'SP 222': [cfg.switch],
    'HS3SA': [cfg.binary_sensor_smoke, cfg.binary_sensor_battery_low],
    'HS1DS/HS3DS': [cfg.binary_sensor_contact],
    'HS3DS': [
        cfg.binary_sensor_contact, cfg.sensor_battery, cfg.binary_sensor_battery_low,
        cfg.binary_sensor_tamper],
    'HS1WL/HS3WL': [cfg.binary_sensor_water_leak],
    'HS1-WL-E': [cfg.binary_sensor_water_leak],
    'HS1WL-N': [
        cfg.binary_sensor_water_leak, cfg.sensor_battery, cfg.binary_sensor_battery_low,
        cfg.binary_sensor_tamper],
    'HS1VS-N': [
        cfg.binary_sensor_vibration, cfg.sensor_battery, cfg.binary_sensor_battery_low,
        cfg.binary_sensor_tamper],
    '3321-S': [cfg.binary_sensor_contact, cfg.sensor_temperature, cfg.sensor_battery],
    'ZPIR-8000': [cfg.binary_sensor_occupancy, cfg.sensor_battery],
    'ZCTS-808': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'ZNCLDJ11LM': [cfg.cover_position, cfg.sensor_cover],
    'TS0601_curtain': [cfg.cover_position],
    '3325-S': [cfg.sensor_temperature, cfg.binary_sensor_occupancy],
    'AV2010/25': [cfg.switch, cfg.sensor_power],
    '1TST-EU': [climate(), cfg.sensor_battery],
    '45856GE': [cfg.switch],
    'AIRAM-CTR.U': [],
    'HGZB-20-DE': [cfg.switch],
    'AV2010/32': [climate(7, 30, 'occupied_heating_setpoint', 0.5), cfg.sensor_battery],
    'E1524/E1810': [cfg.sensor_action, cfg.sensor_battery],
    'AC0251100NJ/AC0251700NJ': [cfg.sensor_action, cfg.sensor_battery],
    'MLI-404011': [cfg.sensor_action],
    'HS1DS-E': [cfg.binary_sensor_contact],
    'SP600': [cfg.switch, cfg.sensor_power, cfg.sensor_energy],
    '1613V': [cfg.switch, cfg.sensor_power],
    'TI0001': [switchEndpoint('left'), switchEndpoint('right')],
    'SPZB0001': [climate(5, 30, 'current_heating_setpoint', 0.5), cfg.sensor_battery],
    'HS3CG': [cfg.binary_sensor_gas],
    '81825': [cfg.sensor_action],
    'Z809AF': [cfg.switch, cfg.sensor_power],
    'RADON TriTech ZB': [
        cfg.binary_sensor_occupancy, cfg.sensor_temperature, cfg.sensor_battery, cfg.binary_sensor_battery_low,
    ],
    'E1746': [],
    'YRD426NRSC': [cfg.lock, cfg.sensor_battery],
    'BE468': [cfg.lock, cfg.sensor_battery],
    'YRD246HA20BP': [cfg.lock, cfg.sensor_battery],
    'E1743': [cfg.sensor_click, cfg.sensor_action, cfg.sensor_battery],
    '9290019758': [
        cfg.binary_sensor_occupancy, cfg.sensor_temperature,
        cfg.sensor_illuminance, cfg.sensor_illuminance_lux, cfg.sensor_battery,
    ],
    'HGZB-042': [switchEndpoint('top'), switchEndpoint('bottom')],
    'HGZB-42': [switchEndpoint('top'), switchEndpoint('bottom')],
    'IM6001-OTP05': [cfg.switch],
    'SV01': [
        cfg.cover_position, cfg.sensor_temperature, cfg.sensor_pressure,
        cfg.sensor_battery,
    ],
    'SV02': [
        cfg.cover_position, cfg.sensor_temperature, cfg.sensor_pressure,
        cfg.sensor_battery,
    ],
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
    'HGZB-42-UK / HGZB-41 / HGZB-41-UK': [cfg.switch],
    'ISW-ZPR1-WP13': [
        cfg.binary_sensor_occupancy, cfg.sensor_temperature,
        cfg.sensor_battery, cfg.binary_sensor_battery_low,
    ],
    'HGZB-043': [switchEndpoint('top'), switchEndpoint('bottom'), switchEndpoint('center')],
    'HGZB-44': [
        switchEndpoint('top_left'), switchEndpoint('top_right'), switchEndpoint('bottom_left'),
        switchEndpoint('bottom_right'),
    ],
    'NUE-ZBFLB': [
        switchEndpoint('button_light'), switchEndpoint('button_fan_high'), switchEndpoint('button_fan_med'),
        switchEndpoint('button_fan_low'),
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
    'IM6001-MTP01': [cfg.sensor_temperature, cfg.sensor_battery, cfg.binary_sensor_occupancy],
    'U86K31ND6': [switchEndpoint('left'), switchEndpoint('right'), switchEndpoint('center')],
    'HS1RC-N': [cfg.sensor_action, cfg.sensor_battery],
    'SWO-WDS1PA': [cfg.binary_sensor_contact],
    'LLKZMK11LM': [
        switchEndpoint('l1'), switchEndpoint('l2'),
        cfg.sensor_power, cfg.sensor_temperature, cfg.sensor_consumption,
    ],
    'T18W3Z': [switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3')],
    'LVS-SM10ZW': [cfg.binary_sensor_contact, cfg.binary_sensor_battery_low],
    'HS2SK': [cfg.switch, cfg.sensor_power, cfg.sensor_voltage, cfg.sensor_current],
    'HS2SS': [cfg.sensor_action, cfg.sensor_battery],
    '45853GE': [cfg.switch, cfg.sensor_power],
    '3315-G': [
        cfg.sensor_temperature, cfg.sensor_battery, cfg.binary_sensor_water_leak,
    ],
    'N2G-SP': [cfg.sensor_power, cfg.switch, cfg.sensor_energy],
    'SCM-5ZBS': [cfg.cover_position],
    'YRD226HA2619': [cfg.sensor_battery, cfg.lock],
    'YMF40/YDM4109+': [cfg.lock, cfg.sensor_battery],
    'V3-BTZB': [cfg.lock, cfg.sensor_battery],
    '3RSS008Z': [cfg.switch, cfg.sensor_battery],
    '3RSS007Z': [cfg.switch],
    '99432': [cfg.fan, cfg.light_brightness],
    'IM6001-MPP01': [
        cfg.sensor_temperature, cfg.binary_sensor_contact, cfg.sensor_battery,
    ],
    '67200BL': [cfg.switch],
    'InstaRemote': [cfg.sensor_action],
    '100.425.90': [cfg.switch],
    'HS1CA-E': [
        cfg.binary_sensor_carbon_monoxide, cfg.binary_sensor_battery_low,
        cfg.sensor_battery,
    ],
    'MCT-340 E': [cfg.binary_sensor_contact, cfg.sensor_temperature, cfg.sensor_battery],
    'MCT-340 SMA': [cfg.binary_sensor_contact, cfg.sensor_temperature, cfg.sensor_battery],
    'ZGRC-KEY-013': [cfg.sensor_click, cfg.sensor_action],
    'ZigUP': [cfg.switch],
    'YRD256HA20BP': [cfg.sensor_battery, cfg.lock],
    'SZ-ESW01-AU': [cfg.sensor_power, cfg.switch],
    'PSM-29ZBSR': [cfg.switch, cfg.sensor_power],
    'SCM-S1': [cfg.cover_position],
    'HEIMAN-M1': [cfg.binary_sensor_contact],
    'HS3MS': [cfg.binary_sensor_occupancy],
    'DIYRUZ_R4_5': [
        switchEndpoint('bottom_left'), switchEndpoint('bottom_right'), switchEndpoint('center'),
        switchEndpoint('top_left'), switchEndpoint('top_right'),
    ],
    'NCZ-3011-HA': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'MEAZON_BIZY_PLUG': [cfg.sensor_power, cfg.switch, cfg.sensor_temperature],
    'MEAZON_DINRAIL': [cfg.sensor_power, cfg.switch, cfg.sensor_temperature],
    'HS1CA-M': [cfg.binary_sensor_carbon_monoxide, cfg.binary_sensor_battery_low],
    '12031': [cfg.cover_position],
    'LS12128': [cfg.cover_position],
    'HS2WD-E': [cfg.sensor_battery],
    'ZNMS12LM': [
        cfg.sensor_action, cfg.binary_sensor_lock, cfg.binary_sensor_lock_reverse,
        cfg.sensor_battery,
    ],
    'ZNMS13LM': [
        cfg.sensor_action, cfg.binary_sensor_lock, cfg.binary_sensor_lock_reverse,
    ],
    'ZNMS11LM': [
        cfg.sensor_action, cfg.binary_sensor_lock, cfg.binary_sensor_lock_reverse,
    ],
    '12050': [cfg.switch, cfg.sensor_power],
    'RH3040': [cfg.sensor_battery, cfg.binary_sensor_occupancy],
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
    'LVS-ZB15S': [cfg.switch],
    'LZL4BWHL01': [cfg.sensor_action],
    '2AJZ4KPKEY': [cfg.sensor_click, cfg.sensor_action, cfg.sensor_battery],
    '2AJZ4KPFT': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'TT001ZAV20': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'TS0002': [switchEndpoint('l1'), switchEndpoint('l2')],
    'LVS-ZB15R': [cfg.switch],
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
    'PM-C140-ZB': [cfg.sensor_power, cfg.switch],
    'PM-C150-ZB': [cfg.sensor_power, cfg.switch],
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
    'HS1CG-M': [cfg.binary_sensor_gas],
    'HS1CG_M': [cfg.binary_sensor_gas],
    'LVS-SN10ZW_SN11': [cfg.sensor_battery, cfg.binary_sensor_occupancy],
    'S1': [cfg.switch, cfg.sensor_power],
    'S2': [switchEndpoint('l1'), switchEndpoint('l2'), cfg.sensor_power],
    'ZWallRemote0': [cfg.sensor_click, cfg.sensor_action],
    'D1': [cfg.light_brightness, cfg.sensor_power],
    'J1': [cfg.cover_position_tilt, cfg.sensor_power],
    'ZNCZ03LM': [cfg.switch, cfg.sensor_power],
    'Z3-1BRL': [cfg.sensor_action, cfg.sensor_brightness],
    'HS1CG-E': [cfg.binary_sensor_gas],
    'ROB_200-008-0': [cfg.sensor_battery, cfg.sensor_click, cfg.sensor_action],
    'ICZB-IW11SW': [cfg.switch],
    'HGZB-20A': [cfg.switch],
    'SZ-ESW01': [cfg.switch, cfg.sensor_power],
    '2AJZ4KPBS': [cfg.sensor_battery, cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    '2AJZ4KPDR': [cfg.sensor_battery, cfg.binary_sensor_contact, cfg.binary_sensor_battery_low],
    '6717-84': [cfg.switch],
    'ICZB-KPD18S': [cfg.sensor_battery, cfg.sensor_click, cfg.sensor_action],
    'E1757': [cfg.cover_position, cfg.sensor_battery],
    'E1926': [cfg.cover_position, cfg.sensor_battery],
    'GL-W-001Z': [cfg.switch],
    'E1766': [cfg.sensor_click, cfg.sensor_battery, cfg.sensor_action],
    '3300-P': [cfg.sensor_temperature, cfg.binary_sensor_contact, cfg.sensor_battery],
    '929002240401': [cfg.switch],
    'HGZB-20-UK': [cfg.switch],
    'PTAPT-WH02': [cfg.switch],
    'DIYRuZ_magnet': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'XHS2-SE': [cfg.binary_sensor_contact, cfg.sensor_temperature, cfg.sensor_battery],
    '4000116784070': [cfg.switch],
    'YRD210-HA-605': [cfg.lock, cfg.sensor_battery],
    'YRD220/YRD221': [cfg.lock, cfg.sensor_battery],
    'ZM-CSW032-D': [cfg.cover_position],
    'LH-32ZB': [cfg.sensor_humidity, cfg.sensor_temperature, cfg.sensor_battery],
    'ZNCLDJ12LM': [cfg.cover_position, cfg.sensor_battery],
    '046677552343': [cfg.switch],
    'ZWLD-100': [cfg.binary_sensor_water_leak, cfg.binary_sensor_battery_low, cfg.sensor_battery],
    'YRD226/246 TSDB': [cfg.lock, cfg.sensor_battery],
    'BASICZBR3': [cfg.switch],
    'E1744': [cfg.sensor_action, cfg.sensor_battery],
    'TS0201': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'LH07321': [cfg.binary_sensor_water_leak, cfg.binary_sensor_battery_low],
    'TERNCY-PP01': [
        cfg.sensor_temperature, cfg.binary_sensor_occupancy, cfg.sensor_illuminance, cfg.sensor_illuminance_lux,
        cfg.sensor_click, cfg.sensor_action,
    ],
    'CR11S8UZ': [cfg.sensor_action],
    'STS-OUT-US-2': [cfg.switch, cfg.sensor_power],
    'UK7004240': [climate(), cfg.sensor_battery],
    'S31ZB': [cfg.switch],
    'SA-003-Zigbee': [cfg.switch],
    'SZ-DWS04': [cfg.binary_sensor_contact, cfg.sensor_temperature, cfg.sensor_battery],
    'TS0203': [cfg.sensor_battery, cfg.binary_sensor_contact],
    'TS0204': [cfg.binary_sensor_gas],
    'TS0205': [cfg.binary_sensor_smoke, cfg.sensor_battery],
    'TS0111': [cfg.switch],
    'TS0001': [cfg.switch],
    'TS0207': [cfg.binary_sensor_water_leak, cfg.sensor_battery],
    'iL07_1': [cfg.binary_sensor_occupancy, cfg.binary_sensor_tamper, cfg.binary_sensor_battery_low],
    'LH-992ZB': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'TS0202': [cfg.binary_sensor_occupancy, cfg.sensor_battery],
    'TS0218': [cfg.sensor_action, cfg.sensor_battery],
    '404021': [cfg.switch],
    'DIYRuZ_rspm': [cfg.switch, cfg.sensor_action, cfg.sensor_power, cfg.sensor_current],
    'ZG9101SAC-HP-Switch': [cfg.switch],
    'ZNCZ04LM': [
        cfg.switch, cfg.sensor_power, cfg.sensor_consumption,
        cfg.sensor_current, cfg.sensor_voltage, cfg.sensor_temperature,
    ],
    'ZNCZ12LM': [cfg.switch, cfg.sensor_power],
    'WXCJKG11LM': [cfg.sensor_action, cfg.sensor_battery],
    'WXCJKG12LM': [cfg.sensor_action, cfg.sensor_battery],
    'WXCJKG13LM': [cfg.sensor_action, cfg.sensor_battery],
    '8718699693985': [cfg.sensor_action, cfg.sensor_battery],
    'F-APP-UK-V2': [cfg.switch, cfg.sensor_power],
    'TS0043': [cfg.sensor_action, cfg.sensor_battery],
    'TS0041': [cfg.sensor_action, cfg.sensor_battery],
    'SP-EUC01': [cfg.switch, cfg.sensor_power],
    'TZSW22FW-L4': [switchEndpoint('top'), switchEndpoint('bottom')],
    'TS0011': [cfg.switch],
    'TS0012': [switchEndpoint('left'), switchEndpoint('right')],
    'TS0013': [switchEndpoint('left'), switchEndpoint('center'), switchEndpoint('right')],
    '6735/6736/6737': [cfg.switch, cfg.sensor_action],
    'SZ-SRN12N': [],
    '9GED18000-009': [cfg.lock, cfg.sensor_battery],
    '9GED21500-005': [cfg.lock, cfg.sensor_battery],
    'MP-841': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'MCT-370 SMA': [cfg.binary_sensor_contact, cfg.binary_sensor_battery_low],
    'SOHM-I1': [cfg.binary_sensor_contact, cfg.binary_sensor_battery_low],
    'SWHM-I1': [cfg.binary_sensor_water_leak, cfg.binary_sensor_battery_low],
    'SMHM-I1': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'SKHMP30-I1': [cfg.switch, cfg.sensor_power],
    '6ARCZABZH': [cfg.sensor_battery, cfg.sensor_action],
    'ZK-EU-2U': [cfg.switch],
    '511.202': [cfg.switch],
    'SP 224': [cfg.switch],
    'E1C-NB6': [cfg.switch],
    'LVS-SC7': [cfg.sensor_action],
    'ZM-L03E-Z': [switchEndpoint('left'), switchEndpoint('center'), switchEndpoint('right')],
    'DL15S-1BZ': [cfg.switch],
    'E1D-G73WNA': [cfg.binary_sensor_contact, cfg.binary_sensor_battery_low],
    'WV704R0A0902': [climate()],
    '067776': [cfg.cover_position],
    '067773': [cfg.sensor_action, cfg.sensor_battery],
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
    '12126': [cfg.switch],
    '067775': [cfg.switch, cfg.sensor_power],
    '064888': [cfg.switch],
    '412015': [cfg.sensor_power, cfg.binary_sensor_power_alarm_active],
    'GZCGQ01LM': [cfg.sensor_battery, cfg.sensor_illuminance, cfg.sensor_illuminance_lux],
    'U86KCJ-ZP': [cfg.sensor_action],
    'HS1HT': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'HS1HT-N': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'HS2ESK-E': [cfg.switch, cfg.sensor_power],
    'HS2AQ-EM': [
        cfg.sensor_battery, cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery_state,
        cfg.sensor_voc, cfg.sensor_pm25, cfg.sensor_pm10, cfg.sensor_hcho, cfg.sensor_aqi,
    ],
    'HS2IRC': [cfg.sensor_battery],
    'B01M7Y8BP9': [cfg.sensor_action],
    'GP-WOU019BBDWG': [cfg.switch, cfg.sensor_power, cfg.sensor_energy],
    'AV2010/21A': [cfg.binary_sensor_battery_low, cfg.binary_sensor_contact, cfg.binary_sensor_tamper],
    'AL-PIR02': [cfg.binary_sensor_occupancy, cfg.binary_sensor_tamper, cfg.sensor_battery],
    'TS0601_switch': [
        switchEndpoint('l1'), switchEndpoint('l2'),
        switchEndpoint('l3'), switchEndpoint('l4'),
    ],
    'TS0601_switch_2_gang': [switchEndpoint('l1'), switchEndpoint('l2')],
    'STS-WTR-250': [cfg.binary_sensor_water_leak, cfg.sensor_battery, cfg.sensor_temperature],
    'ZG2835RAC': [cfg.light_brightness, cfg.sensor_power, cfg.sensor_energy],
    'BW-IS2': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'BW-IS3': [cfg.binary_sensor_occupancy],
    'SLR1b': [climate()],
    'WPT1': [],
    'ROB_200-003-0': [cfg.switch],
    '4512704': [cfg.switch],
    'AV2010/24A': [cfg.binary_sensor_smoke, cfg.binary_sensor_battery_low, cfg.binary_sensor_tamper],
    '902010/24': [cfg.binary_sensor_smoke, cfg.binary_sensor_battery_low, cfg.binary_sensor_tamper],
    'SGMHM-I1': [cfg.binary_sensor_gas, cfg.binary_sensor_battery_low, cfg.binary_sensor_tamper],
    'STHM-I1H': [cfg.sensor_humidity, cfg.sensor_temperature, cfg.sensor_battery],
    'TS0042': [cfg.sensor_action, cfg.sensor_battery],
    'SNZB-04': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'SNZB-01': [cfg.sensor_action, cfg.sensor_battery],
    'SNZB-02': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'SNZB-03': [cfg.binary_sensor_occupancy, cfg.sensor_battery],
    '07046L': [cfg.sensor_action],
    '07045L': [cfg.binary_sensor_contact, cfg.binary_sensor_tamper, cfg.binary_sensor_battery_low],
    'TERNCY-SD01': [cfg.sensor_click, cfg.sensor_battery, cfg.sensor_action, cfg.sensor_direction],
    '07048L': [cfg.switch, cfg.sensor_power],
    'ICZB-KPD14S': [cfg.sensor_battery, cfg.sensor_click, cfg.sensor_action],
    '73743': [cfg.sensor_action, cfg.sensor_battery],
    'C4': [cfg.sensor_action],
    '66492-001': [cfg.lock, cfg.sensor_battery],
    'U202DST600ZB': [lightEndpoint('light_brightness', 'l1'), lightEndpoint('light_brightness', 'l2')],
    'SM10ZW': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'SW2500ZB': [cfg.switch],
    'SP2600ZB': [cfg.switch],
    '4512703': [cfg.sensor_action, cfg.sensor_battery],
    '4512721': [cfg.sensor_action, cfg.sensor_battery],
    '4512702': [cfg.sensor_action, cfg.sensor_battery],
    'HS1EB/HS1EB-E': [cfg.sensor_click, cfg.sensor_action, cfg.sensor_battery],
    'HS2SW1A/HS2SW1A-N': [cfg.switch, cfg.sensor_device_temperature],
    'HS2SW2A/HS2SW2A-N': [switchEndpoint('left'), switchEndpoint('right'), cfg.sensor_device_temperature],
    'HS2SW3A/HS2SW3A-N': [
        switchEndpoint('left'), switchEndpoint('right'),
        switchEndpoint('center'), cfg.sensor_device_temperature,
    ],
    'MCLH-07': [cfg.binary_sensor_water_leak, cfg.sensor_battery],
    'MCLH-04': [cfg.binary_sensor_contact, cfg.sensor_battery],
    '3323-G': [cfg.binary_sensor_contact, cfg.sensor_temperature, cfg.binary_sensor_battery_low],
    'ROB_200-007-0': [cfg.sensor_action, cfg.sensor_battery],
    'PM-S140-ZB': [cfg.switch],
    'PM-S240-ZB': [switchEndpoint('top'), switchEndpoint('bottom')],
    'PM-S340-ZB': [switchEndpoint('top'), switchEndpoint('center'), switchEndpoint('bottom')],
    'PM-S140R-ZB': [cfg.switch],
    'PM-S240R-ZB': [switchEndpoint('top'), switchEndpoint('bottom')],
    'PM-S340R-ZB': [switchEndpoint('top'), switchEndpoint('center'), switchEndpoint('bottom')],
    'PM-S150-ZB': [cfg.switch],
    'PM-S250-ZB': [switchEndpoint('top'), switchEndpoint('bottom')],
    'PM-S350-ZB': [switchEndpoint('top'), switchEndpoint('center'), switchEndpoint('bottom')],
    'U201SRY2KWZB': [cfg.switch],
    'U202SRY2KWZB': [switchEndpoint('l1'), switchEndpoint('l2')],
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
    'U02I007C.01': [
        cfg.sensor_action, cfg.binary_sensor_contact, cfg.binary_sensor_water_leak,
        cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery,
    ],
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
    '4040B': [cfg.sensor_power, switchEndpoint('l1'), switchEndpoint('l2')],
    '3460-L': [cfg.sensor_action, cfg.sensor_temperature, cfg.sensor_battery],
    '3157100': [climate(10, 30, 'occupied_heating_setpoint', 1, ['off', 'heat', 'cool'],
        ['auto', 'on'], [], true, true), cfg.sensor_battery],
    '4200-C': [cfg.switch],
    '4257050-RZHAC': [cfg.switch, cfg.sensor_power],
    '27087-03': [cfg.switch, cfg.sensor_battery],
    '99140-002': [cfg.lock, cfg.sensor_battery],
    '4512706': [cfg.sensor_battery, cfg.sensor_action],
    'RL804QZB': [switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3')],
    'RC-2000WH': [climate(10, 30, 'occupied_heating_setpoint', 1, ['off', 'auto', 'heat', 'cool'],
        ['auto', 'on', 'smart'], [], true, true)],
    'SP 220': [cfg.switch],
    '511.344': [cfg.sensor_battery, cfg.sensor_action, cfg.sensor_action_color, cfg.sensor_action_color_temperature],
    'SMSZB-120': [cfg.binary_sensor_smoke, cfg.sensor_temperature, cfg.sensor_battery],
    'DWS003': [cfg.binary_sensor_contact, cfg.sensor_battery, cfg.binary_sensor_battery_low, cfg.sensor_temperature],
    'MOT003': [cfg.binary_sensor_occupancy, cfg.sensor_temperature, cfg.sensor_battery, cfg.binary_sensor_battery_low],
    'GreenPower_On_Off_Switch': [cfg.sensor_action],
    'GreenPower_7': [cfg.sensor_action],
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
    'WXKG07LM': [cfg.sensor_action, cfg.sensor_battery],
    'MCLH-03': [cfg.switch, cfg.sensor_voltage, cfg.sensor_power, cfg.sensor_current],
    '752189': [cfg.sensor_action, cfg.sensor_battery],
    'XBee': [],
    'ZBHT-1': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'MCLH-05': [cfg.binary_sensor_occupancy, cfg.sensor_battery],
    '5AA-SS-ZA-H0': [cfg.binary_sensor_occupancy, cfg.sensor_illuminance, cfg.sensor_illuminance_lux],
    'MOSZB-130': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'AU-A1ZBRC': [cfg.sensor_action, cfg.sensor_battery],
    'AU-A1ZBPIRS': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low, cfg.sensor_illuminance_lux],
    'TS0121_plug': [cfg.switch, cfg.sensor_voltage, cfg.sensor_power, cfg.sensor_current],
    'ZK03840': [climate()],
    'ZS1100400-IN-V1A02': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'MCLH-08': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_eco2, cfg.sensor_voc],
    'ED2004-012': [cfg.switch],
    'SLT2': [],
    'SLB2': [],
    '8840100H': [cfg.binary_sensor_water_leak, cfg.sensor_temperature, cfg.sensor_battery],
    '9290022408': [cfg.switch],
    'HGZB-14A': [cfg.binary_sensor_water_leak, cfg.sensor_battery],
    'TERNCY-DC01': [cfg.sensor_temperature, cfg.binary_sensor_contact],
    'ZS110050078': [cfg.binary_sensor_contact, cfg.binary_sensor_battery_low],
    'ECW-100-A03': [switchEndpoint('top'), switchEndpoint('center'), switchEndpoint('bottom')],
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
    'LH-990ZB': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'HO-09ZB': [cfg.binary_sensor_contact, cfg.binary_sensor_battery_low],
    '500.67': [cfg.sensor_action],
    'E1E-G7F': [cfg.sensor_action],
    'LH-990F': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'QBKG25LM': [switchEndpoint('left'), switchEndpoint('center'), switchEndpoint('right'), cfg.sensor_action],
    'QBKG26LM': [switchEndpoint('left'), switchEndpoint('center'), switchEndpoint('right')],
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
    'SAGE206612': [cfg.sensor_action, cfg.sensor_battery],
    'TI0001-switch': [cfg.switch],
    'TI0001-socket': [cfg.switch],
    '160-01': [cfg.switch, cfg.sensor_power],
    'ZS232000178': [cfg.sensor_action],
    'ZS190000118 ': [cfg.switch],
    'mcdj3aq': [cfg.cover_position],
    'DIYRuZ_Geiger': [cfg.sensor_radioactive_events_per_minute, cfg.sensor_radiation_dose_per_hour, cfg.sensor_action],
    '12127': [switchEndpoint('l1'), switchEndpoint('l2')],
    'SWO-MOS1PA': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'STS-IRM-251': [cfg.sensor_temperature, cfg.binary_sensor_occupancy, cfg.sensor_battery],
    'WSDCGQ12LM': [cfg.sensor_temperature, cfg.sensor_pressure, cfg.sensor_humidity, cfg.sensor_battery],
    'SJCGQ12LM': [cfg.sensor_battery, cfg.binary_sensor_water_leak],
    'DJT12LM': [cfg.sensor_action],
    'AV2010/22A': [cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low],
    'RS-23ZBS': [cfg.sensor_temperature, cfg.sensor_humidity],
    'KMPCIL_RES005': [
        cfg.sensor_battery, cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_pressure, cfg.sensor_illuminance,
        cfg.sensor_illuminance_lux, cfg.binary_sensor_occupancy, cfg.switch,
    ],
    'DIYRuZ_R8_8': [
        switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3'), switchEndpoint('l4'),
        switchEndpoint('l5'), switchEndpoint('l6'), switchEndpoint('l7'), switchEndpoint('l8'),
    ],
    'DIYRuZ_RT': [cfg.switch, cfg.sensor_temperature],
    '99100-006': [cfg.lock, cfg.sensor_battery],
    'SPE600': [cfg.switch, cfg.sensor_power],
    '067774': [cfg.sensor_action, cfg.sensor_battery],
    '067694': [cfg.sensor_action, cfg.sensor_battery],
    '170-33505': [cfg.switch, cfg.sensor_voltage, cfg.sensor_current, cfg.sensor_power],
    'YRL-220L': [cfg.lock, cfg.sensor_battery],
    'TS0115': [
        switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3'), switchEndpoint('l4'),
        switchEndpoint('l5'),
    ],
    'WL4200': [cfg.binary_sensor_water_leak, cfg.binary_sensor_battery_low],
    'LXN59-2S7LX1.0': [switchEndpoint('left'), switchEndpoint('right')],
    'X711A': [cfg.switch],
    'X712A': [switchEndpoint('l1'), switchEndpoint('l2')],
    'X713A': [switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3')],
    'TYZS1L': [cfg.light_colorhs],
    '43102': [cfg.switch],
    'ROB_200-010-0': [cfg.cover_position],
    'AM25': [cfg.cover_position, cfg.sensor_battery],
    '43076': [cfg.switch],
    'ZSTY-SM-11ZG-US-W': [cfg.switch],
    'ZSTY-SM-1CTZG-US-W': [cfg.cover_position],
    'SNTZ009': [cfg.binary_sensor_water_leak],
    'NAS-AB02B0': [
        cfg.sensor_temperature, cfg.sensor_humidity, cfg.binary_sensor_humidity_alarm,
        cfg.binary_sensor_temperature_alarm, cfg.binary_sensor_alarm,
    ],
    'TS0004': [switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3'), switchEndpoint('l4')],
    'U86KWF-ZPSJ': [climate(5, 30, 'current_heating_setpoint', 0.5)],
    'D3-DPWK-TY': [climate(5, 30, 'current_heating_setpoint', 0.5)],
    '98423051': [cfg.switch],
    'TS0215A': [cfg.sensor_battery, cfg.sensor_action],
    'GWA1521': [cfg.switch],
    'GWA1522': [switchEndpoint('l1'), switchEndpoint('l2')],
    'GWA1531': [cfg.cover_position],
    'TPZRCO2HT-Z3': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery, cfg.sensor_co2],
    '43100': [cfg.switch],
    '3400-D': [cfg.sensor_action, cfg.sensor_battery],
    'TS0121_switch': [cfg.switch],
    'ED-10011': [cfg.sensor_action],
    'ED-10012': [cfg.sensor_action],
    'QS-Zigbee-S04-2C-LN': [switchEndpoint('l1'), switchEndpoint('l2')],
    'SM308': [cfg.switch],
    'SR-ZG9001T4-DIM-EU': [cfg.sensor_action],
    'MEG5113-0300/MEG5165-0000': [cfg.cover_position],
    '43084': [cfg.switch],
    'WSP404': [cfg.switch, cfg.sensor_power, cfg.sensor_energy],
    '8718699689308': [cfg.switch],
    '07047L': [
        cfg.binary_sensor_occupancy, cfg.binary_sensor_battery_low, cfg.sensor_temperature,
        cfg.sensor_humidity, cfg.sensor_illuminance, cfg.sensor_illuminance_lux,
    ],
    'BHT-002-GCLZB': [cfg.lock_child_lock, climate(5, 30, 'current_heating_setpoint', 1)],
    'E220-KR4N0Z0-HA': [switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3'), switchEndpoint('l4')],
    '11830304': [cfg.cover_position],
    '99100-045': [cfg.lock, cfg.sensor_battery],
    'QZR-ZIG2400': [],
    'HDM40PV620': [cfg.cover_position],
    'TS0207_repeater': [],
    'LeTV.8KEY': [cfg.sensor_action],
    'TS0044': [cfg.sensor_action, cfg.sensor_battery],
    'HS2CM-N-DC': [cfg.cover_position],
    'ZS190000118': [cfg.switch],
    'ZG2835': [cfg.sensor_action],
    'CTR.UBX': [cfg.sensor_action],
    'WS-USC03': [cfg.switch],
    'TS0601_switch_3_gang': [switchEndpoint('l1'), switchEndpoint('l2'), switchEndpoint('l3')],
    '4655BC0-R': [cfg.binary_sensor_contact, cfg.binary_sensor_battery_low],
    'BHT-002-GCLZB': [cfg.lock_child_lock, climate(5, 30, 'current_heating_setpoint', 1, ['off', 'heat'], [], ['hold', 'program'])],
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

                for (const expose of def.exposes) {
                    let discoveryEntry = null;
                    /* istanbul ignore else */
                    if (expose.type === 'light') {
                        discoveryEntry = {
                            type: 'light',
                            object_id: expose.endpoint ? `light_${expose.endpoint}` : 'light',
                            discovery_payload: {
                                brightness: expose.features.includes('brightness'),
                                color_temp: expose.features.includes('color_temp'),
                                xy: expose.features.includes('color_xy'),
                                hs: expose.features.includes('color_hs'),
                                schema: 'json',
                                command_topic: true,
                                brightness_scale: 254,
                                command_topic_prefix: expose.endpoint ? expose.endpoint : undefined,
                                state_topic_postfix: expose.endpoint ? expose.endpoint : undefined,
                            },
                        };
                    }

                    assert(discoveryEntry !== null, `Unsupported expose for '${def.model}': ${stringify(expose)}`);
                    this.mapping[def.model].push(discoveryEntry);
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
                    this.mapping[data.entity.definition.model].includes(cfg.binary_sensor_water_leak),
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
        if (!discover || !device || !definition || !this.mapping[definition.model] || device.interviewing ||
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

            // if (payload.away_mode_state_topic) {
            //     payload.away_mode_state_topic = stateTopic;
            // }

            // if (payload.away_mode_command_topic) {
            //     payload.away_mode_command_topic = `${stateTopic}/set/away_mode`;
            // }

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
        const discoveryRegex = new RegExp(`${this.discoveryTopic}/(.*)/(.*)/(.*)/config`);
        const discoveryMatch = topic.match(discoveryRegex);
        const isDeviceAutomation = discoveryMatch && discoveryMatch[1] === 'device_automation';
        if (discoveryMatch) {
            // Clear outdated discovery configs and remember already discoverd device_automations
            try {
                message = JSON.parse(message);
                const property = isDeviceAutomation ? 'topic' : 'availability_topic';
                if (!message || !message[property] ||
                    !message[property].startsWith(settings.get().mqtt.base_topic + '/')) {
                    // Base topic is different, probably different Zigbee2MQTT instance.
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
