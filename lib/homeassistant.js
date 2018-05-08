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
            json_attributes: ['battery']
        }
    },
    'binary_sensor_contact': {
        type: 'binary_sensor',
        object_id: 'contact',
        discovery_payload: {
            payload_on: false,
            payload_off: true,
            value_template: '{{ value_json.contact }}',
            device_class: 'door',
            json_attributes: ['battery']
        }
    },
    'binary_sensor_water_leak': {
        type: 'binary_sensor',
        object_id: 'water_leak',
        discovery_payload: {
            payload_on: true,
            payload_off: false,
            value_template: '{{ value_json.water_leak }}',
            device_class: 'moisture',
            json_attributes: ['battery']
        }
    },

    // Sensor
    'sensor_illuminance': {
        type: 'sensor',
        object_id: 'illuminance',
        discovery_payload: {
            unit_of_measurement: 'lx',
            icon: 'mdi:theme-light-dark',
            value_template: '{{ value_json.illuminance }}',
            json_attributes: ['battery'],
        }
    },
    'sensor_humidity': {
        type: 'sensor',
        object_id: 'humidity',
        discovery_payload: {
            unit_of_measurement: '%',
            icon: 'mdi:water-percent',
            value_template: '{{ value_json.humidity }}',
            json_attributes: ['battery'],
        }
    },
    'sensor_temperature': {
        type: 'sensor',
        object_id: 'temperature',
        discovery_payload: {
            unit_of_measurement: '°C',
            icon: 'mdi:temperature-celsius',
            value_template: '{{ value_json.temperature }}',
            json_attributes: ['battery'],
        }
    },
    'sensor_pressure': {
        type: 'sensor',
        object_id: 'pressure',
        discovery_payload: {
            unit_of_measurement: 'Pa',
            icon: 'mdi:speedometer',
            value_template: '{{ value_json.pressure }}',
            json_attributes: ['battery'],
        }
    },
    'sensor_click': {
        type: 'sensor',
        object_id: 'click',
        discovery_payload: {
            icon: 'mdi:toggle-switch',
            value_template: '{{ value_json.click }}',
            json_attributes: ['battery'],
        }
    },
    'sensor_power': {
        type: 'sensor',
        object_id: 'power',
        discovery_payload: {
            unit_of_measurement: 'Watt',
            icon: 'mdi:flash',
            value_template: '{{ value_json.power }}',
        }
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
            command_topic: true
        }
    },
    'light_brightness_colortemp': {
        type: 'light',
        object_id: 'light',
        discovery_payload: {
            brightness: true,
            color_temp: true,
            platform: 'mqtt_json',
            command_topic: true
        }
    },
    'light_brightness': {
        type: 'light',
        object_id: 'light',
        discovery_payload: {
            brightness: true,
            platform: 'mqtt_json',
            command_topic: true
        }
    },

    // Switch
    'switch': {
        type: 'switch',
        object_id: 'switch',
        discovery_payload: {
            payload_off: 'OFF',
            payload_on: 'ON',
            value_template: '{{ value_json.state }}',
            command_topic: true
        }
    },
    'switch_l1': {
        type: 'switch',
        object_id: 'switch_l1',
        discovery_payload: {
            payload_off: 'OFF',
            payload_on: 'ON',
            value_template: '{{ value_json.state_l1 }}',
            command_topic: true,
            command_topic_prefix: 'l1'
        }
    },
    'switch_l2': {
        type: 'switch',
        object_id: 'switch_l2',
        discovery_payload: {
            payload_off: 'OFF',
            payload_on: 'ON',
            value_template: '{{ value_json.state_l2 }}',
            command_topic: true,
            command_topic_prefix: 'l2'
        }
    },
};

// A map of all discoverd devices
const discovered = {};

function discover(deviceID, configs, mqtt) {
    // Check if already discoverd and check if there are configs.
    if (discovered[deviceID] || !configs) {
        return;
    }

    const friendlyName = settings.getDevice(deviceID).friendly_name;

    configs.forEach((config) => {
        const topic = `${config.type}/${deviceID}/${config.object_id}/config`;
        const payload = config.discovery_payload;
        payload.state_topic = `${settings.get().mqtt.base_topic}/${friendlyName}`;
        payload.availability_topic = `${settings.get().mqtt.base_topic}/bridge/state`;

        // Set unique names in cases this device produces multiple entities in homeassistant.
        if (configs.length > 1) {
            payload.name = `${friendlyName}_${config.object_id}`;
        } else {
            payload.name = friendlyName;
        }

        if (payload.command_topic) {
            payload.command_topic = `${settings.get().mqtt.base_topic}/${friendlyName}/`;

            if (payload.command_topic_prefix) {
                payload.command_topic += `${payload.command_topic_prefix}/`;
            }

            payload.command_topic += 'set';
        }

        mqtt.publish(topic, JSON.stringify(payload), true, null, 'homeassistant');
    });

    discovered[deviceID] = true;
}

module.exports = {
    configurations: configurations,
    discover: (deviceID, configs, mqtt) => discover(deviceID, configs, mqtt),
};
