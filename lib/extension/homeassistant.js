const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const settings = require('../util/settings');
const logger = require('../util/logger');
const zigbee2mqttVersion = require('../../package.json').version;

const configurations = {
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
            expire_after: 1,
        },
    },
    'sensor_power': {
        type: 'sensor',
        object_id: 'power',
        discovery_payload: {
            unit_of_measurement: 'Watt',
            icon: 'mdi:flash',
            value_template: '{{ value_json.power }}',
        },
    },
    'sensor_action': {
        type: 'sensor',
        object_id: 'action',
        discovery_payload: {
            icon: 'mdi:gesture-double-tap',
            value_template: '{{ value_json.action }}',
            expire_after: 1,
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
    'sensor_cover': {
        type: 'sensor',
        object_id: 'cover',
        discovery_payload: {
            value_template: '{{ value_json.position }}',
            icon: 'mdi:view-array',
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

    // Lock
    'lock': {
        type: 'lock',
        object_id: 'lock',
        discovery_payload: {
            command_topic: true,
            value_template: '{{ value_json.state }}',
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
    'WXKG01LM': [configurations.sensor_click, configurations.sensor_battery],
    'WXKG11LM': [configurations.sensor_click, configurations.sensor_battery],
    'WXKG12LM': [configurations.sensor_click, configurations.sensor_battery],
    'WXKG03LM': [configurations.sensor_click, configurations.sensor_battery],
    'WXKG02LM': [configurations.sensor_click, configurations.sensor_battery],
    'QBKG04LM': [configurations.switch, configurations.sensor_click],
    'QBKG03LM': [switchWithPostfix('left'), switchWithPostfix('right'), configurations.sensor_click],
    'WSDCGQ01LM': [configurations.sensor_temperature, configurations.sensor_humidity, configurations.sensor_battery],
    'WSDCGQ11LM': [
        configurations.sensor_temperature, configurations.sensor_humidity, configurations.sensor_pressure,
        configurations.sensor_battery,
    ],
    'RTCGQ01LM': [configurations.binary_sensor_occupancy, configurations.sensor_battery],
    'RTCGQ11LM': [
        configurations.binary_sensor_occupancy, configurations.sensor_illuminance,
        configurations.sensor_battery,
    ],
    'MCCGQ01LM': [configurations.binary_sensor_contact, configurations.sensor_battery],
    'MCCGQ11LM': [configurations.binary_sensor_contact, configurations.sensor_battery],
    'SJCGQ11LM': [configurations.binary_sensor_water_leak, configurations.sensor_battery],
    'MFKZQ01LM': [configurations.sensor_action, configurations.sensor_battery],
    'ZNCZ02LM': [configurations.switch, configurations.sensor_power],
    'QBCZ11LM': [configurations.switch, configurations.sensor_power],
    'LED1545G12': [configurations.light_brightness_colortemp],
    'LED1623G12': [configurations.light_brightness],
    'LED1622G12': [configurations.light_brightness],
    'LED1537R6': [configurations.light_brightness_colortemp],
    'LED1650R5': [configurations.light_brightness],
    'LED1536G5': [configurations.light_brightness_colortemp],
    '7299760PH': [configurations.light_brightness_colorxy],
    '7146060PH': [configurations.light_brightness_colortemp_colorxy],
    'F7C033': [configurations.light_brightness],
    'JTYJ-GD-01LM/BW': [configurations.binary_sensor_smoke, configurations.sensor_battery],
    'PLUG EDP RE:DY': [configurations.switch, configurations.sensor_power],
    'CC2530.ROUTER': [configurations.binary_sensor_router],
    'AA70155': [configurations.light_brightness_colortemp],
    '4058075816718': [configurations.light_brightness_colortemp_colorxy],
    'AA69697': [configurations.light_brightness_colortemp_colorxy],
    'HALIGHTDIMWWE27': [configurations.light_brightness],
    'HALIGHTDIMWWB22': [configurations.light_brightness],
    'AB3257001NJ': [configurations.switch],
    '8718696449691': [configurations.light_brightness],
    'RB 185 C': [configurations.light_brightness_colortemp_colorxy],
    'BY 185 C': [configurations.light_brightness_colortemp_colorxy],
    '9290012573A': [configurations.light_brightness_colortemp_colorxy],
    'LED1624G9': [configurations.light_brightness_colorxy],
    '73742': [configurations.light_brightness_colortemp],
    '73740': [configurations.light_brightness_colortemp],
    '73739': [configurations.light_brightness_colortemp_colorxy],
    '22670': [configurations.light_brightness],
    'ICTC-G-1': [configurations.sensor_brightness, configurations.sensor_battery, configurations.sensor_action],
    'ICPSHC24-30EU-IL-1': [configurations.light_brightness],
    '45852GE': [configurations.light_brightness],
    'E11-G13': [configurations.light_brightness],
    'LED1649C5': [configurations.light_brightness],
    'ICPSHC24-10EU-IL-1': [configurations.light_brightness],
    'LED1546G12': [configurations.light_brightness_colortemp],
    'L1527': [configurations.light_brightness_colortemp],
    'L1529': [configurations.light_brightness_colortemp],
    'L1528': [configurations.light_brightness_colortemp],
    'L1531': [configurations.light_brightness_colortemp],
    'RB 165': [configurations.light_brightness],
    'RB 175 W': [configurations.light_brightness],
    'RS 125': [configurations.light_brightness],
    'RS 225': [configurations.light_brightness],
    'RB 145': [configurations.light_brightness],
    'PL 110': [configurations.light_brightness],
    'ST 110': [configurations.light_brightness],
    'UC 110': [configurations.light_brightness],
    'DL 110 N': [configurations.light_brightness],
    'DL 110 W': [configurations.light_brightness],
    'SL 110 N': [configurations.light_brightness],
    'SL 110 M': [configurations.light_brightness],
    'SL 110 W': [configurations.light_brightness],
    'AA68199': [configurations.light_brightness_colortemp],
    'QBKG11LM': [configurations.switch, configurations.sensor_power, configurations.sensor_click],
    'QBKG12LM': [
        switchWithPostfix('left'), switchWithPostfix('right'), configurations.sensor_power,
        configurations.sensor_click,
    ],
    'K2RGBW01': [configurations.light_brightness_colortemp_colorxy],
    '9290011370': [configurations.light_brightness],
    'DNCKATSW001': [configurations.switch],
    'Z809A': [configurations.switch, configurations.sensor_power],
    'NL08-0800': [configurations.light_brightness],
    '915005106701': [configurations.light_brightness_colortemp_colorxy],
    'AB32840': [configurations.light_brightness_colortemp],
    '8718696485880': [configurations.light_brightness_colortemp_colorxy],
    '8718696598283': [configurations.light_brightness_colortemp],
    '8718696695203': [configurations.light_brightness_colortemp],
    '73693': [configurations.light_brightness_colortemp_colorxy],
    '324131092621': [configurations.sensor_action, configurations.sensor_battery],
    '9290012607': [
        configurations.binary_sensor_occupancy, configurations.sensor_temperature,
        configurations.sensor_illuminance, configurations.sensor_battery,
    ],
    'GL-C-008': [configurations.light_brightness_colortemp_colorxy],
    'STSS-MULT-001': [configurations.binary_sensor_contact, configurations.sensor_battery],
    'E11-G23/E11-G33': [configurations.light_brightness],
    'E1ACA4ABE38A': [configurations.light_brightness],
    'AC03645': [configurations.light_brightness_colortemp_colorxy],
    'AC03641': [configurations.light_brightness],
    'AC03648': [configurations.light_brightness_colortemp],
    'FB56+ZSW05HG1.2': [configurations.switch],
    '72922-A': [configurations.switch],
    'AC03642': [configurations.light_brightness_colortemp],
    'DNCKATSW002': [switchWithPostfix('left'), switchWithPostfix('right')],
    'DNCKATSW003': [switchWithPostfix('left'), switchWithPostfix('right'), switchWithPostfix('center')],
    'DNCKATSW004': [
        switchWithPostfix('bottom_left'), switchWithPostfix('bottom_right'),
        switchWithPostfix('top_left'), switchWithPostfix('top_right'),
    ],
    'BY 165': [configurations.light_brightness],
    'ZLED-2709': [configurations.light_brightness],
    '8718696548738': [configurations.light_brightness_colortemp],
    '4052899926110': [configurations.light_brightness_colortemp_colorxy],
    'Z01-CIA19NAE26': [configurations.light_brightness],
    'E11-N1EA': [configurations.light_brightness_colortemp_colorxy],
    '74283': [configurations.light_brightness],
    'JTQJ-BF-01LM/BW': [
        configurations.binary_sensor_gas,
        configurations.sensor_gas_density,
    ],
    '50045': [configurations.light_brightness],
    'AV2010/22': [configurations.binary_sensor_occupancy, configurations.sensor_battery],
    '3210-L': [configurations.switch],
    '3320-L': [configurations.binary_sensor_contact],
    '3326-L': [configurations.binary_sensor_occupancy, configurations.sensor_temperature],
    '7299355PH': [configurations.light_brightness_colorxy],
    '45857GE': [configurations.light_brightness],
    'A6121': [configurations.sensor_lock],
    '433714': [configurations.light_brightness],
    '3261030P7': [configurations.light_brightness_colortemp],
    '3216431P5': [configurations.light_brightness_colortemp],
    'DJT11LM': [configurations.sensor_action, configurations.sensor_battery],
    'E1603': [configurations.switch],
    '7199960PH': [configurations.light_brightness_colorxy],
    '74696': [configurations.light_brightness],
    'AB35996': [configurations.light_brightness_colortemp_colorxy],
    'AB401130055': [configurations.light_brightness_colortemp],
    '74282': [configurations.light_brightness_colortemp],
    'RS 128 T': [configurations.light_brightness_colortemp],
    '53170161': [configurations.light_brightness_colortemp],
    '4058075036147': [configurations.light_brightness_colortemp_colorxy],
    'KS-SM001': [configurations.switch],
    'MG-AUWS01': [switchWithPostfix('left'), switchWithPostfix('right')],
    '9290002579A': [configurations.light_brightness_colortemp_colorxy],
    '4256251-RZHAC': [configurations.switch, configurations.sensor_power],
    'STS-PRS-251': [configurations.binary_sensor_presence, configurations.sensor_battery],
    '4058075816794': [configurations.light_brightness_colortemp],
    '4052899926158': [configurations.light_brightness],
    '4058075036185': [configurations.light_brightness_colortemp_colorxy],
    '50049': [configurations.light_brightness_colorxy],
    '915005733701': [configurations.light_brightness_colortemp_colorxy],
    'RB 285 C': [configurations.light_brightness_colortemp_colorxy],
    '3216331P5': [configurations.light_brightness_colortemp],
    'AC08562': [configurations.light_brightness],
    '900008-WW': [configurations.light_brightness],
    'Mega23M12': [configurations.light_brightness_colortemp_colorxy],
    'PSS-23ZBS': [configurations.switch],
    'HS1SA': [configurations.binary_sensor_smoke, configurations.binary_sensor_battery_low],
    'Z01-A19NAE26': [configurations.light_brightness_colortemp],
    'AC01353010G': [configurations.binary_sensor_occupancy, configurations.sensor_temperature],
    'SP 120': [configurations.switch, configurations.sensor_power],
    'RB 248 T': [configurations.light_brightness_colortemp],
    'HS3SA': [configurations.binary_sensor_smoke, configurations.binary_sensor_battery_low],
    'HS1DS': [configurations.binary_sensor_contact],
    'HS1WL': [configurations.binary_sensor_water_leak],
    '421786': [configurations.light_brightness],
    'ICZB-IW11D': [configurations.light_brightness],
    'HGZB-01A': [configurations.light_brightness],
    '3321-S': [configurations.binary_sensor_contact, configurations.sensor_temperature],
    'ZPIR-8000': [configurations.binary_sensor_occupancy],
    'ZCTS-808': [configurations.binary_sensor_contact],
    'ZNLDP12LM': [configurations.light_brightness_colortemp],
    'D1821': [configurations.light_brightness_colortemp_colorxy],
    'ZNCLDJ11LM': [configurations.cover_position, configurations.sensor_cover],
    'LTFY004': [configurations.light_brightness_colorxy],
    'GL-S-007Z': [configurations.light_brightness_colortemp_colorxy],
    '3325-S': [configurations.sensor_temperature, configurations.binary_sensor_occupancy],
    '4713407': [configurations.light_brightness],
    '464800': [configurations.light_brightness_colortemp],
    '3261331P7': [configurations.light_brightness_colortemp],
    '4033930P7': [configurations.light_brightness_colortemp],
    'GL-B-008Z': [configurations.light_brightness_colortemp_colorxy],
    'AV2010/25': [configurations.switch, configurations.sensor_power],
    'E12-N14': [configurations.light_brightness],
    '1TST-EU': [],
    'RB 178 T': [configurations.light_brightness_colortemp],
    '45856GE': [configurations.switch],
    'GL-D-003Z': [configurations.light_brightness_colortemp_colorxy],
    'GD-CZ-006': [configurations.light_brightness],
    'AIRAM-CTR.U': [],
    'HGZB-20-DE': [configurations.switch],
    'D1531': [configurations.light_brightness],
    'D1532': [configurations.light_brightness],
    'AV2010/32': [],
    'HGZB-07A': [configurations.light_brightness_colortemp_colorxy],
    'E1524': [configurations.sensor_action],
    'GL-C-006': [configurations.light_brightness_colortemp],
    '100.424.11': [configurations.light_brightness_colortemp],
    'AC0251100NJ': [configurations.sensor_click, configurations.sensor_brightness, configurations.sensor_battery],
    '71831': [configurations.light_brightness_colortemp],
    '404000/404005/404012': [configurations.light_brightness_colortemp_colorxy],
    '404006/404008/404004': [configurations.light_brightness_colortemp],
    'MLI-404011': [configurations.sensor_action],
    'GL-S-003Z': [configurations.light_brightness_colortemp_colorxy],
    'HS1DS-E': [configurations.binary_sensor_contact],
    'SP600': [configurations.switch, configurations.sensor_power],
    '1613V': [configurations.switch, configurations.sensor_power],
    'XVV-Mega23M12': [configurations.light_brightness_colortemp],
    'GL-B-007Z': [configurations.light_brightness_colortemp_colorxy],
    '81809': [configurations.light_brightness_colortemp_colorxy],
    '4090130P7': [configurations.light_brightness_colortemp_colorxy],
    '100.110.39': [configurations.light_brightness_colortemp_colorxy],
    'TI0001': [switchWithPostfix('left'), switchWithPostfix('right')],
    'SPZB0001': [],
    'HS3CG': [configurations.binary_sensor_gas],
    '81825': [configurations.sensor_action],
    'Z809AF': [configurations.switch, configurations.sensor_power],
    'RADON TriTech ZB': [
        configurations.binary_sensor_occupancy, configurations.sensor_temperature,
        configurations.sensor_battery, configurations.binary_sensor_battery_low,
    ],
    'IM-Z3.0-DIM': [configurations.light_brightness],
    'E1746': [],
    'YRD426NRSC': [configurations.lock, configurations.sensor_battery],
    'E1743': [configurations.sensor_click, configurations.sensor_battery],
    'LED1732G11': [configurations.light_brightness_colortemp],
    'RB 265': [configurations.light_brightness],
    '9290019758': [
        configurations.binary_sensor_occupancy, configurations.sensor_temperature,
        configurations.sensor_illuminance, configurations.sensor_battery,
    ],
    'HGZB-042': [switchWithPostfix('top'), switchWithPostfix('bottom')],
    'GL-FL-004TZ': [configurations.light_brightness_colortemp_colorxy],
    'IM6001-OTP05': [configurations.switch],
    'SV01': [
        configurations.cover_position, configurations.sensor_temperature, configurations.sensor_pressure,
        configurations.sensor_battery,
    ],
    '316GLEDRF': [configurations.light_brightness],
    'LVS-ZB500D': [configurations.light_brightness],
    'ST218': [],
    'E1525': [configurations.binary_sensor_occupancy, configurations.sensor_battery],
    'ZYCT-202': [configurations.sensor_action],
    'GR-ZB01-W': [configurations.cover_position],
    '4090531P7': [configurations.light_brightness_colortemp_colorxy],
    'HGZB-42-UK / HGZB-41': [configurations.switch],
    'ISW-ZPR1-WP13': [
        configurations.binary_sensor_occupancy, configurations.sensor_temperature,
        configurations.sensor_battery, configurations.binary_sensor_battery_low,
    ],
    '9290018195': [configurations.light_brightness],
    'HGZB-04D': [configurations.light_brightness],
    'HGZB-02A': [configurations.light_brightness],
    'HGZB-043': [switchWithPostfix('top'), switchWithPostfix('bottom'), switchWithPostfix('center')],
    'NCZ-3043-HA': [
        configurations.binary_sensor_occupancy, configurations.sensor_temperature,
        configurations.sensor_battery, configurations.binary_sensor_battery_low,
    ],
    'STS-IRM-250': [
        configurations.binary_sensor_occupancy, configurations.sensor_temperature,
        configurations.sensor_battery, configurations.binary_sensor_battery_low,
    ],
    '3305-S': [
        configurations.binary_sensor_occupancy, configurations.sensor_temperature,
        configurations.sensor_battery, configurations.binary_sensor_battery_low,
    ],
    '3300-S': [
        configurations.sensor_temperature, configurations.binary_sensor_contact,
        configurations.sensor_battery, configurations.binary_sensor_battery_low,
    ],
    'AV2010/34': [configurations.sensor_click],
    'PP-WHT-US': [configurations.switch, configurations.sensor_power],
    'CR701-YZ': [
        configurations.binary_sensor_battery_low, configurations.binary_sensor_carbon_monoxide,
        configurations.binary_sensor_gas,
    ],
    'HGZB-1S': [configurations.switch, configurations.sensor_click],
    'HGZB-045': [configurations.switch, configurations.sensor_click],
    'HGZB-43': [switchWithPostfix('top'), switchWithPostfix('bottom'), switchWithPostfix('center')],
    'HGZB-01A/02A': [configurations.switch],
    'MCT-350 SMA': [configurations.binary_sensor_contact],
    '3310-S': [configurations.sensor_temperature, configurations.sensor_battery],
    '3315-S': [
        configurations.sensor_temperature, configurations.binary_sensor_water_leak,
        configurations.sensor_battery,
    ],
    'F-MLT-US-2': [
        configurations.sensor_temperature, configurations.binary_sensor_contact,
        configurations.sensor_battery, configurations.binary_sensor_battery_low,
    ],
    'SWO-KEF1PA': [configurations.sensor_action],
    'HGZB-02S': [configurations.sensor_click, configurations.switch],
    'HGZB-41': [configurations.switch],
    'ZG9101SAC-HP': [configurations.light_brightness],
};

Object.keys(mapping).forEach((key) => {
    mapping[key].push(configurations.sensor_linkquality);
});

/**
 * This extensions handles integration with HomeAssistant
 */
class HomeAssistant {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
        this.zigbee2mqttVersion = zigbee2mqttVersion;

        // A map of all discoverd devices
        this.discovered = {};

        if (!settings.get().advanced.cache_state) {
            logger.warn('In order for HomeAssistant integration to work properly set `cache_state: true');
        }

        if (settings.get().experimental.output === 'attribute') {
            throw new Error('Home Assitant integration is not possible with attribute output!');
        }

        this.discoveryTopic = settings.get().advanced.homeassistant_discovery_topic;
    }

    onMQTTConnected() {
        this.mqtt.subscribe('hass/status');

        // MQTT discovery of all paired devices on startup.
        this.zigbee.getAllClients().forEach((device) => {
            const mappedModel = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
            if (mappedModel) {
                this.discover(device.ieeeAddr, mappedModel, true);
            }
        });
    }

    discover(entityID, mappedModel, force=false) {
        // Check if already discoverd and check if there are configs.
        const discover = force || !this.discovered[entityID];
        if (!discover) {
            return;
        }

        const entity = settings.resolveEntity(entityID);
        if (entity.type === 'device' && (!mapping[mappedModel.model] || !settings.getDevice(entity.ID))) {
            return;
        } else if (entity.type === 'group' && (!settings.getGroup(entity.ID))) {
            return;
        }

        mapping[mappedModel.model].forEach((config) => {
            const topic = `${config.type}/${entityID}/${config.object_id}/config`;
            const payload = {...config.discovery_payload};
            const stateTopic = `${settings.get().mqtt.base_topic}/${entity.friendlyName}`;

            if (!payload.hasOwnProperty('state_topic') || payload.state_topic) {
                payload.state_topic = stateTopic;
            } else if (payload.hasOwnProperty('state_topic')) {
                delete payload.state_topic;
            }

            if (payload.position_topic) {
                payload.position_topic = stateTopic;
            }

            // Set json_attributes_topic for types which support this
            // https://github.com/Koenkk/zigbee2mqtt/issues/840
            if (['binary_sensor', 'sensor', 'lock'].includes(config.type)) {
                payload.json_attributes_topic = payload.state_topic;
            }

            // Set (unique) name
            payload.name = `${entity.friendlyName}_${config.object_id}`;

            // Set unique_id
            payload.unique_id = `${entityID}_${config.object_id}_${settings.get().mqtt.base_topic}`;

            // Attributes for device registry
            payload.device = {
                identifiers: `zigbee2mqtt_${entityID}`,
                name: entity.friendlyName,
                sw_version: `Zigbee2mqtt ${this.zigbee2mqttVersion}`,
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
            const device = settings.getDevice(entityID);
            if (device.hasOwnProperty(`${config.object_id}_precision`)) {
                const precision = device[`${config.object_id}_precision`];
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
            }

            if (payload.set_position_topic && payload.command_topic) {
                payload.set_position_topic = payload.command_topic;
            }

            // Override configuration with user settings.
            if (device.hasOwnProperty('homeassistant')) {
                const add = (obj) => {
                    Object.keys(obj).forEach((key) => {
                        if (['number', 'string'].includes(typeof obj[key])) {
                            payload[key] = obj[key];
                        } else if (key === 'device' && typeof obj[key] === 'object') {
                            Object.keys(obj['device']).forEach((key) => {
                                payload['device'][key] = obj['device'][key];
                            });
                        }
                    });
                };

                add(device.homeassistant);

                if (device.homeassistant.hasOwnProperty(config.object_id)) {
                    add(device.homeassistant[config.object_id]);
                }
            }

            this.mqtt.publish(topic, JSON.stringify(payload), {retain: true, qos: 0}, null, this.discoveryTopic);
        });

        this.discovered[entityID] = true;
    }

    onMQTTMessage(topic, message) {
        if (!topic === 'hass/status') {
            return false;
        }

        if (message.toString().toLowerCase() === 'online') {
            const timer = setTimeout(() => {
                // Publish all device states.
                this.zigbee.getAllClients().forEach((device) => {
                    if (this.state.exists(device.ieeeAddr)) {
                        this.publishEntityState(device.ieeeAddr, this.state.get(device.ieeeAddr));
                    }
                });

                clearTimeout(timer);
            }, 20000);
        }

        return true;
    }

    onZigbeeMessage(message, device, mappedModel) {
        if (device && mappedModel) {
            this.discover(device.ieeeAddr, mappedModel);
        }
    }

    // Only for homeassistant.test.js
    _getMapping() {
        return mapping;
    }
}

module.exports = HomeAssistant;
