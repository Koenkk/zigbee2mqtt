const data = require('./stub/data');
const settings = require('../lib/util/settings');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const flushPromises = () => new Promise(setImmediate);
const MQTT = require('./stub/mqtt');
const Controller = require('../lib/controller');

describe('HomeAssistant extension', () => {
    beforeEach(async () => {
        this.version = await require('../lib/util/utils').getZigbee2mqttVersion();
        this.version = `Zigbee2mqtt ${this.version.version}`;
        jest.useRealTimers();
        data.writeDefaultConfiguration();
        settings._reRead();
        data.writeEmptyState();
        MQTT.publish.mockClear();
        settings.set(['homeassistant'], true);
    });

    it('Should have mapping for all devices supported by zigbee-herdsman-converters', () => {
        const missing = [];
        const HomeAssistant = require('../lib/extension/homeassistant');
        const ha = new HomeAssistant(null, null, null, null, {on: () => {}});

        require('zigbee-herdsman-converters').devices.forEach((d) => {
            if (!ha._getMapping()[d.model]) {
                missing.push(d.model);
            }
        });

        expect(missing).toHaveLength(0);
    });

    it('Should not have duplicate type/object_ids in a mapping', () => {
        const duplicated = [];
        const HomeAssistant = require('../lib/extension/homeassistant');
        const ha = new HomeAssistant(null, null, null, null, {on: () => {}});

        require('zigbee-herdsman-converters').devices.forEach((d) => {
            const mapping = ha._getMapping()[d.model];
            const cfg_type_object_ids = [];

            mapping.forEach((c) => {
                if (cfg_type_object_ids.includes(c['type'] + '/' + c['object_id'])) {
                    duplicated.push(d.model);
                } else {
                    cfg_type_object_ids.push(c['type'] + '/' + c['object_id']);
                }
            });
        });

        expect(duplicated).toHaveLength(0);
    });

    it('Should discover devices', async () => {
        controller = new Controller(false);
        await controller.start();

        let payload;
        await flushPromises();

        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'value_template': '{{ value_json.temperature }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': this.version,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            JSON.stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'unit_of_measurement': '%',
            'device_class': 'humidity',
            'value_template': '{{ value_json.humidity }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_humidity',
            'unique_id': '0x0017880104e45522_humidity_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': this.version,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/humidity/config',
            JSON.stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'unit_of_measurement': 'hPa',
            'device_class': 'pressure',
            'value_template': '{{ value_json.pressure }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_pressure',
            'unique_id': '0x0017880104e45522_pressure_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': this.version,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/pressure/config',
            JSON.stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'unit_of_measurement': '%',
            'device_class': 'battery',
            'value_template': '{{ value_json.battery }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_battery',
            'unique_id': '0x0017880104e45522_battery_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': this.version,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/battery/config',
            JSON.stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'icon': 'mdi:signal',
            'unit_of_measurement': 'lqi',
            'value_template': '{{ value_json.linkquality }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_linkquality',
            'unique_id': '0x0017880104e45522_linkquality_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': this.version,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/linkquality/config',
            JSON.stringify(payload),
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

        controller = new Controller(false);
        await controller.start();

        let payload;
        await flushPromises();

        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'value_template': "{{ (value_json.temperature | float) | round(1) }}",
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': this.version,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            JSON.stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'unit_of_measurement': '%',
            'device_class': 'humidity',
            'value_template': '{{ (value_json.humidity | float) | round(0) }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_humidity',
            'unique_id': '0x0017880104e45522_humidity_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': this.version,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/humidity/config',
            JSON.stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'unit_of_measurement': 'hPa',
            'device_class': 'pressure',
            'value_template': '{{ (value_json.pressure | float) | round(2) }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_pressure',
            'unique_id': '0x0017880104e45522_pressure_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': this.version,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/pressure/config',
            JSON.stringify(payload),
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
                }
            },
            friendly_name: 'weather_sensor',
            retain: false,
        })

        controller = new Controller(false);
        await controller.start();

        let payload;
        await flushPromises();

        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'value_template': '{{ value_json.temperature }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': 'test',
                'model': 'custom model',
                'manufacturer': 'From Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
            'expire_after': 90,
            'icon': 'mdi:test',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            JSON.stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        payload = {
            'unit_of_measurement': '%',
            'device_class': 'humidity',
            'value_template': '{{ value_json.humidity }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_humidity',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': this.version,
                'model': 'custom model',
                'manufacturer': 'Not from Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
            'expire_after': 30,
            'icon': 'mdi:test',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/humidity/config',
            JSON.stringify(payload),
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

        controller = new Controller(false);
        await controller.start();

        await flushPromises();

        const topics = MQTT.publish.mock.calls.map((c) => c[0]);
        expect(topics).not.toContain('homeassistant/sensor/0x0017880104e45522/humidity/config')
        expect(topics).not.toContain('homeassistant/sensor/0x0017880104e45522/temperature/config')
    });

    it('Should discover devices with fan', async () => {
        controller = new Controller(false);
        await controller.start();

        let payload;
        await flushPromises();

        payload = {
            "state_topic":"zigbee2mqtt/fan",
            "state_value_template":"{{ value_json.fan_state }}",
            "command_topic":"zigbee2mqtt/fan/set/fan_state",
            "speed_state_topic":"zigbee2mqtt/fan",
            "speed_command_topic":"zigbee2mqtt/fan/set/fan_mode",
            "speed_value_template":"{{ value_json.fan_mode }}",
            "speeds":[
               "off",
               "low",
               "medium",
               "high",
               "on",
               "auto",
               "smart"
            ],
            "json_attributes_topic":"zigbee2mqtt/fan",
            "name":"fan_fan",
            "unique_id":"0x0017880104e45548_fan_zigbee2mqtt",
            "device":{
               "identifiers":[
                  "zigbee2mqtt_0x0017880104e45548"
               ],
               "name":"fan",
               "sw_version":this.version,
               "model":"Universal wink enabled white ceiling fan premier remote control (99432)",
               "manufacturer":"Hampton Bay"
            },
            "availability_topic":"zigbee2mqtt/bridge/state"
         };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/fan/0x0017880104e45548/fan/config',
            JSON.stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover devices with cover_position', async () => {
        controller = new Controller(false);
        await controller.start();

        let payload;
        await flushPromises();

        payload = {
            command_topic: 'zigbee2mqtt/smart_vent/set',
            position_topic: 'zigbee2mqtt/smart_vent',
            set_position_topic: 'zigbee2mqtt/smart_vent/set',
            set_position_template: '{ "position": {{ position }} }',
            value_template: '{{ value_json.position }}',
            json_attributes_topic: 'zigbee2mqtt/smart_vent',
            name: 'smart_vent_cover',
            unique_id: '0x0017880104e45551_cover_zigbee2mqtt',
            device:
            {
                identifiers: [ 'zigbee2mqtt_0x0017880104e45551' ],
                name: 'smart_vent',
                sw_version: this.version,
                model: 'Smart vent (SV01)',
                manufacturer: 'Keen Home'
            },
            availability_topic: 'zigbee2mqtt/bridge/state'
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/cover/0x0017880104e45551/cover/config',
            JSON.stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover devices with custom homeassistant_discovery_topic', async () => {
        settings.set(['advanced', 'homeassistant_discovery_topic'], 'my_custom_discovery_topic')
        controller = new Controller(false);
        await controller.start();

        let payload;
        await flushPromises();

        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'value_template': '{{ value_json.temperature }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': this.version,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'my_custom_discovery_topic/sensor/0x0017880104e45522/temperature/config',
            JSON.stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should throw error when starting with attributes output', async () => {
        settings.set(['experimental', 'output'], 'attribute')
        expect(() => {
            controller = new Controller(false);
        }).toThrowError('Home Assitant integration is not possible with attribute output!');
    });

    it('Should warn when starting with cache_state false', async () => {
        settings.set(['advanced', 'cache_state'], false);
        logger.warn.mockClear();
        controller = new Controller(false);
        expect(logger.warn).toHaveBeenCalledWith("In order for HomeAssistant integration to work properly set `cache_state: true");
    });

    it('Shouldt discover when already discovered', async () => {
        controller = new Controller(false);
        await controller.start();
        await flushPromises();
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        const data = {measuredValue: -85}
        const payload = {data, cluster: 'msTemperatureMeasurement', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        // 1 publish is the publish from deviceReceive
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
    });

    it('Should discover when not discovered yet', async () => {
        controller = new Controller(false);
        await controller.start();
        await flushPromises();
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
            'value_template': '{{ value_json.temperature }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': this.version,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            JSON.stringify(payloadHA),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Shouldnt discover when device leaves', async () => {
        controller = new Controller();
        await controller.start();
        await flushPromises();
        controller.extensions.find((e) => e.constructor.name === 'HomeAssistant').discovered = {};
        const device = zigbeeHerdsman.devices.bulb;
        const payload = {ieeeAddr: device.ieeeAddr};
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceLeave(payload);
        await flushPromises();
        // 1 publish is from device_removed
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
    });

    it('Should send all status when home assistant comes online', async () => {
        jest.useFakeTimers();
        data.writeDefaultState();
        controller = new Controller();
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();
        await MQTT.events.message('hass/status', 'online');
        await flushPromises();
        jest.runOnlyPendingTimers();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            '{"state":"ON","brightness":50,"color_temp":370,"linkquality":99,"update_available":false}',
            { retain: true, qos: 0 },
            expect.any(Function)
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/remote',
            '{"brightness":255,"update_available":false}',
            { retain: true, qos: 0 },
            expect.any(Function)
        );
    });

    it('Shouldnt send all status when home assistant comes offline', async () => {
        jest.useFakeTimers();
        data.writeDefaultState();
        controller = new Controller();
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();
        await MQTT.events.message('hass/status', 'offline');
        await flushPromises();
        jest.runOnlyPendingTimers();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Shouldnt send all status when home assistant comes online with different topic', async () => {
        jest.useFakeTimers();
        data.writeDefaultState();
        controller = new Controller();
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();
        await MQTT.events.message('hass/status_different', 'offline');
        await flushPromises();
        jest.runOnlyPendingTimers();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Should discover devices with availability', async () => {
        settings.set(['advanced', 'availability_timeout'], 1)
        controller = new Controller(false);
        await controller.start();

        let payload;
        await flushPromises();

        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'value_template': '{{ value_json.temperature }}',
            'state_topic': 'zigbee2mqtt/weather_sensor',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor',
            'name': 'weather_sensor_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor',
                'sw_version': this.version,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/weather_sensor/availability',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            JSON.stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should clear discovery when device is removed', async () => {
        controller = new Controller(false);
        await controller.start();
        await flushPromises();
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
        controller = new Controller(false);
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/remove', 'unsupported2');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
    });

    it('Should refresh discovery when device is renamed', async () => {
        controller = new Controller(false);
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/rename', '{"old": "weather_sensor", "new": "weather_sensor_renamed"}');
        await flushPromises();

        const payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'value_template': '{{ value_json.temperature }}',
            'state_topic': 'zigbee2mqtt/weather_sensor_renamed',
            'json_attributes_topic': 'zigbee2mqtt/weather_sensor_renamed',
            'name': 'weather_sensor_renamed_temperature',
            'unique_id': '0x0017880104e45522_temperature_zigbee2mqtt',
            'device': {
                'identifiers': ['zigbee2mqtt_0x0017880104e45522'],
                'name': 'weather_sensor_renamed',
                'sw_version': this.version,
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            JSON.stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover update_available sensor when device supports it', async () => {
        controller = new Controller(false);
        await controller.start();
        await flushPromises();
        const payload = {
            "payload_on":true,
            "payload_off":false,
            "value_template":"{{ value_json.update_available}}",
            "state_topic":"zigbee2mqtt/bulb",
            "json_attributes_topic":"zigbee2mqtt/bulb",
            "name":"bulb_update_available",
            "unique_id":"0x000b57fffec6a5b2_update_available_zigbee2mqtt",
            "device":{
                "identifiers":[
                    "zigbee2mqtt_0x000b57fffec6a5b2"
                ],
                "name":"bulb",
                'sw_version': this.version,
                "model":"TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white (LED1545G12)",
                "manufacturer":"IKEA"
            },
            "availability_topic":"zigbee2mqtt/bridge/state"
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/binary_sensor/0x000b57fffec6a5b2/update_available/config',
            JSON.stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should discover trigger when click is published', async () => {
        controller = new Controller(false);
        await controller.start();
        await flushPromises();

        const discovered = MQTT.publish.mock.calls.filter((c) => c[0].includes('0x0017880104e45520')).map((c) => c[0]);
        expect(discovered.length).toBe(4);
        expect(discovered).toContain('homeassistant/sensor/0x0017880104e45520/click/config');
        expect(discovered).toContain('homeassistant/sensor/0x0017880104e45520/action/config');

        MQTT.publish.mockClear();

        const device = zigbeeHerdsman.devices.WXKG11LM;
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();

        const discoverPayload = {
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
                "sw_version": this.version,
                "model":"Aqara wireless switch (WXKG11LM)",
                "manufacturer":"Xiaomi"
            }
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/click_single/config',
            JSON.stringify(discoverPayload),
            { retain: true, qos: 0 },
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
            JSON.stringify({click: "single", linkquality: 10}),
            { retain: false, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button',
            JSON.stringify({linkquality: 10, click: ""}),
            { retain: false, qos: 0 },
            expect.any(Function),
        );

        // Should only discover it once
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).not.toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/click_single/config',
            JSON.stringify(discoverPayload),
            { retain: true, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button/click',
            'single',
            { retain: false, qos: 0 },
            expect.any(Function),
        );
    });

    it('Should disable Home Assistant legacy triggers', async () => {
        settings.set(['advanced', 'homeassistant_legacy_triggers'], false);
        controller = new Controller(false);
        await controller.start();
        await flushPromises();

        const discovered = MQTT.publish.mock.calls.filter((c) => c[0].includes('0x0017880104e45520')).map((c) => c[0]);
        expect(discovered.length).toBe(2);
        expect(discovered).not.toContain('homeassistant/sensor/0x0017880104e45520/click/config');
        expect(discovered).not.toContain('homeassistant/sensor/0x0017880104e45520/action/config');

        MQTT.publish.mockClear();

        const device = zigbeeHerdsman.devices.WXKG11LM;
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();

        const discoverPayload = {
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
                "sw_version": this.version,
                "model":"Aqara wireless switch (WXKG11LM)",
                "manufacturer":"Xiaomi"
            }
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/click_single/config',
            JSON.stringify(discoverPayload),
            { retain: true, qos: 0 },
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
            JSON.stringify({click: "single", linkquality: 10}),
            { retain: false, qos: 0 },
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledTimes(3);
    });

    it('Should republish payload to postfix topic with lightWithPostfix config', async () => {
        controller = new Controller(false);
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();

        await MQTT.events.message('zigbee2mqtt/U202DST600ZB/l2/set', JSON.stringify({state: 'ON', brightness: 20}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/U202DST600ZB', JSON.stringify({state_l2:"ON", brightness_l2:20}), {"qos": 0, "retain": false}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/U202DST600ZB/l2', JSON.stringify({state:"ON", brightness:20}), {"qos": 0, "retain": false}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/U202DST600ZB/l1', JSON.stringify({}), {"qos": 0, "retain": false}, expect.any(Function));
    });

    it('Shouldnt crash in onPublishEntityState on group publish', async () => {
        controller = new Controller(false);
        await controller.start();
        await flushPromises();
        logger.error.mockClear();
        MQTT.publish.mockClear();

        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expect(logger.error).toHaveBeenCalledTimes(0);
    });
});
