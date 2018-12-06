const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const settings = require('../util/settings');
const logger = require('../util/logger');

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

    // Sensor
    'sensor_illuminance': {
        type: 'sensor',
        object_id: 'illuminance',
        discovery_payload: {
            unit_of_measurement: 'lx',
            device_class: 'illuminance',
            value_template: '{{ value_json.illuminance }}',
            json_attributes: ['linkquality', 'battery', 'voltage'],
        },
    },
    'sensor_humidity': {
        type: 'sensor',
        object_id: 'humidity',
        discovery_payload: {
            unit_of_measurement: '%',
            device_class: 'humidity',
            value_template: '{{ value_json.humidity }}',
            json_attributes: ['linkquality', 'battery', 'voltage'],
        },
    },
    'sensor_temperature': {
        type: 'sensor',
        object_id: 'temperature',
        discovery_payload: {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            value_template: '{{ value_json.temperature }}',
            json_attributes: ['linkquality', 'battery', 'voltage'],
        },
    },
    'sensor_pressure': {
        type: 'sensor',
        object_id: 'pressure',
        discovery_payload: {
            unit_of_measurement: 'hPa',
            device_class: 'pressure',
            value_template: '{{ value_json.pressure }}',
            json_attributes: ['linkquality', 'battery', 'voltage'],
        },
    },
    'sensor_click': {
        type: 'sensor',
        object_id: 'click',
        discovery_payload: {
            icon: 'mdi:toggle-switch',
            value_template: '{{ value_json.click }}',
            json_attributes: ['linkquality', 'battery', 'voltage', 'action', 'duration'],
            force_update: true,
        },
    },
    'sensor_power': {
        type: 'sensor',
        object_id: 'power',
        discovery_payload: {
            unit_of_measurement: 'Watt',
            icon: 'mdi:flash',
            value_template: '{{ value_json.power }}',
            json_attributes: ['linkquality', 'voltage', 'temperature', 'consumption', 'current', 'power_factor'],
        },
    },
    'sensor_action': {
        type: 'sensor',
        object_id: 'action',
        discovery_payload: {
            icon: 'mdi:gesture-double-tap',
            value_template: '{{ value_json.action }}',
            json_attributes: [
                'linkquality', 'battery', 'voltage', 'angle', 'side', 'from_side', 'to_side', 'brightness',
                'angle_x_absolute', 'angle_y_absolute', 'angle_z', 'angle_y', 'angle_x', 'unknown_data',
            ],
            force_update: true,
        },
    },
    'sensor_brightness': {
        type: 'sensor',
        object_id: 'brightness',
        discovery_payload: {
            unit_of_measurement: 'brightness',
            icon: 'mdi:brightness-5',
            value_template: '{{ value_json.brightness }}',
            json_attributes: ['linkquality'],
        },
    },
    'sensor_lock': {
        type: 'sensor',
        object_id: 'lock',
        discovery_payload: {
            icon: 'mdi:lock',
            value_template: '{{ value_json.inserted }}',
            json_attributes: ['linkquality', 'forgotten', 'keyerror'],
        },
    },
    'sensor_battery': {
        type: 'sensor',
        object_id: 'battery',
        discovery_payload: {
            device_class: 'battery',
            value_template: '{{ value_json.battery }}',
            json_attributes: ['linkquality', 'voltage', 'action', 'sensitivity'],
        },
    },
    'sensor_linkquality': {
        type: 'sensor',
        object_id: 'linkquality',
        discovery_payload: {
            value_template: '{{ value_json.linkquality }}',
            json_attributes: ['description', 'type', 'rssi'],
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
            platform: 'mqtt_json',
            command_topic: true,
        },
    },
    'light_brightness_colorxy': {
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
            json_attributes: ['linkquality', `button_${postfix}`],
        },
    };
};

