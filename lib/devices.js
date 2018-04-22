const homeassistant = {
    'binary_sensor_occupancy': {
        type: 'binary_sensor',
        object_id: 'occupancy',
        discovery_payload: {
            payload_on: 'motion',
            payload_off: 'no_motion',
            value_template: '{{ value_json.occupancy }}',
            device_class: 'motion',
            json_attributes: ['battery']
        }
    },
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
    'binary_sensor_state': {
        type: 'binary_sensor',
        object_id: 'state',
        discovery_payload: {
            payload_on: 'open',
            payload_off: 'closed',
            value_template: '{{ value_json.state }}',
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
    }
};

const devices = {
    'lumi.sensor_switch': {
        model: 'WXKG01LM',
        vendor: 'Xiaomi',
        description: 'MiJia wireless switch',
        supports: 'single, double, triple, quadruple, many and long click',
        homeassistant: [homeassistant.sensor_button]
    },
    'lumi.sensor_switch.aq2': {
        model: 'WXKG11LM',
        vendor: 'Xiaomi',
        description: 'Aqara wireless switch',
        supports: 'single, double, triple, quadruple click',
        homeassistant: [homeassistant.sensor_button]
    },
    'lumi.sensor_86sw2\u0000Un': {
        model: 'WXKG02LM',
        vendor: 'Xiaomi',
        description: 'Aqara double key wireless wall switch',
        supports: 'left, right and both click',
        homeassistant: [homeassistant.sensor_button]
    },
    'lumi.sens': {
        model: 'WSDCGQ01LM',
        vendor: 'Xiaomi',
        description: 'MiJia temperature & humidity sensor ',
        supports: 'temperature and humidity',
        homeassistant: [homeassistant.sensor_temperature, homeassistant.sensor_humidity]
    },
    'lumi.weather': {
        model: 'WSDCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara temperature, humidity and pressure sensor',
        supports: 'temperature, humidity and pressure',
        homeassistant: [homeassistant.sensor_temperature, homeassistant.sensor_humidity, homeassistant.sensor_pressure]
    },
    'lumi.sensor_motion': {
        model: 'RTCGQ01LM',
        vendor: 'Xiaomi',
        description: 'MiJia human body movement sensor',
        supports: 'occupancy',
        homeassistant: [homeassistant.binary_sensor_occupancy]
    },
    'lumi.sensor_motion.aq2': {
        model: 'RTCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara human body movement and illuminance sensor',
        supports: 'occupancy and illuminance',
        homeassistant: [homeassistant.binary_sensor_occupancy, homeassistant.sensor_illuminance]
    },
    'lumi.sensor_magnet': {
        model: 'MCCGQ01LM',
        vendor: 'Xiaomi',
        description: 'MiJia door & window contact sensor',
        supports: 'open and closed state',
        homeassistant: [homeassistant.binary_sensor_state]
    },
    'lumi.sensor_magnet.aq2': {
        model: 'MCCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara door & window contact sensor',
        supports: 'open and closed state',
        homeassistant: [homeassistant.binary_sensor_state]
    },
    'lumi.sensor_wleak.aq1': {
        model: 'SJCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara water leak sensor',
        supports: 'water leak true/false',
        homeassistant: [homeassistant.binary_sensor_water_leak]
    },
    'TRADFRI bulb E27 WS opal 980lm': {
        model: 'LED1545G12',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb E27 980 lumen, dimmable, white spectrum, opal white',
        supports: 'on/off, brightness, color temperature',
        homeassistant: [homeassistant.light_brightness_colortemp]
    },
    'TRADFRI bulb GU10 WS 400lm': {
        model: 'LED1537R6',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb GU10 400 lumen, dimmable, white spectrum',
        supports: 'on/off, brightness, color temperature',
        homeassistant: [homeassistant.light_brightness_colortemp]
    },
    'LLC020': {
        model: '7146060PH',
        vendor: 'Philips',
        description: 'Hue Go',
        supports: 'on/off, brightness, color temperature, color xy',
        homeassistant: [homeassistant.light_brightness_colortemp_xy]
    },
}

module.exports = devices;
