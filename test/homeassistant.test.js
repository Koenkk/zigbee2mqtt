const data = require('./stub/data');
const settings = require('../lib/util/settings');
const stringify = require('json-stable-stringify-without-jsonify');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const flushPromises = require('./lib/flushPromises');
const MQTT = require('./stub/mqtt');
const Controller = require('../lib/controller');
const fs = require('fs');
const path = require('path');

describe('HomeAssistant extension', () => {
    let version;
    let controller;
    let extension;

    let resetExtension = async () => {
        await controller.enableDisableExtension(false, 'HomeAssistant');
        MQTT.publish.mockClear();
        await controller.enableDisableExtension(true, 'HomeAssistant');
        extension = controller.extensions.find((e) => e.constructor.name === 'HomeAssistant');
    }

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings.reRead();
        settings.set(['homeassistant'], true);
        data.writeEmptyState();
        controller.state.load();
        await resetExtension();
    });

    beforeAll(async () => {
        version = await require('../lib/util/utils').default.getZigbee2MQTTVersion();
        version = `Zigbee2MQTT ${version.version}`;
        jest.useFakeTimers();
        settings.set(['homeassistant'], true);
        data.writeDefaultConfiguration();
        settings.reRead();
        data.writeEmptyState();
        MQTT.publish.mockClear();
        controller = new Controller(false);
        await controller.start();
    });

    afterAll(async () => {
        jest.useRealTimers();
    });

    it('Should not have duplicate type/object_ids in a mapping', () => {
        const duplicated = [];
        require('zigbee-herdsman-converters').devices.forEach((d) => {
            const exposes = typeof d.exposes == 'function' ? d.exposes() : d.exposes;
            const device = {definition: d, isDevice: () => true, options: {}, exposes: () => exposes};
            const configs = extension.getConfigs(device);
            const cfg_type_object_ids = [];

            configs.forEach((c) => {
                const id = c['type'] + '/' + c['object_id'];
                if (cfg_type_object_ids.includes(id)) {
                    if (typeof d.exposes == 'function') {
                        // A dynamic function must exposes all possible attributes for the docs
                        console.warn(`${d.model} dynamic exposes contains duplicated ${id}`)
                    } else {
                        duplicated.push(d.model);
                    }
                } else {
                    cfg_type_object_ids.push(id);
                }
            });
        });

        expect(duplicated).toHaveLength(0);
    });

    it('Should discover devices and groups', async () => {
        let payload;
        await flushPromises();

        payload = {
            "availability":[{"topic":"zigbee2mqtt/bridge/state"}],
            "brightness":true,
            "brightness_scale":254,
            "color_mode":true,
            "command_topic":"zigbee2mqtt/ha_discovery_group/set",
            "device":{
               "identifiers":["zigbee2mqtt_1221051039810110150109113116116_9"],
               "name":"ha_discovery_group",
               "sw_version": version,
            },
            "max_mireds": 454,
            "min_mireds": 250,
            "json_attributes_topic":"zigbee2mqtt/ha_discovery_group",
            "name":"ha_discovery_group",
            "schema":"json",
            "state_topic":"zigbee2mqtt/ha_discovery_group",
            "supported_color_modes":[
               "xy",
               "color_temp"
            ],
            "unique_id":"9_light_zigbee2mqtt"
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/1221051039810110150109113116116_9/light/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            "availability":[{"topic":"zigbee2mqtt/bridge/state"}],
            "command_topic":"zigbee2mqtt/ha_discovery_group/set",
            "device":{
               "identifiers":["zigbee2mqtt_1221051039810110150109113116116_9"],
               "name":"ha_discovery_group",
               "sw_version": version,
            },
            "json_attributes_topic":"zigbee2mqtt/ha_discovery_group",
            "name":"ha_discovery_group",
            "payload_off":"OFF",
            "payload_on":"ON",
            "state_topic":"zigbee2mqtt/ha_discovery_group",
            "unique_id":"9_switch_zigbee2mqtt",
            "value_template":"{{ value_json.state }}"
         };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/switch/1221051039810110150109113116116_9/switch/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'state_class': 'measurement',
            'value_template': '{{ value_json.temperature }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
            'enabled_by_default': true,
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'unit_of_measurement': '%',
            'device_class': 'humidity',
            'state_class': 'measurement',
            'value_template': '{{ value_json.humidity }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_humidity',
            'unique_id': '0x0017880104e45522_humidity_zigbee2mqtt',
            'enabled_by_default': true,
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/humidity/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'unit_of_measurement': 'hPa',
            'device_class': 'pressure',
            'state_class': 'measurement',
            'value_template': '{{ value_json.pressure }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_pressure',
            'unique_id': '0x0017880104e45522_pressure_zigbee2mqtt',
            'enabled_by_default': true,
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/pressure/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'unit_of_measurement': '%',
            'device_class': 'battery',
            'state_class': 'measurement',
            'value_template': '{{ value_json.battery }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_battery',
            'unique_id': '0x0017880104e45522_battery_zigbee2mqtt',
            'enabled_by_default': true,
            'entity_category': 'diagnostic',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/battery/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'icon': 'mdi:signal',
            'enabled_by_default': false,
            'entity_category': 'diagnostic',
            'unit_of_measurement': 'lqi',
            'state_class': 'measurement',
            'value_template': '{{ value_json.linkquality }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_linkquality',
            'unique_id': '0x0017880104e45522_linkquality_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/linkquality/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            "availability":[{"topic":"zigbee2mqtt/bridge/state"}],
            "command_topic":"zigbee2mqtt/wall_switch_double/left/set",
            "device":{
                "identifiers":[
                    "zigbee2mqtt_0x0017880104e45542"
                ],
                "manufacturer":"Xiaomi",
                "model":"Aqara double key wired wall switch without neutral wire. Doesn't work as a router and doesn't support power meter (QBKG03LM)",
                "name":"wall_switch_double",
                "sw_version": null
            },
            "json_attributes_topic":"zigbee2mqtt/wall_switch_double",
            "name":"wall_switch_double_left",
            "payload_off":"OFF",
            "payload_on":"ON",
            "state_topic":"zigbee2mqtt/wall_switch_double",
            "unique_id":"0x0017880104e45542_switch_left_zigbee2mqtt",
            "value_template":"{{ value_json.state_left }}"
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/switch/0x0017880104e45542/switch_left/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            "availability":[{"topic":"zigbee2mqtt/bridge/state"}],
            "command_topic":"zigbee2mqtt/wall_switch_double/right/set",
            "device":{
                "identifiers":[
                    "zigbee2mqtt_0x0017880104e45542"
                ],
                "manufacturer":"Xiaomi",
                "model":"Aqara double key wired wall switch without neutral wire. Doesn't work as a router and doesn't support power meter (QBKG03LM)",
                "name":"wall_switch_double",
                "sw_version": null
            },
            "json_attributes_topic":"zigbee2mqtt/wall_switch_double",
            "name":"wall_switch_double_right",
            "payload_off":"OFF",
            "payload_on":"ON",
            "state_topic":"zigbee2mqtt/wall_switch_double",
            "unique_id":"0x0017880104e45542_switch_right_zigbee2mqtt",
            "value_template":"{{ value_json.state_right }}"
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/switch/0x0017880104e45542/switch_right/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            "availability":[{"topic":"zigbee2mqtt/bridge/state"}],
            "brightness":true,
            "brightness_scale":254,
            "color_mode": true,
            "supported_color_modes": ["color_temp"],
            "min_mireds": 250,
            "max_mireds": 454,
            "command_topic":"zigbee2mqtt/bulb/set",
            "device":{
                "identifiers":[
                    "zigbee2mqtt_0x000b57fffec6a5b2"
                ],
                "manufacturer":"IKEA",
                "model":"TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white (LED1545G12)",
                "name":"bulb",
                "sw_version": null,
            },
            "effect":true,
            "effect_list":[
                "blink",
                "breathe",
                "okay",
                "channel_change",
                "finish_effect",
                "stop_effect"
            ],
            "json_attributes_topic":"zigbee2mqtt/bulb",
            "name":"bulb",
            "schema":"json",
            "state_topic":"zigbee2mqtt/bulb",
            "unique_id":"0x000b57fffec6a5b2_light_zigbee2mqtt",
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/0x000b57fffec6a5b2/light/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover devices with precision', async () => {
        settings.set(['devices', '0x0017880104e45522'], {
            humidity_precision: 0,
            temperature_precision: 1,
            pressure_precision: 2,
            friendly_name: 'weather_sensor',
            retain: false,
        })

        await resetExtension();

        let payload;
        await flushPromises();

        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'state_class': 'measurement',
            'enabled_by_default': true,
            'value_template': "{{ value_json.temperature }}",
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'unit_of_measurement': '%',
            'device_class': 'humidity',
            'state_class': 'measurement',
            'value_template': '{{ value_json.humidity }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_humidity',
            'unique_id': '0x0017880104e45522_humidity_zigbee2mqtt',
            'enabled_by_default': true,
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/humidity/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'unit_of_measurement': 'hPa',
            'device_class': 'pressure',
            'state_class': 'measurement',
            'value_template': '{{ value_json.pressure }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_pressure',
            'enabled_by_default': true,
            'unique_id': '0x0017880104e45522_pressure_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/pressure/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover devices with overriden user configuration', async () => {
        settings.set(['devices', '0x0017880104e45522'], {
            homeassistant: {
                expire_after: 30,
                icon: 'mdi:test',
                temperature: {
                    expire_after: 90,
                    device: {
                        manufacturer: 'From Xiaomi',
                        sw_version: 'test'
                    }
                },
                humidity: {
                    unique_id: null,
                },
                device: {
                    manufacturer: 'Not from Xiaomi',
                    model: 'custom model',
                },
            },
            friendly_name: 'weather_sensor',
            retain: false,
        })

        await resetExtension();

        let payload;
        await flushPromises();

        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'state_class': 'measurement',
            'value_template': '{{ value_json.temperature }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_temperature',
            'enabled_by_default': true,
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': 'test',
                'model': 'custom model',
                'manufacturer': 'From Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
            'expire_after': 90,
            'icon': 'mdi:test',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'unit_of_measurement': '%',
            'device_class': 'humidity',
            'state_class': 'measurement',
            'value_template': '{{ value_json.humidity }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_humidity',
            'enabled_by_default': true,
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': null,
                'model': 'custom model',
                'manufacturer': 'Not from Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
            'expire_after': 30,
            'icon': 'mdi:test',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/humidity/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover devices with overriden name', async () => {
        settings.set(['devices', '0x0017880104e45522'], {
            homeassistant: {
                name: "Weather Sensor",
            },
            friendly_name: 'weather_sensor',
            retain: false,
        })

        await resetExtension();

        let payload;
        await flushPromises();

        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'state_class': 'measurement',
            'value_template': '{{ value_json.temperature }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'Weather Sensor temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'Weather Sensor',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
            'enabled_by_default': true,
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'unit_of_measurement': '%',
            'device_class': 'humidity',
            'state_class': 'measurement',
            'value_template': '{{ value_json.humidity }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'Weather Sensor humidity',
            'unique_id': '0x0017880104e45522_humidity_zigbee2mqtt',
            'enabled_by_default': true,
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'Weather Sensor',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/humidity/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover devices with overriden user configuration affecting type and object_id', async () => {
        settings.set(['devices', '0x0017880104e45541'], {
            friendly_name: 'my_switch',
            homeassistant: {
                switch: {
                    type: 'light',
                    object_id: 'light'
                },
                light: {
                    type: 'this should be ignored',
                    name: 'my_light_name_override'
                },
            },
        })

        await resetExtension();

        let payload;
        await flushPromises();

        payload = {
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
            "command_topic": "zigbee2mqtt/my_switch/set",
            "device": {
              "identifiers": [
                "zigbee2mqtt_0x0017880104e45541"
              ],
              "manufacturer": "Xiaomi",
              "model": "Aqara single key wired wall switch without neutral wire. Doesn't work as a router and doesn't support power meter (QBKG04LM)",
              "name": "my_switch",
              "sw_version": null
            },
            "json_attributes_topic": "zigbee2mqtt/my_switch",
            "name": "my_light_name_override",
            "payload_off": "OFF",
            "payload_on": "ON",
            "state_topic": "zigbee2mqtt/my_switch",
            "unique_id": "0x0017880104e45541_light_zigbee2mqtt",
            "value_template": "{{ value_json.state }}"
        }

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/0x0017880104e45541/light/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

    });

    it('Shouldnt discover devices when homeassistant null is set in device options', async () => {
        settings.set(['devices', '0x0017880104e45522'], {
            homeassistant: null,
            friendly_name: 'weather_sensor',
            retain: false,
        })

        await resetExtension();
        await flushPromises();

        const topics = MQTT.publish.mock.calls.map((c) => c[0]);
        expect(topics).not.toContain('homeassistant/sensor/0x0017880104e45522/humidity/config')
        expect(topics).not.toContain('homeassistant/sensor/0x0017880104e45522/temperature/config')
    });

    it('Shouldnt discover sensor when set to null', async () => {
        logger.error.mockClear();
        settings.set(['devices', '0x0017880104e45522'], {
            homeassistant: {humidity: null},
            friendly_name: 'weather_sensor',
            retain: false,
        })

        await resetExtension();

        const topics = MQTT.publish.mock.calls.map((c) => c[0]);
        expect(topics).not.toContain('homeassistant/sensor/0x0017880104e45522/humidity/config')
        expect(topics).toContain('homeassistant/sensor/0x0017880104e45522/temperature/config')
    });

    it('Should discover devices with fan', async () => {
        let payload;

        payload = {
            "state_topic":"zigbee2mqtt/fan",
            "state_value_template":"{{ value_json.fan_state }}",
            "command_topic":"zigbee2mqtt/fan/set/fan_state",
            "percentage_state_topic":"zigbee2mqtt/fan",
            "percentage_command_topic":"zigbee2mqtt/fan/set/fan_mode",
            "percentage_value_template":"{{ {'off':0, 'low':1, 'medium':2, 'high':3, 'on':4}[value_json.fan_mode] | default('None') }}",
            "percentage_command_template":"{{ {0:'off', 1:'low', 2:'medium', 3:'high', 4:'on'}[value] | default('') }}",
            "preset_mode_state_topic":"zigbee2mqtt/fan",
            "preset_mode_command_topic":"zigbee2mqtt/fan/set/fan_mode",
            "preset_mode_value_template":"{{ value_json.fan_mode if value_json.fan_mode in ['smart'] else 'None' | default('None') }}",
            "preset_modes":[
               "smart"
            ],
            "speed_range_min":1,
            "speed_range_max":4,
            "json_attributes_topic":"zigbee2mqtt/fan",
            "name":"fan",
            "unique_id":"0x0017880104e45548_fan_zigbee2mqtt",
            "device":{
               "identifiers":[
                  "zigbee2mqtt_0x0017880104e45548"
               ],
               "name":"fan",
               "sw_version": null,
               "model":"Universal wink enabled white ceiling fan premier remote control (99432)",
               "manufacturer":"Hampton Bay"
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
         };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/fan/0x0017880104e45548/fan/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover thermostat devices', async () => {
        let payload;

        payload = {
            "action_template":"{% set values = {None:None,'idle':'off','heat':'heating','cool':'cooling','fan_only':'fan'} %}{{ values[value_json.running_state] }}",
            "action_topic":"zigbee2mqtt/TS0601_thermostat",
            "availability":[
                {
                    "topic":"zigbee2mqtt/bridge/state"
                }
            ],
            "away_mode_command_topic":"zigbee2mqtt/TS0601_thermostat/set/away_mode",
            "away_mode_state_template":"{{ value_json.away_mode }}",
            "away_mode_state_topic":"zigbee2mqtt/TS0601_thermostat",
            "current_temperature_template":"{{ value_json.local_temperature }}",
            "current_temperature_topic":"zigbee2mqtt/TS0601_thermostat",
            "device":{
                "identifiers":[
                    "zigbee2mqtt_0x0017882104a44559"
                ],
                "manufacturer":"TuYa",
                "model":"Radiator valve with thermostat (TS0601_thermostat)",
                "name":"TS0601_thermostat",
                "sw_version":null
            },
            "hold_command_topic":"zigbee2mqtt/TS0601_thermostat/set/preset",
            "hold_modes":[
                "schedule",
                "manual",
                "boost",
                "complex",
                "comfort",
                "eco"
            ],
            "hold_state_template":"{{ value_json.preset }}",
            "hold_state_topic":"zigbee2mqtt/TS0601_thermostat",
            "json_attributes_topic":"zigbee2mqtt/TS0601_thermostat",
            "max_temp":"35",
            "min_temp":"5",
            "mode_command_topic":"zigbee2mqtt/TS0601_thermostat/set/system_mode",
            "mode_state_template":"{{ value_json.system_mode }}",
            "mode_state_topic":"zigbee2mqtt/TS0601_thermostat",
            "modes":[
                "heat",
                "auto",
                "off"
            ],
            "name":"TS0601_thermostat",
            "temp_step":0.5,
            "temperature_command_topic":"zigbee2mqtt/TS0601_thermostat/set/current_heating_setpoint",
            "temperature_state_template":"{{ value_json.current_heating_setpoint }}",
            "temperature_state_topic":"zigbee2mqtt/TS0601_thermostat",
            "temperature_unit":"C",
            "unique_id":"0x0017882104a44559_climate_zigbee2mqtt"
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/climate/0x0017882104a44559/climate/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover devices with cover_position', async () => {
        let payload;

        payload = {
            command_topic: 'zigbee2mqtt/smart vent/set',
            position_topic: 'zigbee2mqtt/smart vent',
            set_position_topic: 'zigbee2mqtt/smart vent/set',
            set_position_template: '{ "position": {{ position }} }',
            position_template: '{{ value_json.position }}',
            json_attributes_topic: 'zigbee2mqtt/smart vent',
            name: 'smart vent',
            unique_id: '0x0017880104e45551_cover_zigbee2mqtt',
            device:
            {
                identifiers: [ 'zigbee2mqtt_0x0017880104e45551' ],
                name: 'smart vent',
                sw_version: null,
                model: 'Smart vent (SV01)',
                manufacturer: 'Keen Home'
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/cover/0x0017880104e45551/cover/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover devices with custom homeassistant_discovery_topic', async () => {
        settings.set(['advanced', 'homeassistant_discovery_topic'], 'my_custom_discovery_topic')
        await resetExtension();

        let payload;

        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'state_class': 'measurement',
            'value_template': '{{ value_json.temperature }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'enabled_by_default': true,
            'name': 'weather_sensor_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'my_custom_discovery_topic/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should throw error when starting with attributes output', async () => {
        settings.set(['experimental', 'output'], 'attribute')
        settings.set(['homeassistant'], true)
        expect(() => {
            const controller = new Controller(false);
        }).toThrowError('Home Assistant integration is not possible with attribute output!');
    });

    it('Should warn when starting with cache_state false', async () => {
        settings.set(['advanced', 'cache_state'], false);
        logger.warn.mockClear();
        await resetExtension();
        expect(logger.warn).toHaveBeenCalledWith("In order for Home Assistant integration to work properly set `cache_state: true");
    });

    it('Should set missing values to null', async () => {
        // https://github.com/Koenkk/zigbee2mqtt/issues/6987
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        const data = {measuredValue: -85}
        const payload = {data, cluster: 'msTemperatureMeasurement', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/weather_sensor',
            stringify({"battery":null,"humidity":null,"linkquality":null,"pressure":null,"temperature":-0.85,"voltage":null}),
            { retain: false, qos: 1 },
            expect.any(Function),
        );
    });

    it('Should copy hue/saturtion to h/s if present', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const data = {currentHue: 0, currentSaturation: 254}
        const payload = {data, cluster: 'lightingColorCtrl', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({"color":{"hue": 0, "saturation": 100, "h": 0, "s": 100}, "color_mode": "hs", "linkquality": null, "state": null, "update_available": null, "update": {"state": null}}),
            { retain: false, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should not copy hue/saturtion if properties are missing', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const data = {currentX: 29991, currentY: 26872};
        const payload = {data, cluster: 'lightingColorCtrl', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({"color": {"x": 0.4576,"y": 0.41}, "color_mode": "xy", "linkquality": null,"state": null, "update_available": null, "update": {"state": null}}),
            { retain: false, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should not copy hue/saturtion if color is missing', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const data = {onOff: 1}
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({"linkquality": null,"state": "ON", "update_available": null, "update": {"state": null}}),
            { retain: false, qos: 0 },
            expect.any(Function),
        );
    });

    it('Shouldt discover when already discovered', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        const data = {measuredValue: -85}
        const payload = {data, cluster: 'msTemperatureMeasurement', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        // 1 publish is the publish from receive
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
    });

    it('Should discover when not discovered yet', async () => {
        controller.extensions.find((e) => e.constructor.name === 'HomeAssistant').discovered = {};
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        const data = {measuredValue: -85}
        const payload = {data, cluster: 'msTemperatureMeasurement', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        const payloadHA = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'enabled_by_default': true,
            'state_class': 'measurement',
            'value_template': '{{ value_json.temperature }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payloadHA),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Shouldnt discover when device leaves', async () => {
        controller.extensions.find((e) => e.constructor.name === 'HomeAssistant').discovered = {};
        const device = zigbeeHerdsman.devices.bulb;
        const payload = {ieeeAddr: device.ieeeAddr};
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceLeave(payload);
        await flushPromises();
    });

    it('Should discover when options change', async () => {
        const device = controller.zigbee.resolveEntity(zigbeeHerdsman.devices.bulb);
        MQTT.publish.mockClear();
        controller.eventBus.emitEntityOptionsChanged({entity: device, from: {}, to: {'test': 123}});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            `homeassistant/light/${device.ID}/light/config`,
            expect.any(String),
            expect.any(Object),
            expect.any(Function),
        );
    });

    it('Should send all status when home assistant comes online (default topic)', async () => {
        data.writeDefaultState();
        extension.state.load();
        await resetExtension();
        expect(MQTT.subscribe).toHaveBeenCalledWith('homeassistant/status');
        await flushPromises();
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/status', 'online');
        await flushPromises();
        jest.runOnlyPendingTimers();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({"state":"ON","brightness":50,"color_temp":370,"linkquality":99,"power_on_behavior":null, "update_available": null, "update": {"state": null}}),
            { retain: true, qos: 0 },
            expect.any(Function)
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/remote',
            stringify({"action":null,"action_duration":null,"battery":null,"brightness":255,"linkquality":null, "update_available": null, "update": {"state": null}}),
            { retain: true, qos: 0 },
            expect.any(Function)
        );
    });

    it('Should send all status when home assistant comes online', async () => {
        data.writeDefaultState();
        extension.state.load();
        await resetExtension();
        expect(MQTT.subscribe).toHaveBeenCalledWith('hass/status');
        MQTT.publish.mockClear();
        await MQTT.events.message('hass/status', 'online');
        await flushPromises();
        jest.runOnlyPendingTimers();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({"state":"ON","brightness":50,"color_temp":370,"linkquality":99,"power_on_behavior":null, "update_available": null, "update": {"state": null}}),
            { retain: true, qos: 0 },
            expect.any(Function)
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/remote',
            stringify({"action":null,"action_duration":null,"battery":null,"brightness":255,"linkquality":null, "update_available": null, "update": {"state": null}}),
            { retain: true, qos: 0 },
            expect.any(Function)
        );
    });

    it('Shouldnt send all status when home assistant comes offline', async () => {
        data.writeDefaultState();
        extension.state.load();
        await resetExtension();
        await flushPromises();
        MQTT.publish.mockClear();
        await MQTT.events.message('hass/status', 'offline');
        await flushPromises();
        jest.runOnlyPendingTimers();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Shouldnt send all status when home assistant comes online with different topic', async () => {
        data.writeDefaultState();
        extension.state.load();
        await resetExtension();
        MQTT.publish.mockClear();
        await MQTT.events.message('hass/status_different', 'offline');
        await flushPromises();
        jest.runOnlyPendingTimers();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Should discover devices with availability', async () => {
        settings.set(['availability'], true)
        await resetExtension();

        let payload;

        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'enabled_by_default': true,
            'state_class': 'measurement',
            'value_template': '{{ value_json.temperature }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_mode': 'all',
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}, {topic: 'zigbee2mqtt/weather_sensor/availability'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should clear discovery when device is removed', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/remove', 'weather_sensor');
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            null,
            { retain: true, qos: 0 },
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/humidity/config',
            null,
            { retain: true, qos: 0 },
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/pressure/config',
            null,
            { retain: true, qos: 0 },
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/battery/config',
            null,
            { retain: true, qos: 0 },
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/linkquality/config',
            null,
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should not clear discovery when unsupported device is removed', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/remove', 'unsupported2');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
    });

    it('Should refresh discovery when device is renamed', async () => {
        await MQTT.events.message('homeassistant/device_automation/0x0017880104e45522/action_double/config', stringify({topic: 'zigbee2mqtt/weather_sensor/action'}));
        await flushPromises();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({"from": "weather_sensor", "to": "weather_sensor_renamed","homeassistant_rename":true}));
        await flushPromises();

        const payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'state_class': 'measurement',
            'enabled_by_default': true,
            'value_template': '{{ value_json.temperature }}',
            'state_topic': 'zigbee2mqtt/weather_sensor_renamed',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor_renamed',
            'name': 'weather_sensor_renamed_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor_renamed',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            null,
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45522/action_double/config',
            stringify({
                "automation_type":"trigger",
                "type":"action",
                "subtype":"double",
                "payload":"double",
                "topic":"zigbee2mqtt/weather_sensor_renamed/action",
                "device":{
                    "identifiers":[
                        "zigbee2mqtt_0x0017880104e45522"
                    ],
                    "name":"weather_sensor_renamed",
                    "sw_version": null,
                    "model":"Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)",
                    "manufacturer":"Xiaomi"
                }
            }),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should refresh discovery when group is renamed', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/rename', stringify({"from": "ha_discovery_group", "to": "ha_discovery_group_new","homeassistant_rename":true}));
        await flushPromises();

        const payload = {
            "availability":[{"topic":"zigbee2mqtt/bridge/state"}],
            "brightness":true,
            "brightness_scale":254,
            "color_mode":true,
            "command_topic":"zigbee2mqtt/ha_discovery_group_new/set",
            "device":{
               "identifiers":["zigbee2mqtt_1221051039810110150109113116116_9"],
               "name":"ha_discovery_group_new",
               "sw_version": version,
            },
            "json_attributes_topic":"zigbee2mqtt/ha_discovery_group_new",
            "max_mireds": 454,
            "min_mireds": 250,
            "name":"ha_discovery_group_new",
            "schema":"json",
            "state_topic":"zigbee2mqtt/ha_discovery_group_new",
            "supported_color_modes":[
               "xy",
               "color_temp"
            ],
            "unique_id":"9_light_zigbee2mqtt"
         };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/1221051039810110150109113116116_9/light/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/1221051039810110150109113116116_9/light/config',
            null,
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Shouldnt refresh discovery when device is renamed and homeassistant_rename is false', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({"from": "weather_sensor", "to": "weather_sensor_renamed","homeassistant_rename":false}));
        await flushPromises();

        expect(MQTT.publish).not.toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            null,
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        const payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'state_class': 'measurement',
            'enabled_by_default': true,
            'value_template': '{{ value_json.temperature }}',
            'state_topic': 'zigbee2mqtt/weather_sensor_renamed',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor_renamed',
            'name': 'weather_sensor_renamed_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor_renamed',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover update_available sensor when device supports it', async () => {
        const payload = {
            "payload_on":true,
            "payload_off":false,
            "value_template":`{{ value_json['update']['state'] == "available" }}`,
            "enabled_by_default": true,
            "state_topic":"zigbee2mqtt/bulb",
            "json_attributes_topic":"zigbee2mqtt/bulb",
            "name":"bulb update available",
            "unique_id":"0x000b57fffec6a5b2_update_available_zigbee2mqtt",
            "device":{
                "identifiers":[
                    "zigbee2mqtt_0x000b57fffec6a5b2"
                ],
                "name":"bulb",
                'sw_version': null,
                "model":"TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white (LED1545G12)",
                "manufacturer":"IKEA"
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
            'device_class': 'update',
            'entity_category': 'diagnostic'
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/binary_sensor/0x000b57fffec6a5b2/update_available/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover trigger when click is published', async () => {
        const discovered = MQTT.publish.mock.calls.filter((c) => c[0].includes('0x0017880104e45520')).map((c) => c[0]);
        expect(discovered.length).toBe(7);
        expect(discovered).toContain('homeassistant/sensor/0x0017880104e45520/click/config');
        expect(discovered).toContain('homeassistant/sensor/0x0017880104e45520/action/config');

        MQTT.publish.mockClear();

        const device = zigbeeHerdsman.devices.WXKG11LM;
        const payload1 = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload1);
        await flushPromises();

        const discoverPayloadAction = {
            "automation_type":"trigger",
            "type":"action",
            "subtype":"single",
            "payload":"single",
            "topic":"zigbee2mqtt/button/action",
            "device":{
                "identifiers":[
                    "zigbee2mqtt_0x0017880104e45520"
                ],
                "name":"button",
                "sw_version": null,
                "model":"Aqara wireless switch (WXKG11LM)",
                "manufacturer":"Xiaomi"
            }
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/action_single/config',
            stringify(discoverPayloadAction),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        const discoverPayloadClick = {
            "automation_type":"trigger",
            "type":"click",
            "subtype":"single",
            "payload":"single",
            "topic":"zigbee2mqtt/button/click",
            "device":{
                "identifiers":[
                    "zigbee2mqtt_0x0017880104e45520"
                ],
                "name":"button",
                "sw_version": null,
                "model":"Aqara wireless switch (WXKG11LM)",
                "manufacturer":"Xiaomi"
            }
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/click_single/config',
            stringify(discoverPayloadClick),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button/action',
            'single',
            { retain: false, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button/click',
            'single',
            { retain: false, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button',
            stringify({action: "single", click: "single", battery: null, linkquality: null, voltage: null, power_outage_count: null, device_temperature: null}),
            { retain: false, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button',
            stringify({action: "", battery: null, linkquality: null, voltage: null, click: null, power_outage_count: null, device_temperature: null}),
            { retain: false, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button',
            stringify({click: "", action: null, battery: null, linkquality: null, voltage: null, power_outage_count: null, device_temperature: null}),
            { retain: false, qos: 0 },
            expect.any(Function),
        );

        // Should only discover it once
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload1);
        await flushPromises();
        expect(MQTT.publish).not.toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/action_single/config',
            stringify(discoverPayloadAction),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).not.toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/click_single/config',
            stringify(discoverPayloadClick),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button/action',
            'single',
            { retain: false, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button/click',
            'single',
            { retain: false, qos: 0 },
            expect.any(Function),
        );

        // Shouldn't rediscover when already discovered in previous session
        controller.extensions.find((e) => e.constructor.name === 'HomeAssistant')._clearDiscoveredTrigger();
        await MQTT.events.message('homeassistant/device_automation/0x0017880104e45520/action_double/config', stringify({topic: 'zigbee2mqtt/button/action'}));
        await MQTT.events.message('homeassistant/device_automation/0x0017880104e45520/action_double/config', stringify({topic: 'zigbee2mqtt/button/action'}));
        await flushPromises();
        MQTT.publish.mockClear();
        const payload2 = {data: {'32768': 2}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload2);
        await flushPromises();
        expect(MQTT.publish).not.toHaveBeenCalledWith('homeassistant/device_automation/0x0017880104e45520/action_double/config', expect.any(String), expect.any(Object), expect.any(Function));

        // Should rediscover when already discovered in previous session but with diferent name
        controller.extensions.find((e) => e.constructor.name === 'HomeAssistant')._clearDiscoveredTrigger();
        await MQTT.events.message('homeassistant/device_automation/0x0017880104e45520/action_double/config', stringify({topic: 'zigbee2mqtt/button_other_name/action'}));
        await flushPromises();
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload2);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('homeassistant/device_automation/0x0017880104e45520/action_double/config', expect.any(String), expect.any(Object), expect.any(Function));
    });

    it('Should not discover device_automation when disabled', async () => {
        settings.set(['device_options'], {
            homeassistant: {device_automation: null},
        })
        await resetExtension();
        MQTT.publish.mockClear();

        const device = zigbeeHerdsman.devices.WXKG11LM;
        const payload1 = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload1);
        await flushPromises();

        expect(MQTT.publish).not.toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/action_single/config',
            expect.any(String),
            expect.any(Object),
            expect.any(Function),
        );
    });

    it('Should not discover sensor_click when legacy: false is set', async () => {
        settings.set(['devices', '0x0017880104e45520'], {
            legacy: false,
            friendly_name: 'weather_sensor',
            retain: false,
        })
        await resetExtension();

        const discovered = MQTT.publish.mock.calls.filter((c) => c[0].includes('0x0017880104e45520')).map((c) => c[0]);
        expect(discovered.length).toBe(6);
        expect(discovered).toContain('homeassistant/sensor/0x0017880104e45520/action/config');
        expect(discovered).toContain('homeassistant/sensor/0x0017880104e45520/battery/config');
        expect(discovered).toContain('homeassistant/sensor/0x0017880104e45520/linkquality/config');
    });

    it('Should disable Home Assistant legacy triggers', async () => {
        settings.set(['advanced', 'homeassistant_legacy_triggers'], false);
        await resetExtension();

        const discovered = MQTT.publish.mock.calls.filter((c) => c[0].includes('0x0017880104e45520')).map((c) => c[0]);
        expect(discovered.length).toBe(5);
        expect(discovered).not.toContain('homeassistant/sensor/0x0017880104e45520/click/config');
        expect(discovered).not.toContain('homeassistant/sensor/0x0017880104e45520/action/config');

        MQTT.publish.mockClear();

        const device = zigbeeHerdsman.devices.WXKG11LM;
        settings.set(['devices', device.ieeeAddr, 'legacy'], false);
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();

        const discoverPayload = {
            "automation_type":"trigger",
            "type":"action",
            "subtype":"single",
            "payload":"single",
            "topic":"zigbee2mqtt/button/action",
            "device":{
                "identifiers":[
                    "zigbee2mqtt_0x0017880104e45520"
                ],
                "name":"button",
                "sw_version": null,
                "model":"Aqara wireless switch (WXKG11LM)",
                "manufacturer":"Xiaomi"
            }
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/action_single/config',
            stringify(discoverPayload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button/action',
            'single',
            { retain: false, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button',
            stringify({action: "single", "battery":null,"linkquality":null,"voltage":null, "power_outage_count": null, "device_temperature": null}),
            { retain: false, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledTimes(3);
    });

    it('Should republish payload to postfix topic with lightWithPostfix config', async () => {
        MQTT.publish.mockClear();

        await MQTT.events.message('zigbee2mqtt/U202DST600ZB/l2/set', stringify({state: 'ON', brightness: 20}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/U202DST600ZB', stringify({state_l2:"ON", brightness_l2:20, linkquality: null, state_l1: null}), {"qos": 0, "retain": false}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/U202DST600ZB/l2', stringify({state:"ON", brightness:20}), {"qos": 0, "retain": false}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/U202DST600ZB/l1', stringify({state: null}), {"qos": 0, "retain": false}, expect.any(Function));
    });

    it('Shouldnt crash in onPublishEntityState on group publish', async () => {
        logger.error.mockClear();
        MQTT.publish.mockClear();

        await MQTT.events.message('zigbee2mqtt/group_1/set', stringify({state: 'ON'}));
        await flushPromises();
        expect(logger.error).toHaveBeenCalledTimes(0);
    });

    it('Should counter an action payload with an empty payload', async () => {
        MQTT.publish.mockClear();
        const device = zigbeeHerdsman.devices.WXKG11LM;
        settings.set(['devices', device.ieeeAddr, 'legacy'], false);
        const data = {onOff: 1}
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(4);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({action: 'single', click: null, battery: null, linkquality: null, voltage: null, power_outage_count: null, device_temperature: null});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/button');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({action: '', click: null, battery: null, linkquality: null, voltage: null, power_outage_count: null, device_temperature: null});
        expect(MQTT.publish.mock.calls[1][2]).toStrictEqual({"qos": 0, "retain": false});
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('homeassistant/device_automation/0x0017880104e45520/action_single/config');
        expect(MQTT.publish.mock.calls[3][0]).toStrictEqual('zigbee2mqtt/button/action');
    });

    it('Should clear outdated configs', async () => {
        // Non-existing group -> clear
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/light/1221051039810110150109113116116_91231/light/config', stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith('homeassistant/light/1221051039810110150109113116116_91231/light/config', null, {qos: 0, retain: true}, expect.any(Function));

        // Existing group -> dont clear
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/light/1221051039810110150109113116116_9/light/config', stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);

        // Existing group with old topic structure (1.20.0) -> clear
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/light/9/light/config', stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith('homeassistant/light/9/light/config', null, {qos: 0, retain: true}, expect.any(Function));

        // Existing group, non existing config ->  clear
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/light/1221051039810110150109113116116_9/switch/config', stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith('homeassistant/light/1221051039810110150109113116116_9/switch/config', null, {qos: 0, retain: true}, expect.any(Function));

        // Non-existing device -> clear
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/sensor/0x123/temperature/config', stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith('homeassistant/sensor/0x123/temperature/config', null, {qos: 0, retain: true}, expect.any(Function));

        // Existing device -> don't clear
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/binary_sensor/0x000b57fffec6a5b2/update_available/config', stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);

        // Non-existing device of different instance -> don't clear
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/sensor/0x123/temperature/config', stringify({availability: [{topic: 'zigbee2mqtt_different/bridge/state'}]}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);

        // Existing device but non-existing config -> don't clear
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/sensor/0x000b57fffec6a5b2/update_available/config', stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith('homeassistant/sensor/0x000b57fffec6a5b2/update_available/config', null, {qos: 0, retain: true}, expect.any(Function));

        // Non-existing device but invalid payload -> clear
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/sensor/0x123/temperature/config', '1}3');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);

        // Existing device, device automation -> don't clear
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/device_automation/0x000b57fffec6a5b2/action_button_3_single/config', stringify({topic: 'zigbee2mqtt/0x000b57fffec6a5b2/availability'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);

        // Device automation of different instance -> don't clear
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/device_automation/0x000b57fffec6a5b2_not_existing/action_button_3_single/config', stringify({topic: 'zigbee2mqtt_different/0x000b57fffec6a5b2_not_existing/availability'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);

        // Device was flagged to be excluded from homeassistant discovery
        settings.set(['devices', '0x000b57fffec6a5b2', 'homeassistant'], null);
        await resetExtension();
        MQTT.publish.mockClear();

        await MQTT.events.message('homeassistant/sensor/0x000b57fffec6a5b2/update_available/config', stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('homeassistant/sensor/0x000b57fffec6a5b2/update_available/config', null, {qos: 0, retain: true}, expect.any(Function));
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/device_automation/0x000b57fffec6a5b2/action_button_3_single/config', stringify({topic: 'zigbee2mqtt/0x000b57fffec6a5b2/availability'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('homeassistant/device_automation/0x000b57fffec6a5b2/action_button_3_single/config', null, {qos: 0, retain: true}, expect.any(Function));
    });

    it('Should not have Home Assistant legacy entity attributes when disabled', async () => {
        settings.set(['advanced', 'homeassistant_legacy_entity_attributes'], false);
        await resetExtension();

        let payload;
        await flushPromises();

        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'state_class': 'measurement',
            'value_template': '{{ value_json.temperature }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'enabled_by_default': true,
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should rediscover group when device is added to it', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/members/add', stringify({group: 'ha_discovery_group', device: 'wall_switch_double/left'}));
        await flushPromises();

        const payload = {
            "availability":[{"topic":"zigbee2mqtt/bridge/state"}],
            "brightness":true,
            "brightness_scale":254,
            "color_mode":true,
            "command_topic":"zigbee2mqtt/ha_discovery_group/set",
            "device":{
               "identifiers":["zigbee2mqtt_1221051039810110150109113116116_9"],
               "name":"ha_discovery_group",
               "sw_version": version,
            },
            "json_attributes_topic":"zigbee2mqtt/ha_discovery_group",
            "max_mireds": 454,
            "min_mireds": 250,
            "name":"ha_discovery_group",
            "schema":"json",
            "state_topic":"zigbee2mqtt/ha_discovery_group",
            "supported_color_modes":[
               "xy",
               "color_temp"
            ],
            "unique_id":"9_light_zigbee2mqtt"
         };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/1221051039810110150109113116116_9/light/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover with json availability payload value_template', async () => {
        settings.set(['advanced', 'legacy_availability_payload'], false);
        await resetExtension();

        const payload = {
            "availability":[{"topic":"zigbee2mqtt/bridge/state","value_template":'{{ value_json.state }}'}],
            "brightness":true,
            "brightness_scale":254,
            "color_mode":true,
            "command_topic":"zigbee2mqtt/ha_discovery_group/set",
            "device":{
               "identifiers":["zigbee2mqtt_1221051039810110150109113116116_9"],
               "name":"ha_discovery_group",
               "sw_version": version,
            },
            "max_mireds": 454,
            "min_mireds": 250,
            "json_attributes_topic":"zigbee2mqtt/ha_discovery_group",
            "name":"ha_discovery_group",
            "schema":"json",
            "state_topic":"zigbee2mqtt/ha_discovery_group",
            "supported_color_modes":[
               "xy",
               "color_temp"
            ],
            "unique_id":"9_light_zigbee2mqtt"
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/1221051039810110150109113116116_9/light/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover last_seen when enabled', async () => {
        settings.set(['advanced', 'last_seen'], 'ISO_8601');
        await resetExtension();

        const payload = {
            "availability":[
               {
                  "topic":"zigbee2mqtt/bridge/state"
               }
            ],
            "device":{
               "identifiers":[
                  "zigbee2mqtt_0x000b57fffec6a5b2"
               ],
               "manufacturer":"IKEA",
               "model":"TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white (LED1545G12)",
               "name":"bulb",
               "sw_version": null
            },
            "enabled_by_default":false,
            "icon":"mdi:clock",
            "json_attributes_topic":"zigbee2mqtt/bulb",
            "name":"bulb last seen",
            "state_topic":"zigbee2mqtt/bulb",
            "unique_id":"0x000b57fffec6a5b2_last_seen_zigbee2mqtt",
            "value_template":"{{ value_json.last_seen }}",
            "device_class": "timestamp",
            "entity_category": "diagnostic"
         };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x000b57fffec6a5b2/last_seen/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover devices with configuration url', async () => {
        settings.set(['frontend', 'url'], 'http://zigbee.mqtt');

        await resetExtension();

        let payload;
        await flushPromises();

        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'state_class': 'measurement',
            'enabled_by_default': true,
            'value_template': "{{ value_json.temperature }}",
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': null,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
                'configuration_url': 'http://zigbee.mqtt/#/device/0x0017880104e45522/info'
            },
            'availability': [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });
});