// Map homeassitant configurations to devices.
const mapping = {
    'WXKG01LM': [configurations.sensor_click],
    'WXKG11LM': [configurations.sensor_click],
    'WXKG12LM': [configurations.sensor_click],
    'WXKG03LM': [configurations.sensor_click],
    'WXKG02LM': [configurations.sensor_click],
    'QBKG04LM': [configurations.switch],
    'QBKG03LM': [switchWithPostfix('left'), switchWithPostfix('right')],
    'WSDCGQ01LM': [configurations.sensor_temperature, configurations.sensor_humidity],
    'WSDCGQ11LM': [configurations.sensor_temperature, configurations.sensor_humidity, configurations.sensor_pressure],
    'RTCGQ01LM': [configurations.binary_sensor_occupancy, configurations.sensor_battery],
    'RTCGQ11LM': [
        configurations.binary_sensor_occupancy, configurations.sensor_illuminance,
        configurations.sensor_battery,
    ],
    'MCCGQ01LM': [configurations.binary_sensor_contact, configurations.sensor_battery],
    'MCCGQ11LM': [configurations.binary_sensor_contact, configurations.sensor_battery],
    'SJCGQ11LM': [configurations.binary_sensor_water_leak, configurations.sensor_battery],
    'MFKZQ01LM': [configurations.sensor_action],
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
    'CC2530.ROUTER': [configurations.binary_sensor_router, configurations.sensor_linkquality],
    'AA70155': [configurations.light_brightness_colortemp],
    '4058075816718': [configurations.light_brightness_colortemp_colorxy],
    'AA69697': [configurations.light_brightness_colortemp_colorxy],
    'HALIGHTDIMWWE27': [configurations.light_brightness],
    'AB3257001NJ': [configurations.switch],
    '8718696449691': [configurations.light_brightness],
    'RB 185 C': [configurations.light_brightness_colortemp_colorxy],
    '9290012573A': [configurations.light_brightness_colortemp_colorxy],
    'LED1624G9': [configurations.light_brightness_colorxy],
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
    'QBKG12LM': [switchWithPostfix('left'), switchWithPostfix('right'), configurations.sensor_power],
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
    '324131092621': [configurations.sensor_action],
    '9290012607': [
        configurations.binary_sensor_occupancy, configurations.sensor_temperature,
        configurations.sensor_illuminance, configurations.sensor_battery,
    ],
    'GL-C-008': [configurations.light_brightness_colortemp_colorxy],
    'STSS-MULT-001': [configurations.binary_sensor_contact, configurations.sensor_battery],
    'E11-G23/E11-G33': [configurations.light_brightness],
    'AC03645': [configurations.light_brightness_colortemp_colorxy],
    'AC03641': [configurations.light_brightness],
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
    'JTQJ-BF-01LM/BW': [configurations.binary_sensor_gas, configurations.sensor_battery],
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
    'DJT11LM': [configurations.sensor_action],
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
    'HS1SA': [configurations.binary_sensor_smoke],
    'Z01-A19NAE26': [configurations.light_brightness_colortemp],
    'AC01353010G': [configurations.binary_sensor_occupancy, configurations.sensor_temperature],
};

/**
 * This extensions handles integration with HomeAssistant
 */
class HomeAssistant {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishDeviceState = publishDeviceState;

        // A map of all discoverd devices
        this.discovered = {};

        if (!settings.get().advanced.cache_state) {
            logger.warn('In order for HomeAssistant integration to work properly set `cache_state: true');
        }
    }

    onMQTTConnected() {
        this.mqtt.subscribe('hass/status');

        // MQTT discovery of all paired devices on startup.
        this.zigbee.getAllClients().forEach((device) => {
            const mappedDevice = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
            if (mappedDevice) {
                this.discover(device.ieeeAddr, mappedDevice.model, true);
            }
        });
    }

    discover(ieeeAddr, model, force=false) {
        // Check if already discoverd and check if there are configs.
        const discover = force || !this.discovered[ieeeAddr];
        if (!discover || !mapping[model] || !settings.getDevice(ieeeAddr)) {
            return;
        }

        const friendlyName = settings.getDevice(ieeeAddr).friendly_name;

        mapping[model].forEach((config) => {
            const topic = `${config.type}/${ieeeAddr}/${config.object_id}/config`;
            const payload = {...config.discovery_payload};
            payload.state_topic = `${settings.get().mqtt.base_topic}/${friendlyName}`;
            payload.availability_topic = `${settings.get().mqtt.base_topic}/bridge/state`;

            // Set unique names in cases this device produces multiple entities in homeassistant.
            payload.name = mapping[model].length > 1 ? `${friendlyName}_${config.object_id}` : friendlyName;

            // Only set unique_id when user did not set a friendly_name yet,
            // see https://github.com/Koenkk/zigbee2mqtt/issues/138
            if (ieeeAddr === friendlyName) {
                payload.unique_id = `${ieeeAddr}_${config.object_id}_${settings.get().mqtt.base_topic}`;
            }

            if (payload.command_topic) {
                payload.command_topic = `${settings.get().mqtt.base_topic}/${friendlyName}/`;

                if (payload.command_topic_prefix) {
                    payload.command_topic += `${payload.command_topic_prefix}/`;
                }

                payload.command_topic += 'set';
            }

            this.mqtt.publish(topic, JSON.stringify(payload), {retain: true, qos: 0}, null, 'homeassistant');
        });

        this.discovered[ieeeAddr] = true;
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
                        this.publishDeviceState(device, this.state.get(device.ieeeAddr), false);
                    }
                });

                clearTimeout(timer);
            }, 20000);
        }

        return true;
    }

    onZigbeeMessage(message, device, mappedDevice) {
        if (device && mappedDevice) {
            this.discover(device.ieeeAddr, mappedDevice.model);
        }
    }

    // Only for homeassistant.test.js
    _getMapping() {
        return mapping;
    }
}

module.exports = HomeAssistant;
