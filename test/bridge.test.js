const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const fs = require('fs');
const path = require('path');
const flushPromises = require('./lib/flushPromises');
const utils = require('../lib/util/utils').default;
const stringify = require('json-stable-stringify-without-jsonify');

const mockJSZipFile = jest.fn();
const mockJSZipGenerateAsync = jest.fn().mockReturnValue('THISISBASE64');

jest.mock('jszip', () =>
    jest.fn().mockImplementation((path) => {
        return {
            file: mockJSZipFile,
            generateAsync: mockJSZipGenerateAsync,
        };
    }),
);

const {coordinator, bulb, unsupported, WXKG11LM, remote, ZNCZ02LM, bulb_color_2, WSDCGQ11LM, zigfred_plus, bulb_custom_cluster} =
    zigbeeHerdsman.devices;
zigbeeHerdsman.returnDevices.push(coordinator.ieeeAddr);
zigbeeHerdsman.returnDevices.push(bulb.ieeeAddr);
zigbeeHerdsman.returnDevices.push(unsupported.ieeeAddr);
zigbeeHerdsman.returnDevices.push(WXKG11LM.ieeeAddr);
zigbeeHerdsman.returnDevices.push(remote.ieeeAddr);
zigbeeHerdsman.returnDevices.push(ZNCZ02LM.ieeeAddr);
zigbeeHerdsman.returnDevices.push(bulb_color_2.ieeeAddr);
zigbeeHerdsman.returnDevices.push(WSDCGQ11LM.ieeeAddr);
zigbeeHerdsman.returnDevices.push(zigfred_plus.ieeeAddr);
zigbeeHerdsman.returnDevices.push(bulb_custom_cluster.ieeeAddr);

