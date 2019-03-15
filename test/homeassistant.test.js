const devices = require('zigbee-shepherd-converters').devices;
const HomeassistantExtension = require('../lib/extension/homeassistant');
const settings = require('../lib/util/settings');

const WSDCGQ11LM = devices.find((d) => d.model === 'WSDCGQ11LM');
const SV01 = devices.find((d) => d.model === 'SV01');

describe('HomeAssistant extension', () => {
    let homeassistant = null;
    let mqtt = null;

    beforeEach(() => {
        mqtt = {
            publish: jest.fn(),
        };

        homeassistant = new HomeassistantExtension(null, mqtt, null, null);
        homeassistant.zigbee2mqttVersion = 'test';
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('Should have mapping for all devices supported by zigbee-shepherd-converters', () => {
        const missing = [];

        devices.forEach((d) => {
            if (!homeassistant._getMapping()[d.model]) {
                missing.push(d.model);
            }
        });

        expect(missing).toHaveLength(0);
    }
    );

    it('Should discover devices', () => {
        let payload = null;
        jest.spyOn(settings, 'getDevice').mockReturnValue({friendly_name: 'my_device'});

        homeassistant.discover('0x12345678', WSDCGQ11LM, false);
        expect(mqtt.publish).toHaveBeenCalledTimes(5);

        // 1
        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'value_template': '{{ value_json.temperature }}',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'state_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_temperature',
            'unique_id': '0x12345678_temperature_zigbee2mqtt',
            'device': {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[0][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[0][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[0][3]).toBeNull();
        expect(mqtt.publish.mock.calls[0][4]).toBe('homeassistant');

        // 2
        payload = {
            'unit_of_measurement': '%',
            'device_class': 'humidity',
            'value_template': '{{ value_json.humidity }}',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'state_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_humidity',
            'unique_id': '0x12345678_humidity_zigbee2mqtt',
            'device': {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[1][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[1][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[1][3]).toBeNull();
        expect(mqtt.publish.mock.calls[1][4]).toBe('homeassistant');

        // 3
        payload = {
            'unit_of_measurement': 'hPa',
            'device_class': 'pressure',
            'value_template': '{{ value_json.pressure }}',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'state_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_pressure',
            'unique_id': '0x12345678_pressure_zigbee2mqtt',
            'device': {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[2][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[2][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[2][3]).toBeNull();
        expect(mqtt.publish.mock.calls[2][4]).toBe('homeassistant');

        // 4
        payload = {
            'unit_of_measurement': '%',
            'device_class': 'battery',
            'value_template': '{{ value_json.battery }}',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'state_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_battery',
            'unique_id': '0x12345678_battery_zigbee2mqtt',
            'device': {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[3][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[3][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[3][3]).toBeNull();
        expect(mqtt.publish.mock.calls[3][4]).toBe('homeassistant');

        // 5
        payload = {
            'unit_of_measurement': '-',
            'value_template': '{{ value_json.linkquality }}',
            'state_topic': 'zigbee2mqtt/my_device',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_linkquality',
            'unique_id': '0x12345678_linkquality_zigbee2mqtt',
            'device': {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[4][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[4][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[4][3]).toBeNull();
        expect(mqtt.publish.mock.calls[4][4]).toBe('homeassistant');
    });

    it('Should discover devices with precision', () => {
        let payload = null;
        jest.spyOn(settings, 'getDevice').mockReturnValue({
            friendly_name: 'my_device',
            humidity_precision: 0,
            temperature_precision: 1,
            pressure_precision: 2,
        });

        homeassistant.discover('0x12345678', WSDCGQ11LM, false);
        expect(mqtt.publish).toHaveBeenCalledTimes(5);

        // 1
        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'value_template': '{{ (value_json.temperature | float) | round(1) }}',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'state_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_temperature',
            'unique_id': '0x12345678_temperature_zigbee2mqtt',
            'device': {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[0][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[0][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[0][3]).toBeNull();
        expect(mqtt.publish.mock.calls[0][4]).toBe('homeassistant');

        // 2
        payload = {
            'unit_of_measurement': '%',
            'device_class': 'humidity',
            'value_template': '{{ (value_json.humidity | float) | round(0) }}',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'state_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_humidity',
            'unique_id': '0x12345678_humidity_zigbee2mqtt',
            'device': {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[1][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[1][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[1][3]).toBeNull();
        expect(mqtt.publish.mock.calls[1][4]).toBe('homeassistant');

        // 3
        payload = {
            'unit_of_measurement': 'hPa',
            'device_class': 'pressure',
            'value_template': '{{ (value_json.pressure | float) | round(2) }}',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'state_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_pressure',
            'unique_id': '0x12345678_pressure_zigbee2mqtt',
            'device': {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[2][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[2][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[2][3]).toBeNull();
        expect(mqtt.publish.mock.calls[2][4]).toBe('homeassistant');

        // 4
        payload = {
            'unit_of_measurement': '%',
            'device_class': 'battery',
            'value_template': '{{ value_json.battery }}',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'state_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_battery',
            'unique_id': '0x12345678_battery_zigbee2mqtt',
            'device': {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[3][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[3][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[3][3]).toBeNull();
        expect(mqtt.publish.mock.calls[3][4]).toBe('homeassistant');

        // 5
        payload = {
            'unit_of_measurement': '-',
            'value_template': '{{ value_json.linkquality }}',
            'state_topic': 'zigbee2mqtt/my_device',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_linkquality',
            'unique_id': '0x12345678_linkquality_zigbee2mqtt',
            'device': {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[4][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[4][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[4][3]).toBeNull();
        expect(mqtt.publish.mock.calls[4][4]).toBe('homeassistant');
    });

    it('Should discover devices with overriden user configuration', () => {
        let payload = null;
        jest.spyOn(settings, 'getDevice').mockReturnValue({
            friendly_name: 'my_device',
            homeassistant: {
                expire_after: 30,
                icon: 'mdi:test',
                temperature: {
                    expire_after: 90,
                },
            },
        });

        homeassistant.discover('0x12345678', WSDCGQ11LM, false);
        expect(mqtt.publish).toHaveBeenCalledTimes(5);

        // 1
        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'value_template': '{{ value_json.temperature }}',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'state_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_temperature',
            'unique_id': '0x12345678_temperature_zigbee2mqtt',
            'expire_after': 90,
            'icon': 'mdi:test',
            'device': {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[0][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[0][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[0][3]).toBeNull();
        expect(mqtt.publish.mock.calls[0][4]).toBe('homeassistant');

        // 2
        payload = {
            'unit_of_measurement': '%',
            'device_class': 'humidity',
            'value_template': '{{ value_json.humidity }}',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'state_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_humidity',
            'unique_id': '0x12345678_humidity_zigbee2mqtt',
            'expire_after': 30,
            'icon': 'mdi:test',
            'device': {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[1][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[1][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[1][3]).toBeNull();
        expect(mqtt.publish.mock.calls[1][4]).toBe('homeassistant');

        // 3
        payload = {
            'unit_of_measurement': 'hPa',
            'device_class': 'pressure',
            'value_template': '{{ value_json.pressure }}',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'state_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_pressure',
            'unique_id': '0x12345678_pressure_zigbee2mqtt',
            'expire_after': 30,
            'icon': 'mdi:test',
            'device': {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[2][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[2][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[2][3]).toBeNull();
        expect(mqtt.publish.mock.calls[2][4]).toBe('homeassistant');

        // 4
        payload = {
            'unit_of_measurement': '%',
            'device_class': 'battery',
            'value_template': '{{ value_json.battery }}',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'state_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_battery',
            'unique_id': '0x12345678_battery_zigbee2mqtt',
            'expire_after': 30,
            'icon': 'mdi:test',
            'device': {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[3][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[3][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[3][3]).toBeNull();
        expect(mqtt.publish.mock.calls[3][4]).toBe('homeassistant');

        // 5
        payload = {
            'unit_of_measurement': '-',
            'value_template': '{{ value_json.linkquality }}',
            'state_topic': 'zigbee2mqtt/my_device',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_linkquality',
            'unique_id': '0x12345678_linkquality_zigbee2mqtt',
            'expire_after': 30,
            'icon': 'mdi:test',
            'device': {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[4][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[4][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[4][3]).toBeNull();
        expect(mqtt.publish.mock.calls[4][4]).toBe('homeassistant');
    });

    it('Should discover devices with cover_position', () => {
        let payload = null;
        jest.spyOn(settings, 'getDevice').mockReturnValue({friendly_name: 'my_device'});

        homeassistant.discover('0x12345678', SV01, false);
        expect(mqtt.publish).toHaveBeenCalledTimes(5);

        // 1
        payload = {
            name: 'my_device_cover',
            command_topic: 'zigbee2mqtt/my_device/set',
            position_topic: 'zigbee2mqtt/my_device',
            set_position_topic: 'zigbee2mqtt/my_device/set',
            set_position_template: '{ "position": {{ position }} }',
            value_template: '{{ value_json.position }}',
            unique_id: '0x12345678_cover_zigbee2mqtt',
            device: {
                'identifiers': 'zigbee2mqtt_0x12345678',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Smart vent (SV01)',
                'manufacturer': 'Keen Home',
            },
            availability_topic: 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[0][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[0][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[0][3]).toBeNull();
        expect(mqtt.publish.mock.calls[0][4]).toBe('homeassistant');
    });

    it('Should discover devices with overriden user configuration in device', () => {
        let payload = null;
        jest.spyOn(settings, 'getDevice').mockReturnValue({
            friendly_name: 'my_device',
            homeassistant: {
                device: {
                    identifiers: 'test123',
                },
                temperature: {
                    expire_after: 90,
                },
            },
        });

        homeassistant.discover('0x12345678', WSDCGQ11LM, false);
        expect(mqtt.publish).toHaveBeenCalledTimes(5);

        // 1
        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'value_template': '{{ value_json.temperature }}',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'state_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_temperature',
            'unique_id': '0x12345678_temperature_zigbee2mqtt',
            'expire_after': 90,
            'device': {
                'identifiers': 'test123',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[0][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[0][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[0][3]).toBeNull();
        expect(mqtt.publish.mock.calls[0][4]).toBe('homeassistant');
    });

    it('Should discover devices with overriden user configuration in device in temperature', () => {
        let payload = null;
        jest.spyOn(settings, 'getDevice').mockReturnValue({
            friendly_name: 'my_device',
            homeassistant: {
                temperature: {
                    expire_after: 90,
                    device: {
                        identifiers: 'test',
                    },
                },
            },
        });

        homeassistant.discover('0x12345678', WSDCGQ11LM, false);
        expect(mqtt.publish).toHaveBeenCalledTimes(5);

        // 1
        payload = {
            'unit_of_measurement': '°C',
            'device_class': 'temperature',
            'value_template': '{{ value_json.temperature }}',
            'json_attributes_topic': 'zigbee2mqtt/my_device',
            'state_topic': 'zigbee2mqtt/my_device',
            'name': 'my_device_temperature',
            'unique_id': '0x12345678_temperature_zigbee2mqtt',
            'expire_after': 90,
            'device': {
                'identifiers': 'test',
                'name': 'my_device',
                'sw_version': 'Zigbee2mqtt test',
                'model': 'Aqara temperature, humidity and pressure sensor (WSDCGQ11LM)',
                'manufacturer': 'Xiaomi',
            },
            'availability_topic': 'zigbee2mqtt/bridge/state',
        };

        expect(JSON.parse(mqtt.publish.mock.calls[0][1])).toStrictEqual(payload);
        expect(mqtt.publish.mock.calls[0][2]).toStrictEqual({retain: true, qos: 0});
        expect(mqtt.publish.mock.calls[0][3]).toBeNull();
        expect(mqtt.publish.mock.calls[0][4]).toBe('homeassistant');
    });

    it('Should discover devices with a custom discovery topic', () => {
        jest.spyOn(settings, 'get').mockReturnValue({
            mqtt: {
                base_topic: 'zigbee2mqtt',
            },
            experimental: {
                output: 'json',
            },
            advanced: {
                homeassistant_discovery_topic: 'my_custom_topic',
            },
        });

        homeassistant = new HomeassistantExtension(null, mqtt, null, null);

        jest.spyOn(settings, 'getDevice').mockReturnValue({
            friendly_name: 'my_device',
            homeassistant: {
                temperature: {
                    expire_after: 90,
                    device: {
                        identifiers: 'test',
                    },
                },
            },
        });

        homeassistant.discover('0x12345678', WSDCGQ11LM, false);

        expect(mqtt.publish).toHaveBeenCalledTimes(5);
        expect(mqtt.publish.mock.calls[0][4]).toBe('my_custom_topic');
    });
});
