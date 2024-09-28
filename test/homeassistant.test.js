const data = require('./stub/data');
const settings = require('../lib/util/settings');
const stringify = require('json-stable-stringify-without-jsonify');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const flushPromises = require('./lib/flushPromises');
const MQTT = require('./stub/mqtt');
const sleep = require('./stub/sleep');
const Controller = require('../lib/controller');

describe('HomeAssistant extension', () => {
    let version;
    let z2m_version;
    let controller;
    let extension;
    let origin;

    let resetExtension = async (runTimers = true) => {
        await controller.enableDisableExtension(false, 'HomeAssistant');
        MQTT.publish.mockClear();
        await controller.enableDisableExtension(true, 'HomeAssistant');
        extension = controller.extensions.find((e) => e.constructor.name === 'HomeAssistant');
        if (runTimers) {
            await jest.runOnlyPendingTimersAsync();
        }
    };

    let resetDiscoveryPayloads = (id) => {
        // Change discovered payload, otherwise it's not re-published because it's the same.
        Object.values(extension.discovered[id].messages).forEach((m) => (m.payload = 'changed'));
    };

    let clearDiscoveredTrigger = (id) => {
        extension.discovered[id].triggers = new Set();
    };

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings.reRead();
        settings.set(['homeassistant'], true);
        data.writeEmptyState();
        controller.state.load();
        await resetExtension();
        await flushPromises();
    });

    beforeAll(async () => {
        z2m_version = (await require('../lib/util/utils').default.getZigbee2MQTTVersion()).version;
        origin = {name: 'Zigbee2MQTT', sw: z2m_version, url: 'https://www.zigbee2mqtt.io'};
        version = `Zigbee2MQTT ${z2m_version}`;
        jest.useFakeTimers();
        settings.set(['homeassistant'], true);
        data.writeDefaultConfiguration();
        settings.reRead();
        data.writeEmptyState();
        MQTT.publish.mockClear();
        sleep.mock();
        controller = new Controller(false);
        await controller.start();
    });

    afterAll(async () => {
        jest.useRealTimers();
        sleep.restore();
    });

    it('Should not have duplicate type/object_ids in a mapping', () => {
        const duplicated = [];
        require('zigbee-herdsman-converters').definitions.forEach((d) => {
            const exposes = typeof d.exposes == 'function' ? d.exposes() : d.exposes;
            const device = {definition: d, isDevice: () => true, isGroup: () => false, options: {}, exposes: () => exposes, zh: {endpoints: []}};
            const configs = extension.getConfigs(device);
            const cfg_type_object_ids = [];

            configs.forEach((c) => {
                const id = c['type'] + '/' + c['object_id'];
                if (cfg_type_object_ids.includes(id)) {
                    // A dynamic function must exposes all possible attributes for the docs
                    if (typeof d.exposes != 'function') {
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

        payload = {
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            brightness: true,
            brightness_scale: 254,
            command_topic: 'zigbee2mqtt/ha_discovery_group/set',
            device: {
                identifiers: ['zigbee2mqtt_1221051039810110150109113116116_9'],
                name: 'ha_discovery_group',
                sw_version: version,
                model: 'Group',
                manufacturer: 'Zigbee2MQTT',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            max_mireds: 454,
            min_mireds: 250,
            json_attributes_topic: 'zigbee2mqtt/ha_discovery_group',
            name: null,
            schema: 'json',
            state_topic: 'zigbee2mqtt/ha_discovery_group',
            supported_color_modes: ['xy', 'color_temp'],
            effect: true,
            effect_list: [
                'blink',
                'breathe',
                'okay',
                'channel_change',
                'candle',
                'fireplace',
                'colorloop',
                'finish_effect',
                'stop_effect',
                'stop_hue_effect',
            ],
            object_id: 'ha_discovery_group',
            unique_id: '9_light_zigbee2mqtt',
            origin: origin,
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/1221051039810110150109113116116_9/light/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            command_topic: 'zigbee2mqtt/ha_discovery_group/set',
            device: {
                identifiers: ['zigbee2mqtt_1221051039810110150109113116116_9'],
                name: 'ha_discovery_group',
                sw_version: version,
                model: 'Group',
                manufacturer: 'Zigbee2MQTT',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            json_attributes_topic: 'zigbee2mqtt/ha_discovery_group',
            name: null,
            payload_off: 'OFF',
            payload_on: 'ON',
            state_topic: 'zigbee2mqtt/ha_discovery_group',
            object_id: 'ha_discovery_group',
            unique_id: '9_switch_zigbee2mqtt',
            origin: origin,
            value_template: '{{ value_json.state }}',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/switch/1221051039810110150109113116116_9/switch/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            state_class: 'measurement',
            value_template: '{{ value_json.temperature }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            object_id: 'weather_sensor_temperature',
            unique_id: '0x0017880104e45522_temperature_zigbee2mqtt',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            enabled_by_default: true,
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            unit_of_measurement: '%',
            device_class: 'humidity',
            state_class: 'measurement',
            value_template: '{{ value_json.humidity }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            object_id: 'weather_sensor_humidity',
            unique_id: '0x0017880104e45522_humidity_zigbee2mqtt',
            origin: origin,
            enabled_by_default: true,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/humidity/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            unit_of_measurement: 'hPa',
            device_class: 'atmospheric_pressure',
            state_class: 'measurement',
            value_template: '{{ value_json.pressure }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            object_id: 'weather_sensor_pressure',
            unique_id: '0x0017880104e45522_pressure_zigbee2mqtt',
            origin: origin,
            enabled_by_default: true,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/pressure/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            unit_of_measurement: '%',
            device_class: 'battery',
            state_class: 'measurement',
            value_template: '{{ value_json.battery }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            object_id: 'weather_sensor_battery',
            unique_id: '0x0017880104e45522_battery_zigbee2mqtt',
            origin: origin,
            enabled_by_default: true,
            entity_category: 'diagnostic',
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/battery/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            icon: 'mdi:signal',
            enabled_by_default: false,
            entity_category: 'diagnostic',
            unit_of_measurement: 'lqi',
            state_class: 'measurement',
            value_template: '{{ value_json.linkquality }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            name: 'Linkquality',
            object_id: 'weather_sensor_linkquality',
            unique_id: '0x0017880104e45522_linkquality_zigbee2mqtt',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/linkquality/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            command_topic: 'zigbee2mqtt/wall_switch_double/left/set',
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45542'],
                manufacturer: 'Aqara',
                model: 'Smart wall switch (no neutral, double rocker) (QBKG03LM)',
                name: 'wall_switch_double',
                sw_version: null,
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            json_attributes_topic: 'zigbee2mqtt/wall_switch_double',
            name: 'Left',
            payload_off: 'OFF',
            payload_on: 'ON',
            state_topic: 'zigbee2mqtt/wall_switch_double',
            object_id: 'wall_switch_double_left',
            unique_id: '0x0017880104e45542_switch_left_zigbee2mqtt',
            origin: origin,
            value_template: '{{ value_json.state_left }}',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/switch/0x0017880104e45542/switch_left/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            command_topic: 'zigbee2mqtt/wall_switch_double/right/set',
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45542'],
                manufacturer: 'Aqara',
                model: 'Smart wall switch (no neutral, double rocker) (QBKG03LM)',
                name: 'wall_switch_double',
                sw_version: null,
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            json_attributes_topic: 'zigbee2mqtt/wall_switch_double',
            name: 'Right',
            payload_off: 'OFF',
            payload_on: 'ON',
            state_topic: 'zigbee2mqtt/wall_switch_double',
            object_id: 'wall_switch_double_right',
            unique_id: '0x0017880104e45542_switch_right_zigbee2mqtt',
            origin: origin,
            value_template: '{{ value_json.state_right }}',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/switch/0x0017880104e45542/switch_right/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            brightness: true,
            brightness_scale: 254,
            supported_color_modes: ['color_temp'],
            min_mireds: 250,
            max_mireds: 454,
            command_topic: 'zigbee2mqtt/bulb/set',
            device: {
                identifiers: ['zigbee2mqtt_0x000b57fffec6a5b2'],
                manufacturer: 'IKEA',
                model: 'TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm (LED1545G12)',
                name: 'bulb',
                sw_version: null,
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            effect: true,
            effect_list: ['blink', 'breathe', 'okay', 'channel_change', 'finish_effect', 'stop_effect'],
            json_attributes_topic: 'zigbee2mqtt/bulb',
            name: null,
            schema: 'json',
            state_topic: 'zigbee2mqtt/bulb',
            object_id: 'bulb',
            unique_id: '0x000b57fffec6a5b2_light_zigbee2mqtt',
            origin: origin,
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/0x000b57fffec6a5b2/light/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should not discovery devices which are already discovered', async () => {
        await resetExtension(false);
        const topic1 = 'homeassistant/sensor/0x0017880104e45522/humidity/config';
        const payload1 = stringify({
            unit_of_measurement: '%',
            device_class: 'humidity',
            state_class: 'measurement',
            value_template: '{{ value_json.humidity }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            object_id: 'weather_sensor_humidity',
            unique_id: '0x0017880104e45522_humidity_zigbee2mqtt',
            origin: origin,
            enabled_by_default: true,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        });
        const topic2 = 'homeassistant/device_automation/0x0017880104e45522/action_double/config';
        const payload2 = stringify({
            automation_type: 'trigger',
            type: 'action',
            subtype: 'double',
            payload: 'double',
            topic: 'zigbee2mqtt/weather_sensor_renamed/action',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor_renamed',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
        });

        // Should subscribe to `homeassistant/#` to find out what devices are already discovered.
        expect(MQTT.subscribe).toHaveBeenCalledWith(`homeassistant/#`);

        // Retained Home Assistant discovery message arrives
        await MQTT.events.message(topic1, payload1);
        await MQTT.events.message(topic2, payload2);

        await jest.runOnlyPendingTimersAsync();

        // Should unsubscribe to not receive all messages that are going to be published to `homeassistant/#` again.
        expect(MQTT.unsubscribe).toHaveBeenCalledWith(`homeassistant/#`);

        expect(MQTT.publish).not.toHaveBeenCalledWith(topic1, expect.anything(), expect.any(Object), expect.any(Function));
        // Device automation should not be cleared
        expect(MQTT.publish).not.toHaveBeenCalledWith(topic2, '', expect.any(Object), expect.any(Function));
        expect(logger.debug).toHaveBeenCalledWith(`Skipping discovery of 'sensor/0x0017880104e45522/humidity/config', already discovered`);
    });

    it('Should discover devices with precision', async () => {
        settings.set(['devices', '0x0017880104e45522'], {
            humidity_precision: 0,
            temperature_precision: 1,
            pressure_precision: 2,
            friendly_name: 'weather_sensor',
            retain: false,
        });

        await resetExtension();

        let payload;
        await flushPromises();

        payload = {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            state_class: 'measurement',
            enabled_by_default: true,
            value_template: '{{ value_json.temperature }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            object_id: 'weather_sensor_temperature',
            unique_id: '0x0017880104e45522_temperature_zigbee2mqtt',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            unit_of_measurement: '%',
            device_class: 'humidity',
            state_class: 'measurement',
            value_template: '{{ value_json.humidity }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            object_id: 'weather_sensor_humidity',
            unique_id: '0x0017880104e45522_humidity_zigbee2mqtt',
            origin: origin,
            enabled_by_default: true,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/humidity/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            unit_of_measurement: 'hPa',
            device_class: 'atmospheric_pressure',
            state_class: 'measurement',
            value_template: '{{ value_json.pressure }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            enabled_by_default: true,
            object_id: 'weather_sensor_pressure',
            unique_id: '0x0017880104e45522_pressure_zigbee2mqtt',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/pressure/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should discover devices with overridden user configuration', async () => {
        settings.set(['devices', '0x0017880104e45522'], {
            homeassistant: {
                expire_after: 30,
                icon: 'mdi:test',
                temperature: {
                    expire_after: 90,
                    device: {
                        manufacturer: 'From Aqara',
                        sw_version: 'test',
                    },
                },
                humidity: {
                    unique_id: null,
                },
                device: {
                    manufacturer: 'Not from Aqara',
                    model: 'custom model',
                },
            },
            friendly_name: 'weather_sensor',
            retain: false,
        });

        await resetExtension();

        let payload;
        await flushPromises();

        payload = {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            state_class: 'measurement',
            value_template: '{{ value_json.temperature }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            enabled_by_default: true,
            object_id: 'weather_sensor_temperature',
            unique_id: '0x0017880104e45522_temperature_zigbee2mqtt',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: 'test',
                model: 'custom model',
                manufacturer: 'From Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            expire_after: 90,
            icon: 'mdi:test',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            unit_of_measurement: '%',
            device_class: 'humidity',
            state_class: 'measurement',
            value_template: '{{ value_json.humidity }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            enabled_by_default: true,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: null,
                model: 'custom model',
                manufacturer: 'Not from Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            origin: origin,
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            expire_after: 30,
            icon: 'mdi:test',
            object_id: 'weather_sensor_humidity',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/humidity/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should discover devices with overridden name', async () => {
        settings.set(['devices', '0x0017880104e45522'], {
            homeassistant: {
                name: 'Weather Sensor',
            },
            friendly_name: 'weather_sensor',
            retain: false,
        });

        await resetExtension();

        let payload;
        await flushPromises();

        payload = {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            state_class: 'measurement',
            value_template: '{{ value_json.temperature }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            object_id: 'weather_sensor_temperature',
            unique_id: '0x0017880104e45522_temperature_zigbee2mqtt',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'Weather Sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            enabled_by_default: true,
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            unit_of_measurement: '%',
            device_class: 'humidity',
            state_class: 'measurement',
            value_template: '{{ value_json.humidity }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            object_id: 'weather_sensor_humidity',
            unique_id: '0x0017880104e45522_humidity_zigbee2mqtt',
            origin: origin,
            enabled_by_default: true,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'Weather Sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/humidity/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should discover devices with overridden user configuration affecting type and object_id', async () => {
        settings.set(['devices', '0x0017880104e45541'], {
            friendly_name: 'my_switch',
            homeassistant: {
                switch: {
                    type: 'light',
                    object_id: 'light',
                },
                light: {
                    type: 'this should be ignored',
                    name: 'my_light_name_override',
                },
            },
        });

        await resetExtension();

        let payload;
        await flushPromises();

        payload = {
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            command_topic: 'zigbee2mqtt/my_switch/set',
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45541'],
                manufacturer: 'Aqara',
                model: 'Smart wall switch (no neutral, single rocker) (QBKG04LM)',
                name: 'my_switch',
                sw_version: null,
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            json_attributes_topic: 'zigbee2mqtt/my_switch',
            name: 'my_light_name_override',
            payload_off: 'OFF',
            payload_on: 'ON',
            state_topic: 'zigbee2mqtt/my_switch',
            object_id: 'my_switch',
            unique_id: '0x0017880104e45541_light_zigbee2mqtt',
            origin: origin,
            value_template: '{{ value_json.state }}',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/0x0017880104e45541/light/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Shouldnt discover devices when homeassistant null is set in device options', async () => {
        settings.set(['devices', '0x0017880104e45522'], {
            homeassistant: null,
            friendly_name: 'weather_sensor',
            retain: false,
        });

        await resetExtension();
        await flushPromises();

        const topics = MQTT.publish.mock.calls.map((c) => c[0]);
        expect(topics).not.toContain('homeassistant/sensor/0x0017880104e45522/humidity/config');
        expect(topics).not.toContain('homeassistant/sensor/0x0017880104e45522/temperature/config');
    });

    it('Shouldnt discover sensor when set to null', async () => {
        logger.error.mockClear();
        settings.set(['devices', '0x0017880104e45522'], {
            homeassistant: {humidity: null},
            friendly_name: 'weather_sensor',
            retain: false,
        });

        await resetExtension();

        const topics = MQTT.publish.mock.calls.map((c) => c[0]);
        expect(topics).not.toContain('homeassistant/sensor/0x0017880104e45522/humidity/config');
        expect(topics).toContain('homeassistant/sensor/0x0017880104e45522/temperature/config');
    });

    it('Should discover devices with fan', async () => {
        let payload;

        payload = {
            state_topic: 'zigbee2mqtt/fan',
            state_value_template: '{{ value_json.fan_state }}',
            command_topic: 'zigbee2mqtt/fan/set/fan_state',
            percentage_state_topic: 'zigbee2mqtt/fan',
            percentage_command_topic: 'zigbee2mqtt/fan/set/fan_mode',
            percentage_value_template: "{{ {'off':0, 'low':1, 'medium':2, 'high':3, 'on':4}[value_json.fan_mode] | default('None') }}",
            percentage_command_template: "{{ {0:'off', 1:'low', 2:'medium', 3:'high', 4:'on'}[value] | default('') }}",
            preset_mode_state_topic: 'zigbee2mqtt/fan',
            preset_mode_command_topic: 'zigbee2mqtt/fan/set/fan_mode',
            preset_mode_value_template: "{{ value_json.fan_mode if value_json.fan_mode in ['smart'] else 'None' | default('None') }}",
            preset_modes: ['smart'],
            speed_range_min: 1,
            speed_range_max: 4,
            json_attributes_topic: 'zigbee2mqtt/fan',
            name: null,
            object_id: 'fan',
            unique_id: '0x0017880104e45548_fan_zigbee2mqtt',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45548'],
                name: 'fan',
                sw_version: null,
                model: 'Universal wink enabled white ceiling fan premier remote control (99432)',
                manufacturer: 'Hampton Bay',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/fan/0x0017880104e45548/fan/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should discover thermostat devices', async () => {
        const payload = {
            action_template:
                "{% set values = {None:None,'idle':'idle','heat':'heating','cool':'cooling','fan_only':'fan'} %}{{ values[value_json.running_state] }}",
            action_topic: 'zigbee2mqtt/TS0601_thermostat',
            availability: [
                {
                    topic: 'zigbee2mqtt/bridge/state',
                },
            ],
            current_temperature_template: '{{ value_json.local_temperature }}',
            current_temperature_topic: 'zigbee2mqtt/TS0601_thermostat',
            device: {
                identifiers: ['zigbee2mqtt_0x0017882104a44559'],
                manufacturer: 'Tuya',
                model: 'Radiator valve with thermostat (TS0601_thermostat)',
                name: 'TS0601_thermostat',
                sw_version: null,
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            preset_mode_command_topic: 'zigbee2mqtt/TS0601_thermostat/set/preset',
            preset_modes: ['schedule', 'manual', 'boost', 'complex', 'comfort', 'eco', 'away'],
            preset_mode_value_template: '{{ value_json.preset }}',
            preset_mode_state_topic: 'zigbee2mqtt/TS0601_thermostat',
            json_attributes_topic: 'zigbee2mqtt/TS0601_thermostat',
            max_temp: '35',
            min_temp: '5',
            mode_command_topic: 'zigbee2mqtt/TS0601_thermostat/set/system_mode',
            mode_state_template: '{{ value_json.system_mode }}',
            mode_state_topic: 'zigbee2mqtt/TS0601_thermostat',
            modes: ['heat', 'auto', 'off'],
            name: null,
            temp_step: 0.5,
            temperature_command_topic: 'zigbee2mqtt/TS0601_thermostat/set/current_heating_setpoint',
            temperature_state_template: '{{ value_json.current_heating_setpoint }}',
            temperature_state_topic: 'zigbee2mqtt/TS0601_thermostat',
            temperature_unit: 'C',
            object_id: 'ts0601_thermostat',
            unique_id: '0x0017882104a44559_climate_zigbee2mqtt',
            origin: origin,
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/climate/0x0017882104a44559/climate/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should discover Bosch BTH-RA with a compatibility mapping', async () => {
        const payload = {
            action_template:
                "{% set values = {None:None,'idle':'idle','heat':'heating','cool':'cooling','fan_only':'fan'} %}{{ values[value_json.running_state] }}",
            action_topic: 'zigbee2mqtt/bosch_radiator',
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            current_temperature_template: '{{ value_json.local_temperature }}',
            current_temperature_topic: 'zigbee2mqtt/bosch_radiator',
            device: {
                identifiers: ['zigbee2mqtt_0x18fc2600000d7ae2'],
                manufacturer: 'Bosch',
                model: 'Radiator thermostat II (BTH-RA)',
                name: 'bosch_radiator',
                sw_version: '3.05.09',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            json_attributes_topic: 'zigbee2mqtt/bosch_radiator',
            max_temp: '30',
            min_temp: '5',
            mode_command_template: `{% set values = { 'auto':'schedule','heat':'manual','off':'pause'} %}{"operating_mode": "{{ values[value] if value in values.keys() else 'pause' }}"}`,
            mode_command_topic: 'zigbee2mqtt/bosch_radiator/set',
            mode_state_template:
                "{% set values = {'schedule':'auto','manual':'heat','pause':'off'} %}{% set value = value_json.operating_mode %}{{ values[value] if value in values.keys() else 'off' }}",
            mode_state_topic: 'zigbee2mqtt/bosch_radiator',
            modes: ['off', 'heat', 'auto'],
            name: null,
            object_id: 'bosch_radiator',
            origin: origin,
            temp_step: 0.5,
            temperature_command_topic: 'zigbee2mqtt/bosch_radiator/set/occupied_heating_setpoint',
            temperature_state_template: '{{ value_json.occupied_heating_setpoint }}',
            temperature_state_topic: 'zigbee2mqtt/bosch_radiator',
            temperature_unit: 'C',
            unique_id: '0x18fc2600000d7ae2_climate_zigbee2mqtt',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/climate/0x18fc2600000d7ae2/climate/config',
            stringify(payload),
            {qos: 1, retain: true},
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
            state_topic: 'zigbee2mqtt/smart vent',
            value_template: `{{ value_json.state }}`,
            state_open: 'OPEN',
            state_closed: 'CLOSE',
            state_stopped: 'STOP',
            json_attributes_topic: 'zigbee2mqtt/smart vent',
            name: null,
            object_id: 'smart_vent',
            unique_id: '0x0017880104e45551_cover_zigbee2mqtt',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45551'],
                name: 'smart vent',
                sw_version: null,
                model: 'Smart vent (SV01)',
                manufacturer: 'Keen Home',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/cover/0x0017880104e45551/cover/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            command_topic: 'zigbee2mqtt/zigfred_plus/l6/set',
            device: {
                identifiers: ['zigbee2mqtt_0xf4ce368a38be56a1'],
                manufacturer: 'Siglis',
                model: 'zigfred plus smart in-wall switch (ZFP-1A-CH)',
                name: 'zigfred_plus',
                sw_version: null,
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            json_attributes_topic: 'zigbee2mqtt/zigfred_plus/l6',
            name: 'L6',
            position_template: '{{ value_json.position }}',
            position_topic: 'zigbee2mqtt/zigfred_plus/l6',
            set_position_template: '{ "position_l6": {{ position }} }',
            set_position_topic: 'zigbee2mqtt/zigfred_plus/l6/set',
            state_stopped: 'STOP',
            state_closed: 'CLOSE',
            state_open: 'OPEN',
            state_topic: 'zigbee2mqtt/zigfred_plus/l6',
            tilt_command_topic: 'zigbee2mqtt/zigfred_plus/l6/set/tilt',
            tilt_status_template: '{{ value_json.tilt }}',
            tilt_status_topic: 'zigbee2mqtt/zigfred_plus/l6',
            object_id: 'zigfred_plus_l6',
            unique_id: '0xf4ce368a38be56a1_cover_l6_zigbee2mqtt',
            origin: origin,
            value_template: '{{ value_json.state }}',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/cover/0xf4ce368a38be56a1/cover_l6/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should discover devices with custom homeassistant_discovery_topic', async () => {
        settings.set(['advanced', 'homeassistant_discovery_topic'], 'my_custom_discovery_topic');
        await resetExtension();

        let payload;

        payload = {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            state_class: 'measurement',
            value_template: '{{ value_json.temperature }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            enabled_by_default: true,
            object_id: 'weather_sensor_temperature',
            unique_id: '0x0017880104e45522_temperature_zigbee2mqtt',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'my_custom_discovery_topic/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should throw error when starting with attributes output', async () => {
        settings.set(['experimental', 'output'], 'attribute');
        settings.set(['homeassistant'], true);
        expect(() => {
            new Controller(false);
        }).toThrow('Home Assistant integration is not possible with attribute output!');
    });

    it('Should throw error when homeassistant.discovery_topic equals the mqtt.base_topic', async () => {
        settings.set(['mqtt', 'base_topic'], 'homeassistant');
        expect(() => {
            new Controller(false);
        }).toThrow("'homeassistant.discovery_topic' cannot not be equal to the 'mqtt.base_topic' (got 'homeassistant')");
    });

    it('Should warn when starting with cache_state false', async () => {
        settings.set(['advanced', 'cache_state'], false);
        logger.warning.mockClear();
        await resetExtension();
        expect(logger.warning).toHaveBeenCalledWith('In order for Home Assistant integration to work properly set `cache_state: true');
    });

    it('Should set missing values to null', async () => {
        // https://github.com/Koenkk/zigbee2mqtt/issues/6987
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        const data = {measuredValue: -85};
        const payload = {
            data,
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/weather_sensor',
            stringify({battery: null, humidity: null, linkquality: null, pressure: null, temperature: -0.85, voltage: null}),
            {retain: false, qos: 1},
            expect.any(Function),
        );
    });

    it('Should copy hue/saturtion to h/s if present', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const data = {currentHue: 0, currentSaturation: 254};
        const payload = {data, cluster: 'lightingColorCtrl', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({
                color: {hue: 0, saturation: 100, h: 0, s: 100},
                color_mode: 'hs',
                linkquality: null,
                state: null,
                update_available: null,
                power_on_behavior: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: false, qos: 0},
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
            stringify({
                color: {x: 0.4576, y: 0.41},
                color_mode: 'xy',
                linkquality: null,
                state: null,
                update_available: null,
                power_on_behavior: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should not copy hue/saturtion if color is missing', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({
                linkquality: null,
                state: 'ON',
                update_available: null,
                power_on_behavior: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Shouldt discover when already discovered', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        const data = {measuredValue: -85};
        const payload = {
            data,
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        // 1 publish is the publish from receive
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
    });

    it('Should discover when not discovered yet', async () => {
        extension.discovered = {};
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        const data = {measuredValue: -85};
        const payload = {
            data,
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        const payloadHA = {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            enabled_by_default: true,
            state_class: 'measurement',
            value_template: '{{ value_json.temperature }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            object_id: 'weather_sensor_temperature',
            unique_id: '0x0017880104e45522_temperature_zigbee2mqtt',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payloadHA),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Shouldnt discover when device leaves', async () => {
        extension.discovered = {};
        const device = zigbeeHerdsman.devices.bulb;
        const payload = {ieeeAddr: device.ieeeAddr};
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceLeave(payload);
        await flushPromises();
    });

    it('Should discover when options change', async () => {
        const device = controller.zigbee.resolveEntity(zigbeeHerdsman.devices.bulb);
        resetDiscoveryPayloads(device.ieeeAddr);
        MQTT.publish.mockClear();
        controller.eventBus.emitEntityOptionsChanged({entity: device, from: {}, to: {test: 123}});
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
        await jest.runOnlyPendingTimersAsync();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({
                state: 'ON',
                color_options: null,
                brightness: 50,
                color_temp: 370,
                linkquality: 99,
                power_on_behavior: null,
                update_available: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: true, qos: 0},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/remote',
            stringify({
                action: null,
                action_duration: null,
                battery: null,
                brightness: 255,
                linkquality: null,
                update_available: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: true, qos: 0},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/group_1', stringify({state: 'ON'}), {retain: false, qos: 0}, expect.any(Function));
    });

    it('Should send all status when home assistant comes online', async () => {
        data.writeDefaultState();
        extension.state.load();
        await resetExtension();
        expect(MQTT.subscribe).toHaveBeenCalledWith('hass/status');
        MQTT.publish.mockClear();
        await MQTT.events.message('hass/status', 'online');
        await flushPromises();
        await jest.runOnlyPendingTimersAsync();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({
                state: 'ON',
                color_options: null,
                brightness: 50,
                color_temp: 370,
                linkquality: 99,
                power_on_behavior: null,
                update_available: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: true, qos: 0},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/remote',
            stringify({
                action: null,
                action_duration: null,
                battery: null,
                brightness: 255,
                linkquality: null,
                update_available: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: true, qos: 0},
            expect.any(Function),
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
        await jest.runOnlyPendingTimersAsync();
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
        await jest.runOnlyPendingTimersAsync();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Should discover devices with availability', async () => {
        settings.set(['availability'], true);
        await resetExtension();

        let payload;

        payload = {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            enabled_by_default: true,
            state_class: 'measurement',
            value_template: '{{ value_json.temperature }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            object_id: 'weather_sensor_temperature',
            unique_id: '0x0017880104e45522_temperature_zigbee2mqtt',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability_mode: 'all',
            availability: [{topic: 'zigbee2mqtt/bridge/state'}, {topic: 'zigbee2mqtt/weather_sensor/availability'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should clear discovery when device is removed', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/remove', 'weather_sensor');
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            '',
            {retain: true, qos: 1},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/humidity/config',
            '',
            {retain: true, qos: 1},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/pressure/config',
            '',
            {retain: true, qos: 1},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/battery/config',
            '',
            {retain: true, qos: 1},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/linkquality/config',
            '',
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should clear discovery when group is removed', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/remove', stringify({id: 'ha_discovery_group'}));
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/1221051039810110150109113116116_9/light/config',
            '',
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should refresh discovery when device is renamed', async () => {
        await MQTT.events.message(
            'homeassistant/device_automation/0x0017880104e45522/action_double/config',
            stringify({topic: 'zigbee2mqtt/weather_sensor/action'}),
        );
        await flushPromises();
        MQTT.publish.mockClear();
        MQTT.events.message(
            'zigbee2mqtt/bridge/request/device/rename',
            stringify({from: 'weather_sensor', to: 'weather_sensor_renamed', homeassistant_rename: true}),
        );
        await flushPromises();
        await jest.runOnlyPendingTimersAsync();
        await flushPromises();

        const payload = {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            state_class: 'measurement',
            enabled_by_default: true,
            value_template: '{{ value_json.temperature }}',
            state_topic: 'zigbee2mqtt/weather_sensor_renamed',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor_renamed',
            object_id: 'weather_sensor_renamed_temperature',
            origin: origin,
            unique_id: '0x0017880104e45522_temperature_zigbee2mqtt',
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor_renamed',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            '',
            {retain: true, qos: 1},
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45522/action_double/config',
            stringify({
                automation_type: 'trigger',
                type: 'action',
                subtype: 'double',
                payload: 'double',
                topic: 'zigbee2mqtt/weather_sensor_renamed/action',
                origin: origin,
                device: {
                    identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                    name: 'weather_sensor_renamed',
                    sw_version: null,
                    model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                    manufacturer: 'Aqara',
                    via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
                },
            }),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should refresh discovery when group is renamed', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message(
            'zigbee2mqtt/bridge/request/group/rename',
            stringify({from: 'ha_discovery_group', to: 'ha_discovery_group_new', homeassistant_rename: true}),
        );
        await flushPromises();
        await jest.runOnlyPendingTimersAsync();
        await flushPromises();

        const payload = {
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            brightness: true,
            brightness_scale: 254,
            command_topic: 'zigbee2mqtt/ha_discovery_group_new/set',
            device: {
                identifiers: ['zigbee2mqtt_1221051039810110150109113116116_9'],
                name: 'ha_discovery_group_new',
                sw_version: version,
                model: 'Group',
                manufacturer: 'Zigbee2MQTT',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            json_attributes_topic: 'zigbee2mqtt/ha_discovery_group_new',
            max_mireds: 454,
            min_mireds: 250,
            name: null,
            schema: 'json',
            state_topic: 'zigbee2mqtt/ha_discovery_group_new',
            supported_color_modes: ['xy', 'color_temp'],
            effect: true,
            effect_list: [
                'blink',
                'breathe',
                'okay',
                'channel_change',
                'candle',
                'fireplace',
                'colorloop',
                'finish_effect',
                'stop_effect',
                'stop_hue_effect',
            ],
            object_id: 'ha_discovery_group_new',
            unique_id: '9_light_zigbee2mqtt',
            origin: origin,
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/1221051039810110150109113116116_9/light/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/1221051039810110150109113116116_9/light/config',
            '',
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Shouldnt refresh discovery when device is renamed and homeassistant_rename is false', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message(
            'zigbee2mqtt/bridge/request/device/rename',
            stringify({from: 'weather_sensor', to: 'weather_sensor_renamed', homeassistant_rename: false}),
        );
        await flushPromises();

        expect(MQTT.publish).not.toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            '',
            {retain: true, qos: 1},
            expect.any(Function),
        );

        const payload = {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            state_class: 'measurement',
            enabled_by_default: true,
            value_template: '{{ value_json.temperature }}',
            state_topic: 'zigbee2mqtt/weather_sensor_renamed',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor_renamed',
            object_id: 'weather_sensor_renamed_temperature',
            unique_id: '0x0017880104e45522_temperature_zigbee2mqtt',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor_renamed',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should discover update_available sensor when device supports it', async () => {
        const payload = {
            payload_on: true,
            payload_off: false,
            value_template: `{{ value_json['update']['state'] == "available" }}`,
            enabled_by_default: false,
            state_topic: 'zigbee2mqtt/bulb',
            json_attributes_topic: 'zigbee2mqtt/bulb',
            name: null,
            object_id: 'bulb_update_available',
            unique_id: '0x000b57fffec6a5b2_update_available_zigbee2mqtt',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x000b57fffec6a5b2'],
                name: 'bulb',
                sw_version: null,
                model: 'TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm (LED1545G12)',
                manufacturer: 'IKEA',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            device_class: 'update',
            entity_category: 'diagnostic',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/binary_sensor/0x000b57fffec6a5b2/update_available/config',
            stringify(payload),
            {retain: true, qos: 1},
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
            automation_type: 'trigger',
            type: 'action',
            subtype: 'single',
            payload: 'single',
            topic: 'zigbee2mqtt/button/action',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45520'],
                name: 'button',
                sw_version: null,
                model: 'Wireless mini switch (WXKG11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/action_single/config',
            stringify(discoverPayloadAction),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        const discoverPayloadClick = {
            automation_type: 'trigger',
            type: 'click',
            subtype: 'single',
            payload: 'single',
            topic: 'zigbee2mqtt/button/click',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45520'],
                name: 'button',
                sw_version: null,
                model: 'Wireless mini switch (WXKG11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/click_single/config',
            stringify(discoverPayloadClick),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/button/action', 'single', {retain: false, qos: 0}, expect.any(Function));

        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/button/click', 'single', {retain: false, qos: 0}, expect.any(Function));

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button',
            stringify({
                action: 'single',
                click: 'single',
                battery: null,
                linkquality: null,
                voltage: null,
                power_outage_count: null,
                device_temperature: null,
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button',
            stringify({action: '', battery: null, linkquality: null, voltage: null, click: null, power_outage_count: null, device_temperature: null}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button',
            stringify({click: '', action: null, battery: null, linkquality: null, voltage: null, power_outage_count: null, device_temperature: null}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        // Should only discover it once
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload1);
        await flushPromises();
        expect(MQTT.publish).not.toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/action_single/config',
            stringify(discoverPayloadAction),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        expect(MQTT.publish).not.toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/click_single/config',
            stringify(discoverPayloadClick),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/button/action', 'single', {retain: false, qos: 0}, expect.any(Function));

        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/button/click', 'single', {retain: false, qos: 0}, expect.any(Function));

        // Shouldn't rediscover when already discovered in previous session
        clearDiscoveredTrigger('0x0017880104e45520');
        await MQTT.events.message(
            'homeassistant/device_automation/0x0017880104e45520/action_double/config',
            stringify({topic: 'zigbee2mqtt/button/action'}),
        );
        await MQTT.events.message(
            'homeassistant/device_automation/0x0017880104e45520/action_double/config',
            stringify({topic: 'zigbee2mqtt/button/action'}),
        );
        await flushPromises();
        MQTT.publish.mockClear();
        const payload2 = {data: {32768: 2}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload2);
        await flushPromises();
        expect(MQTT.publish).not.toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/action_double/config',
            expect.any(String),
            expect.any(Object),
            expect.any(Function),
        );

        // Should rediscover when already discovered in previous session but with different name
        clearDiscoveredTrigger('0x0017880104e45520');
        await MQTT.events.message(
            'homeassistant/device_automation/0x0017880104e45520/action_double/config',
            stringify({topic: 'zigbee2mqtt/button_other_name/action'}),
        );
        await flushPromises();
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload2);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/action_double/config',
            expect.any(String),
            expect.any(Object),
            expect.any(Function),
        );
    });

    it('Should not discover device_automation when disabled', async () => {
        settings.set(['device_options'], {
            homeassistant: {device_automation: null},
        });
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
        });
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
            automation_type: 'trigger',
            type: 'action',
            subtype: 'single',
            payload: 'single',
            topic: 'zigbee2mqtt/button/action',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45520'],
                name: 'button',
                sw_version: null,
                model: 'Wireless mini switch (WXKG11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/device_automation/0x0017880104e45520/action_single/config',
            stringify(discoverPayload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/button/action', 'single', {retain: false, qos: 0}, expect.any(Function));

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button',
            stringify({action: 'single', battery: null, linkquality: null, voltage: null, power_outage_count: null, device_temperature: null}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledTimes(3);
    });

    it('Should republish payload to postfix topic with lightWithPostfix config', async () => {
        MQTT.publish.mockClear();

        await MQTT.events.message('zigbee2mqtt/U202DST600ZB/l2/set', stringify({state: 'ON', brightness: 20}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/U202DST600ZB',
            stringify({state_l2: 'ON', brightness_l2: 20, linkquality: null, state_l1: null, power_on_behavior_l1: null, power_on_behavior_l2: null}),
            {qos: 0, retain: false},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/U202DST600ZB/l2',
            stringify({state: 'ON', brightness: 20, power_on_behavior: null}),
            {qos: 0, retain: false},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/U202DST600ZB/l1',
            stringify({state: null, power_on_behavior: null}),
            {qos: 0, retain: false},
            expect.any(Function),
        );
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
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(4);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({
            action: 'single',
            click: null,
            battery: null,
            linkquality: null,
            voltage: null,
            power_outage_count: null,
            device_temperature: null,
        });
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/button');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({
            action: '',
            click: null,
            battery: null,
            linkquality: null,
            voltage: null,
            power_outage_count: null,
            device_temperature: null,
        });
        expect(MQTT.publish.mock.calls[1][2]).toStrictEqual({qos: 0, retain: false});
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('homeassistant/device_automation/0x0017880104e45520/action_single/config');
        expect(MQTT.publish.mock.calls[3][0]).toStrictEqual('zigbee2mqtt/button/action');
    });

    it('Should clear outdated configs', async () => {
        // Non-existing group -> clear
        MQTT.publish.mockClear();
        await MQTT.events.message(
            'homeassistant/light/1221051039810110150109113116116_91231/light/config',
            stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}),
        );
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/1221051039810110150109113116116_91231/light/config',
            '',
            {qos: 1, retain: true},
            expect.any(Function),
        );

        // Existing group -> dont clear
        MQTT.publish.mockClear();
        await MQTT.events.message(
            'homeassistant/light/1221051039810110150109113116116_9/light/config',
            stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}),
        );
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);

        // Existing group with old topic structure (1.20.0) -> clear
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/light/9/light/config', stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith('homeassistant/light/9/light/config', '', {qos: 1, retain: true}, expect.any(Function));

        // Existing group, non existing config ->  clear
        MQTT.publish.mockClear();
        await MQTT.events.message(
            'homeassistant/light/1221051039810110150109113116116_9/switch/config',
            stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}),
        );
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/1221051039810110150109113116116_9/switch/config',
            '',
            {qos: 1, retain: true},
            expect.any(Function),
        );

        // Non-existing device -> clear
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/sensor/0x123/temperature/config', stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith('homeassistant/sensor/0x123/temperature/config', '', {qos: 1, retain: true}, expect.any(Function));

        // Existing device -> don't clear
        MQTT.publish.mockClear();
        await MQTT.events.message(
            'homeassistant/binary_sensor/0x000b57fffec6a5b2/update_available/config',
            stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}),
        );
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);

        // Non-existing device of different instance -> don't clear
        MQTT.publish.mockClear();
        await MQTT.events.message(
            'homeassistant/sensor/0x123/temperature/config',
            stringify({availability: [{topic: 'zigbee2mqtt_different/bridge/state'}]}),
        );
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);

        // Existing device but non-existing config -> don't clear
        MQTT.publish.mockClear();
        await MQTT.events.message(
            'homeassistant/sensor/0x000b57fffec6a5b2/update_available/config',
            stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}),
        );
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x000b57fffec6a5b2/update_available/config',
            '',
            {qos: 1, retain: true},
            expect.any(Function),
        );

        // Non-existing device but invalid payload -> clear
        MQTT.publish.mockClear();
        await MQTT.events.message('homeassistant/sensor/0x123/temperature/config', '1}3');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);

        // Existing device, device automation -> don't clear
        MQTT.publish.mockClear();
        await MQTT.events.message(
            'homeassistant/device_automation/0x000b57fffec6a5b2/action_button_3_single/config',
            stringify({topic: 'zigbee2mqtt/0x000b57fffec6a5b2/availability'}),
        );
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);

        // Device automation of different instance -> don't clear
        MQTT.publish.mockClear();
        await MQTT.events.message(
            'homeassistant/device_automation/0x000b57fffec6a5b2_not_existing/action_button_3_single/config',
            stringify({topic: 'zigbee2mqtt_different/0x000b57fffec6a5b2_not_existing/availability'}),
        );
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);

        // Device was flagged to be excluded from homeassistant discovery
        settings.set(['devices', '0x000b57fffec6a5b2', 'homeassistant'], null);
        await resetExtension();
        MQTT.publish.mockClear();

        await MQTT.events.message(
            'homeassistant/sensor/0x000b57fffec6a5b2/update_available/config',
            stringify({availability: [{topic: 'zigbee2mqtt/bridge/state'}]}),
        );
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x000b57fffec6a5b2/update_available/config',
            '',
            {qos: 1, retain: true},
            expect.any(Function),
        );
        MQTT.publish.mockClear();
        await MQTT.events.message(
            'homeassistant/device_automation/0x000b57fffec6a5b2/action_button_3_single/config',
            stringify({topic: 'zigbee2mqtt/0x000b57fffec6a5b2/availability'}),
        );
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/device_automation/0x000b57fffec6a5b2/action_button_3_single/config',
            '',
            {qos: 1, retain: true},
            expect.any(Function),
        );
    });

    it('Should not have Home Assistant legacy entity attributes when disabled', async () => {
        settings.set(['advanced', 'homeassistant_legacy_entity_attributes'], false);
        await resetExtension();

        let payload;
        await flushPromises();

        payload = {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            state_class: 'measurement',
            value_template: '{{ value_json.temperature }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            object_id: 'weather_sensor_temperature',
            unique_id: '0x0017880104e45522_temperature_zigbee2mqtt',
            origin: origin,
            enabled_by_default: true,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should rediscover group when device is added to it', async () => {
        resetDiscoveryPayloads(9);
        MQTT.publish.mockClear();
        MQTT.events.message(
            'zigbee2mqtt/bridge/request/group/members/add',
            stringify({group: 'ha_discovery_group', device: 'wall_switch_double/left'}),
        );
        await flushPromises();

        const payload = {
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            brightness: true,
            brightness_scale: 254,
            command_topic: 'zigbee2mqtt/ha_discovery_group/set',
            device: {
                identifiers: ['zigbee2mqtt_1221051039810110150109113116116_9'],
                name: 'ha_discovery_group',
                sw_version: version,
                model: 'Group',
                manufacturer: 'Zigbee2MQTT',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            json_attributes_topic: 'zigbee2mqtt/ha_discovery_group',
            max_mireds: 454,
            min_mireds: 250,
            name: null,
            schema: 'json',
            state_topic: 'zigbee2mqtt/ha_discovery_group',
            supported_color_modes: ['xy', 'color_temp'],
            effect: true,
            effect_list: [
                'blink',
                'breathe',
                'okay',
                'channel_change',
                'candle',
                'fireplace',
                'colorloop',
                'finish_effect',
                'stop_effect',
                'stop_hue_effect',
            ],
            object_id: 'ha_discovery_group',
            unique_id: '9_light_zigbee2mqtt',
            origin: origin,
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/1221051039810110150109113116116_9/light/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should discover with json availability payload value_template', async () => {
        settings.set(['advanced', 'legacy_availability_payload'], false);
        await resetExtension();

        const payload = {
            availability: [{topic: 'zigbee2mqtt/bridge/state', value_template: '{{ value_json.state }}'}],
            brightness: true,
            brightness_scale: 254,
            command_topic: 'zigbee2mqtt/ha_discovery_group/set',
            device: {
                identifiers: ['zigbee2mqtt_1221051039810110150109113116116_9'],
                name: 'ha_discovery_group',
                sw_version: version,
                model: 'Group',
                manufacturer: 'Zigbee2MQTT',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            max_mireds: 454,
            min_mireds: 250,
            json_attributes_topic: 'zigbee2mqtt/ha_discovery_group',
            name: null,
            schema: 'json',
            state_topic: 'zigbee2mqtt/ha_discovery_group',
            supported_color_modes: ['xy', 'color_temp'],
            effect: true,
            effect_list: [
                'blink',
                'breathe',
                'okay',
                'channel_change',
                'candle',
                'fireplace',
                'colorloop',
                'finish_effect',
                'stop_effect',
                'stop_hue_effect',
            ],
            object_id: 'ha_discovery_group',
            unique_id: '9_light_zigbee2mqtt',
            origin: origin,
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/1221051039810110150109113116116_9/light/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should discover with availability offline when device is disabled', async () => {
        settings.set(['devices', '0x000b57fffec6a5b2', 'disabled'], true);

        await resetExtension();

        const payload = {
            availability: [
                {
                    topic: 'zigbee2mqtt/bridge/state',
                    value_template: `{{ "offline" }}`,
                },
            ],
            brightness: true,
            brightness_scale: 254,
            command_topic: 'zigbee2mqtt/bulb/set',
            device: {
                identifiers: ['zigbee2mqtt_0x000b57fffec6a5b2'],
                manufacturer: 'IKEA',
                model: 'TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm (LED1545G12)',
                name: 'bulb',
                sw_version: null,
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            effect: true,
            effect_list: ['blink', 'breathe', 'okay', 'channel_change', 'finish_effect', 'stop_effect'],
            json_attributes_topic: 'zigbee2mqtt/bulb',
            max_mireds: 454,
            min_mireds: 250,
            name: null,
            schema: 'json',
            state_topic: 'zigbee2mqtt/bulb',
            supported_color_modes: ['color_temp'],
            object_id: 'bulb',
            unique_id: '0x000b57fffec6a5b2_light_zigbee2mqtt',
            origin: origin,
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/0x000b57fffec6a5b2/light/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should discover last_seen when enabled', async () => {
        settings.set(['advanced', 'last_seen'], 'ISO_8601');
        await resetExtension();

        const payload = {
            availability: [
                {
                    topic: 'zigbee2mqtt/bridge/state',
                },
            ],
            device: {
                identifiers: ['zigbee2mqtt_0x000b57fffec6a5b2'],
                manufacturer: 'IKEA',
                model: 'TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm (LED1545G12)',
                name: 'bulb',
                sw_version: null,
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            enabled_by_default: false,
            icon: 'mdi:clock',
            json_attributes_topic: 'zigbee2mqtt/bulb',
            name: 'Last seen',
            state_topic: 'zigbee2mqtt/bulb',
            object_id: 'bulb_last_seen',
            unique_id: '0x000b57fffec6a5b2_last_seen_zigbee2mqtt',
            origin: origin,
            value_template: '{{ value_json.last_seen }}',
            device_class: 'timestamp',
            entity_category: 'diagnostic',
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x000b57fffec6a5b2/last_seen/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should discover devices with configuration url', async () => {
        settings.set(['frontend', 'url'], 'http://zigbee.mqtt');

        await resetExtension();

        let payload;
        await flushPromises();

        payload = {
            unit_of_measurement: '°C',
            device_class: 'temperature',
            state_class: 'measurement',
            enabled_by_default: true,
            value_template: '{{ value_json.temperature }}',
            state_topic: 'zigbee2mqtt/weather_sensor',
            json_attributes_topic: 'zigbee2mqtt/weather_sensor',
            object_id: 'weather_sensor_temperature',
            unique_id: '0x0017880104e45522_temperature_zigbee2mqtt',
            origin: origin,
            device: {
                identifiers: ['zigbee2mqtt_0x0017880104e45522'],
                name: 'weather_sensor',
                sw_version: null,
                model: 'Temperature and humidity sensor (WSDCGQ11LM)',
                manufacturer: 'Aqara',
                configuration_url: 'http://zigbee.mqtt/#/device/0x0017880104e45522/info',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/0x0017880104e45522/temperature/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should rediscover scenes when a scene is changed', async () => {
        // Device/endpoint scenes.
        const device = controller.zigbee.resolveEntity(zigbeeHerdsman.devices.bulb_color_2);
        resetDiscoveryPayloads(device.ieeeAddr);

        MQTT.publish.mockClear();
        controller.eventBus.emitScenesChanged({entity: device});
        await flushPromises();

        // Discovery messages for scenes have been purged.
        expect(MQTT.publish).toHaveBeenCalledWith(
            `homeassistant/scene/0x000b57fffec6a5b4/scene_1/config`,
            '',
            {retain: true, qos: 1},
            expect.any(Function),
        );
        await jest.runOnlyPendingTimersAsync();
        await flushPromises();

        let payload = {
            name: 'Chill scene',
            command_topic: 'zigbee2mqtt/bulb_color_2/set',
            payload_on: '{ "scene_recall": 1 }',
            json_attributes_topic: 'zigbee2mqtt/bulb_color_2',
            object_id: 'bulb_color_2_1_chill_scene',
            unique_id: '0x000b57fffec6a5b4_scene_1_zigbee2mqtt',
            device: {
                identifiers: ['zigbee2mqtt_0x000b57fffec6a5b4'],
                name: 'bulb_color_2',
                sw_version: '5.127.1.26581',
                model: 'Hue Go (7146060PH)',
                manufacturer: 'Philips',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            origin: origin,
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };
        expect(MQTT.publish).toHaveBeenCalledWith(
            `homeassistant/scene/0x000b57fffec6a5b4/scene_1/config`,
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledTimes(12);

        // Group scenes.
        const group = controller.zigbee.resolveEntity('ha_discovery_group');
        resetDiscoveryPayloads(9);

        MQTT.publish.mockClear();
        controller.eventBus.emitScenesChanged({entity: group});
        await flushPromises();

        // Discovery messages for scenes have been purged.
        expect(MQTT.publish).toHaveBeenCalledWith(
            `homeassistant/scene/1221051039810110150109113116116_9/scene_4/config`,
            '',
            {retain: true, qos: 1},
            expect.any(Function),
        );
        await jest.runOnlyPendingTimersAsync();
        await flushPromises();

        payload = {
            name: 'Scene 4',
            command_topic: 'zigbee2mqtt/ha_discovery_group/set',
            payload_on: '{ "scene_recall": 4 }',
            json_attributes_topic: 'zigbee2mqtt/ha_discovery_group',
            object_id: 'ha_discovery_group_4_scene_4',
            unique_id: '9_scene_4_zigbee2mqtt',
            device: {
                identifiers: ['zigbee2mqtt_1221051039810110150109113116116_9'],
                name: 'ha_discovery_group',
                sw_version: version,
                model: 'Group',
                manufacturer: 'Zigbee2MQTT',
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            origin: origin,
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
        };
        expect(MQTT.publish).toHaveBeenCalledWith(
            `homeassistant/scene/1221051039810110150109113116116_9/scene_4/config`,
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledTimes(6);
    });

    it('Should not clear bridge entities unnecessarily', async () => {
        MQTT.publish.mockClear();

        const topic = 'homeassistant/button/1221051039810110150109113116116_0x00124b00120144ae/restart/config';
        const payload = {
            name: 'Restart',
            object_id: 'zigbee2mqtt_bridge_restart',
            unique_id: 'bridge_0x00124b00120144ae_restart_zigbee2mqtt',
            device_class: 'restart',
            command_topic: 'zigbee2mqtt/bridge/request/restart',
            payload_press: '',
            origin: origin,
            device: {
                name: 'Zigbee2MQTT Bridge',
                identifiers: ['zigbee2mqtt_bridge_0x00124b00120144ae'],
                manufacturer: 'Zigbee2MQTT',
                model: 'Bridge',
                hw_version: 'z-Stack 20190425',
                sw_version: z2m_version,
            },
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            availability_mode: 'all',
        };

        controller.eventBus.emitMQTTMessage({
            topic: topic,
            message: stringify(payload),
        });
        await flushPromises();

        expect(MQTT.publish).not.toHaveBeenCalledWith(topic, '', {retain: true, qos: 1}, expect.any(Function));
    });

    it('Should discover bridge entities', async () => {
        settings.set(['advanced', 'homeassistant_legacy_entity_attributes'], false);
        await resetExtension();

        const devicePayload = {
            name: 'Zigbee2MQTT Bridge',
            identifiers: ['zigbee2mqtt_bridge_0x00124b00120144ae'],
            manufacturer: 'Zigbee2MQTT',
            model: 'Bridge',
            hw_version: 'z-Stack 20190425',
            sw_version: z2m_version,
        };

        // Binary sensors.
        let payload;
        payload = {
            name: 'Connection state',
            object_id: 'zigbee2mqtt_bridge_connection_state',
            entity_category: 'diagnostic',
            device_class: 'connectivity',
            unique_id: 'bridge_0x00124b00120144ae_connection_state_zigbee2mqtt',
            state_topic: 'zigbee2mqtt/bridge/state',
            value_template: '{{ value }}',
            payload_on: 'online',
            payload_off: 'offline',
            origin: origin,
            device: devicePayload,
        };
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/binary_sensor/1221051039810110150109113116116_0x00124b00120144ae/connection_state/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            name: 'Restart required',
            object_id: 'zigbee2mqtt_bridge_restart_required',
            entity_category: 'diagnostic',
            device_class: 'problem',
            enabled_by_default: false,
            unique_id: 'bridge_0x00124b00120144ae_restart_required_zigbee2mqtt',
            state_topic: 'zigbee2mqtt/bridge/info',
            value_template: '{{ value_json.restart_required }}',
            payload_on: true,
            payload_off: false,
            origin: origin,
            device: devicePayload,
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            availability_mode: 'all',
        };
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/binary_sensor/1221051039810110150109113116116_0x00124b00120144ae/restart_required/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        // Buttons.
        payload = {
            name: 'Restart',
            object_id: 'zigbee2mqtt_bridge_restart',
            unique_id: 'bridge_0x00124b00120144ae_restart_zigbee2mqtt',
            device_class: 'restart',
            command_topic: 'zigbee2mqtt/bridge/request/restart',
            payload_press: '',
            origin: origin,
            device: devicePayload,
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            availability_mode: 'all',
        };
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/button/1221051039810110150109113116116_0x00124b00120144ae/restart/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        // Selects.
        payload = {
            name: 'Log level',
            object_id: 'zigbee2mqtt_bridge_log_level',
            entity_category: 'config',
            unique_id: 'bridge_0x00124b00120144ae_log_level_zigbee2mqtt',
            state_topic: 'zigbee2mqtt/bridge/info',
            value_template: '{{ value_json.log_level | lower }}',
            command_topic: 'zigbee2mqtt/bridge/request/options',
            command_template: '{"options": {"advanced": {"log_level": "{{ value }}" } } }',
            options: settings.LOG_LEVELS,
            origin: origin,
            device: devicePayload,
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            availability_mode: 'all',
        };
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/select/1221051039810110150109113116116_0x00124b00120144ae/log_level/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        // Sensors.
        payload = {
            name: 'Version',
            object_id: 'zigbee2mqtt_bridge_version',
            entity_category: 'diagnostic',
            icon: 'mdi:zigbee',
            unique_id: 'bridge_0x00124b00120144ae_version_zigbee2mqtt',
            state_topic: 'zigbee2mqtt/bridge/info',
            value_template: '{{ value_json.version }}',
            origin: origin,
            device: devicePayload,
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            availability_mode: 'all',
        };
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/1221051039810110150109113116116_0x00124b00120144ae/version/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            name: 'Coordinator version',
            object_id: 'zigbee2mqtt_bridge_coordinator_version',
            entity_category: 'diagnostic',
            enabled_by_default: false,
            icon: 'mdi:chip',
            unique_id: 'bridge_0x00124b00120144ae_coordinator_version_zigbee2mqtt',
            state_topic: 'zigbee2mqtt/bridge/info',
            value_template: '{{ value_json.coordinator.meta.revision }}',
            origin: origin,
            device: devicePayload,
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            availability_mode: 'all',
        };
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/1221051039810110150109113116116_0x00124b00120144ae/coordinator_version/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            name: 'Network map',
            object_id: 'zigbee2mqtt_bridge_network_map',
            entity_category: 'diagnostic',
            enabled_by_default: false,
            unique_id: 'bridge_0x00124b00120144ae_network_map_zigbee2mqtt',
            state_topic: 'zigbee2mqtt/bridge/response/networkmap',
            value_template: "{{ now().strftime('%Y-%m-%d %H:%M:%S') }}",
            json_attributes_topic: 'zigbee2mqtt/bridge/response/networkmap',
            json_attributes_template: '{{ value_json.data.value | tojson }}',
            origin: origin,
            device: devicePayload,
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            availability_mode: 'all',
        };
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/1221051039810110150109113116116_0x00124b00120144ae/network_map/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        payload = {
            name: 'Permit join timeout',
            object_id: 'zigbee2mqtt_bridge_permit_join_timeout',
            entity_category: 'diagnostic',
            device_class: 'duration',
            unit_of_measurement: 's',
            unique_id: 'bridge_0x00124b00120144ae_permit_join_timeout_zigbee2mqtt',
            state_topic: 'zigbee2mqtt/bridge/info',
            value_template: '{{ iif(value_json.permit_join_timeout is defined, value_json.permit_join_timeout, None) }}',
            origin: origin,
            device: devicePayload,
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            availability_mode: 'all',
        };
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/sensor/1221051039810110150109113116116_0x00124b00120144ae/permit_join_timeout/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );

        // Switches.
        payload = {
            name: 'Permit join',
            object_id: 'zigbee2mqtt_bridge_permit_join',
            icon: 'mdi:human-greeting-proximity',
            unique_id: 'bridge_0x00124b00120144ae_permit_join_zigbee2mqtt',
            state_topic: 'zigbee2mqtt/bridge/info',
            value_template: '{{ value_json.permit_join | lower }}',
            command_topic: 'zigbee2mqtt/bridge/request/permit_join',
            payload_on: 'true',
            payload_off: 'false',
            origin: origin,
            device: devicePayload,
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            availability_mode: 'all',
        };
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/switch/1221051039810110150109113116116_0x00124b00120144ae/permit_join/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should remove discovery entries for removed exposes when device options change', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message(
            'zigbee2mqtt/bridge/request/device/options',
            stringify({id: '0xf4ce368a38be56a1', options: {dimmer_1_enabled: 'false', dimmer_1_dimming_enabled: 'false'}}),
        );
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/light/0xf4ce368a38be56a1/light_l2/config',
            '',
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should publish discovery message when a converter announces changed exposes', async () => {
        MQTT.publish.mockClear();
        const device = zigbeeHerdsman.devices['BMCT-SLZ'];
        const data = {deviceMode: 0};
        const msg = {data, cluster: 'boschSpecific', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        resetDiscoveryPayloads('0x18fc26000000cafe');
        await zigbeeHerdsman.events.message(msg);
        await flushPromises();
        const payload = {
            availability: [{topic: 'zigbee2mqtt/bridge/state'}],
            command_topic: 'zigbee2mqtt/0x18fc26000000cafe/set/device_mode',
            device: {
                identifiers: ['zigbee2mqtt_0x18fc26000000cafe'],
                manufacturer: 'Bosch',
                model: 'Light/shutter control unit II (BMCT-SLZ)',
                name: '0x18fc26000000cafe',
                sw_version: null,
                via_device: 'zigbee2mqtt_bridge_0x00124b00120144ae',
            },
            entity_category: 'config',
            icon: 'mdi:tune',
            json_attributes_topic: 'zigbee2mqtt/0x18fc26000000cafe',
            name: 'Device mode',
            object_id: '0x18fc26000000cafe_device_mode',
            options: ['light', 'shutter', 'disabled'],
            origin: origin,
            state_topic: 'zigbee2mqtt/0x18fc26000000cafe',
            unique_id: '0x18fc26000000cafe_device_mode_zigbee2mqtt',
            value_template: '{{ value_json.device_mode }}',
            enabled_by_default: true,
        };
        expect(MQTT.publish).toHaveBeenCalledWith(
            'homeassistant/select/0x18fc26000000cafe/device_mode/config',
            stringify(payload),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });
});
