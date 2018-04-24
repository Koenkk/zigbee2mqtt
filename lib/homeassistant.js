const homeassistant = {
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
    'sensor_button': {
        type: 'sensor',
        object_id: 'button',
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

    // zigbee2mqtt
    'zigbee2mqtt_permit_join': {
        type: 'switch',
        object_id: 'switch',
        discovery_payload: {
            payload_off: 'OFF',
            payload_on: 'ON',
            value_template: '{{ value_json.state }}',
            command_topic: true,
            icon: 'mdi:router-wireless',
        } 
    },
};

module.exports = homeassistant;
