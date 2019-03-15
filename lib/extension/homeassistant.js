const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const settings = require('../util/settings');
const logger = require('../util/logger');
const zigbee2mqttVersion = require('../../package.json').version;
const BaseExtension = require('./baseExtension');

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
    'binary_sensor_router': {
        type: 'binary_sensor',
        object_id: 'router',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.state }}',
            device_class: 'connectivity',
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

    // Sensor
    'sensor_illuminance': {
        type: 'sensor',
        object_id: 'illuminance',
        discovery_payload: {
            unit_of_measurement: 'lx',
            device_class: 'illuminance',
            value_template: '{{ value_json.illuminance }}',
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
    'sensor_temperature': {
        type: 'sensor',
        object_id: 'temperature',
        discovery_payload: {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            value_template: '{{ value_json.temperature }}',
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
            icon: 'mdi:factory',
            value_template: '{{ value_json.power }}',
        },
    },
    'sensor_current': {
        type: 'sensor',
        object_id: 'current',
        discovery_payload: {
            unit_of_measurement: 'A',
            icon: 'mdi:power-plug',
            value_template: '{{ value_json.current }}',
        },
    },
    'sensor_voltage': {
        type: 'sensor',
        object_id: 'voltage',
        discovery_payload: {
            unit_of_measurement: 'V',
            icon: 'mdi:flash',
            value_template: '{{ value_json.voltage }}',
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
            unit_of_measurement: '-',
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
    'sensor_sensitivity': {
        type: 'sensor',
        object_id: 'sensitivity',
        discovery_payload: {
            value_template: '{{ value_json.sensitivity }}',
            icon: 'mdi:filter-variant',
        },
    },

    // Light
    'light_brightness_colorxy_white': {
        type: 'light',
        object_id: 'light',
        discovery_payload: {
            brightness: true,
            xy: true,
            white_value: true,
            schema: 'json',
            command_topic: true,
        },
    },
    'light_brightness_colortemp_colorxy': {
        type: 'light',
        object_id: 'light',
        discovery_payload: {
            brightness: true,
            color_temp: true,
            xy: true,
            schema: 'json',
            command_topic: true,
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
        },
    },
    'light_brightness': {
        type: 'light',
        object_id: 'light',
        discovery_payload: {
            brightness: true,
            schema: 'json',
            command_topic: true,
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
        },
    },

    // Thermostat/HVAC
    'thermostat': (minTemp=7, maxTemp=30, temperatureStateProperty='occupied_heating_setpoint', tempStep=1) => {
        return {
            type: 'climate',
            object_id: 'climate',
            discovery_payload: {
                state_topic: false,
                min_temp: `${minTemp}`,
                max_temp: `${maxTemp}`,
                modes: ['off', 'auto', 'heat'],
                mode_state_topic: true,
                mode_state_template: '{{ value_json.system_mode }}',
                mode_command_topic: true,
                current_temperature_topic: true,
                current_temperature_template: '{{ value_json.local_temperature }}',
                temperature_state_topic: true,
                temperature_state_template: `{{ value_json.${temperatureStateProperty} }}`,
                temperature_command_topic: temperatureStateProperty,
                temp_step: tempStep,
            },
        };
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
};

const switchWithPostfix = (postfix) => {
    return {
        type: 'switch',
        object_id: `switch_${postfix}`,
        discovery_payload: {
            payload_off: 'OFF',
            payload_on: 'ON',
            value_template: `{{ value_json.state_${postfix} }}`,
            command_topic: true,
            command_topic_prefix: postfix,
        },
    };
};

// Map homeassitant configurations to devices.
const mapping = {
    'WXKG01LM': [cfg.sensor_click, cfg.sensor_battery],
    'WXKG11LM': [cfg.sensor_click, cfg.sensor_battery],
    'WXKG12LM': [cfg.sensor_click, cfg.sensor_battery, cfg.sensor_action],
    // DEPRECATED; BREAKING_IMPROVEMENT: only use sensor_click for WXKG03LM (action hold -> click hold)
    'WXKG03LM': [cfg.sensor_click, cfg.sensor_battery, cfg.sensor_action],
    'WXKG02LM': [cfg.sensor_click, cfg.sensor_battery],
    'QBKG04LM': [cfg.switch, cfg.sensor_click, cfg.sensor_action],
    'QBKG03LM': [switchWithPostfix('left'), switchWithPostfix('right'), cfg.sensor_click, cfg.sensor_temperature],
    'WSDCGQ01LM': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_battery],
    'WSDCGQ11LM': [cfg.sensor_temperature, cfg.sensor_humidity, cfg.sensor_pressure, cfg.sensor_battery],
    'RTCGQ01LM': [cfg.binary_sensor_occupancy, cfg.sensor_battery],
    'RTCGQ11LM': [cfg.binary_sensor_occupancy, cfg.sensor_illuminance, cfg.sensor_battery],
    'MCCGQ01LM': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'MCCGQ11LM': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'SJCGQ11LM': [cfg.binary_sensor_water_leak, cfg.sensor_battery],
    'MFKZQ01LM': [cfg.sensor_action, cfg.sensor_battery],
    'ZNCZ02LM': [cfg.switch, cfg.sensor_power],
    'QBCZ11LM': [cfg.switch, cfg.sensor_power],
    'LED1545G12': [cfg.light_brightness_colortemp],
    'LED1623G12': [cfg.light_brightness],
    'LED1622G12': [cfg.light_brightness],
    'LED1537R6': [cfg.light_brightness_colortemp],
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
    'CC2530.ROUTER': [cfg.binary_sensor_router],
    'AA70155': [cfg.light_brightness_colortemp],
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
    'AA68199': [cfg.light_brightness_colortemp],
    'QBKG11LM': [cfg.switch, cfg.sensor_power, cfg.sensor_click],
    'QBKG12LM': [switchWithPostfix('left'), switchWithPostfix('right'), cfg.sensor_power, cfg.sensor_click],
    'K2RGBW01': [cfg.light_brightness_colortemp_colorxy],
    '9290011370': [cfg.light_brightness],
    'DNCKATSW001': [cfg.switch],
    'Z809A': [cfg.switch, cfg.sensor_power],
    'NL08-0800': [cfg.light_brightness],
    '915005106701': [cfg.light_brightness_colortemp_colorxy],
    'AB32840': [cfg.light_brightness_colortemp],
    '8718696485880': [cfg.light_brightness_colortemp_colorxy],
    '8718696598283': [cfg.light_brightness_colortemp],
    '8718696695203': [cfg.light_brightness_colortemp],
    '73693': [cfg.light_brightness_colortemp_colorxy],
    '324131092621': [cfg.sensor_action, cfg.sensor_battery],
    '9290012607': [cfg.binary_sensor_occupancy, cfg.sensor_temperature, cfg.sensor_illuminance, cfg.sensor_battery],
    'GL-C-008': [cfg.light_brightness_colortemp_colorxy],
    'GL-C-009': [cfg.light_brightness],
    'STSS-MULT-001': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'E11-G23/E11-G33': [cfg.light_brightness],
    'E1ACA4ABE38A': [cfg.light_brightness],
    'AC03645': [cfg.light_brightness_colortemp_colorxy],
    'AC03641': [cfg.light_brightness],
    'AC03648': [cfg.light_brightness_colortemp],
    'FB56+ZSW05HG1.2': [cfg.switch],
    '72922-A': [cfg.switch],
    'AC03642': [cfg.light_brightness_colortemp],
    'AC08560': [cfg.light_brightness],
    'DNCKATSW002': [switchWithPostfix('left'), switchWithPostfix('right')],
    'DNCKATSW003': [switchWithPostfix('left'), switchWithPostfix('right'), switchWithPostfix('center')],
    'DNCKATSW004': [
        switchWithPostfix('bottom_left'), switchWithPostfix('bottom_right'),
        switchWithPostfix('top_left'), switchWithPostfix('top_right'),
    ],
    'BY 165': [cfg.light_brightness],
    'ZLED-2709': [cfg.light_brightness],
    '8718696548738': [cfg.light_brightness_colortemp],
    '915005587401': [cfg.light_brightness_colortemp],
    '4052899926110': [cfg.light_brightness_colortemp_colorxy],
    'Z01-CIA19NAE26': [cfg.light_brightness],
    'E11-N1EA': [cfg.light_brightness_colortemp_colorxy],
    '74283': [cfg.light_brightness],
    'JTQJ-BF-01LM/BW': [cfg.binary_sensor_gas, cfg.sensor_gas_density, cfg.sensor_sensitivity],
    '50043': [cfg.switch],
    '50045': [cfg.light_brightness],
    'AV2010/22': [cfg.binary_sensor_occupancy, cfg.sensor_battery],
    '3210-L': [cfg.switch, cfg.sensor_power, cfg.sensor_current, cfg.sensor_voltage],
    '3320-L': [cfg.binary_sensor_contact, cfg.sensor_temperature, cfg.sensor_battery],
    '3326-L': [cfg.binary_sensor_occupancy, cfg.sensor_temperature, cfg.sensor_battery],
    '7299355PH': [cfg.light_brightness_colorxy],
    '45857GE': [cfg.light_brightness],
    'A6121': [cfg.sensor_lock],
    '433714': [cfg.light_brightness],
    '3261030P7': [cfg.light_brightness_colortemp],
    '3216431P5': [cfg.light_brightness_colortemp],
    'DJT11LM': [cfg.sensor_action, cfg.sensor_battery, cfg.sensor_sensitivity],
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
    'MG-AUWS01': [switchWithPostfix('left'), switchWithPostfix('right')],
    '9290002579A': [cfg.light_brightness_colortemp_colorxy],
    '4256251-RZHAC': [cfg.switch, cfg.sensor_power],
    '4257050-ZHAC': [cfg.light_brightness, cfg.sensor_power, cfg.sensor_current, cfg.sensor_voltage],
    'STS-PRS-251': [cfg.binary_sensor_presence, cfg.sensor_battery],
    '4058075816794': [cfg.light_brightness_colortemp],
    '4052899926158': [cfg.light_brightness],
    '4058075036185': [cfg.light_brightness_colortemp_colorxy],
    '50049': [cfg.light_brightness_colorxy],
    '915005733701': [cfg.light_brightness_colortemp_colorxy],
    'RB 285 C': [cfg.light_brightness_colortemp_colorxy],
    '3216331P5': [cfg.light_brightness_colortemp],
    'AC08562': [cfg.light_brightness],
    '900008-WW': [cfg.light_brightness],
    'Mega23M12': [cfg.light_brightness_colortemp_colorxy],
    'PSS-23ZBS': [cfg.switch],
    'HS1SA-M': [cfg.binary_sensor_smoke, cfg.binary_sensor_battery_low],
    'Z01-A19NAE26': [cfg.light_brightness_colortemp],
    'Z01-A60EAE27': [cfg.light_brightness_colortemp],
    'AC01353010G': [cfg.binary_sensor_occupancy, cfg.sensor_temperature, cfg.binary_sensor_battery_low],
    'SP 120': [cfg.switch, cfg.sensor_power],
    'SP 222': [cfg.switch],
    'RB 248 T': [cfg.light_brightness_colortemp],
    'HS3SA': [cfg.binary_sensor_smoke, cfg.binary_sensor_battery_low],
    'HS1DS/HS3DS': [cfg.binary_sensor_contact],
    'HS1WL/HS3WL': [cfg.binary_sensor_water_leak],
    'HS1-WL-E': [cfg.binary_sensor_water_leak],
    '421786': [cfg.light_brightness],
    'ICZB-IW11D': [cfg.light_brightness],
    '3321-S': [cfg.binary_sensor_contact, cfg.sensor_temperature],
    'ZPIR-8000': [cfg.binary_sensor_occupancy],
    'ZCTS-808': [cfg.binary_sensor_contact, cfg.sensor_battery],
    'ZNLDP12LM': [cfg.light_brightness_colortemp],
    'D1821': [cfg.light_brightness_colortemp_colorxy],
    'ZNCLDJ11LM': [cfg.cover_position, cfg.sensor_cover],
    'LTFY004': [cfg.light_brightness_colorxy],
    'GL-S-007Z': [cfg.light_brightness_colorxy_white],
    '3325-S': [cfg.sensor_temperature, cfg.binary_sensor_occupancy],
    '4713407': [cfg.light_brightness],
    '464800': [cfg.light_brightness_colortemp],
    '3261331P7': [cfg.light_brightness_colortemp],
    '4033930P7': [cfg.light_brightness_colortemp],
    'GL-B-008Z': [cfg.light_brightness_colortemp_colorxy],
    'AV2010/25': [cfg.switch, cfg.sensor_power],
    'E12-N14': [cfg.light_brightness],
    '1TST-EU': [cfg.thermostat(), cfg.sensor_battery],
    'RB 178 T': [cfg.light_brightness_colortemp],
    '45856GE': [cfg.switch],
    'GL-D-003Z': [cfg.light_brightness_colortemp_colorxy],
    'GL-D-005Z': [cfg.light_brightness_colortemp_colorxy],
    'GD-CZ-006': [cfg.light_brightness],
    'AIRAM-CTR.U': [],
    'HGZB-20-DE': [cfg.switch],
    'D1531': [cfg.light_brightness],
    'D1532': [cfg.light_brightness],
    'AV2010/32': [],
    'HGZB-07A': [cfg.light_brightness_colortemp_colorxy],
    'E1524/E1810': [cfg.sensor_action, cfg.sensor_battery],
    'GL-C-006': [cfg.light_brightness_colortemp],
    'GL-C-007': [cfg.light_brightness_colorxy_white],
    '100.424.11': [cfg.light_brightness_colortemp],
    'AC0251100NJ/AC0251700NJ': [cfg.sensor_action, cfg.sensor_battery],
    '71831': [cfg.light_brightness_colortemp],
    '404000/404005/404012': [cfg.light_brightness_colortemp_colorxy],
    '44435': [cfg.light_brightness_colortemp_colorxy],
    '404006/404008/404004': [cfg.light_brightness_colortemp],
    'MLI-404011': [cfg.sensor_action],
    'GL-S-003Z': [cfg.light_brightness_colorxy_white],
    'GL-S-005Z': [cfg.light_brightness_colortemp_colorxy],
    'HS1DS-E': [cfg.binary_sensor_contact],
    'SP600': [cfg.switch, cfg.sensor_power],
    '1613V': [cfg.switch, cfg.sensor_power],
    'XVV-Mega23M12': [cfg.light_brightness_colortemp],
    'GL-B-007Z': [cfg.light_brightness_colortemp_colorxy],
    '81809': [cfg.light_brightness_colortemp_colorxy],
    '4090130P7': [cfg.light_brightness_colortemp_colorxy],
    '100.110.39': [cfg.light_brightness_colortemp_colorxy],
    'TI0001': [switchWithPostfix('left'), switchWithPostfix('right')],
    'SPZB0001': [cfg.thermostat(5, 30, 'current_heating_setpoint', 0.5), cfg.sensor_battery],
    'HS3CG': [cfg.binary_sensor_gas],
    '81825': [cfg.sensor_action],
    'Z809AF': [cfg.switch, cfg.sensor_power],
    'RADON TriTech ZB': [
        cfg.binary_sensor_occupancy, cfg.sensor_temperature, cfg.sensor_battery, cfg.binary_sensor_battery_low,
    ],
    'IM-Z3.0-DIM': [cfg.light_brightness],
    'E1746': [],
    'LED1836G9': [cfg.light_brightness],
    'YRD426NRSC': [cfg.lock, cfg.sensor_battery],
    'E1743': [cfg.sensor_click, cfg.sensor_battery],
    'LED1732G11': [cfg.light_brightness_colortemp],
    'LED1736G9': [cfg.light_brightness_colortemp],
    'RB 265': [cfg.light_brightness],
    '9290019758': [
        cfg.binary_sensor_occupancy, cfg.sensor_temperature,
        cfg.sensor_illuminance, cfg.sensor_battery,
    ],
    'HGZB-042': [switchWithPostfix('top'), switchWithPostfix('bottom')],
    'HGZB-42': [switchWithPostfix('top'), switchWithPostfix('bottom')],
    'GL-FL-004TZ': [cfg.light_brightness_colortemp_colorxy],
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
    'ST218': [],
    'E1525': [cfg.binary_sensor_occupancy, cfg.sensor_battery],
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
    'HGZB-043': [switchWithPostfix('top'), switchWithPostfix('bottom'), switchWithPostfix('center')],
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
    'IM6001-BTP01': [cfg.sensor_click, cfg.sensor_temperature],
    'AV2010/34': [cfg.sensor_click],
    'PP-WHT-US': [
        cfg.switch, cfg.sensor_power,
        cfg.sensor_current, cfg.sensor_voltage,
    ],
    'CR701-YZ': [
        cfg.binary_sensor_battery_low, cfg.binary_sensor_carbon_monoxide,
        cfg.binary_sensor_gas,
    ],
    'HGZB-1S': [cfg.switch, cfg.sensor_click],
    'HGZB-045': [cfg.switch, cfg.sensor_click],
    'HGZB-43': [switchWithPostfix('top'), switchWithPostfix('bottom'), switchWithPostfix('center')],
    'HGZB-01A/02A': [configurations.switch],
    'MCT-350 SMA': [configurations.binary_sensor_contact],
    'SWO-KEF1PA': [configurations.sensor_action],
};

Object.keys(mapping).forEach((key) => {
    mapping[key].push(cfg.sensor_linkquality);
});

/**
 * This extensions handles integration with HomeAssistant
 */
class HomeAssistant extends BaseExtension {
    constructor(zigbee, mqtt, state, publishEntityState) {
        super(zigbee, mqtt, state, publishEntityState);

        // A map of all discoverd devices
        this.discovered = {};

        if (!settings.get().advanced.cache_state) {
            logger.warn('In order for HomeAssistant integration to work properly set `cache_state: true');
        }

        if (settings.get().experimental.output === 'attribute') {
            throw new Error('Home Assitant integration is not possible with attribute output!');
        }

        this.discoveryTopic = settings.get().advanced.homeassistant_discovery_topic;
        this.statusTopic = settings.get().advanced.homeassistant_status_topic;
    }

    async onMQTTConnected() {
        this.mqtt.subscribe(this.statusTopic);

        // MQTT discovery of all paired devices on startup.
        for (const device of this.zigbee.getClients()) {
            const mappedModel = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
            if (mappedModel) {
                this.discover(device.ieeeAddr, mappedModel, true);
            }
        }
    }

    discover(entityID, mappedModel, force=false) {
        // Check if already discoverd and check if there are configs.
        const discover = force || !this.discovered[entityID];
        if (!discover) {
            return;
        }

        const entity = settings.getEntity(entityID);
        if (!entity || (entity.type === 'device' && !mapping[mappedModel.model]) ||
            (entity.hasOwnProperty('homeassistant') && !entity.homeassistant)) {
            return;
        }

        mapping[mappedModel.model].forEach((config) => {
            const topic = `${config.type}/${entity.ID}/${config.object_id}/config`;
            const payload = {...config.discovery_payload};
            const stateTopic = `${settings.get().mqtt.base_topic}/${entity.friendlyName}`;

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

            // Set (unique) name
            payload.name = `${entity.friendlyName}_${config.object_id}`;

            // Set unique_id
            payload.unique_id = `${entity.ID}_${config.object_id}_${settings.get().mqtt.base_topic}`;

            // Attributes for device registry
            payload.device = {
                identifiers: [`zigbee2mqtt_${entity.ID}`],
                name: entity.friendlyName,
                sw_version: `Zigbee2mqtt ${zigbee2mqttVersion}`,
                model: `${mappedModel.description} (${mappedModel.model})`,
                manufacturer: mappedModel.vendor,
            };

            // Set availability payload
            // When using availability_timeout each device has it's own availability topic.
            // If not, use the availability topic of zigbee2mqtt.
            if (settings.get().advanced.availability_timeout) {
                payload.availability_topic = `${settings.get().mqtt.base_topic}/${entity.friendlyName}/availability`;
            } else {
                payload.availability_topic = `${settings.get().mqtt.base_topic}/bridge/state`;
            }

            // Add precision to value_template
            if (entity.hasOwnProperty(`${config.object_id}_precision`)) {
                const precision = entity[`${config.object_id}_precision`];
                let template = payload.value_template;
                template = template.replace('{{ ', '').replace(' }}', '');
                template = `{{ (${template} | float) | round(${precision}) }}`;
                payload.value_template = template;
            }

            if (payload.command_topic) {
                payload.command_topic = `${settings.get().mqtt.base_topic}/${entity.friendlyName}/`;

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

            if (payload.current_temperature_topic) {
                payload.current_temperature_topic = stateTopic;
            }

            if (payload.temperature_state_topic) {
                payload.temperature_state_topic = stateTopic;
            }

            if (payload.speed_state_topic) {
                payload.speed_state_topic = stateTopic;
            }

            if (payload.temperature_command_topic) {
                payload.temperature_command_topic = `${stateTopic}/set/${payload.temperature_command_topic}`;
            }

            if (payload.speed_command_topic) {
                payload.speed_command_topic = `${stateTopic}/set/fan_mode`;
            }

            // Override configuration with user settings.
            if (entity.hasOwnProperty('homeassistant')) {
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

                add(entity.homeassistant);

                if (entity.homeassistant.hasOwnProperty(config.object_id)) {
                    add(entity.homeassistant[config.object_id]);
                }
            }

            this.mqtt.publish(topic, JSON.stringify(payload), {retain: true, qos: 0}, this.discoveryTopic);
        });

        this.discovered[entityID] = true;
    }

    onMQTTMessage(topic, message) {
        if (topic !== this.statusTopic) {
            return false;
        }

        if (message.toLowerCase() === 'online') {
            const timer = setTimeout(async () => {
                // Publish all device states.
                for (const device of this.zigbee.getClients()) {
                    if (this.state.exists(device.ieeeAddr)) {
                        this.publishEntityState(device.ieeeAddr, this.state.get(device.ieeeAddr));
                    }
                }

                clearTimeout(timer);
            }, 20000);
        }
    }

    onZigbeeEvent(type, data, mappedDevice, settingsDevice) {
        const device = data.device;
        if (device && mappedDevice) {
            this.discover(device.ieeeAddr, mappedDevice);
        }
    }

    // Only for homeassistant.test.js
    _getMapping() {
        return mapping;
    }
}

module.exports = HomeAssistant;
