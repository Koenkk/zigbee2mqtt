const settings = require('./util/settings');

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
            json_attributes: ['battery', 'voltage'],
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
            json_attributes: ['battery', 'voltage'],
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
            json_attributes: ['battery', 'voltage'],
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
            json_attributes: ['battery', 'voltage'],
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
            json_attributes: ['description', 'type', 'rssi'],
        },
    },

    // Sensor
    'sensor_illuminance': {
        type: 'sensor',
        object_id: 'illuminance',
        discovery_payload: {
            unit_of_measurement: 'lx',
            icon: 'mdi:theme-light-dark',
            value_template: '{{ value_json.illuminance }}',
            json_attributes: ['battery', 'voltage'],
        },
    },
    'sensor_humidity': {
        type: 'sensor',
        object_id: 'humidity',
        discovery_payload: {
            unit_of_measurement: '%',
            icon: 'mdi:water-percent',
            value_template: '{{ value_json.humidity }}',
            json_attributes: ['battery', 'voltage'],
        },
    },
    'sensor_temperature': {
        type: 'sensor',
        object_id: 'temperature',
        discovery_payload: {
            unit_of_measurement: '°C',
            icon: 'mdi:temperature-celsius',
            value_template: '{{ value_json.temperature }}',
            json_attributes: ['battery', 'voltage'],
        },
    },
    'sensor_pressure': {
        type: 'sensor',
        object_id: 'pressure',
        discovery_payload: {
            unit_of_measurement: 'Pa',
            icon: 'mdi:speedometer',
            value_template: '{{ value_json.pressure }}',
            json_attributes: ['battery', 'voltage'],
        },
    },
    'sensor_click': {
        type: 'sensor',
        object_id: 'click',
        discovery_payload: {
            icon: 'mdi:toggle-switch',
            value_template: '{{ value_json.click }}',
            json_attributes: ['battery', 'voltage', 'action', 'duration'],
        },
    },
    'sensor_power': {
        type: 'sensor',
        object_id: 'power',
        discovery_payload: {
            unit_of_measurement: 'Watt',
            icon: 'mdi:flash',
            value_template: '{{ value_json.power }}',
            json_attributes: ['voltage', 'temperature', 'consumption', 'current', 'power_factor'],
        },
    },
    'sensor_action': {
        type: 'sensor',
        object_id: 'action',
        discovery_payload: {
            icon: 'mdi:gesture-double-tap',
            value_template: '{{ value_json.action }}',
            json_attributes: ['battery', 'voltage', 'angle', 'side', 'from_side', 'to_side', 'brightness'],
        },
    },
    'sensor_brightness': {
        type: 'sensor',
        object_id: 'brightness',
        discovery_payload: {
            unit_of_measurement: 'brightness',
            icon: 'mdi:brightness-5',
            value_template: '{{ value_json.brightness }}',
            json_attributes: [],
        },
    },

    // Light
    'light_brightness_colortemp_xy': {
        type: 'light',
        object_id: 'light',
        discovery_payload: {
            brightness: true,
            color_temp: true,
            xy: true,
            platform: 'mqtt_json',
            command_topic: true,
        },
    },
    'light_brightness_xy': {
        type: 'light',
        object_id: 'light',
        discovery_payload: {
            brightness: true,
            xy: true,
            platform: 'mqtt_json',
            command_topic: true,
        },
    },
    'light_brightness_colortemp': {
        type: 'light',
        object_id: 'light',
        discovery_payload: {
            brightness: true,
            color_temp: true,
            platform: 'mqtt_json',
            command_topic: true,
        },
    },
    'light_brightness': {
        type: 'light',
        object_id: 'light',
        discovery_payload: {
            brightness: true,
            platform: 'mqtt_json',
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
    'switch_left': {
        type: 'switch',
        object_id: 'switch_left',
        discovery_payload: {
            payload_off: 'OFF',
            payload_on: 'ON',
            value_template: '{{ value_json.state_left }}',
            command_topic: true,
            command_topic_prefix: 'left',
        },
    },
    'switch_right': {
        type: 'switch',
        object_id: 'switch_right',
        discovery_payload: {
            payload_off: 'OFF',
            payload_on: 'ON',
            value_template: '{{ value_json.state_right }}',
            command_topic: true,
            command_topic_prefix: 'right',
        },
    },
};

// Map homeassitant configurations to devices.
const mapping = {
    'WXKG01LM': [configurations.sensor_click],
    'WXKG11LM': [configurations.sensor_click],
    'WXKG12LM': [configurations.sensor_click],
    'WXKG03LM': [configurations.sensor_click],
    'WXKG02LM': [configurations.sensor_click],
    'QBKG04LM': [configurations.switch],
    'QBKG03LM': [configurations.switch_left, configurations.switch_right],
    'WSDCGQ01LM': [configurations.sensor_temperature, configurations.sensor_humidity],
    'WSDCGQ11LM': [configurations.sensor_temperature, configurations.sensor_humidity, configurations.sensor_pressure],
    'RTCGQ01LM': [configurations.binary_sensor_occupancy],
    'RTCGQ11LM': [configurations.binary_sensor_occupancy, configurations.sensor_illuminance],
    'MCCGQ01LM': [configurations.binary_sensor_contact],
    'MCCGQ11LM': [configurations.binary_sensor_contact],
    'SJCGQ11LM': [configurations.binary_sensor_water_leak],
    'MFKZQ01LM': [configurations.sensor_action],
    'ZNCZ02LM': [configurations.switch, configurations.sensor_power],
    'QBCZ11LM': [configurations.switch, configurations.sensor_power],
    'LED1545G12': [configurations.light_brightness_colortemp],
    'LED1623G12': [configurations.light_brightness],
    'LED1622G12': [configurations.light_brightness],
    'LED1537R6': [configurations.light_brightness_colortemp],
    'LED1650R5': [configurations.light_brightness],
    'LED1536G5': [configurations.light_brightness_colortemp],
    '7299760PH': [configurations.light_brightness_xy],
    '7146060PH': [configurations.light_brightness_colortemp_xy],
    'F7C033': [configurations.light_brightness],
    'JTYJ-GD-01LM/BW': [configurations.binary_sensor_smoke],
    'PLUG EDP RE:DY': [configurations.switch, configurations.sensor_power],
    'CC2530.ROUTER': [configurations.binary_sensor_router],
    'AA70155': [configurations.light_brightness_colortemp],
    'AA69697': [configurations.light_brightness_colortemp_xy],
    'HALIGHTDIMWWE27': [configurations.light_brightness],
    'AB3257001NJ': [configurations.switch],
    '8718696449691': [configurations.light_brightness],
    'RB 185 C': [configurations.light_brightness_colortemp_xy],
    '9290012573A': [configurations.light_brightness_colortemp_xy],
    'LED1624G9': [configurations.light_brightness_xy],
    '73742': [configurations.light_brightness_colortemp],
    '73740': [configurations.light_brightness_colortemp],
    '22670': [configurations.light_brightness],
    'ICTC-G-1': [configurations.sensor_brightness],
    'ICPSHC24-30EU-IL-1': [configurations.light_brightness],
    '45852GE': [configurations.light_brightness],
    'E11-G13': [configurations.light_brightness],
    'LED1649C5': [configurations.light_brightness],
    'ICPSHC24-10EU-IL-1': [configurations.light_brightness],
    'LED1546G12': [configurations.light_brightness_colortemp],
    'L1527': [configurations.light_brightness_colortemp],
    'L1529': [configurations.light_brightness_colortemp],
    'L1528': [configurations.light_brightness_colortemp],
    'RB 165': [configurations.light_brightness],
    'RB 175 W': [configurations.light_brightness],
    'RS 125': [configurations.light_brightness],
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
    'QBKG11LM': [configurations.switch, configurations.sensor_power],
    'QBKG12LM': [configurations.switch_left, configurations.switch_right, configurations.sensor_power],
    'K2RGBW01': [configurations.light_brightness_colortemp_xy],
    '9290011370': [configurations.light_brightness],
    'DNCKATSW001': [configurations.switch],
    'Z809A': [configurations.switch, configurations.sensor_power],
    'NL08-0800': [configurations.light_brightness],
    '915005106701': [configurations.light_brightness_colortemp_xy],
    'AB32840': [configurations.light_brightness_colortemp],
    '8718696485880': [configurations.light_brightness_colortemp_xy],
    '8718696598283': [configurations.light_brightness_colortemp],
    '73693': [configurations.light_brightness_colortemp_xy],
    '324131092621': [configurations.sensor_action],
    'GL-C-008': [configurations.light_brightness_colortemp_xy],
    'STSS-MULT-001': [configurations.binary_sensor_contact],
    'E11-G23': [configurations.light_brightness],
    'AC03845': [configurations.light_brightness_colortemp_xy],
    'AC03641': [configurations.light_brightness],
};

// A map of all discoverd devices
const discovered = {};

function discover(deviceID, model, mqtt, force) {
    // Check if already discoverd and check if there are configs.
    const discover = force || !discovered[deviceID];
    if (!discover || !mapping[model] || !settings.getDevice(deviceID)) {
        return;
    }

    const friendlyName = settings.getDevice(deviceID).friendly_name;

    mapping[model].forEach((config) => {
        const topic = `${config.type}/${deviceID}/${config.object_id}/config`;
        const payload = config.discovery_payload;
        payload.state_topic = `${settings.get().mqtt.base_topic}/${friendlyName}`;
        payload.availability_topic = `${settings.get().mqtt.base_topic}/bridge/state`;

        // Set unique names in cases this device produces multiple entities in homeassistant.
        payload.name = mapping[model].length > 1 ? `${friendlyName}_${config.object_id}` : friendlyName;

        // Only set unique_id when user did not set a friendly_name yet,
        // see https://github.com/Koenkk/zigbee2mqtt/issues/138
        if (deviceID === friendlyName) {
            payload.unique_id = `${deviceID}_${config.object_id}_${settings.get().mqtt.base_topic}`;
        }

        if (payload.command_topic) {
            payload.command_topic = `${settings.get().mqtt.base_topic}/${friendlyName}/`;

            if (payload.command_topic_prefix) {
                payload.command_topic += `${payload.command_topic_prefix}/`;
            }

            payload.command_topic += 'set';
        }

        mqtt.publish(topic, JSON.stringify(payload), {retain: true, qos: 0}, null, 'homeassistant');
    });

    discovered[deviceID] = true;
}

function clear(deviceID, model, mqtt) {
    // Check if there are configs.
    if (!mapping[model]) {
        return;
    }

    mapping[model].forEach((config) => {
        const topic = `${config.type}/${deviceID}/${config.object_id}/config`;
        const payload = '';
        mqtt.publish(topic, payload, {retain: true, qos: 0}, null, 'homeassistant');
    });

    discovered[deviceID] = false;
}

module.exports = {
    mapping: mapping,
    discover: (deviceID, model, mqtt, force) => discover(deviceID, model, mqtt, force),
    clear: (deviceID, model, mqtt) => clear(deviceID, model, mqtt),
};