describe('Bridge', () => {
    let controller;
    let mockRestart;
    let extension;

    let resetExtension = async () => {
        await controller.enableDisableExtension(false, 'Bridge');
        await controller.enableDisableExtension(true, 'Bridge');
        extension = controller.extensions.find((e) => e.constructor.name === 'Bridge');
    };

    beforeAll(async () => {
        jest.useFakeTimers();
        mockRestart = jest.fn();
        settings.set(['advanced', 'legacy_api'], false);
        controller = new Controller(mockRestart, jest.fn());
        await controller.start();
        await flushPromises();
        extension = controller.extensions.find((e) => e.constructor.name === 'Bridge');
    });

    beforeEach(async () => {
        MQTT.mock.reconnecting = false;
        data.writeDefaultConfiguration();
        settings.reRead();
        settings.set(['advanced', 'legacy_api'], false);
        data.writeDefaultState();
        logger.info.mockClear();
        logger.warning.mockClear();
        logger.setTransportsEnabled(false);
        MQTT.publish.mockClear();
        const device = zigbeeHerdsman.devices.bulb;
        device.interview.mockClear();
        device.removeFromDatabase.mockClear();
        device.removeFromNetwork.mockClear();
        extension.lastJoinedDeviceIeeeAddr = null;
        extension.restartRequired = false;
        controller.state.state = {[zigbeeHerdsman.devices.bulb.ieeeAddr]: {brightness: 50}};
    });

    afterAll(async () => {
        jest.useRealTimers();
    });

    it('Should publish bridge info on startup', async () => {
        await resetExtension();
        const version = await utils.getZigbee2MQTTVersion();
        const zhVersion = await utils.getDependencyVersion('zigbee-herdsman');
        const zhcVersion = await utils.getDependencyVersion('zigbee-herdsman-converters');
        const directory = settings.get().advanced.log_directory;
        // console.log(MQTT.publish.mock.calls.find((c) => c[0] === 'zigbee2mqtt/bridge/info')[1])
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/info',
            stringify({
                commit: version.commitHash,
                config: {
                    advanced: {
                        adapter_concurrent: undefined,
                        adapter_delay: undefined,
                        availability_blacklist: [],
                        availability_blocklist: [],
                        availability_passlist: [],
                        availability_whitelist: [],
                        cache_state: true,
                        cache_state_persistent: true,
                        cache_state_send_on_startup: true,
                        channel: 11,
                        elapsed: false,
                        ext_pan_id: [221, 221, 221, 221, 221, 221, 221, 221],
                        last_seen: 'disable',
                        legacy_api: false,
                        legacy_availability_payload: true,
                        log_debug_namespace_ignore: '',
                        log_debug_to_mqtt_frontend: false,
                        log_directory: directory,
                        log_file: 'log.log',
                        log_level: 'info',
                        log_namespaced_levels: {},
                        log_output: ['console', 'file'],
                        log_rotation: true,
                        log_symlink_current: false,
                        log_syslog: {},
                        output: 'json',
                        pan_id: 6754,
                        report: false,
                        soft_reset_timeout: 0,
                        timestamp_format: 'YYYY-MM-DD HH:mm:ss',
                    },
                    blocklist: [],
                    device_options: {},
                    devices: {
                        '0x000b57fffec6a5b2': {description: 'this is my bulb', friendly_name: 'bulb', retain: true},
                        '0x000b57fffec6a5b3': {friendly_name: 'bulb_color', retain: false},
                        '0x000b57fffec6a5b4': {friendly_name: 'bulb_color_2', retain: false},
                        '0x000b57fffec6a5b7': {friendly_name: 'bulb_2', retain: false},
                        '0x0017880104a44559': {friendly_name: 'J1_cover'},
                        '0x0017880104e43559': {friendly_name: 'U202DST600ZB'},
                        '0x0017880104e44559': {friendly_name: '3157100_thermostat'},
                        '0x0017880104e45517': {friendly_name: 'remote', retain: true},
                        '0x0017880104e45520': {friendly_name: 'button', retain: false},
                        '0x0017880104e45521': {friendly_name: 'button_double_key', retain: false},
                        '0x0017880104e45522': {friendly_name: 'weather_sensor', qos: 1, retain: false},
                        '0x0017880104e45523': {friendly_name: 'occupancy_sensor', retain: false},
                        '0x0017880104e45524': {friendly_name: 'power_plug', retain: false},
                        '0x0017880104e45526': {friendly_name: 'GL-S-007ZS'},
                        '0x0017880104e45529': {friendly_name: 'unsupported2', retain: false},
                        '0x0017880104e45530': {friendly_name: 'button_double_key_interviewing', retain: false},
                        '0x0017880104e45540': {friendly_name: 'ikea_onoff'},
                        '0x0017880104e45541': {friendly_name: 'wall_switch', retain: false},
                        '0x0017880104e45542': {friendly_name: 'wall_switch_double', retain: false},
                        '0x0017880104e45543': {friendly_name: 'led_controller_1', retain: false},
                        '0x0017880104e45544': {friendly_name: 'led_controller_2', retain: false},
                        '0x0017880104e45545': {friendly_name: 'dimmer_wall_switch', retain: false},
                        '0x0017880104e45547': {friendly_name: 'curtain', retain: false},
                        '0x0017880104e45548': {friendly_name: 'fan', retain: false},
                        '0x0017880104e45549': {friendly_name: 'siren', retain: false},
                        '0x0017880104e45550': {friendly_name: 'thermostat', retain: false},
                        '0x0017880104e45551': {friendly_name: 'smart vent', retain: false},
                        '0x0017880104e45552': {friendly_name: 'j1', retain: false},
                        '0x0017880104e45553': {friendly_name: 'bulb_enddevice', retain: false},
                        '0x0017880104e45559': {friendly_name: 'cc2530_router', retain: false},
                        '0x0017880104e45560': {friendly_name: 'livolo', retain: false},
                        '0x0017880104e45561': {friendly_name: 'temperature_sensor'},
                        '0x0017880104e45562': {friendly_name: 'heating_actuator'},
                        '0x0017880104e45724': {friendly_name: 'GLEDOPTO_2ID'},
                        '0x0017882104a44559': {friendly_name: 'TS0601_thermostat'},
                        '0x0017882104a44560': {friendly_name: 'TS0601_switch'},
                        '0x0017882104a44562': {friendly_name: 'TS0601_cover_switch'},
                        '0x0017882194e45543': {friendly_name: 'QS-Zigbee-D02-TRIAC-2C-LN'},
                        '0x18fc2600000d7ae2': {friendly_name: 'bosch_radiator'},
                        '0x90fd9ffffe4b64aa': {friendly_name: 'SP600_OLD'},
                        '0x90fd9ffffe4b64ab': {friendly_name: 'SP600_NEW'},
                        '0x90fd9ffffe4b64ac': {friendly_name: 'MKS-CM-W5'},
                        '0x90fd9ffffe4b64ae': {friendly_name: 'tradfri_remote', retain: false},
                        '0x90fd9ffffe4b64af': {friendly_name: 'roller_shutter'},
                        '0x90fd9ffffe4b64ax': {friendly_name: 'ZNLDP12LM'},
                        '0xf4ce368a38be56a1': {
                            cover_1_enabled: 'true',
                            cover_1_tilt_enabled: 'true',
                            cover_2_enabled: 'true',
                            cover_2_tilt_enabled: 'true',
                            dimmer_1_dimming_enabled: 'true',
                            dimmer_1_enabled: 'true',
                            dimmer_2_dimming_enabled: 'true',
                            dimmer_2_enabled: 'true',
                            dimmer_3_dimming_enabled: 'true',
                            dimmer_3_enabled: 'true',
                            dimmer_4_dimming_enabled: 'true',
                            dimmer_4_enabled: 'true',
                            friendly_name: 'zigfred_plus',
                            front_surface_enabled: 'true',
                            retain: false,
                        },
                    },
                    external_converters: [],
                    groups: {
                        1: {friendly_name: 'group_1', retain: false},
                        11: {devices: ['bulb_2'], friendly_name: 'group_with_tradfri', retain: false},
                        12: {devices: ['TS0601_thermostat'], friendly_name: 'thermostat_group', retain: false},
                        14: {devices: ['power_plug', 'bulb_2'], friendly_name: 'switch_group', retain: false},
                        15071: {devices: ['bulb_color_2', 'bulb_2'], friendly_name: 'group_tradfri_remote', retain: false},
                        2: {friendly_name: 'group_2', retain: false},
                        21: {devices: ['GLEDOPTO_2ID/cct'], friendly_name: 'gledopto_group'},
                        9: {devices: ['bulb_color_2', 'bulb_2', 'wall_switch_double/right'], friendly_name: 'ha_discovery_group'},
                    },
                    homeassistant: false,
                    map_options: {
                        graphviz: {
                            colors: {
                                fill: {coordinator: '#e04e5d', enddevice: '#fff8ce', router: '#4ea3e0'},
                                font: {coordinator: '#ffffff', enddevice: '#000000', router: '#ffffff'},
                                line: {active: '#009900', inactive: '#994444'},
                            },
                        },
                    },
                    mqtt: {base_topic: 'zigbee2mqtt', force_disable_retain: false, include_device_information: false, server: 'mqtt://localhost'},
                    ota: {disable_automatic_update_check: false, update_check_interval: 1440},
                    passlist: [],
                    permit_join: true,
                    serial: {disable_led: false, port: '/dev/dummy'},
                },
                config_schema: settings.schema,
                coordinator: {ieee_address: '0x00124b00120144ae', meta: {revision: 20190425, version: 1}, type: 'z-Stack'},
                log_level: 'info',
                network: {channel: 15, extended_pan_id: [0, 11, 22], pan_id: 5674},
                permit_join: false,
                restart_required: false,
                version: version.version,
                zigbee_herdsman: zhVersion,
                zigbee_herdsman_converters: zhcVersion,
            }),
            {retain: true, qos: 0},
            expect.any(Function),
        );
    });

    it('Should publish devices on startup', async () => {
        await resetExtension();
        // console.log(MQTT.publish.mock.calls.find((c) => c[0] === 'zigbee2mqtt/bridge/devices')[1]);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/devices',
            stringify([
                {
                    date_code: null,
                    disabled: false,
                    endpoints: {1: {bindings: [], clusters: {input: [], output: []}, configured_reportings: [], scenes: []}},
                    friendly_name: 'Coordinator',
                    ieee_address: '0x00124b00120144ae',
                    interview_completed: false,
                    interviewing: false,
                    model_id: null,
                    network_address: 0,
                    power_source: null,
                    software_build_id: null,
                    supported: true,
                    type: 'Coordinator',
                },
                {
                    date_code: null,
                    definition: {
                        description: 'TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm',
                        exposes: [
                            {
                                features: [
                                    {
                                        access: 7,
                                        description: 'On/off state of this light',
                                        label: 'State',
                                        name: 'state',
                                        property: 'state',
                                        type: 'binary',
                                        value_off: 'OFF',
                                        value_on: 'ON',
                                        value_toggle: 'TOGGLE',
                                    },
                                    {
                                        access: 7,
                                        description: 'Brightness of this light',
                                        label: 'Brightness',
                                        name: 'brightness',
                                        property: 'brightness',
                                        type: 'numeric',
                                        value_max: 254,
                                        value_min: 0,
                                    },
                                    {
                                        access: 7,
                                        description: 'Color temperature of this light',
                                        label: 'Color temp',
                                        name: 'color_temp',
                                        presets: [
                                            {description: 'Coolest temperature supported', name: 'coolest', value: 250},
                                            {description: 'Cool temperature (250 mireds / 4000 Kelvin)', name: 'cool', value: 250},
                                            {description: 'Neutral temperature (370 mireds / 2700 Kelvin)', name: 'neutral', value: 370},
                                            {description: 'Warm temperature (454 mireds / 2200 Kelvin)', name: 'warm', value: 454},
                                            {description: 'Warmest temperature supported', name: 'warmest', value: 454},
                                        ],
                                        property: 'color_temp',
                                        type: 'numeric',
                                        unit: 'mired',
                                        value_max: 454,
                                        value_min: 250,
                                    },
                                    {
                                        access: 7,
                                        description: 'Color temperature after cold power on of this light',
                                        label: 'Color temp startup',
                                        name: 'color_temp_startup',
                                        presets: [
                                            {description: 'Coolest temperature supported', name: 'coolest', value: 250},
                                            {description: 'Cool temperature (250 mireds / 4000 Kelvin)', name: 'cool', value: 250},
                                            {description: 'Neutral temperature (370 mireds / 2700 Kelvin)', name: 'neutral', value: 370},
                                            {description: 'Warm temperature (454 mireds / 2200 Kelvin)', name: 'warm', value: 454},
                                            {description: 'Warmest temperature supported', name: 'warmest', value: 454},
                                            {description: 'Restore previous color_temp on cold power on', name: 'previous', value: 65535},
                                        ],
                                        property: 'color_temp_startup',
                                        type: 'numeric',
                                        unit: 'mired',
                                        value_max: 454,
                                        value_min: 250,
                                    },
                                    {
                                        access: 7,
                                        description: 'Configure genLevelCtrl',
                                        features: [
                                            {
                                                access: 7,
                                                description:
                                                    'this setting can affect the "on_level", "current_level_startup" or "brightness" setting',
                                                label: 'Execute if off',
                                                name: 'execute_if_off',
                                                property: 'execute_if_off',
                                                type: 'binary',
                                                value_off: false,
                                                value_on: true,
                                            },
                                            {
                                                access: 7,
                                                description: 'Defines the desired startup level for a device when it is supplied with power',
                                                label: 'Current level startup',
                                                name: 'current_level_startup',
                                                presets: [
                                                    {description: 'Use minimum permitted value', name: 'minimum', value: 0},
                                                    {description: 'Use previous value', name: 'previous', value: 255},
                                                ],
                                                property: 'current_level_startup',
                                                type: 'numeric',
                                                value_max: 254,
                                                value_min: 1,
                                            },
                                        ],
                                        label: 'Level config',
                                        name: 'level_config',
                                        property: 'level_config',
                                        type: 'composite',
                                    },
                                ],
                                type: 'light',
                            },
                            {
                                access: 2,
                                description: 'Triggers an effect on the light (e.g. make light blink for a few seconds)',
                                label: 'Effect',
                                name: 'effect',
                                property: 'effect',
                                type: 'enum',
                                values: ['blink', 'breathe', 'okay', 'channel_change', 'finish_effect', 'stop_effect'],
                            },
                            {
                                access: 7,
                                category: 'config',
                                description: 'Controls the behavior when the device is powered on after power loss',
                                label: 'Power-on behavior',
                                name: 'power_on_behavior',
                                property: 'power_on_behavior',
                                type: 'enum',
                                values: ['off', 'on', 'toggle', 'previous'],
                            },
                            {
                                access: 7,
                                category: 'config',
                                description: 'Advanced color behavior',
                                features: [
                                    {
                                        access: 2,
                                        description: 'Controls whether color and color temperature can be set while light is off',
                                        label: 'Execute if off',
                                        name: 'execute_if_off',
                                        property: 'execute_if_off',
                                        type: 'binary',
                                        value_off: false,
                                        value_on: true,
                                    },
                                ],
                                label: 'Color options',
                                name: 'color_options',
                                property: 'color_options',
                                type: 'composite',
                            },
                            {
                                access: 2,
                                category: 'config',
                                description: 'Initiate device identification',
                                label: 'Identify',
                                name: 'identify',
                                property: 'identify',
                                type: 'enum',
                                values: ['identify'],
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Link quality (signal strength)',
                                label: 'Linkquality',
                                name: 'linkquality',
                                property: 'linkquality',
                                type: 'numeric',
                                unit: 'lqi',
                                value_max: 255,
                                value_min: 0,
                            },
                        ],
                        model: 'LED1545G12',
                        options: [
                            {
                                access: 2,
                                description:
                                    'Controls the transition time (in seconds) of on/off, brightness, color temperature (if applicable) and color (if applicable) changes. Defaults to `0` (no transition).',
                                label: 'Transition',
                                name: 'transition',
                                property: 'transition',
                                type: 'numeric',
                                value_min: 0,
                            },
                            {
                                access: 2,
                                description:
                                    'When enabled colors will be synced, e.g. if the light supports both color x/y and color temperature a conversion from color x/y to color temperature will be done when setting the x/y color (default true).',
                                label: 'Color sync',
                                name: 'color_sync',
                                property: 'color_sync',
                                type: 'binary',
                                value_off: false,
                                value_on: true,
                            },
                            {
                                access: 2,
                                description:
                                    'Sets the duration of the identification procedure in seconds (i.e., how long the device would flash).The value ranges from 1 to 30 seconds (default: 3).',
                                label: 'Identify timeout',
                                name: 'identify_timeout',
                                property: 'identify_timeout',
                                type: 'numeric',
                                value_max: 30,
                                value_min: 1,
                            },
                            {
                                access: 2,
                                description: "State actions will also be published as 'action' when true (default false).",
                                label: 'State action',
                                name: 'state_action',
                                property: 'state_action',
                                type: 'binary',
                                value_off: false,
                                value_on: true,
                            },
                        ],
                        supports_ota: true,
                        vendor: 'IKEA',
                    },
                    description: 'this is my bulb',
                    disabled: false,
                    endpoints: {
                        1: {
                            bindings: [],
                            clusters: {
                                input: ['genBasic', 'genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl'],
                                output: ['genScenes', 'genOta'],
                            },
                            configured_reportings: [
                                {
                                    attribute: 'onOff',
                                    cluster: 'genOnOff',
                                    maximum_report_interval: 10,
                                    minimum_report_interval: 1,
                                    reportable_change: 20,
                                },
                            ],
                            scenes: [],
                        },
                    },
                    friendly_name: 'bulb',
                    ieee_address: '0x000b57fffec6a5b2',
                    interview_completed: true,
                    interviewing: false,
                    model_id: 'TRADFRI bulb E27 WS opal 980lm',
                    network_address: 40369,
                    power_source: 'Mains (single phase)',
                    software_build_id: null,
                    supported: true,
                    type: 'Router',
                },
                {
                    date_code: '2019.09',
                    definition: {
                        description: 'Hue Go',
                        exposes: [
                            {
                                features: [
                                    {
                                        access: 7,
                                        description: 'On/off state of this light',
                                        label: 'State',
                                        name: 'state',
                                        property: 'state',
                                        type: 'binary',
                                        value_off: 'OFF',
                                        value_on: 'ON',
                                        value_toggle: 'TOGGLE',
                                    },
                                    {
                                        access: 7,
                                        description: 'Brightness of this light',
                                        label: 'Brightness',
                                        name: 'brightness',
                                        property: 'brightness',
                                        type: 'numeric',
                                        value_max: 254,
                                        value_min: 0,
                                    },
                                    {
                                        access: 7,
                                        description: 'Color temperature of this light',
                                        label: 'Color temp',
                                        name: 'color_temp',
                                        presets: [
                                            {description: 'Coolest temperature supported', name: 'coolest', value: 150},
                                            {description: 'Cool temperature (250 mireds / 4000 Kelvin)', name: 'cool', value: 250},
                                            {description: 'Neutral temperature (370 mireds / 2700 Kelvin)', name: 'neutral', value: 370},
                                            {description: 'Warm temperature (454 mireds / 2200 Kelvin)', name: 'warm', value: 454},
                                            {description: 'Warmest temperature supported', name: 'warmest', value: 500},
                                        ],
                                        property: 'color_temp',
                                        type: 'numeric',
                                        unit: 'mired',
                                        value_max: 500,
                                        value_min: 150,
                                    },
                                    {
                                        access: 7,
                                        description: 'Color temperature after cold power on of this light',
                                        label: 'Color temp startup',
                                        name: 'color_temp_startup',
                                        presets: [
                                            {description: 'Coolest temperature supported', name: 'coolest', value: 150},
                                            {description: 'Cool temperature (250 mireds / 4000 Kelvin)', name: 'cool', value: 250},
                                            {description: 'Neutral temperature (370 mireds / 2700 Kelvin)', name: 'neutral', value: 370},
                                            {description: 'Warm temperature (454 mireds / 2200 Kelvin)', name: 'warm', value: 454},
                                            {description: 'Warmest temperature supported', name: 'warmest', value: 500},
                                            {description: 'Restore previous color_temp on cold power on', name: 'previous', value: 65535},
                                        ],
                                        property: 'color_temp_startup',
                                        type: 'numeric',
                                        unit: 'mired',
                                        value_max: 500,
                                        value_min: 150,
                                    },
                                    {
                                        access: 7,
                                        description: 'Color of this light in the CIE 1931 color space (x/y)',
                                        features: [
                                            {access: 7, label: 'X', name: 'x', property: 'x', type: 'numeric'},
                                            {access: 7, label: 'Y', name: 'y', property: 'y', type: 'numeric'},
                                        ],
                                        label: 'Color (X/Y)',
                                        name: 'color_xy',
                                        property: 'color',
                                        type: 'composite',
                                    },
                                    {
                                        access: 7,
                                        description: 'Color of this light expressed as hue/saturation',
                                        features: [
                                            {access: 7, label: 'Hue', name: 'hue', property: 'hue', type: 'numeric'},
                                            {access: 7, label: 'Saturation', name: 'saturation', property: 'saturation', type: 'numeric'},
                                        ],
                                        label: 'Color (HS)',
                                        name: 'color_hs',
                                        property: 'color',
                                        type: 'composite',
                                    },
                                ],
                                type: 'light',
                            },
                            {
                                access: 7,
                                category: 'config',
                                description: 'Controls the behavior when the device is powered on after power loss',
                                label: 'Power-on behavior',
                                name: 'power_on_behavior',
                                property: 'power_on_behavior',
                                type: 'enum',
                                values: ['off', 'on', 'toggle', 'previous'],
                            },
                            {
                                access: 2,
                                label: 'Effect',
                                name: 'effect',
                                property: 'effect',
                                type: 'enum',
                                values: [
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
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Link quality (signal strength)',
                                label: 'Linkquality',
                                name: 'linkquality',
                                property: 'linkquality',
                                type: 'numeric',
                                unit: 'lqi',
                                value_max: 255,
                                value_min: 0,
                            },
                        ],
                        model: '7146060PH',
                        options: [
                            {
                                access: 2,
                                description:
                                    'Controls the transition time (in seconds) of on/off, brightness, color temperature (if applicable) and color (if applicable) changes. Defaults to `0` (no transition).',
                                label: 'Transition',
                                name: 'transition',
                                property: 'transition',
                                type: 'numeric',
                                value_min: 0,
                            },
                            {
                                access: 2,
                                description:
                                    'When enabled colors will be synced, e.g. if the light supports both color x/y and color temperature a conversion from color x/y to color temperature will be done when setting the x/y color (default true).',
                                label: 'Color sync',
                                name: 'color_sync',
                                property: 'color_sync',
                                type: 'binary',
                                value_off: false,
                                value_on: true,
                            },
                            {
                                access: 2,
                                description: "State actions will also be published as 'action' when true (default false).",
                                label: 'State action',
                                name: 'state_action',
                                property: 'state_action',
                                type: 'binary',
                                value_off: false,
                                value_on: true,
                            },
                        ],
                        supports_ota: true,
                        vendor: 'Philips',
                    },
                    disabled: false,
                    endpoints: {
                        1: {
                            bindings: [],
                            clusters: {
                                input: ['genBasic', 'genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl'],
                                output: ['genScenes', 'genOta'],
                            },
                            configured_reportings: [],
                            scenes: [{id: 1, name: 'Chill scene'}],
                        },
                    },
                    friendly_name: 'bulb_color_2',
                    ieee_address: '0x000b57fffec6a5b4',
                    interview_completed: true,
                    interviewing: false,
                    manufacturer: 'Philips',
                    model_id: 'LLC020',
                    network_address: 401292,
                    power_source: 'Mains (single phase)',
                    software_build_id: '5.127.1.26581',
                    supported: true,
                    type: 'Router',
                },
                {
                    date_code: null,
                    definition: {
                        description: 'Hue dimmer switch',
                        exposes: [
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Remaining battery in %, can take up to 24 hours before reported',
                                label: 'Battery',
                                name: 'battery',
                                property: 'battery',
                                type: 'numeric',
                                unit: '%',
                                value_max: 100,
                                value_min: 0,
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Triggered action duration in seconds',
                                label: 'Action duration',
                                name: 'action_duration',
                                property: 'action_duration',
                                type: 'numeric',
                                unit: 's',
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Triggered action (e.g. a button click)',
                                label: 'Action',
                                name: 'action',
                                property: 'action',
                                type: 'enum',
                                values: [
                                    'on_press',
                                    'on_press_release',
                                    'on_hold',
                                    'on_hold_release',
                                    'up_press',
                                    'up_press_release',
                                    'up_hold',
                                    'up_hold_release',
                                    'down_press',
                                    'down_press_release',
                                    'down_hold',
                                    'down_hold_release',
                                    'off_press',
                                    'off_press_release',
                                    'off_hold',
                                    'off_hold_release',
                                ],
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Link quality (signal strength)',
                                label: 'Linkquality',
                                name: 'linkquality',
                                property: 'linkquality',
                                type: 'numeric',
                                unit: 'lqi',
                                value_max: 255,
                                value_min: 0,
                            },
                        ],
                        model: '324131092621',
                        options: [
                            {
                                access: 2,
                                description:
                                    'Set to false to disable the legacy integration (highly recommended), will change structure of the published payload (default true).',
                                label: 'Legacy',
                                name: 'legacy',
                                property: 'legacy',
                                type: 'binary',
                                value_off: false,
                                value_on: true,
                            },
                            {
                                access: 2,
                                description:
                                    'Simulate a brightness value. If this device provides a brightness_move_up or brightness_move_down action it is possible to specify the update interval and delta. The action_brightness_delta indicates the delta for each interval. Only works when legacy is false.',
                                features: [
                                    {
                                        access: 2,
                                        description: 'Delta per interval, 20 by default',
                                        label: 'Delta',
                                        name: 'delta',
                                        property: 'delta',
                                        type: 'numeric',
                                        value_min: 0,
                                    },
                                    {
                                        access: 2,
                                        description: 'Interval duration',
                                        label: 'Interval',
                                        name: 'interval',
                                        property: 'interval',
                                        type: 'numeric',
                                        unit: 'ms',
                                        value_min: 0,
                                    },
                                ],
                                label: 'Simulated brightness',
                                name: 'simulated_brightness',
                                property: 'simulated_brightness',
                                type: 'composite',
                            },
                        ],
                        supports_ota: true,
                        vendor: 'Philips',
                    },
                    disabled: false,
                    endpoints: {
                        1: {
                            bindings: [
                                {cluster: 'genLevelCtrl', target: {endpoint: 1, ieee_address: '0x000b57fffec6a5b3', type: 'endpoint'}},
                                {cluster: 'genOnOff', target: {endpoint: 1, ieee_address: '0x000b57fffec6a5b3', type: 'endpoint'}},
                                {cluster: 'lightingColorCtrl', target: {endpoint: 1, ieee_address: '0x000b57fffec6a5b3', type: 'endpoint'}},
                                {cluster: 'genOnOff', target: {id: 1, type: 'group'}},
                                {cluster: 'genLevelCtrl', target: {id: 1, type: 'group'}},
                            ],
                            clusters: {input: ['genBasic'], output: ['genBasic', 'genOnOff', 'genLevelCtrl', 'genScenes']},
                            configured_reportings: [],
                            scenes: [],
                        },
                        2: {bindings: [], clusters: {input: ['genBasic'], output: ['genOta', 'genOnOff']}, configured_reportings: [], scenes: []},
                    },
                    friendly_name: 'remote',
                    ieee_address: '0x0017880104e45517',
                    interview_completed: true,
                    interviewing: false,
                    model_id: 'RWL021',
                    network_address: 6535,
                    power_source: 'Battery',
                    software_build_id: null,
                    supported: true,
                    type: 'EndDevice',
                },
                {
                    date_code: null,
                    definition: {
                        description: 'Automatically generated definition',
                        exposes: [
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Triggered action (e.g. a button click)',
                                label: 'Action',
                                name: 'action',
                                property: 'action',
                                type: 'enum',
                                values: [
                                    'on',
                                    'off',
                                    'toggle',
                                    'brightness_move_to_level',
                                    'brightness_move_up',
                                    'brightness_move_down',
                                    'brightness_step_up',
                                    'brightness_step_down',
                                    'brightness_stop',
                                ],
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Link quality (signal strength)',
                                label: 'Linkquality',
                                name: 'linkquality',
                                property: 'linkquality',
                                type: 'numeric',
                                unit: 'lqi',
                                value_max: 255,
                                value_min: 0,
                            },
                        ],
                        model: 'notSupportedModelID',
                        options: [
                            {
                                access: 2,
                                description:
                                    'Simulate a brightness value. If this device provides a brightness_move_up or brightness_move_down action it is possible to specify the update interval and delta. The action_brightness_delta indicates the delta for each interval. ',
                                features: [
                                    {
                                        access: 2,
                                        description: 'Delta per interval, 20 by default',
                                        label: 'Delta',
                                        name: 'delta',
                                        property: 'delta',
                                        type: 'numeric',
                                        value_min: 0,
                                    },
                                    {
                                        access: 2,
                                        description: 'Interval duration',
                                        label: 'Interval',
                                        name: 'interval',
                                        property: 'interval',
                                        type: 'numeric',
                                        unit: 'ms',
                                        value_min: 0,
                                    },
                                ],
                                label: 'Simulated brightness',
                                name: 'simulated_brightness',
                                property: 'simulated_brightness',
                                type: 'composite',
                            },
                        ],
                        supports_ota: false,
                        vendor: 'notSupportedMfg',
                    },
                    disabled: false,
                    endpoints: {
                        1: {
                            bindings: [],
                            clusters: {input: ['genBasic'], output: ['genBasic', 'genOnOff', 'genLevelCtrl', 'genScenes']},
                            configured_reportings: [],
                            scenes: [],
                        },
                    },
                    friendly_name: '0x0017880104e45518',
                    ieee_address: '0x0017880104e45518',
                    interview_completed: true,
                    interviewing: false,
                    manufacturer: 'notSupportedMfg',
                    model_id: 'notSupportedModelID',
                    network_address: 6536,
                    power_source: 'Battery',
                    software_build_id: null,
                    supported: false,
                    type: 'EndDevice',
                },
                {
                    date_code: null,
                    definition: {
                        description: 'Wireless mini switch',
                        exposes: [
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Remaining battery in %, can take up to 24 hours before reported',
                                label: 'Battery',
                                name: 'battery',
                                property: 'battery',
                                type: 'numeric',
                                unit: '%',
                                value_max: 100,
                                value_min: 0,
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Voltage of the battery in millivolts',
                                label: 'Voltage',
                                name: 'voltage',
                                property: 'voltage',
                                type: 'numeric',
                                unit: 'mV',
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Temperature of the device',
                                label: 'Device temperature',
                                name: 'device_temperature',
                                property: 'device_temperature',
                                type: 'numeric',
                                unit: '°C',
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Number of power outages (since last pairing)',
                                label: 'Power outage count',
                                name: 'power_outage_count',
                                property: 'power_outage_count',
                                type: 'numeric',
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Triggered action (e.g. a button click)',
                                label: 'Action',
                                name: 'action',
                                property: 'action',
                                type: 'enum',
                                values: ['single', 'double', 'triple', 'quadruple', 'hold', 'release'],
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Link quality (signal strength)',
                                label: 'Linkquality',
                                name: 'linkquality',
                                property: 'linkquality',
                                type: 'numeric',
                                unit: 'lqi',
                                value_max: 255,
                                value_min: 0,
                            },
                        ],
                        model: 'WXKG11LM',
                        options: [
                            {
                                access: 2,
                                description: 'Calibrates the device_temperature value (absolute offset), takes into effect on next report of device.',
                                label: 'Device temperature calibration',
                                name: 'device_temperature_calibration',
                                property: 'device_temperature_calibration',
                                type: 'numeric',
                            },
                            {
                                access: 2,
                                description:
                                    'Set to false to disable the legacy integration (highly recommended), will change structure of the published payload (default true).',
                                label: 'Legacy',
                                name: 'legacy',
                                property: 'legacy',
                                type: 'binary',
                                value_off: false,
                                value_on: true,
                            },
                        ],
                        supports_ota: false,
                        vendor: 'Aqara',
                    },
                    disabled: false,
                    endpoints: {
                        1: {
                            bindings: [],
                            clusters: {input: ['genBasic'], output: ['genBasic', 'genOnOff', 'genLevelCtrl', 'genScenes']},
                            configured_reportings: [
                                {
                                    attribute: 1337,
                                    cluster: 'genOnOff',
                                    maximum_report_interval: 10,
                                    minimum_report_interval: 1,
                                    reportable_change: 20,
                                },
                            ],
                            scenes: [],
                        },
                    },
                    friendly_name: 'button',
                    ieee_address: '0x0017880104e45520',
                    interview_completed: true,
                    interviewing: false,
                    model_id: 'lumi.sensor_switch.aq2',
                    network_address: 6537,
                    power_source: 'Battery',
                    software_build_id: null,
                    supported: true,
                    type: 'EndDevice',
                },
                {
                    date_code: null,
                    definition: {
                        description: 'Temperature and humidity sensor',
                        exposes: [
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Remaining battery in %, can take up to 24 hours before reported',
                                label: 'Battery',
                                name: 'battery',
                                property: 'battery',
                                type: 'numeric',
                                unit: '%',
                                value_max: 100,
                                value_min: 0,
                            },
                            {
                                access: 1,
                                description: 'Measured temperature value',
                                label: 'Temperature',
                                name: 'temperature',
                                property: 'temperature',
                                type: 'numeric',
                                unit: '°C',
                            },
                            {
                                access: 1,
                                description: 'Measured relative humidity',
                                label: 'Humidity',
                                name: 'humidity',
                                property: 'humidity',
                                type: 'numeric',
                                unit: '%',
                            },
                            {
                                access: 1,
                                description: 'The measured atmospheric pressure',
                                label: 'Pressure',
                                name: 'pressure',
                                property: 'pressure',
                                type: 'numeric',
                                unit: 'hPa',
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Voltage of the battery in millivolts',
                                label: 'Voltage',
                                name: 'voltage',
                                property: 'voltage',
                                type: 'numeric',
                                unit: 'mV',
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Link quality (signal strength)',
                                label: 'Linkquality',
                                name: 'linkquality',
                                property: 'linkquality',
                                type: 'numeric',
                                unit: 'lqi',
                                value_max: 255,
                                value_min: 0,
                            },
                        ],
                        model: 'WSDCGQ11LM',
                        options: [
                            {
                                access: 2,
                                description: 'Calibrates the temperature value (absolute offset), takes into effect on next report of device.',
                                label: 'Temperature calibration',
                                name: 'temperature_calibration',
                                property: 'temperature_calibration',
                                type: 'numeric',
                            },
                            {
                                access: 2,
                                description:
                                    'Number of digits after decimal point for temperature, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
                                label: 'Temperature precision',
                                name: 'temperature_precision',
                                property: 'temperature_precision',
                                type: 'numeric',
                                value_max: 3,
                                value_min: 0,
                            },
                            {
                                access: 2,
                                description: 'Calibrates the humidity value (absolute offset), takes into effect on next report of device.',
                                label: 'Humidity calibration',
                                name: 'humidity_calibration',
                                property: 'humidity_calibration',
                                type: 'numeric',
                            },
                            {
                                access: 2,
                                description:
                                    'Number of digits after decimal point for humidity, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
                                label: 'Humidity precision',
                                name: 'humidity_precision',
                                property: 'humidity_precision',
                                type: 'numeric',
                                value_max: 3,
                                value_min: 0,
                            },
                            {
                                access: 2,
                                description: 'Calibrates the pressure value (absolute offset), takes into effect on next report of device.',
                                label: 'Pressure calibration',
                                name: 'pressure_calibration',
                                property: 'pressure_calibration',
                                type: 'numeric',
                            },
                            {
                                access: 2,
                                description:
                                    'Number of digits after decimal point for pressure, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
                                label: 'Pressure precision',
                                name: 'pressure_precision',
                                property: 'pressure_precision',
                                type: 'numeric',
                                value_max: 3,
                                value_min: 0,
                            },
                        ],
                        supports_ota: false,
                        vendor: 'Aqara',
                    },
                    disabled: false,
                    endpoints: {1: {bindings: [], clusters: {input: ['genBasic'], output: []}, configured_reportings: [], scenes: []}},
                    friendly_name: 'weather_sensor',
                    ieee_address: '0x0017880104e45522',
                    interview_completed: true,
                    interviewing: false,
                    model_id: 'lumi.weather',
                    network_address: 6539,
                    power_source: 'Battery',
                    software_build_id: null,
                    supported: true,
                    type: 'EndDevice',
                },
                {
                    date_code: null,
                    definition: {
                        description: 'Mi smart plug',
                        exposes: [
                            {
                                features: [
                                    {
                                        access: 7,
                                        description: 'On/off state of the switch',
                                        label: 'State',
                                        name: 'state',
                                        property: 'state',
                                        type: 'binary',
                                        value_off: 'OFF',
                                        value_on: 'ON',
                                        value_toggle: 'TOGGLE',
                                    },
                                ],
                                type: 'switch',
                            },
                            {
                                access: 5,
                                category: 'diagnostic',
                                description: 'Instantaneous measured power',
                                label: 'Power',
                                name: 'power',
                                property: 'power',
                                type: 'numeric',
                                unit: 'W',
                            },
                            {
                                access: 1,
                                description: 'Sum of consumed energy',
                                label: 'Energy',
                                name: 'energy',
                                property: 'energy',
                                type: 'numeric',
                                unit: 'kWh',
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Temperature of the device',
                                label: 'Device temperature',
                                name: 'device_temperature',
                                property: 'device_temperature',
                                type: 'numeric',
                                unit: '°C',
                            },
                            {
                                access: 7,
                                category: 'config',
                                description: 'Enable/disable the power outage memory, this recovers the on/off mode after power failure',
                                label: 'Power outage memory',
                                name: 'power_outage_memory',
                                property: 'power_outage_memory',
                                type: 'binary',
                                value_off: false,
                                value_on: true,
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Link quality (signal strength)',
                                label: 'Linkquality',
                                name: 'linkquality',
                                property: 'linkquality',
                                type: 'numeric',
                                unit: 'lqi',
                                value_max: 255,
                                value_min: 0,
                            },
                        ],
                        model: 'ZNCZ02LM',
                        options: [
                            {
                                access: 2,
                                description: 'Calibrates the power value (percentual offset), takes into effect on next report of device.',
                                label: 'Power calibration',
                                name: 'power_calibration',
                                property: 'power_calibration',
                                type: 'numeric',
                            },
                            {
                                access: 2,
                                description:
                                    'Number of digits after decimal point for power, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
                                label: 'Power precision',
                                name: 'power_precision',
                                property: 'power_precision',
                                type: 'numeric',
                                value_max: 3,
                                value_min: 0,
                            },
                            {
                                access: 2,
                                description: 'Calibrates the energy value (percentual offset), takes into effect on next report of device.',
                                label: 'Energy calibration',
                                name: 'energy_calibration',
                                property: 'energy_calibration',
                                type: 'numeric',
                            },
                            {
                                access: 2,
                                description:
                                    'Number of digits after decimal point for energy, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
                                label: 'Energy precision',
                                name: 'energy_precision',
                                property: 'energy_precision',
                                type: 'numeric',
                                value_max: 3,
                                value_min: 0,
                            },
                            {
                                access: 2,
                                description: 'Calibrates the device_temperature value (absolute offset), takes into effect on next report of device.',
                                label: 'Device temperature calibration',
                                name: 'device_temperature_calibration',
                                property: 'device_temperature_calibration',
                                type: 'numeric',
                            },
                            {
                                access: 2,
                                description: "State actions will also be published as 'action' when true (default false).",
                                label: 'State action',
                                name: 'state_action',
                                property: 'state_action',
                                type: 'binary',
                                value_off: false,
                                value_on: true,
                            },
                        ],
                        supports_ota: true,
                        vendor: 'Xiaomi',
                    },
                    disabled: false,
                    endpoints: {1: {bindings: [], clusters: {input: ['genBasic', 'genOnOff'], output: []}, configured_reportings: [], scenes: []}},
                    friendly_name: 'power_plug',
                    ieee_address: '0x0017880104e45524',
                    interview_completed: true,
                    interviewing: false,
                    model_id: 'lumi.plug',
                    network_address: 6540,
                    power_source: 'Mains (single phase)',
                    software_build_id: null,
                    supported: true,
                    type: 'Router',
                },
                {
                    date_code: null,
                    definition: {
                        description: 'zigfred plus smart in-wall switch',
                        exposes: [
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Triggered action (e.g. a button click)',
                                label: 'Action',
                                name: 'action',
                                property: 'action',
                                type: 'enum',
                                values: [
                                    'button_1_single',
                                    'button_1_double',
                                    'button_1_hold',
                                    'button_1_release',
                                    'button_2_single',
                                    'button_2_double',
                                    'button_2_hold',
                                    'button_2_release',
                                    'button_3_single',
                                    'button_3_double',
                                    'button_3_hold',
                                    'button_3_release',
                                    'button_4_single',
                                    'button_4_double',
                                    'button_4_hold',
                                    'button_4_release',
                                ],
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Link quality (signal strength)',
                                label: 'Linkquality',
                                name: 'linkquality',
                                property: 'linkquality',
                                type: 'numeric',
                                unit: 'lqi',
                                value_max: 255,
                                value_min: 0,
                            },
                            {
                                endpoint: 'l1',
                                features: [
                                    {
                                        access: 7,
                                        description: 'On/off state of this light',
                                        endpoint: 'l1',
                                        label: 'State',
                                        name: 'state',
                                        property: 'state_l1',
                                        type: 'binary',
                                        value_off: 'OFF',
                                        value_on: 'ON',
                                        value_toggle: 'TOGGLE',
                                    },
                                    {
                                        access: 7,
                                        description: 'Brightness of this light',
                                        endpoint: 'l1',
                                        label: 'Brightness',
                                        name: 'brightness',
                                        property: 'brightness_l1',
                                        type: 'numeric',
                                        value_max: 254,
                                        value_min: 0,
                                    },
                                    {
                                        access: 7,
                                        description: 'Color of this light in the CIE 1931 color space (x/y)',
                                        endpoint: 'l1',
                                        features: [
                                            {access: 7, label: 'X', name: 'x', property: 'x', type: 'numeric'},
                                            {access: 7, label: 'Y', name: 'y', property: 'y', type: 'numeric'},
                                        ],
                                        label: 'Color (X/Y)',
                                        name: 'color_xy',
                                        property: 'color_l1',
                                        type: 'composite',
                                    },
                                ],
                                type: 'light',
                            },
                            {
                                endpoint: 'l2',
                                features: [
                                    {
                                        access: 7,
                                        description: 'On/off state of this light',
                                        endpoint: 'l2',
                                        label: 'State',
                                        name: 'state',
                                        property: 'state_l2',
                                        type: 'binary',
                                        value_off: 'OFF',
                                        value_on: 'ON',
                                        value_toggle: 'TOGGLE',
                                    },
                                    {
                                        access: 7,
                                        description: 'Brightness of this light',
                                        endpoint: 'l2',
                                        label: 'Brightness',
                                        name: 'brightness',
                                        property: 'brightness_l2',
                                        type: 'numeric',
                                        value_max: 254,
                                        value_min: 0,
                                    },
                                ],
                                type: 'light',
                            },
                            {
                                endpoint: 'l3',
                                features: [
                                    {
                                        access: 7,
                                        description: 'On/off state of this light',
                                        endpoint: 'l3',
                                        label: 'State',
                                        name: 'state',
                                        property: 'state_l3',
                                        type: 'binary',
                                        value_off: 'OFF',
                                        value_on: 'ON',
                                        value_toggle: 'TOGGLE',
                                    },
                                    {
                                        access: 7,
                                        description: 'Brightness of this light',
                                        endpoint: 'l3',
                                        label: 'Brightness',
                                        name: 'brightness',
                                        property: 'brightness_l3',
                                        type: 'numeric',
                                        value_max: 254,
                                        value_min: 0,
                                    },
                                ],
                                type: 'light',
                            },
                            {
                                endpoint: 'l4',
                                features: [
                                    {
                                        access: 7,
                                        description: 'On/off state of this light',
                                        endpoint: 'l4',
                                        label: 'State',
                                        name: 'state',
                                        property: 'state_l4',
                                        type: 'binary',
                                        value_off: 'OFF',
                                        value_on: 'ON',
                                        value_toggle: 'TOGGLE',
                                    },
                                    {
                                        access: 7,
                                        description: 'Brightness of this light',
                                        endpoint: 'l4',
                                        label: 'Brightness',
                                        name: 'brightness',
                                        property: 'brightness_l4',
                                        type: 'numeric',
                                        value_max: 254,
                                        value_min: 0,
                                    },
                                ],
                                type: 'light',
                            },
                            {
                                endpoint: 'l5',
                                features: [
                                    {
                                        access: 7,
                                        description: 'On/off state of this light',
                                        endpoint: 'l5',
                                        label: 'State',
                                        name: 'state',
                                        property: 'state_l5',
                                        type: 'binary',
                                        value_off: 'OFF',
                                        value_on: 'ON',
                                        value_toggle: 'TOGGLE',
                                    },
                                    {
                                        access: 7,
                                        description: 'Brightness of this light',
                                        endpoint: 'l5',
                                        label: 'Brightness',
                                        name: 'brightness',
                                        property: 'brightness_l5',
                                        type: 'numeric',
                                        value_max: 254,
                                        value_min: 0,
                                    },
                                ],
                                type: 'light',
                            },
                            {
                                endpoint: 'l6',
                                features: [
                                    {
                                        access: 7,
                                        endpoint: 'l6',
                                        label: 'State',
                                        name: 'state',
                                        property: 'state_l6',
                                        type: 'enum',
                                        values: ['OPEN', 'CLOSE', 'STOP'],
                                    },
                                    {
                                        access: 7,
                                        description: 'Position of this cover',
                                        endpoint: 'l6',
                                        label: 'Position',
                                        name: 'position',
                                        property: 'position_l6',
                                        type: 'numeric',
                                        unit: '%',
                                        value_max: 100,
                                        value_min: 0,
                                    },
                                    {
                                        access: 7,
                                        description: 'Tilt of this cover',
                                        endpoint: 'l6',
                                        label: 'Tilt',
                                        name: 'tilt',
                                        property: 'tilt_l6',
                                        type: 'numeric',
                                        unit: '%',
                                        value_max: 100,
                                        value_min: 0,
                                    },
                                ],
                                type: 'cover',
                            },
                            {
                                endpoint: 'l7',
                                features: [
                                    {
                                        access: 7,
                                        endpoint: 'l7',
                                        label: 'State',
                                        name: 'state',
                                        property: 'state_l7',
                                        type: 'enum',
                                        values: ['OPEN', 'CLOSE', 'STOP'],
                                    },
                                    {
                                        access: 7,
                                        description: 'Position of this cover',
                                        endpoint: 'l7',
                                        label: 'Position',
                                        name: 'position',
                                        property: 'position_l7',
                                        type: 'numeric',
                                        unit: '%',
                                        value_max: 100,
                                        value_min: 0,
                                    },
                                    {
                                        access: 7,
                                        description: 'Tilt of this cover',
                                        endpoint: 'l7',
                                        label: 'Tilt',
                                        name: 'tilt',
                                        property: 'tilt_l7',
                                        type: 'numeric',
                                        unit: '%',
                                        value_max: 100,
                                        value_min: 0,
                                    },
                                ],
                                type: 'cover',
                            },
                        ],
                        model: 'ZFP-1A-CH',
                        options: [
                            {
                                access: 2,
                                description: 'Front Surface LED enabled',
                                label: 'Front surface enabled',
                                name: 'front_surface_enabled',
                                property: 'front_surface_enabled',
                                type: 'enum',
                                values: ['auto', 'true', 'false'],
                            },
                            {
                                access: 2,
                                description: 'Dimmer 1 enabled',
                                label: 'Dimmer 1 enabled',
                                name: 'dimmer_1_enabled',
                                property: 'dimmer_1_enabled',
                                type: 'enum',
                                values: ['auto', 'true', 'false'],
                            },
                            {
                                access: 2,
                                description: 'Dimmer 1 dimmable',
                                label: 'Dimmer 1 dimming enabled',
                                name: 'dimmer_1_dimming_enabled',
                                property: 'dimmer_1_dimming_enabled',
                                type: 'enum',
                                values: ['auto', 'true', 'false'],
                            },
                            {
                                access: 2,
                                description: 'Dimmer 2 enabled',
                                label: 'Dimmer 2 enabled',
                                name: 'dimmer_2_enabled',
                                property: 'dimmer_2_enabled',
                                type: 'enum',
                                values: ['auto', 'true', 'false'],
                            },
                            {
                                access: 2,
                                description: 'Dimmer 2 dimmable',
                                label: 'Dimmer 2 dimming enabled',
                                name: 'dimmer_2_dimming_enabled',
                                property: 'dimmer_2_dimming_enabled',
                                type: 'enum',
                                values: ['auto', 'true', 'false'],
                            },
                            {
                                access: 2,
                                description: 'Dimmer 3 enabled',
                                label: 'Dimmer 3 enabled',
                                name: 'dimmer_3_enabled',
                                property: 'dimmer_3_enabled',
                                type: 'enum',
                                values: ['auto', 'true', 'false'],
                            },
                            {
                                access: 2,
                                description: 'Dimmer 3 dimmable',
                                label: 'Dimmer 3 dimming enabled',
                                name: 'dimmer_3_dimming_enabled',
                                property: 'dimmer_3_dimming_enabled',
                                type: 'enum',
                                values: ['auto', 'true', 'false'],
                            },
                            {
                                access: 2,
                                description: 'Dimmer 4 enabled',
                                label: 'Dimmer 4 enabled',
                                name: 'dimmer_4_enabled',
                                property: 'dimmer_4_enabled',
                                type: 'enum',
                                values: ['auto', 'true', 'false'],
                            },
                            {
                                access: 2,
                                description: 'Dimmer 4 dimmable',
                                label: 'Dimmer 4 dimming enabled',
                                name: 'dimmer_4_dimming_enabled',
                                property: 'dimmer_4_dimming_enabled',
                                type: 'enum',
                                values: ['auto', 'true', 'false'],
                            },
                            {
                                access: 2,
                                description: 'Cover 1 enabled',
                                label: 'Cover 1 enabled',
                                name: 'cover_1_enabled',
                                property: 'cover_1_enabled',
                                type: 'enum',
                                values: ['auto', 'true', 'false'],
                            },
                            {
                                access: 2,
                                description: 'Cover 1 tiltable',
                                label: 'Cover 1 tilt enabled',
                                name: 'cover_1_tilt_enabled',
                                property: 'cover_1_tilt_enabled',
                                type: 'enum',
                                values: ['auto', 'true', 'false'],
                            },
                            {
                                access: 2,
                                description: 'Cover 2 enabled',
                                label: 'Cover 2 enabled',
                                name: 'cover_2_enabled',
                                property: 'cover_2_enabled',
                                type: 'enum',
                                values: ['auto', 'true', 'false'],
                            },
                            {
                                access: 2,
                                description: 'Cover 2 tiltable',
                                label: 'Cover 2 tilt enabled',
                                name: 'cover_2_tilt_enabled',
                                property: 'cover_2_tilt_enabled',
                                type: 'enum',
                                values: ['auto', 'true', 'false'],
                            },
                            {
                                access: 2,
                                description:
                                    'When enabled colors will be synced, e.g. if the light supports both color x/y and color temperature a conversion from color x/y to color temperature will be done when setting the x/y color (default true).',
                                label: 'Color sync',
                                name: 'color_sync',
                                property: 'color_sync',
                                type: 'binary',
                                value_off: false,
                                value_on: true,
                            },
                            {
                                access: 2,
                                description:
                                    'Controls the transition time (in seconds) of on/off, brightness, color temperature (if applicable) and color (if applicable) changes. Defaults to `0` (no transition).',
                                label: 'Transition',
                                name: 'transition',
                                property: 'transition',
                                type: 'numeric',
                                value_min: 0,
                            },
                            {
                                access: 2,
                                description: "State actions will also be published as 'action' when true (default false).",
                                label: 'State action',
                                name: 'state_action',
                                property: 'state_action',
                                type: 'binary',
                                value_off: false,
                                value_on: true,
                            },
                            {
                                access: 2,
                                description: 'Inverts the cover position, false: open=100,close=0, true: open=0,close=100 (default false).',
                                label: 'Invert cover',
                                name: 'invert_cover',
                                property: 'invert_cover',
                                type: 'binary',
                                value_off: false,
                                value_on: true,
                            },
                        ],
                        supports_ota: false,
                        vendor: 'Siglis',
                    },
                    disabled: false,
                    endpoints: {
                        10: {
                            bindings: [],
                            clusters: {input: ['genBasic', 'genScenes', 'genOnOff', 'genLevelCtrl'], output: []},
                            configured_reportings: [],
                            scenes: [],
                        },
                        11: {
                            bindings: [],
                            clusters: {input: ['genBasic', 'genScenes', 'closuresWindowCovering'], output: []},
                            configured_reportings: [],
                            scenes: [],
                        },
                        12: {
                            bindings: [],
                            clusters: {input: ['genBasic', 'genScenes', 'closuresWindowCovering'], output: []},
                            configured_reportings: [],
                            scenes: [],
                        },
                        5: {
                            bindings: [],
                            clusters: {input: ['genBasic', 'genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl'], output: []},
                            configured_reportings: [],
                            scenes: [],
                        },
                        7: {
                            bindings: [],
                            clusters: {input: ['genBasic', 'genScenes', 'genOnOff', 'genLevelCtrl'], output: []},
                            configured_reportings: [],
                            scenes: [],
                        },
                        8: {
                            bindings: [],
                            clusters: {input: ['genBasic', 'genScenes', 'genOnOff', 'genLevelCtrl'], output: []},
                            configured_reportings: [],
                            scenes: [],
                        },
                        9: {
                            bindings: [],
                            clusters: {input: ['genBasic', 'genScenes', 'genOnOff', 'genLevelCtrl'], output: []},
                            configured_reportings: [],
                            scenes: [],
                        },
                    },
                    friendly_name: 'zigfred_plus',
                    ieee_address: '0xf4ce368a38be56a1',
                    interview_completed: true,
                    interviewing: false,
                    manufacturer: 'Siglis',
                    model_id: 'zigfred plus',
                    network_address: 6589,
                    power_source: 'Mains (single phase)',
                    software_build_id: null,
                    supported: true,
                    type: 'Router',
                },
                {
                    date_code: null,
                    definition: {
                        description: 'TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm',
                        exposes: [
                            {
                                features: [
                                    {
                                        access: 7,
                                        description: 'On/off state of this light',
                                        label: 'State',
                                        name: 'state',
                                        property: 'state',
                                        type: 'binary',
                                        value_off: 'OFF',
                                        value_on: 'ON',
                                        value_toggle: 'TOGGLE',
                                    },
                                    {
                                        access: 7,
                                        description: 'Brightness of this light',
                                        label: 'Brightness',
                                        name: 'brightness',
                                        property: 'brightness',
                                        type: 'numeric',
                                        value_max: 254,
                                        value_min: 0,
                                    },
                                    {
                                        access: 7,
                                        description: 'Color temperature of this light',
                                        label: 'Color temp',
                                        name: 'color_temp',
                                        presets: [
                                            {description: 'Coolest temperature supported', name: 'coolest', value: 250},
                                            {description: 'Cool temperature (250 mireds / 4000 Kelvin)', name: 'cool', value: 250},
                                            {description: 'Neutral temperature (370 mireds / 2700 Kelvin)', name: 'neutral', value: 370},
                                            {description: 'Warm temperature (454 mireds / 2200 Kelvin)', name: 'warm', value: 454},
                                            {description: 'Warmest temperature supported', name: 'warmest', value: 454},
                                        ],
                                        property: 'color_temp',
                                        type: 'numeric',
                                        unit: 'mired',
                                        value_max: 454,
                                        value_min: 250,
                                    },
                                    {
                                        access: 7,
                                        description: 'Color temperature after cold power on of this light',
                                        label: 'Color temp startup',
                                        name: 'color_temp_startup',
                                        presets: [
                                            {description: 'Coolest temperature supported', name: 'coolest', value: 250},
                                            {description: 'Cool temperature (250 mireds / 4000 Kelvin)', name: 'cool', value: 250},
                                            {description: 'Neutral temperature (370 mireds / 2700 Kelvin)', name: 'neutral', value: 370},
                                            {description: 'Warm temperature (454 mireds / 2200 Kelvin)', name: 'warm', value: 454},
                                            {description: 'Warmest temperature supported', name: 'warmest', value: 454},
                                            {description: 'Restore previous color_temp on cold power on', name: 'previous', value: 65535},
                                        ],
                                        property: 'color_temp_startup',
                                        type: 'numeric',
                                        unit: 'mired',
                                        value_max: 454,
                                        value_min: 250,
                                    },
                                    {
                                        access: 7,
                                        description: 'Configure genLevelCtrl',
                                        features: [
                                            {
                                                access: 7,
                                                description:
                                                    'this setting can affect the "on_level", "current_level_startup" or "brightness" setting',
                                                label: 'Execute if off',
                                                name: 'execute_if_off',
                                                property: 'execute_if_off',
                                                type: 'binary',
                                                value_off: false,
                                                value_on: true,
                                            },
                                            {
                                                access: 7,
                                                description: 'Defines the desired startup level for a device when it is supplied with power',
                                                label: 'Current level startup',
                                                name: 'current_level_startup',
                                                presets: [
                                                    {description: 'Use minimum permitted value', name: 'minimum', value: 0},
                                                    {description: 'Use previous value', name: 'previous', value: 255},
                                                ],
                                                property: 'current_level_startup',
                                                type: 'numeric',
                                                value_max: 254,
                                                value_min: 1,
                                            },
                                        ],
                                        label: 'Level config',
                                        name: 'level_config',
                                        property: 'level_config',
                                        type: 'composite',
                                    },
                                ],
                                type: 'light',
                            },
                            {
                                access: 2,
                                description: 'Triggers an effect on the light (e.g. make light blink for a few seconds)',
                                label: 'Effect',
                                name: 'effect',
                                property: 'effect',
                                type: 'enum',
                                values: ['blink', 'breathe', 'okay', 'channel_change', 'finish_effect', 'stop_effect'],
                            },
                            {
                                access: 7,
                                category: 'config',
                                description: 'Controls the behavior when the device is powered on after power loss',
                                label: 'Power-on behavior',
                                name: 'power_on_behavior',
                                property: 'power_on_behavior',
                                type: 'enum',
                                values: ['off', 'on', 'toggle', 'previous'],
                            },
                            {
                                access: 7,
                                category: 'config',
                                description: 'Advanced color behavior',
                                features: [
                                    {
                                        access: 2,
                                        description: 'Controls whether color and color temperature can be set while light is off',
                                        label: 'Execute if off',
                                        name: 'execute_if_off',
                                        property: 'execute_if_off',
                                        type: 'binary',
                                        value_off: false,
                                        value_on: true,
                                    },
                                ],
                                label: 'Color options',
                                name: 'color_options',
                                property: 'color_options',
                                type: 'composite',
                            },
                            {
                                access: 2,
                                category: 'config',
                                description: 'Initiate device identification',
                                label: 'Identify',
                                name: 'identify',
                                property: 'identify',
                                type: 'enum',
                                values: ['identify'],
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Link quality (signal strength)',
                                label: 'Linkquality',
                                name: 'linkquality',
                                property: 'linkquality',
                                type: 'numeric',
                                unit: 'lqi',
                                value_max: 255,
                                value_min: 0,
                            },
                        ],
                        model: 'LED1545G12',
                        options: [
                            {
                                access: 2,
                                description:
                                    'Controls the transition time (in seconds) of on/off, brightness, color temperature (if applicable) and color (if applicable) changes. Defaults to `0` (no transition).',
                                label: 'Transition',
                                name: 'transition',
                                property: 'transition',
                                type: 'numeric',
                                value_min: 0,
                            },
                            {
                                access: 2,
                                description:
                                    'When enabled colors will be synced, e.g. if the light supports both color x/y and color temperature a conversion from color x/y to color temperature will be done when setting the x/y color (default true).',
                                label: 'Color sync',
                                name: 'color_sync',
                                property: 'color_sync',
                                type: 'binary',
                                value_off: false,
                                value_on: true,
                            },
                            {
                                access: 2,
                                description:
                                    'Sets the duration of the identification procedure in seconds (i.e., how long the device would flash).The value ranges from 1 to 30 seconds (default: 3).',
                                label: 'Identify timeout',
                                name: 'identify_timeout',
                                property: 'identify_timeout',
                                type: 'numeric',
                                value_max: 30,
                                value_min: 1,
                            },
                            {
                                access: 2,
                                description: "State actions will also be published as 'action' when true (default false).",
                                label: 'State action',
                                name: 'state_action',
                                property: 'state_action',
                                type: 'binary',
                                value_off: false,
                                value_on: true,
                            },
                        ],
                        supports_ota: true,
                        vendor: 'IKEA',
                    },
                    disabled: false,
                    endpoints: {
                        1: {
                            bindings: [],
                            clusters: {
                                input: ['genBasic', 'genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl'],
                                output: ['genScenes', 'genOta'],
                            },
                            configured_reportings: [],
                            scenes: [],
                        },
                    },
                    friendly_name: '0x000b57fffec6a5c2',
                    ieee_address: '0x000b57fffec6a5c2',
                    interview_completed: true,
                    interviewing: false,
                    manufacturer: null,
                    model_id: 'TRADFRI bulb E27 WS opal 980lm',
                    network_address: 40369,
                    power_source: 'Mains (single phase)',
                    software_build_id: null,
                    supported: true,
                    type: 'Router',
                },
            ]),
            {retain: true, qos: 0},
            expect.any(Function),
        );
    });

    it('Should publish definitions on startup', async () => {
        await resetExtension();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/definitions',
            expect.stringContaining(stringify(zigbeeHerdsman.custom_clusters)),
            {retain: true, qos: 0},
            expect.any(Function),
        );
    });

    it('Should log to MQTT', async () => {
        logger.setTransportsEnabled(true);
        MQTT.publish.mockClear();
        logger.info.mockClear();
        logger.info('this is a test');
        logger.info('this is a test'); // Should not publish dupes
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/logging',
            stringify({message: 'this is a test', level: 'info', namespace: 'z2m'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledTimes(1);

        // Should not publish debug logging
        MQTT.publish.mockClear();
        logger.debug('this is a test');
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Should log to MQTT including debug when enabled', async () => {
        settings.set(['advanced', 'log_debug_to_mqtt_frontend'], true);
        await resetExtension();

        logger.setTransportsEnabled(true);
        MQTT.publish.mockClear();
        logger.info.mockClear();
        logger.info('this is a test');
        logger.info('this is a test'); // Should not publish dupes
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/logging',
            stringify({message: 'this is a test', level: 'info', namespace: 'z2m'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledTimes(1);

        // Should publish debug logging
        MQTT.publish.mockClear();
        logger.debug('this is a test');
        expect(MQTT.publish).toHaveBeenCalledTimes(1);

        settings.set(['advanced', 'log_debug_to_mqtt_frontend'], false);
        settings.reRead();
    });

    it('Shouldnt log to MQTT when not connected', async () => {
        logger.setTransportsEnabled(true);
        MQTT.mock.reconnecting = true;
        MQTT.publish.mockClear();
        logger.info.mockClear();
        logger.error.mockClear();
        logger.info('this is a test');
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledTimes(0);
    });

    it('Should publish groups on startup', async () => {
        await resetExtension();
        logger.setTransportsEnabled(true);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/groups',
            stringify([
                {friendly_name: 'group_1', id: 1, members: [], scenes: []},
                {friendly_name: 'group_tradfri_remote', id: 15071, members: [{endpoint: 1, ieee_address: '0x000b57fffec6a5b4'}], scenes: []},
                {friendly_name: '99', id: 99, members: [], scenes: []},
                {friendly_name: 'group_with_tradfri', id: 11, members: [], scenes: []},
                {friendly_name: 'thermostat_group', id: 12, members: [], scenes: []},
                {friendly_name: 'switch_group', id: 14, members: [{endpoint: 1, ieee_address: '0x0017880104e45524'}], scenes: []},
                {friendly_name: 'gledopto_group', id: 21, members: [], scenes: []},
                {friendly_name: 'default_bind_group', id: 901, members: [], scenes: []},
                {
                    friendly_name: 'ha_discovery_group',
                    id: 9,
                    members: [
                        {endpoint: 1, ieee_address: '0x000b57fffec6a5b4'},
                        {endpoint: 2, ieee_address: '0x0017880104e45542'},
                    ],
                    scenes: [{id: 4, name: 'Scene 4'}],
                },
                {friendly_name: 'group_2', id: 2, members: [], scenes: []},
            ]),
            {retain: true, qos: 0},
            expect.any(Function),
        );
    });

    it('Should publish event when device joined', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceJoined({device: zigbeeHerdsman.devices.bulb});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
            stringify({type: 'device_joined', data: {friendly_name: 'bulb', ieee_address: '0x000b57fffec6a5b2'}}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should publish devices when device joined', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceNetworkAddressChanged({device: zigbeeHerdsman.devices.bulb});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
    });

    it('Should publish event when device announces', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceAnnounce({device: zigbeeHerdsman.devices.bulb});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
            stringify({type: 'device_announce', data: {friendly_name: 'bulb', ieee_address: '0x000b57fffec6a5b2'}}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should publish event when device interview started', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceInterview({device: zigbeeHerdsman.devices.bulb, status: 'started'});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
            stringify({type: 'device_interview', data: {friendly_name: 'bulb', status: 'started', ieee_address: '0x000b57fffec6a5b2'}}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should publish event and devices when device interview failed', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceInterview({device: zigbeeHerdsman.devices.bulb, status: 'failed'});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
            stringify({type: 'device_interview', data: {friendly_name: 'bulb', status: 'failed', ieee_address: '0x000b57fffec6a5b2'}}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
    });

    it('Should publish event and devices when device interview successful', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceInterview({device: zigbeeHerdsman.devices.bulb, status: 'successful'});
        await zigbeeHerdsman.events.deviceInterview({device: zigbeeHerdsman.devices.unsupported, status: 'successful'});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(7);
        // console.log(MQTT.publish.mock.calls.filter((c) => c[0] === 'zigbee2mqtt/bridge/event'));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
            stringify({
                data: {
                    definition: {
                        description: 'TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm',
                        exposes: [
                            {
                                features: [
                                    {
                                        access: 7,
                                        description: 'On/off state of this light',
                                        label: 'State',
                                        name: 'state',
                                        property: 'state',
                                        type: 'binary',
                                        value_off: 'OFF',
                                        value_on: 'ON',
                                        value_toggle: 'TOGGLE',
                                    },
                                    {
                                        access: 7,
                                        description: 'Brightness of this light',
                                        label: 'Brightness',
                                        name: 'brightness',
                                        property: 'brightness',
                                        type: 'numeric',
                                        value_max: 254,
                                        value_min: 0,
                                    },
                                    {
                                        access: 7,
                                        description: 'Color temperature of this light',
                                        label: 'Color temp',
                                        name: 'color_temp',
                                        presets: [
                                            {description: 'Coolest temperature supported', name: 'coolest', value: 250},
                                            {description: 'Cool temperature (250 mireds / 4000 Kelvin)', name: 'cool', value: 250},
                                            {description: 'Neutral temperature (370 mireds / 2700 Kelvin)', name: 'neutral', value: 370},
                                            {description: 'Warm temperature (454 mireds / 2200 Kelvin)', name: 'warm', value: 454},
                                            {description: 'Warmest temperature supported', name: 'warmest', value: 454},
                                        ],
                                        property: 'color_temp',
                                        type: 'numeric',
                                        unit: 'mired',
                                        value_max: 454,
                                        value_min: 250,
                                    },
                                    {
                                        access: 7,
                                        description: 'Color temperature after cold power on of this light',
                                        label: 'Color temp startup',
                                        name: 'color_temp_startup',
                                        presets: [
                                            {description: 'Coolest temperature supported', name: 'coolest', value: 250},
                                            {description: 'Cool temperature (250 mireds / 4000 Kelvin)', name: 'cool', value: 250},
                                            {description: 'Neutral temperature (370 mireds / 2700 Kelvin)', name: 'neutral', value: 370},
                                            {description: 'Warm temperature (454 mireds / 2200 Kelvin)', name: 'warm', value: 454},
                                            {description: 'Warmest temperature supported', name: 'warmest', value: 454},
                                            {description: 'Restore previous color_temp on cold power on', name: 'previous', value: 65535},
                                        ],
                                        property: 'color_temp_startup',
                                        type: 'numeric',
                                        unit: 'mired',
                                        value_max: 454,
                                        value_min: 250,
                                    },
                                    {
                                        access: 7,
                                        description: 'Configure genLevelCtrl',
                                        features: [
                                            {
                                                access: 7,
                                                description: `this setting can affect the "on_level", "current_level_startup" or "brightness" setting`,
                                                label: 'Execute if off',
                                                name: 'execute_if_off',
                                                property: 'execute_if_off',
                                                type: 'binary',
                                                value_off: false,
                                                value_on: true,
                                            },
                                            {
                                                access: 7,
                                                description: 'Defines the desired startup level for a device when it is supplied with power',
                                                label: 'Current level startup',
                                                name: 'current_level_startup',
                                                presets: [
                                                    {description: 'Use minimum permitted value', name: 'minimum', value: 0},
                                                    {description: 'Use previous value', name: 'previous', value: 255},
                                                ],
                                                property: 'current_level_startup',
                                                type: 'numeric',
                                                value_max: 254,
                                                value_min: 1,
                                            },
                                        ],
                                        label: 'Level config',
                                        name: 'level_config',
                                        property: 'level_config',
                                        type: 'composite',
                                    },
                                ],
                                type: 'light',
                            },
                            {
                                access: 2,
                                description: 'Triggers an effect on the light (e.g. make light blink for a few seconds)',
                                label: 'Effect',
                                name: 'effect',
                                property: 'effect',
                                type: 'enum',
                                values: ['blink', 'breathe', 'okay', 'channel_change', 'finish_effect', 'stop_effect'],
                            },
                            {
                                access: 7,
                                category: 'config',
                                description: 'Controls the behavior when the device is powered on after power loss',
                                label: 'Power-on behavior',
                                name: 'power_on_behavior',
                                property: 'power_on_behavior',
                                type: 'enum',
                                values: ['off', 'on', 'toggle', 'previous'],
                            },
                            {
                                access: 7,
                                category: 'config',
                                description: 'Advanced color behavior',
                                features: [
                                    {
                                        access: 2,
                                        description: 'Controls whether color and color temperature can be set while light is off',
                                        label: 'Execute if off',
                                        name: 'execute_if_off',
                                        property: 'execute_if_off',
                                        type: 'binary',
                                        value_off: false,
                                        value_on: true,
                                    },
                                ],
                                label: 'Color options',
                                name: 'color_options',
                                property: 'color_options',
                                type: 'composite',
                            },
                            {
                                access: 2,
                                category: 'config',
                                description: 'Initiate device identification',
                                label: 'Identify',
                                name: 'identify',
                                property: 'identify',
                                type: 'enum',
                                values: ['identify'],
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Link quality (signal strength)',
                                label: 'Linkquality',
                                name: 'linkquality',
                                property: 'linkquality',
                                type: 'numeric',
                                unit: 'lqi',
                                value_max: 255,
                                value_min: 0,
                            },
                        ],
                        model: 'LED1545G12',
                        options: [
                            {
                                access: 2,
                                description:
                                    'Controls the transition time (in seconds) of on/off, brightness, color temperature (if applicable) and color (if applicable) changes. Defaults to `0` (no transition).',
                                label: 'Transition',
                                name: 'transition',
                                property: 'transition',
                                type: 'numeric',
                                value_min: 0,
                            },
                            {
                                access: 2,
                                description:
                                    'When enabled colors will be synced, e.g. if the light supports both color x/y and color temperature a conversion from color x/y to color temperature will be done when setting the x/y color (default true).',
                                label: 'Color sync',
                                name: 'color_sync',
                                property: 'color_sync',
                                type: 'binary',
                                value_off: false,
                                value_on: true,
                            },
                            {
                                access: 2,
                                description:
                                    'Sets the duration of the identification procedure in seconds (i.e., how long the device would flash).The value ranges from 1 to 30 seconds (default: 3).',
                                label: 'Identify timeout',
                                name: 'identify_timeout',
                                property: 'identify_timeout',
                                type: 'numeric',
                                value_max: 30,
                                value_min: 1,
                            },
                            {
                                access: 2,
                                description: "State actions will also be published as 'action' when true (default false).",
                                label: 'State action',
                                name: 'state_action',
                                property: 'state_action',
                                type: 'binary',
                                value_off: false,
                                value_on: true,
                            },
                        ],
                        supports_ota: true,
                        vendor: 'IKEA',
                    },
                    friendly_name: 'bulb',
                    ieee_address: '0x000b57fffec6a5b2',
                    status: 'successful',
                    supported: true,
                },
                type: 'device_interview',
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
            stringify({
                data: {
                    definition: {
                        description: 'Automatically generated definition',
                        exposes: [
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Triggered action (e.g. a button click)',
                                label: 'Action',
                                name: 'action',
                                property: 'action',
                                type: 'enum',
                                values: [
                                    'on',
                                    'off',
                                    'toggle',
                                    'brightness_move_to_level',
                                    'brightness_move_up',
                                    'brightness_move_down',
                                    'brightness_step_up',
                                    'brightness_step_down',
                                    'brightness_stop',
                                ],
                            },
                            {
                                access: 1,
                                category: 'diagnostic',
                                description: 'Link quality (signal strength)',
                                label: 'Linkquality',
                                name: 'linkquality',
                                property: 'linkquality',
                                type: 'numeric',
                                unit: 'lqi',
                                value_max: 255,
                                value_min: 0,
                            },
                        ],
                        model: 'notSupportedModelID',
                        options: [
                            {
                                access: 2,
                                description:
                                    'Simulate a brightness value. If this device provides a brightness_move_up or brightness_move_down action it is possible to specify the update interval and delta. The action_brightness_delta indicates the delta for each interval. ',
                                features: [
                                    {
                                        access: 2,
                                        description: 'Delta per interval, 20 by default',
                                        label: 'Delta',
                                        name: 'delta',
                                        property: 'delta',
                                        type: 'numeric',
                                        value_min: 0,
                                    },
                                    {
                                        access: 2,
                                        description: 'Interval duration',
                                        label: 'Interval',
                                        name: 'interval',
                                        property: 'interval',
                                        type: 'numeric',
                                        unit: 'ms',
                                        value_min: 0,
                                    },
                                ],
                                label: 'Simulated brightness',
                                name: 'simulated_brightness',
                                property: 'simulated_brightness',
                                type: 'composite',
                            },
                        ],
                        supports_ota: false,
                        vendor: 'notSupportedMfg',
                    },
                    friendly_name: '0x0017880104e45518',
                    ieee_address: '0x0017880104e45518',
                    status: 'successful',
                    supported: false,
                },
                type: 'device_interview',
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/definitions', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
    });

    it('Should publish event and devices when device leaves', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceLeave({ieeeAddr: zigbeeHerdsman.devices.bulb.ieeeAddr});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(3);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
            stringify({type: 'device_leave', data: {ieee_address: '0x000b57fffec6a5b2', friendly_name: 'bulb'}}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            // Defintitions should be updated on device event
            'zigbee2mqtt/bridge/definitions',
            expect.any(String),
            {retain: true, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow permit join', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', 'true');
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(true, undefined, undefined);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({data: {value: true}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({value: false}));
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(false, undefined, undefined);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({data: {value: false}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({value: 'False'}));
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(false, undefined, undefined);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({data: {value: false}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        // Invalid payload
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({value_bla: false}));
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({data: {}, status: 'error', error: 'Invalid payload'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow permit join for certain time', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({value: false, time: 10}));
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(false, undefined, 10);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({data: {value: false, time: 10}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should republish bridge info when permit join changes', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.permitJoinChanged({permitted: false, timeout: 10});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
    });

    it('Shouldnt republish bridge info when permit join changes and hersman is stopping', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.isStopping.mockImplementationOnce(() => true);
        await zigbeeHerdsman.events.permitJoinChanged({permitted: false, timeout: 10});
        await flushPromises();
        expect(MQTT.publish).not.toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
    });

    it('Should allow permit join via device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({value: true, device: 'bulb'}));
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(true, device, undefined);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({data: {value: true, device: 'bulb'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        // Device does not exist
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({value: true, device: 'bulb_not_existing_woeeee'}));
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({data: {}, status: 'error', error: "Device 'bulb_not_existing_woeeee' does not exist"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should put transaction in response when request is done with transaction', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({value: false, transaction: 22}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({data: {value: false}, status: 'ok', transaction: 22}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should put error in response when request fails', async () => {
        zigbeeHerdsman.permitJoin.mockImplementationOnce(() => {
            throw new Error('Failed to connect to adapter');
        });
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({value: false}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({data: {}, status: 'error', error: 'Failed to connect to adapter'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should put error in response when format is incorrect', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/last_seen', stringify({value_not_good: false}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/last_seen',
            stringify({data: {}, status: 'error', error: 'No value given'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Coverage satisfaction', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/random', stringify({value: false}));
        const device = zigbeeHerdsman.devices.bulb;
        await zigbeeHerdsman.events.message({
            data: {onOff: 1},
            cluster: 'genOnOff',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        });
        await flushPromises();
    });

    it('Should allow a healthcheck', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/health_check', '');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/health_check',
            stringify({data: {healthy: true}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow a coordinator check', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.coordinatorCheck.mockReturnValueOnce({missingRouters: [zigbeeHerdsman.getDeviceByIeeeAddr('0x000b57fffec6a5b2')]});
        MQTT.events.message('zigbee2mqtt/bridge/request/coordinator_check', '');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/coordinator_check',
            stringify({data: {missing_routers: [{friendly_name: 'bulb', ieee_address: '0x000b57fffec6a5b2'}]}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to remove device by string', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        settings.set(['groups'], {
            1: {
                friendly_name: 'group_1',
                retain: false,
                devices: [
                    '0x999b57fffec6a5b9/1',
                    '0x000b57fffec6a5b2/1',
                    'bulb',
                    'bulb/right',
                    'other_bulb',
                    'bulb_1',
                    '0x000b57fffec6a5b2',
                    'bulb/room/2',
                ],
            },
        });
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', 'bulb');
        await flushPromises();
        expect(controller.state[device.ieeeAddr]).toBeUndefined();
        expect(device.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(device.removeFromDatabase).not.toHaveBeenCalled();
        expect(settings.getDevice('bulb')).toBeUndefined();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb', '', {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            stringify({data: {id: 'bulb', block: false, force: false}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(settings.get().blocklist).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual(['0x999b57fffec6a5b9/1', 'other_bulb', 'bulb_1', 'bulb/room/2']);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
    });

    it('Should allow to remove device by object ID', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', stringify({id: 'bulb'}));
        await flushPromises();
        expect(device.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(device.removeFromDatabase).not.toHaveBeenCalled();
        expect(settings.getDevice('bulb')).toBeUndefined();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            stringify({data: {id: 'bulb', block: false, force: false}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to force remove device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', stringify({id: 'bulb', force: true}));
        await flushPromises();
        expect(device.removeFromDatabase).toHaveBeenCalledTimes(1);
        expect(device.removeFromNetwork).not.toHaveBeenCalled();
        expect(settings.getDevice('bulb')).toBeUndefined();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            stringify({data: {id: 'bulb', block: false, force: true}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to block device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', stringify({id: 'bulb', block: true, force: true}));
        await flushPromises();
        expect(device.removeFromDatabase).toHaveBeenCalledTimes(1);
        expect(settings.getDevice('bulb')).toBeUndefined();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            stringify({data: {id: 'bulb', block: true, force: true}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(settings.get().blocklist).toStrictEqual(['0x000b57fffec6a5b2']);
    });

    it('Should allow to remove group', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/remove', 'group_1');
        await flushPromises();
        expect(group.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(settings.getGroup('group_1')).toBeUndefined();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/remove',
            stringify({data: {id: 'group_1', force: false}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to force remove group', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/remove', stringify({id: 'group_1', force: true}));
        await flushPromises();
        expect(group.removeFromDatabase).toHaveBeenCalledTimes(1);
        expect(settings.getGroup('group_1')).toBeUndefined();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/remove',
            stringify({data: {id: 'group_1', force: true}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to add and remove from blocklist', async () => {
        expect(settings.get().blocklist).toStrictEqual([]);
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {blocklist: ['0x123', '0x1234']}}));
        await flushPromises();
        expect(settings.get().blocklist).toStrictEqual(['0x123', '0x1234']);

        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {blocklist: ['0x123']}}));
        await flushPromises();
        expect(settings.get().blocklist).toStrictEqual(['0x123']);
    });

    it('Should allow to add and remove from availabliltiy blocklist', async () => {
        expect(settings.get().blocklist).toStrictEqual([]);
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {advanced: {availability_blocklist: ['0x123', '0x1234']}}}));
        await flushPromises();
        expect(settings.get().advanced.availability_blocklist).toStrictEqual(['0x123', '0x1234']);
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {advanced: {availability_blocklist: ['0x123']}}}));
        await flushPromises();
        expect(settings.get().advanced.availability_blocklist).toStrictEqual(['0x123']);
    });

    it('Should throw error on removing non-existing device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', stringify({id: 'non-existing-device'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            stringify({data: {}, status: 'error', error: "Device 'non-existing-device' does not exist"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should throw error when remove device fails', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        device.removeFromNetwork.mockImplementationOnce(() => {
            throw new Error('device timeout');
        });
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', stringify({id: 'bulb'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            stringify({data: {}, status: 'error', error: "Failed to remove device 'bulb' (block: false, force: false) (Error: device timeout)"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow rename device', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({from: 'bulb', to: 'bulb_new_name'}));
        await flushPromises();
        expect(settings.getDevice('bulb')).toBeUndefined();
        expect(settings.getDevice('bulb_new_name')).toStrictEqual({
            ID: '0x000b57fffec6a5b2',
            friendly_name: 'bulb_new_name',
            retain: true,
            description: 'this is my bulb',
        });
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb', '', {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_new_name', stringify({brightness: 50}), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            stringify({data: {from: 'bulb', to: 'bulb_new_name', homeassistant_rename: false}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Shouldnt allow rename device with to not allowed name containing a wildcard', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({from: 'bulb', to: 'living_room/blinds#'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            stringify({data: {}, status: 'error', error: "MQTT wildcard (+ and #) not allowed in friendly_name ('living_room/blinds#')"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow rename group', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/rename', stringify({from: 'group_1', to: 'group_new_name'}));
        await flushPromises();
        expect(settings.getGroup('group_1')).toBeUndefined();
        expect(settings.getGroup('group_new_name')).toStrictEqual({ID: 1, devices: [], friendly_name: 'group_new_name', retain: false});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/rename',
            stringify({data: {from: 'group_1', to: 'group_new_name', homeassistant_rename: false}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should throw error on invalid device rename payload', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({from_bla: 'bulb', to: 'bulb_new_name'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            stringify({data: {}, status: 'error', error: 'Invalid payload'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should throw error on non-existing device rename', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({from: 'bulb_not_existing', to: 'bulb_new_name'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            stringify({data: {}, status: 'error', error: "Device 'bulb_not_existing' does not exist"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to rename last joined device', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceJoined({device: zigbeeHerdsman.devices.bulb});
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({last: true, to: 'bulb_new_name'}));
        await flushPromises();
        expect(settings.getDevice('bulb')).toBeUndefined();
        expect(settings.getDevice('bulb_new_name')).toStrictEqual({
            ID: '0x000b57fffec6a5b2',
            friendly_name: 'bulb_new_name',
            retain: true,
            description: 'this is my bulb',
        });
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            stringify({data: {from: 'bulb', to: 'bulb_new_name', homeassistant_rename: false}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should throw error when renaming device through not allowed friendlyName', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({from: 'bulb', to: 'bulb_new_name/1'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            stringify({data: {}, status: 'error', error: `Friendly name cannot end with a "/DIGIT" ('bulb_new_name/1')`}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should throw error when renaming last joined device but none has joined', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({last: true, to: 'bulb_new_name'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            stringify({data: {}, status: 'error', error: 'No device has joined since start'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow interviewing a device by friendly name', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.devices.bulb.interview.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/interview', stringify({id: 'bulb'}));
        await flushPromises();
        expect(zigbeeHerdsman.devices.bulb.interview).toHaveBeenCalled();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/interview',
            stringify({data: {id: 'bulb'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        // The following indicates that devices have published.
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
    });

    it('Should allow interviewing a device by ieeeAddr', async () => {
        const device = controller.zigbee.resolveEntity(zigbeeHerdsman.devices.bulb);
        device.resolveDefinition = jest.fn();
        MQTT.publish.mockClear();
        zigbeeHerdsman.devices.bulb.interview.mockClear();
        expect(device.resolveDefinition).toHaveBeenCalledTimes(0);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/interview', stringify({id: '0x000b57fffec6a5b2'}));
        await flushPromises();
        expect(zigbeeHerdsman.devices.bulb.interview).toHaveBeenCalledWith(true);
        expect(device.resolveDefinition).toHaveBeenCalledWith(true);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/interview',
            stringify({data: {id: '0x000b57fffec6a5b2'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        // The following indicates that devices have published.
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
    });

    it('Should throw error on invalid device interview payload', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/interview', stringify({foo: 'bulb'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/interview',
            stringify({data: {}, status: 'error', error: 'Invalid payload'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should throw error on non-existing device interview', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/interview', stringify({id: 'bulb_not_existing'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/interview',
            stringify({data: {}, status: 'error', error: "Device 'bulb_not_existing' does not exist"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should throw error on id is device endpoint', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/interview', stringify({id: 'bulb/1'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/interview',
            stringify({data: {}, status: 'error', error: "Device 'bulb/1' does not exist"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should throw error on id is a group', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/interview', stringify({id: 'group_1'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/interview',
            stringify({data: {}, status: 'error', error: "Device 'group_1' does not exist"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should throw error on when interview fails', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.devices.bulb.interview.mockClear();
        zigbeeHerdsman.devices.bulb.interview.mockImplementation(() => Promise.reject(new Error('something went wrong')));
        MQTT.events.message('zigbee2mqtt/bridge/request/device/interview', stringify({id: 'bulb'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/interview',
            stringify({data: {}, status: 'error', error: "interview of 'bulb' (0x000b57fffec6a5b2) failed: Error: something went wrong"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should error when generate_external_definition is invalid', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/generate_external_definition', stringify({wrong: ZNCZ02LM.ieeeAddr}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/generate_external_definition',
            stringify({data: {}, error: 'Invalid payload', status: 'error'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should error when generate_external_definition requested for unknown device', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/generate_external_definition', stringify({id: 'non_existing_device'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/generate_external_definition',
            stringify({data: {}, error: "Device 'non_existing_device' does not exist", status: 'error'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to generate device definition', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/generate_external_definition', stringify({id: ZNCZ02LM.ieeeAddr}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/generate_external_definition',
            stringify({
                data: {
                    id: '0x0017880104e45524',
                    source:
                        "const {onOff} = require('zigbee-herdsman-converters/lib/modernExtend');\n" +
                        '\n' +
                        'const definition = {\n' +
                        "    zigbeeModel: ['lumi.plug'],\n" +
                        "    model: 'lumi.plug',\n" +
                        "    vendor: '',\n" +
                        "    description: 'Automatically generated definition',\n" +
                        '    extend: [onOff({"powerOnBehavior":false})],\n' +
                        '    meta: {},\n' +
                        '};\n' +
                        '\n' +
                        'module.exports = definition;',
                },
                status: 'ok',
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow change device options', async () => {
        MQTT.publish.mockClear();
        expect(settings.getDevice('bulb')).toStrictEqual({
            ID: '0x000b57fffec6a5b2',
            friendly_name: 'bulb',
            retain: true,
            description: 'this is my bulb',
        });
        MQTT.events.message('zigbee2mqtt/bridge/request/device/options', stringify({options: {retain: false, transition: 1}, id: 'bulb'}));
        await flushPromises();
        expect(settings.getDevice('bulb')).toStrictEqual({
            ID: '0x000b57fffec6a5b2',
            friendly_name: 'bulb',
            retain: false,
            transition: 1,
            description: 'this is my bulb',
        });
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/options',
            stringify({
                data: {
                    from: {retain: true, description: 'this is my bulb'},
                    to: {retain: false, transition: 1, description: 'this is my bulb'},
                    restart_required: false,
                    id: 'bulb',
                },
                status: 'ok',
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to remove device option', async () => {
        MQTT.publish.mockClear();
        settings.set(['devices', '0x000b57fffec6a5b2', 'qos'], 1);
        expect(settings.getDevice('bulb')).toStrictEqual({
            ID: '0x000b57fffec6a5b2',
            friendly_name: 'bulb',
            qos: 1,
            retain: true,
            description: 'this is my bulb',
        });
        MQTT.events.message('zigbee2mqtt/bridge/request/device/options', stringify({options: {qos: null}, id: 'bulb'}));
        await flushPromises();
        expect(settings.getDevice('bulb')).toStrictEqual({
            ID: '0x000b57fffec6a5b2',
            friendly_name: 'bulb',
            retain: true,
            description: 'this is my bulb',
        });
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/options',
            stringify({
                data: {
                    from: {retain: true, qos: 1, description: 'this is my bulb'},
                    to: {retain: true, description: 'this is my bulb'},
                    restart_required: false,
                    id: 'bulb',
                },
                status: 'ok',
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow change device options with restart required', async () => {
        MQTT.publish.mockClear();
        expect(settings.getDevice('bulb')).toStrictEqual({
            ID: '0x000b57fffec6a5b2',
            friendly_name: 'bulb',
            retain: true,
            description: 'this is my bulb',
        });
        MQTT.events.message('zigbee2mqtt/bridge/request/device/options', stringify({options: {disabled: true}, id: 'bulb'}));
        await flushPromises();
        expect(settings.getDevice('bulb')).toStrictEqual({
            ID: '0x000b57fffec6a5b2',
            friendly_name: 'bulb',
            retain: true,
            disabled: true,
            description: 'this is my bulb',
        });
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/options',
            stringify({
                data: {
                    from: {retain: true, description: 'this is my bulb'},
                    to: {disabled: true, retain: true, description: 'this is my bulb'},
                    restart_required: true,
                    id: 'bulb',
                },
                status: 'ok',
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow change group options', async () => {
        MQTT.publish.mockClear();
        expect(settings.getGroup('group_1')).toStrictEqual({ID: 1, devices: [], friendly_name: 'group_1', retain: false});
        MQTT.events.message('zigbee2mqtt/bridge/request/group/options', stringify({options: {retain: true, transition: 1}, id: 'group_1'}));
        await flushPromises();
        expect(settings.getGroup('group_1')).toStrictEqual({ID: 1, devices: [], friendly_name: 'group_1', retain: true, transition: 1});
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/options',
            stringify({data: {from: {retain: false}, to: {retain: true, transition: 1}, restart_required: false, id: 'group_1'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow change group options with restart required', async () => {
        MQTT.publish.mockClear();
        expect(settings.getGroup('group_1')).toStrictEqual({ID: 1, devices: [], friendly_name: 'group_1', retain: false});
        MQTT.events.message('zigbee2mqtt/bridge/request/group/options', stringify({options: {off_state: 'all_members_off'}, id: 'group_1'}));
        await flushPromises();
        expect(settings.getGroup('group_1')).toStrictEqual({
            ID: 1,
            devices: [],
            friendly_name: 'group_1',
            retain: false,
            off_state: 'all_members_off',
        });
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/options',
            stringify({
                data: {from: {retain: false}, to: {retain: false, off_state: 'all_members_off'}, restart_required: true, id: 'group_1'},
                status: 'ok',
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should throw error on invalid device change options payload', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/options', stringify({options_: {retain: true, transition: 1}, id: 'bulb'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/options',
            stringify({data: {}, status: 'error', error: 'Invalid payload'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to add group by string', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/add', 'group_193');
        await flushPromises();
        expect(settings.getGroup('group_193')).toStrictEqual({ID: 3, devices: [], friendly_name: 'group_193'});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/add',
            stringify({data: {friendly_name: 'group_193', id: 3}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to add group with ID', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/add', stringify({friendly_name: 'group_193', id: 92}));
        await flushPromises();
        expect(settings.getGroup('group_193')).toStrictEqual({ID: 92, devices: [], friendly_name: 'group_193'});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/add',
            stringify({data: {friendly_name: 'group_193', id: 92}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Shouldnt allow to add group with empty name', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/add', stringify({friendly_name: '', id: 9}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/add',
            stringify({data: {}, status: 'error', error: 'friendly_name must be at least 1 char long'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should throw error when add with invalid payload', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/add', stringify({friendly_name9: 'group_193'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/add',
            stringify({data: {}, status: 'error', error: 'Invalid payload'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to enable/disable Home Assistant extension', async () => {
        // Test if disabled initially
        const device = zigbeeHerdsman.devices.WXKG11LM;
        settings.set(['devices', device.ieeeAddr, 'legacy'], false);
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        expect(settings.get().homeassistant).toBeFalsy();
        expect(MQTT.publish).not.toHaveBeenCalledWith('zigbee2mqtt/button/action', 'single', {retain: false, qos: 0}, expect.any(Function));

        // Disable when already disabled should go OK
        MQTT.events.message('zigbee2mqtt/bridge/request/config/homeassistant', stringify({value: false}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/homeassistant',
            stringify({data: {value: false}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(settings.get().homeassistant).toBeFalsy();

        // Enable
        MQTT.events.message('zigbee2mqtt/bridge/request/config/homeassistant', stringify({value: true}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/homeassistant',
            stringify({data: {value: true}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(settings.get().homeassistant).toBeTruthy();
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/button/action', 'single', {retain: false, qos: 0}, expect.any(Function));

        // Disable
        MQTT.events.message('zigbee2mqtt/bridge/request/config/homeassistant', stringify({value: false}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/homeassistant',
            stringify({data: {value: false}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(settings.get().homeassistant).toBeFalsy();
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).not.toHaveBeenCalledWith('zigbee2mqtt/button/action', 'single', {retain: false, qos: 0}, expect.any(Function));
    });

    it('Should fail to set Home Assistant when invalid type', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/homeassistant', 'invalid_one');
        await flushPromises();
        expect(settings.get().homeassistant).toBeFalsy();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/homeassistant',
            stringify({data: {}, status: 'error', error: "'invalid_one' is not an allowed value, allowed: true,false"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to set last_seen', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/last_seen', 'ISO_8601');
        await flushPromises();
        expect(settings.get().advanced.last_seen).toBe('ISO_8601');
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/last_seen',
            stringify({data: {value: 'ISO_8601'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should fail to set last_seen when invalid type', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/last_seen', 'invalid_one');
        await flushPromises();
        expect(settings.get().advanced.last_seen).toBe('disable');
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/last_seen',
            stringify({data: {}, status: 'error', error: "'invalid_one' is not an allowed value, allowed: disable,ISO_8601,epoch,ISO_8601_local"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to set elapsed', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/elapsed', 'true');
        await flushPromises();
        expect(settings.get().advanced.elapsed).toBe(true);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/elapsed',
            stringify({data: {value: true}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should fail to set last_seen when invalid type', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/elapsed', 'not_valid');
        await flushPromises();
        expect(settings.get().advanced.elapsed).toBe(false);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/elapsed',
            stringify({data: {}, status: 'error', error: "'not_valid' is not an allowed value, allowed: true,false"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to set log level', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/log_level', 'debug');
        await flushPromises();
        expect(logger.getLevel()).toBe('debug');
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/log_level',
            stringify({data: {value: 'debug'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should fail to set log level when invalid type', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/log_level', 'not_valid');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/log_level',
            stringify({data: {}, status: 'error', error: `'not_valid' is not an allowed value, allowed: ${settings.LOG_LEVELS.join(',')}`}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to touchlink factory reset (succeeds)', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkFactoryResetFirst.mockClear();
        zigbeeHerdsman.touchlinkFactoryResetFirst.mockReturnValueOnce(true);
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/factory_reset', '');
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkFactoryResetFirst).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/factory_reset',
            stringify({data: {}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to touchlink factory reset specific device', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkFactoryReset.mockClear();
        zigbeeHerdsman.touchlinkFactoryReset.mockReturnValueOnce(true);
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/factory_reset', stringify({ieee_address: '0x1239', channel: 12}));
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkFactoryReset).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.touchlinkFactoryReset).toHaveBeenCalledWith('0x1239', 12);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/factory_reset',
            stringify({data: {ieee_address: '0x1239', channel: 12}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Add install code', async () => {
        MQTT.publish.mockClear();

        // By object
        zigbeeHerdsman.addInstallCode.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/install_code/add', stringify({value: 'my-code'}));
        await flushPromises();
        expect(zigbeeHerdsman.addInstallCode).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.addInstallCode).toHaveBeenCalledWith('my-code');
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/install_code/add',
            stringify({data: {value: 'my-code'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        // By string
        zigbeeHerdsman.addInstallCode.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/install_code/add', 'my-string-code');
        await flushPromises();
        expect(zigbeeHerdsman.addInstallCode).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.addInstallCode).toHaveBeenCalledWith('my-string-code');
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/install_code/add',
            stringify({data: {value: 'my-code'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Add install code error', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.addInstallCode.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/install_code/add', stringify({wrong: 'my-code'}));
        await flushPromises();
        expect(zigbeeHerdsman.addInstallCode).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/install_code/add',
            stringify({data: {}, status: 'error', error: 'Invalid payload'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to touchlink identify specific device', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkIdentify.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/identify', stringify({ieee_address: '0x1239', channel: 12}));
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkIdentify).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.touchlinkIdentify).toHaveBeenCalledWith('0x1239', 12);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/identify',
            stringify({data: {ieee_address: '0x1239', channel: 12}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Touchlink identify fails when payload is invalid', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkIdentify.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/identify', stringify({ieee_address: '0x1239'}));
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkIdentify).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/identify',
            stringify({data: {}, status: 'error', error: 'Invalid payload'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to touchlink factory reset (fails)', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkFactoryResetFirst.mockClear();
        zigbeeHerdsman.touchlinkFactoryResetFirst.mockReturnValueOnce(false);
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/factory_reset', '');
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkFactoryResetFirst).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/factory_reset',
            stringify({data: {}, status: 'error', error: 'Failed to factory reset device through Touchlink'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to touchlink scan', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkScan.mockClear();
        zigbeeHerdsman.touchlinkScan.mockReturnValueOnce([
            {ieeeAddr: '0x123', channel: 12},
            {ieeeAddr: '0x124', channel: 24},
        ]);
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/scan', '');
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkScan).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/scan',
            stringify({
                data: {
                    found: [
                        {ieee_address: '0x123', channel: 12},
                        {ieee_address: '0x124', channel: 24},
                    ],
                },
                status: 'ok',
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to configure reporting', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        endpoint.configureReporting.mockClear();
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message(
            'zigbee2mqtt/bridge/request/device/configure_reporting',
            stringify({
                id: '0x000b57fffec6a5b2/1',
                cluster: 'genLevelCtrl',
                attribute: 'currentLevel',
                maximum_report_interval: 10,
                minimum_report_interval: 1,
                reportable_change: 1,
            }),
        );
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', coordinator.endpoints[0]);
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(1);
        expect(endpoint.configureReporting).toHaveBeenCalledWith(
            'genLevelCtrl',
            [{attribute: 'currentLevel', maximumReportInterval: 10, minimumReportInterval: 1, reportableChange: 1}],
            undefined,
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure_reporting',
            stringify({
                data: {
                    id: '0x000b57fffec6a5b2/1',
                    cluster: 'genLevelCtrl',
                    attribute: 'currentLevel',
                    maximum_report_interval: 10,
                    minimum_report_interval: 1,
                    reportable_change: 1,
                },
                status: 'ok',
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
    });

    it('Should throw error when configure reporting is called with malformed payload', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        endpoint.configureReporting.mockClear();
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message(
            'zigbee2mqtt/bridge/request/device/configure_reporting',
            stringify({
                id: 'bulb',
                cluster: 'genLevelCtrl',
                attribute_lala: 'currentLevel',
                maximum_report_interval: 10,
                minimum_report_interval: 1,
                reportable_change: 1,
            }),
        );
        await flushPromises();
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure_reporting',
            stringify({data: {}, status: 'error', error: 'Invalid payload'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should throw error when configure reporting is called for non-existing device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        endpoint.configureReporting.mockClear();
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message(
            'zigbee2mqtt/bridge/request/device/configure_reporting',
            stringify({
                id: 'non_existing_device',
                cluster: 'genLevelCtrl',
                attribute: 'currentLevel',
                maximum_report_interval: 10,
                minimum_report_interval: 1,
                reportable_change: 1,
            }),
        );
        await flushPromises();
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure_reporting',
            stringify({data: {}, status: 'error', error: "Device 'non_existing_device' does not exist"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should throw error when configure reporting is called for non-existing endpoint', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        endpoint.configureReporting.mockClear();
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message(
            'zigbee2mqtt/bridge/request/device/configure_reporting',
            stringify({
                id: '0x000b57fffec6a5b2/non_existing_endpoint',
                cluster: 'genLevelCtrl',
                attribute: 'currentLevel',
                maximum_report_interval: 10,
                minimum_report_interval: 1,
                reportable_change: 1,
            }),
        );
        await flushPromises();
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure_reporting',
            stringify({data: {}, status: 'error', error: "Device '0x000b57fffec6a5b2' does not have endpoint 'non_existing_endpoint'"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to create a backup', async () => {
        fs.mkdirSync(path.join(data.mockDir, 'ext_converters'));
        fs.writeFileSync(path.join(data.mockDir, 'ext_converters', 'afile.js'), 'test123');
        fs.mkdirSync(path.join(data.mockDir, 'log'));
        fs.writeFileSync(path.join(data.mockDir, 'log', 'log.log'), 'test123');
        fs.mkdirSync(path.join(data.mockDir, 'ext_converters', '123'));
        fs.writeFileSync(path.join(data.mockDir, 'ext_converters', '123', 'myfile.js'), 'test123');
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/backup', '');
        await flushPromises();
        expect(zigbeeHerdsman.backup).toHaveBeenCalledTimes(1);
        expect(mockJSZipFile).toHaveBeenCalledTimes(4);
        expect(mockJSZipFile).toHaveBeenNthCalledWith(1, 'configuration.yaml', expect.any(Object));
        expect(mockJSZipFile).toHaveBeenNthCalledWith(2, path.join('ext_converters', '123', 'myfile.js'), expect.any(Object));
        expect(mockJSZipFile).toHaveBeenNthCalledWith(3, path.join('ext_converters', 'afile.js'), expect.any(Object));
        expect(mockJSZipFile).toHaveBeenNthCalledWith(4, 'state.json', expect.any(Object));
        expect(mockJSZipGenerateAsync).toHaveBeenCalledTimes(1);
        expect(mockJSZipGenerateAsync).toHaveBeenNthCalledWith(1, {type: 'base64'});
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/backup',
            stringify({data: {zip: 'THISISBASE64'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to restart', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/restart', '');
        await flushPromises();
        jest.runOnlyPendingTimers();
        expect(mockRestart).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/restart',
            stringify({data: {}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Change options', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        settings.apply({permit_join: false});
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {permit_join: true}}));
        await flushPromises();
        expect(settings.get().permit_join).toBe(true);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(true, undefined, undefined);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({data: {restart_required: false}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Change options and apply - homeassistant', async () => {
        expect(controller.extensions.find((e) => e.constructor.name === 'HomeAssistant')).toBeUndefined();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {homeassistant: true}}));
        await flushPromises();
        expect(controller.extensions.find((e) => e.constructor.name === 'HomeAssistant')).not.toBeUndefined();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({data: {restart_required: true}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Change options and apply - log_level', async () => {
        logger.setLevel('info');
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {advanced: {log_level: 'debug'}}}));
        await flushPromises();
        expect(logger.getLevel()).toStrictEqual('debug');
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({data: {restart_required: false}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Change options and apply - log_debug_namespace_ignore', async () => {
        MQTT.publish.mockClear();
        const nsIgnore = '^zhc:legacy:fz:(tuya|moes)|^zh:ember:uart:|^zh:controller';
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {advanced: {log_debug_namespace_ignore: nsIgnore}}}));
        await flushPromises();
        expect(logger.getDebugNamespaceIgnore()).toStrictEqual(nsIgnore);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({data: {restart_required: false}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Change options and apply - log_namespaced_levels', async () => {
        logger.setLevel('info');
        settings.apply({advanced: {log_namespaced_levels: {'zh:zstack': 'warning', 'z2m:mqtt': 'debug'}}});
        MQTT.publish.mockClear();
        MQTT.events.message(
            'zigbee2mqtt/bridge/request/options',
            stringify({options: {advanced: {log_namespaced_levels: {'z2m:mqtt': 'warning', 'zh:zstack': null}}}}),
        );
        await flushPromises();
        expect(settings.get().advanced.log_namespaced_levels).toStrictEqual({'z2m:mqtt': 'warning'});
        expect(logger.getNamespacedLevels()).toStrictEqual({'z2m:mqtt': 'warning'});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({data: {restart_required: false}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {advanced: {log_namespaced_levels: {'z2m:mqtt': null}}}}));
        await flushPromises();
        expect(settings.get().advanced.log_namespaced_levels).toStrictEqual({});
        expect(logger.getNamespacedLevels()).toStrictEqual({});
    });

    it('Change options restart required', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        settings.apply({serial: {port: '123'}});
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {serial: {port: '/dev/newport'}}}));
        await flushPromises();
        expect(settings.get().serial.port).toBe('/dev/newport');
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({data: {restart_required: true}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Change options array', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        expect(settings.get().advanced.ext_pan_id).toStrictEqual([221, 221, 221, 221, 221, 221, 221, 221]);
        MQTT.publish.mockClear();
        MQTT.events.message(
            'zigbee2mqtt/bridge/request/options',
            stringify({options: {advanced: {ext_pan_id: [220, 221, 221, 221, 221, 221, 221, 221]}}}),
        );
        await flushPromises();
        expect(settings.get().advanced.ext_pan_id).toStrictEqual([220, 221, 221, 221, 221, 221, 221, 221]);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({data: {restart_required: true}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Change options with null', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        expect(settings.get().serial).toStrictEqual({disable_led: false, port: '/dev/dummy'});
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {serial: {disable_led: false, port: null}}}));
        await flushPromises();
        expect(settings.get().serial).toStrictEqual({disable_led: false});
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({data: {restart_required: true}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Change options invalid payload', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/options', 'I am invalid');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({data: {}, error: 'Invalid payload', status: 'error'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Change options not valid against schema', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {permit_join: 'true'}}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({data: {}, error: 'permit_join must be boolean', status: 'error'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Icon link handling', async () => {
        const bridge = controller.extensions.find((e) => e.constructor.name === 'Bridge');
        expect(bridge).not.toBeUndefined();

        const definition = {model: 'lumi.plug', fromZigbee: []};
        const device = zigbeeHerdsman.devices.ZNCZ02LM;
        const svg_icon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDo';
        const icon_link = 'https://www.zigbee2mqtt.io/images/devices/ZNCZ02LM.jpg';
        definition.icon = icon_link;
        let payload = bridge.getDefinitionPayload({...device, zh: device, definition, exposes: () => definition.exposes, options: {}});
        expect(payload).not.toBeUndefined();
        expect(payload['icon']).not.toBeUndefined();
        expect(payload.icon).toBe(icon_link);

        definition.icon = icon_link;
        payload = bridge.getDefinitionPayload({...device, zh: device, definition, exposes: () => definition.exposes, options: {icon: svg_icon}});
        expect(payload).not.toBeUndefined();
        expect(payload['icon']).not.toBeUndefined();
        expect(payload.icon).toBe(svg_icon);

        definition.icon = '_${model}_';
        payload = bridge.getDefinitionPayload({...device, zh: device, definition, exposes: () => definition.exposes, options: {}});
        expect(payload).not.toBeUndefined();
        expect(payload['icon']).not.toBeUndefined();
        expect(payload.icon).toBe('_lumi.plug_');

        definition.icon = '_${model}_${zigbeeModel}_';
        payload = bridge.getDefinitionPayload({...device, zh: device, definition, exposes: () => definition.exposes, options: {}});
        expect(payload).not.toBeUndefined();
        expect(payload['icon']).not.toBeUndefined();
        expect(payload.icon).toBe('_lumi.plug_lumi.plug_');

        definition.icon = svg_icon;
        payload = bridge.getDefinitionPayload({...device, zh: device, definition, exposes: () => definition.exposes, options: {}});
        expect(payload).not.toBeUndefined();
        expect(payload['icon']).not.toBeUndefined();
        expect(payload.icon).toBe(svg_icon);

        device.modelID = '?._Z\\NC+Z02*LM';
        definition.model = '&&&&*+';
        definition.icon = '_${model}_${zigbeeModel}_';
        payload = bridge.getDefinitionPayload({...device, zh: device, definition, exposes: () => definition.exposes, options: {}});
        expect(payload).not.toBeUndefined();
        expect(payload['icon']).not.toBeUndefined();
        expect(payload.icon).toBe('_------_-._Z-NC-Z02-LM_');
    });

    it('Should publish bridge info, devices and definitions when a device with custom_clusters joined', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceJoined({device: zigbeeHerdsman.devices.bulb_custom_cluster});
        await flushPromises();

        // console.log(MQTT.publish.mock.calls);
        expect(MQTT.publish).toHaveBeenCalledTimes(5);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/definitions',
            expect.stringContaining(stringify(zigbeeHerdsman.custom_clusters)),
            {retain: true, qos: 0},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
            stringify({data: {friendly_name: '0x000b57fffec6a5c2', ieee_address: '0x000b57fffec6a5c2'}, type: 'device_joined'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should publish bridge info, devices and definitions when a device with custom_clusters is reconfigured', async () => {
        // Adding a device first
        await zigbeeHerdsman.events.deviceJoined({device: zigbeeHerdsman.devices.bulb_custom_cluster});
        await flushPromises();
        MQTT.publish.mockClear();

        // After cleaning, reconfigure it
        MQTT.events.message('zigbee2mqtt/bridge/request/device/configure', zigbeeHerdsman.devices.bulb_custom_cluster.ieeeAddr);
        await flushPromises();

        // console.log(MQTT.publish.mock.calls);
        expect(MQTT.publish).toHaveBeenCalledTimes(4);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/definitions',
            expect.stringContaining(stringify(zigbeeHerdsman.custom_clusters)),
            {retain: true, qos: 0},
            expect.any(Function),
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure',
            expect.any(String),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });
});
