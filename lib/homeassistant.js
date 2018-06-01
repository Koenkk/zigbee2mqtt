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
            json_attributes: ['voltage', 'temperature', 'consumption'],
        },
    },
    'sensor_action': {
        type: 'sensor',
        object_id: 'action',
        discovery_payload: {
            icon: 'mdi:cube',
            value_template: '{{ value_json.action }}',
            json_attributes: ['battery', 'voltage'],
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
    'switch_l1': {
        type: 'switch',
        object_id: 'switch_l1',
        discovery_payload: {
            payload_off: 'OFF',
            payload_on: 'ON',
            value_template: '{{ value_json.state_l1 }}',
            command_topic: true,
            command_topic_prefix: 'l1',
        },
    },
    'switch_l2': {
        type: 'switch',
        object_id: 'switch_l2',
        discovery_payload: {
            payload_off: 'OFF',
            payload_on: 'ON',
            value_template: '{{ value_json.state_l2 }}',
            command_topic: true,
            command_topic_prefix: 'l2',
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
    'QBKG03LM': [configurations.switch_l1, configurations.switch_l2],
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
};

// A map of all discoverd devices
const discovered = {};

function discover(deviceID, model, mqtt) {
    // Check if already discoverd and check if there are configs.
    if (discovered[deviceID] || !mapping[model] || !settings.getDevice(deviceID)) {
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

module.exports = {
    mapping: mapping,
    discover: (deviceID, model, mqtt) => discover(deviceID, model, mqtt),
};
