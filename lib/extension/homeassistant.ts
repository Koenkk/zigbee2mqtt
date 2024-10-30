import assert from 'assert';

import bind from 'bind-decorator';
import stringify from 'json-stable-stringify-without-jsonify';

import * as zhc from 'zigbee-herdsman-converters';

import logger from '../util/logger';
import * as settings from '../util/settings';
import utils, {assertBinaryExpose, assertEnumExpose, assertNumericExpose, isBinaryExpose, isEnumExpose, isNumericExpose} from '../util/utils';
import Extension from './extension';

interface MockProperty {
    property: string;
    value: KeyValue | string | null;
}

interface DiscoveryEntry {
    mockProperties: MockProperty[];
    type: string;
    object_id: string;
    discovery_payload: KeyValue;
}

interface Discovered {
    mockProperties: Set<MockProperty>;
    messages: {[s: string]: {payload: string; published: boolean}};
    triggers: Set<string>;
    discovered: boolean;
}

const SENSOR_CLICK: Readonly<DiscoveryEntry> = {
    type: 'sensor',
    object_id: 'click',
    mockProperties: [{property: 'click', value: null}],
    discovery_payload: {
        name: 'Click',
        icon: 'mdi:toggle-switch',
        value_template: '{{ value_json.click }}',
    },
};

const ACCESS_STATE = 0b001;
const ACCESS_SET = 0b010;
const GROUP_SUPPORTED_TYPES: ReadonlyArray<string> = ['light', 'switch', 'lock', 'cover'];
const DEFAULT_STATUS_TOPIC = 'homeassistant/status';
const COVER_OPENING_LOOKUP: ReadonlyArray<string> = ['opening', 'open', 'forward', 'up', 'rising'];
const COVER_CLOSING_LOOKUP: ReadonlyArray<string> = ['closing', 'close', 'backward', 'back', 'reverse', 'down', 'declining'];
const COVER_STOPPED_LOOKUP: ReadonlyArray<string> = ['stopped', 'stop', 'pause', 'paused'];
const SWITCH_DIFFERENT: ReadonlyArray<string> = ['valve_detection', 'window_detection', 'auto_lock', 'away_mode'];
const LEGACY_MAPPING: ReadonlyArray<{models: string[]; discovery: DiscoveryEntry}> = [
    {
        models: [
            'WXKG01LM',
            'HS1EB/HS1EB-E',
            'ICZB-KPD14S',
            'TERNCY-SD01',
            'TERNCY-PP01',
            'ICZB-KPD18S',
            'E1766',
            'ZWallRemote0',
            'ptvo.switch',
            '2AJZ4KPKEY',
            'ZGRC-KEY-013',
            'HGZB-02S',
            'HGZB-045',
            'HGZB-1S',
            'AV2010/34',
            'IM6001-BTP01',
            'WXKG11LM',
            'WXKG03LM',
            'WXKG02LM_rev1',
            'WXKG02LM_rev2',
            'QBKG04LM',
            'QBKG03LM',
            'QBKG11LM',
            'QBKG21LM',
            'QBKG22LM',
            'WXKG12LM',
            'QBKG12LM',
            'E1743',
        ],
        discovery: SENSOR_CLICK,
    },
    {
        models: ['ICTC-G-1'],
        discovery: {
            type: 'sensor',
            mockProperties: [{property: 'brightness', value: null}],
            object_id: 'brightness',
            discovery_payload: {
                name: 'Brightness',
                unit_of_measurement: 'brightness',
                icon: 'mdi:brightness-5',
                value_template: '{{ value_json.brightness }}',
            },
        },
    },
];
const BINARY_DISCOVERY_LOOKUP: {[s: string]: KeyValue} = {
    activity_led_indicator: {icon: 'mdi:led-on'},
    auto_off: {icon: 'mdi:flash-auto'},
    battery_low: {entity_category: 'diagnostic', device_class: 'battery'},
    button_lock: {entity_category: 'config', icon: 'mdi:lock'},
    calibration: {entity_category: 'config', icon: 'mdi:progress-wrench'},
    capabilities_configurable_curve: {entity_category: 'diagnostic', icon: 'mdi:tune'},
    capabilities_forward_phase_control: {entity_category: 'diagnostic', icon: 'mdi:tune'},
    capabilities_overload_detection: {entity_category: 'diagnostic', icon: 'mdi:tune'},
    capabilities_reactance_discriminator: {entity_category: 'diagnostic', icon: 'mdi:tune'},
    capabilities_reverse_phase_control: {entity_category: 'diagnostic', icon: 'mdi:tune'},
    carbon_monoxide: {device_class: 'carbon_monoxide'},
    card: {entity_category: 'config', icon: 'mdi:clipboard-check'},
    child_lock: {entity_category: 'config', icon: 'mdi:account-lock'},
    color_sync: {entity_category: 'config', icon: 'mdi:sync-circle'},
    consumer_connected: {device_class: 'plug'},
    contact: {device_class: 'door'},
    garage_door_contact: {device_class: 'garage_door', payload_on: false, payload_off: true},
    eco_mode: {entity_category: 'config', icon: 'mdi:leaf'},
    expose_pin: {entity_category: 'config', icon: 'mdi:pin'},
    flip_indicator_light: {entity_category: 'config', icon: 'mdi:arrow-left-right'},
    gas: {device_class: 'gas'},
    indicator_mode: {entity_category: 'config', icon: 'mdi:led-on'},
    invert_cover: {entity_category: 'config', icon: 'mdi:arrow-left-right'},
    led_disabled_night: {entity_category: 'config', icon: 'mdi:led-off'},
    led_indication: {entity_category: 'config', icon: 'mdi:led-on'},
    led_enable: {entity_category: 'config', icon: 'mdi:led-on'},
    legacy: {entity_category: 'config', icon: 'mdi:cog'},
    motor_reversal: {entity_category: 'config', icon: 'mdi:arrow-left-right'},
    moving: {device_class: 'moving'},
    no_position_support: {entity_category: 'config', icon: 'mdi:minus-circle-outline'},
    noise_detected: {device_class: 'sound'},
    occupancy: {device_class: 'occupancy'},
    power_outage_memory: {entity_category: 'config', icon: 'mdi:memory'},
    presence: {device_class: 'presence'},
    setup: {device_class: 'running'},
    smoke: {device_class: 'smoke'},
    sos: {device_class: 'safety'},
    schedule: {icon: 'mdi:calendar'},
    status_capacitive_load: {entity_category: 'diagnostic', icon: 'mdi:tune'},
    status_forward_phase_control: {entity_category: 'diagnostic', icon: 'mdi:tune'},
    status_inductive_load: {entity_category: 'diagnostic', icon: 'mdi:tune'},
    status_overload: {entity_category: 'diagnostic', icon: 'mdi:tune'},
    status_reverse_phase_control: {entity_category: 'diagnostic', icon: 'mdi:tune'},
    tamper: {device_class: 'tamper'},
    temperature_scale: {entity_category: 'config', icon: 'mdi:temperature-celsius'},
    test: {entity_category: 'diagnostic', icon: 'mdi:test-tube'},
    th_heater: {icon: 'mdi:heat-wave'},
    trigger_indicator: {icon: 'mdi:led-on'},
    valve_alarm: {device_class: 'problem'},
    valve_detection: {icon: 'mdi:pipe-valve'},
    valve_state: {device_class: 'opening'},
    vibration: {device_class: 'vibration'},
    water_leak: {device_class: 'moisture'},
    window: {device_class: 'window'},
    window_detection: {icon: 'mdi:window-open-variant'},
    window_open: {device_class: 'window'},
} as const;
const NUMERIC_DISCOVERY_LOOKUP: {[s: string]: KeyValue} = {
    ac_frequency: {device_class: 'frequency', enabled_by_default: false, entity_category: 'diagnostic', state_class: 'measurement'},
    action_duration: {icon: 'mdi:timer', device_class: 'duration'},
    alarm_humidity_max: {device_class: 'humidity', entity_category: 'config', icon: 'mdi:water-plus'},
    alarm_humidity_min: {device_class: 'humidity', entity_category: 'config', icon: 'mdi:water-minus'},
    alarm_temperature_max: {device_class: 'temperature', entity_category: 'config', icon: 'mdi:thermometer-high'},
    alarm_temperature_min: {device_class: 'temperature', entity_category: 'config', icon: 'mdi:thermometer-low'},
    angle: {icon: 'angle-acute'},
    angle_axis: {icon: 'angle-acute'},
    aqi: {device_class: 'aqi', state_class: 'measurement'},
    auto_relock_time: {entity_category: 'config', icon: 'mdi:timer'},
    away_preset_days: {entity_category: 'config', icon: 'mdi:timer'},
    away_preset_temperature: {entity_category: 'config', icon: 'mdi:thermometer'},
    ballast_maximum_level: {entity_category: 'config'},
    ballast_minimum_level: {entity_category: 'config'},
    ballast_physical_maximum_level: {entity_category: 'diagnostic'},
    ballast_physical_minimum_level: {entity_category: 'diagnostic'},
    battery: {device_class: 'battery', state_class: 'measurement'},
    battery2: {device_class: 'battery', entity_category: 'diagnostic', state_class: 'measurement'},
    battery_voltage: {device_class: 'voltage', entity_category: 'diagnostic', state_class: 'measurement', enabled_by_default: true},
    boost_heating_countdown: {device_class: 'duration'},
    boost_heating_countdown_time_set: {entity_category: 'config', icon: 'mdi:timer'},
    boost_time: {entity_category: 'config', icon: 'mdi:timer'},
    calibration: {entity_category: 'config', icon: 'mdi:wrench-clock'},
    calibration_time: {entity_category: 'config', icon: 'mdi:wrench-clock'},
    co2: {device_class: 'carbon_dioxide', state_class: 'measurement'},
    comfort_temperature: {entity_category: 'config', icon: 'mdi:thermometer'},
    cpu_temperature: {
        device_class: 'temperature',
        entity_category: 'diagnostic',
        state_class: 'measurement',
    },
    cube_side: {icon: 'mdi:cube'},
    current: {
        device_class: 'current',
        enabled_by_default: false,
        entity_category: 'diagnostic',
        state_class: 'measurement',
    },
    current_phase_b: {
        device_class: 'current',
        enabled_by_default: false,
        entity_category: 'diagnostic',
        state_class: 'measurement',
    },
    current_phase_c: {
        device_class: 'current',
        enabled_by_default: false,
        entity_category: 'diagnostic',
        state_class: 'measurement',
    },
    deadzone_temperature: {entity_category: 'config', icon: 'mdi:thermometer'},
    detection_interval: {icon: 'mdi:timer'},
    device_temperature: {
        device_class: 'temperature',
        entity_category: 'diagnostic',
        state_class: 'measurement',
    },
    distance: {device_class: 'distance', state_class: 'measurement'},
    duration: {entity_category: 'config', icon: 'mdi:timer'},
    eco2: {device_class: 'carbon_dioxide', state_class: 'measurement'},
    eco_temperature: {entity_category: 'config', icon: 'mdi:thermometer'},
    energy: {device_class: 'energy', state_class: 'total_increasing'},
    external_temperature_input: {icon: 'mdi:thermometer'},
    formaldehyd: {state_class: 'measurement'},
    gas_density: {icon: 'mdi:google-circles-communities', state_class: 'measurement'},
    hcho: {icon: 'mdi:air-filter', state_class: 'measurement'},
    humidity: {device_class: 'humidity', state_class: 'measurement'},
    humidity_calibration: {entity_category: 'config', icon: 'mdi:wrench-clock'},
    humidity_max: {entity_category: 'config', icon: 'mdi:water-percent'},
    humidity_min: {entity_category: 'config', icon: 'mdi:water-percent'},
    illuminance_calibration: {entity_category: 'config', icon: 'mdi:wrench-clock'},
    illuminance_lux: {device_class: 'illuminance', state_class: 'measurement'},
    illuminance: {device_class: 'illuminance', enabled_by_default: false, state_class: 'measurement'},
    linkquality: {
        enabled_by_default: false,
        entity_category: 'diagnostic',
        icon: 'mdi:signal',
        state_class: 'measurement',
    },
    local_temperature: {device_class: 'temperature', state_class: 'measurement'},
    max_range: {entity_category: 'config', icon: 'mdi:signal-distance-variant'},
    max_temperature: {entity_category: 'config', icon: 'mdi:thermometer-high'},
    max_temperature_limit: {entity_category: 'config', icon: 'mdi:thermometer-high'},
    min_temperature_limit: {entity_category: 'config', icon: 'mdi:thermometer-low'},
    min_temperature: {entity_category: 'config', icon: 'mdi:thermometer-low'},
    minimum_on_level: {entity_category: 'config'},
    measurement_poll_interval: {entity_category: 'config', icon: 'mdi:clock-out'},
    motion_sensitivity: {entity_category: 'config', icon: 'mdi:motion-sensor'},
    noise: {device_class: 'sound_pressure', state_class: 'measurement'},
    noise_detect_level: {icon: 'mdi:volume-equal'},
    noise_timeout: {icon: 'mdi:timer'},
    occupancy_level: {icon: 'mdi:motion-sensor'},
    occupancy_sensitivity: {entity_category: 'config', icon: 'mdi:motion-sensor'},
    occupancy_timeout: {entity_category: 'config', icon: 'mdi:timer'},
    overload_protection: {icon: 'mdi:flash'},
    pm10: {device_class: 'pm10', state_class: 'measurement'},
    pm25: {device_class: 'pm25', state_class: 'measurement'},
    people: {state_class: 'measurement', icon: 'mdi:account-multiple'},
    position: {icon: 'mdi:valve', state_class: 'measurement'},
    power: {device_class: 'power', entity_category: 'diagnostic', state_class: 'measurement'},
    power_phase_b: {device_class: 'power', entity_category: 'diagnostic', state_class: 'measurement'},
    power_phase_c: {device_class: 'power', entity_category: 'diagnostic', state_class: 'measurement'},
    power_factor: {device_class: 'power_factor', enabled_by_default: false, entity_category: 'diagnostic', state_class: 'measurement'},
    power_outage_count: {icon: 'mdi:counter', enabled_by_default: false},
    precision: {entity_category: 'config', icon: 'mdi:decimal-comma-increase'},
    pressure: {device_class: 'atmospheric_pressure', state_class: 'measurement'},
    presence_timeout: {entity_category: 'config', icon: 'mdi:timer'},
    reporting_time: {entity_category: 'config', icon: 'mdi:clock-time-one-outline'},
    requested_brightness_level: {
        enabled_by_default: false,
        entity_category: 'diagnostic',
        icon: 'mdi:brightness-5',
    },
    requested_brightness_percent: {
        enabled_by_default: false,
        entity_category: 'diagnostic',
        icon: 'mdi:brightness-5',
    },
    smoke_density: {icon: 'mdi:google-circles-communities', state_class: 'measurement'},
    soil_moisture: {device_class: 'moisture', state_class: 'measurement'},
    temperature: {device_class: 'temperature', state_class: 'measurement'},
    temperature_calibration: {entity_category: 'config', icon: 'mdi:wrench-clock'},
    temperature_max: {entity_category: 'config', icon: 'mdi:thermometer-plus'},
    temperature_min: {entity_category: 'config', icon: 'mdi:thermometer-minus'},
    temperature_offset: {icon: 'mdi:thermometer-lines'},
    transition: {entity_category: 'config', icon: 'mdi:transition'},
    trigger_count: {icon: 'mdi:counter', enabled_by_default: false},
    voc: {device_class: 'volatile_organic_compounds', state_class: 'measurement'},
    voc_index: {state_class: 'measurement', icon: 'mdi:molecule'},
    voc_parts: {device_class: 'volatile_organic_compounds_parts', state_class: 'measurement'},
    vibration_timeout: {entity_category: 'config', icon: 'mdi:timer'},
    voltage: {
        device_class: 'voltage',
        enabled_by_default: false,
        entity_category: 'diagnostic',
        state_class: 'measurement',
    },
    voltage_phase_b: {
        device_class: 'voltage',
        enabled_by_default: false,
        entity_category: 'diagnostic',
        state_class: 'measurement',
    },
    voltage_phase_c: {
        device_class: 'voltage',
        enabled_by_default: false,
        entity_category: 'diagnostic',
        state_class: 'measurement',
    },
    water_consumed: {
        device_class: 'water',
        state_class: 'total_increasing',
    },
    x_axis: {icon: 'mdi:axis-x-arrow'},
    y_axis: {icon: 'mdi:axis-y-arrow'},
    z_axis: {icon: 'mdi:axis-z-arrow'},
} as const;
const ENUM_DISCOVERY_LOOKUP: {[s: string]: KeyValue} = {
    action: {icon: 'mdi:gesture-double-tap'},
    alarm_humidity: {entity_category: 'config', icon: 'mdi:water-percent-alert'},
    alarm_temperature: {entity_category: 'config', icon: 'mdi:thermometer-alert'},
    backlight_auto_dim: {entity_category: 'config', icon: 'mdi:brightness-auto'},
    backlight_mode: {entity_category: 'config', icon: 'mdi:lightbulb'},
    calibrate: {icon: 'mdi:tune'},
    color_power_on_behavior: {entity_category: 'config', icon: 'mdi:palette'},
    control_mode: {entity_category: 'config', icon: 'mdi:tune'},
    device_mode: {entity_category: 'config', icon: 'mdi:tune'},
    effect: {enabled_by_default: false, icon: 'mdi:palette'},
    force: {entity_category: 'config', icon: 'mdi:valve'},
    keep_time: {entity_category: 'config', icon: 'mdi:av-timer'},
    identify: {device_class: 'identify'},
    keypad_lockout: {entity_category: 'config', icon: 'mdi:lock'},
    load_detection_mode: {entity_category: 'config', icon: 'mdi:tune'},
    load_dimmable: {entity_category: 'config', icon: 'mdi:chart-bell-curve'},
    load_type: {entity_category: 'config', icon: 'mdi:led-on'},
    melody: {entity_category: 'config', icon: 'mdi:music-note'},
    mode_phase_control: {entity_category: 'config', icon: 'mdi:tune'},
    mode: {entity_category: 'config', icon: 'mdi:tune'},
    mode_switch: {icon: 'mdi:tune'},
    motion_sensitivity: {entity_category: 'config', icon: 'mdi:tune'},
    operation_mode: {entity_category: 'config', icon: 'mdi:tune'},
    power_on_behavior: {entity_category: 'config', icon: 'mdi:power-settings'},
    power_outage_memory: {entity_category: 'config', icon: 'mdi:power-settings'},
    power_supply_mode: {entity_category: 'config', icon: 'mdi:power-settings'},
    power_type: {entity_category: 'config', icon: 'mdi:lightning-bolt-circle'},
    restart: {device_class: 'restart'},
    sensitivity: {entity_category: 'config', icon: 'mdi:tune'},
    sensor: {icon: 'mdi:tune'},
    sensors_type: {entity_category: 'config', icon: 'mdi:tune'},
    sound_volume: {entity_category: 'config', icon: 'mdi:volume-high'},
    status: {icon: 'mdi:state-machine'},
    switch_type: {entity_category: 'config', icon: 'mdi:tune'},
    temperature_display_mode: {entity_category: 'config', icon: 'mdi:thermometer'},
    temperature_sensor_select: {entity_category: 'config', icon: 'mdi:home-thermometer'},
    thermostat_unit: {entity_category: 'config', icon: 'mdi:thermometer'},
    update: {device_class: 'update'},
    volume: {entity_category: 'config', icon: 'mdi: volume-high'},
    week: {entity_category: 'config', icon: 'mdi:calendar-clock'},
} as const;
const LIST_DISCOVERY_LOOKUP: {[s: string]: KeyValue} = {
    action: {icon: 'mdi:gesture-double-tap'},
    color_options: {icon: 'mdi:palette'},
    level_config: {entity_category: 'diagnostic'},
    programming_mode: {icon: 'mdi:calendar-clock'},
    schedule_settings: {icon: 'mdi:calendar-clock'},
} as const;

const featurePropertyWithoutEndpoint = (feature: zhc.Feature): string => {
    if (feature.endpoint) {
        return feature.property.slice(0, -1 + -1 * feature.endpoint.length);
    } else {
        return feature.property;
    }
};

/**
 * This class handles the bridge entity configuration for Home Assistant Discovery.
 */
class Bridge {
    private coordinatorIeeeAddress: string;
    private coordinatorType: string;
    private coordinatorFirmwareVersion: string;
    private discoveryEntries: DiscoveryEntry[];

    readonly options: {
        ID?: string;
        homeassistant?: KeyValue;
    };

    get ID(): string {
        return this.coordinatorIeeeAddress;
    }
    get name(): string {
        return 'bridge';
    }
    get hardwareVersion(): string {
        return this.coordinatorType;
    }
    get firmwareVersion(): string {
        return this.coordinatorFirmwareVersion;
    }
    get configs(): DiscoveryEntry[] {
        return this.discoveryEntries;
    }

    constructor(ieeeAdress: string, version: zh.CoordinatorVersion, discovery: DiscoveryEntry[]) {
        this.coordinatorIeeeAddress = ieeeAdress;
        this.coordinatorType = version.type;
        /* istanbul ignore next */
        this.coordinatorFirmwareVersion = version.meta.revision ? `${version.meta.revision}` : '';
        this.discoveryEntries = discovery;

        this.options = {
            ID: `bridge_${ieeeAdress}`,
            homeassistant: {
                name: `Zigbee2MQTT Bridge`,
            },
        };
    }

    isDevice(): this is Device {
        return false;
    }
    isGroup(): this is Group {
        return false;
    }
}

/**
 * This extensions handles integration with HomeAssistant
 */
export default class HomeAssistant extends Extension {
    private discovered: {[s: string]: Discovered} = {};
    private discoveryTopic: string;
    private discoveryRegex: RegExp;
    private discoveryRegexWoTopic = new RegExp(`(.*)/(.*)/(.*)/config`);
    private statusTopic: string;
    private entityAttributes: boolean;
    private legacyTrigger: boolean;
    // @ts-expect-error initialized in `start`
    private zigbee2MQTTVersion: string;
    // @ts-expect-error initialized in `start`
    private discoveryOrigin: {name: string; sw: string; url: string};
    // @ts-expect-error initialized in `start`
    private bridge: Bridge;
    // @ts-expect-error initialized in `start`
    private bridgeIdentifier: string;

    constructor(
        zigbee: Zigbee,
        mqtt: MQTT,
        state: State,
        publishEntityState: PublishEntityState,
        eventBus: EventBus,
        enableDisableExtension: (enable: boolean, name: string) => Promise<void>,
        restartCallback: () => Promise<void>,
        addExtension: (extension: Extension) => Promise<void>,
    ) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);
        if (settings.get().advanced.output === 'attribute') {
            throw new Error('Home Assistant integration is not possible with attribute output!');
        }

        const haSettings = settings.get().homeassistant;
        assert(haSettings, 'Home Assistant extension used without settings');
        this.discoveryTopic = haSettings.discovery_topic;
        this.discoveryRegex = new RegExp(`${haSettings.discovery_topic}/(.*)/(.*)/(.*)/config`);
        this.statusTopic = haSettings.status_topic;
        this.entityAttributes = haSettings.legacy_entity_attributes;
        this.legacyTrigger = haSettings.legacy_triggers;
        if (haSettings.discovery_topic === settings.get().mqtt.base_topic) {
            throw new Error(`'homeassistant.discovery_topic' cannot not be equal to the 'mqtt.base_topic' (got '${settings.get().mqtt.base_topic}')`);
        }
    }

    override async start(): Promise<void> {
        if (!settings.get().advanced.cache_state) {
            logger.warning('In order for Home Assistant integration to work properly set `cache_state: true');
        }

        this.zigbee2MQTTVersion = (await utils.getZigbee2MQTTVersion(false)).version;
        this.discoveryOrigin = {name: 'Zigbee2MQTT', sw: this.zigbee2MQTTVersion, url: 'https://www.zigbee2mqtt.io'};
        this.bridge = this.getBridgeEntity(await this.zigbee.getCoordinatorVersion());
        this.bridgeIdentifier = this.getDevicePayload(this.bridge).identifiers[0];
        this.eventBus.onEntityRemoved(this, this.onEntityRemoved);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onEntityRenamed(this, this.onEntityRenamed);
        this.eventBus.onPublishEntityState(this, this.onPublishEntityState);
        this.eventBus.onGroupMembersChanged(this, this.onGroupMembersChanged);
        this.eventBus.onDeviceAnnounce(this, this.onZigbeeEvent);
        this.eventBus.onDeviceJoined(this, this.onZigbeeEvent);
        this.eventBus.onDeviceInterview(this, this.onZigbeeEvent);
        this.eventBus.onDeviceMessage(this, this.onZigbeeEvent);
        this.eventBus.onScenesChanged(this, this.onScenesChanged);
        this.eventBus.onEntityOptionsChanged(this, async (data) => await this.discover(data.entity));
        this.eventBus.onExposesChanged(this, async (data) => await this.discover(data.device));

        this.mqtt.subscribe(this.statusTopic);
        this.mqtt.subscribe(DEFAULT_STATUS_TOPIC);

        /**
         * Prevent unnecessary re-discovery of entities by waiting 5 seconds for retained discovery messages to come in.
         * Any received discovery messages will not be published again.
         * Unsubscribe from the discoveryTopic to prevent receiving our own messages.
         */
        const discoverWait = 5;
        // Discover with `published = false`, this will populate `this.discovered` without publishing the discoveries.
        // This is needed for clearing outdated entries in `this.onMQTTMessage()`
        await this.discover(this.bridge, false);

        for (const e of this.zigbee.devicesAndGroupsIterator(utils.deviceNotCoordinator)) {
            await this.discover(e, false);
        }

        logger.debug(`Discovering entities to Home Assistant in ${discoverWait}s`);
        this.mqtt.subscribe(`${this.discoveryTopic}/#`);
        setTimeout(async () => {
            this.mqtt.unsubscribe(`${this.discoveryTopic}/#`);
            logger.debug(`Discovering entities to Home Assistant`);

            await this.discover(this.bridge);

            for (const e of this.zigbee.devicesAndGroupsIterator(utils.deviceNotCoordinator)) {
                await this.discover(e);
            }
        }, utils.seconds(discoverWait));

        // Send availability messages, this is required if the legacy_availability_payload option has been changed.
        this.eventBus.emitPublishAvailability();
    }

    private getDiscovered(entity: Device | Group | Bridge | string | number): Discovered {
        const ID = typeof entity === 'string' || typeof entity === 'number' ? entity : entity.ID;
        if (!(ID in this.discovered)) {
            this.discovered[ID] = {messages: {}, triggers: new Set(), mockProperties: new Set(), discovered: false};
        }
        return this.discovered[ID];
    }

    private exposeToConfig(
        exposes: zhc.Expose[],
        entityType: 'device' | 'group',
        allExposes: zhc.Expose[],
        definition?: zhc.Definition,
    ): DiscoveryEntry[] {
        // For groups an array of exposes (of the same type) is passed, this is to determine e.g. what features
        // to use for a bulb (e.g. color_xy/color_temp)
        assert(entityType === 'group' || exposes.length === 1, 'Multiple exposes for device not allowed');
        const firstExpose = exposes[0];
        assert(entityType === 'device' || GROUP_SUPPORTED_TYPES.includes(firstExpose.type), `Unsupported expose type ${firstExpose.type} for group`);

        const discoveryEntries: DiscoveryEntry[] = [];
        const endpoint = entityType === 'device' ? exposes[0].endpoint : undefined;
        const getProperty = (feature: zhc.Feature): string => (entityType === 'group' ? featurePropertyWithoutEndpoint(feature) : feature.property);

        switch (firstExpose.type) {
            case 'light': {
                const hasColorXY = (exposes as zhc.Light[]).find((expose) => expose.features.find((e) => e.name === 'color_xy'));
                const hasColorHS = (exposes as zhc.Light[]).find((expose) => expose.features.find((e) => e.name === 'color_hs'));
                const hasBrightness = (exposes as zhc.Light[]).find((expose) => expose.features.find((e) => e.name === 'brightness'));
                const hasColorTemp = (exposes as zhc.Light[]).find((expose) => expose.features.find((e) => e.name === 'color_temp'));
                const state = (firstExpose as zhc.Light).features.find((f) => f.name === 'state');
                assert(state, `Light expose must have a 'state'`);
                // Prefer HS over XY when at least one of the lights in the group prefers HS over XY.
                // A light prefers HS over XY when HS is earlier in the feature array than HS.
                const preferHS =
                    (exposes as zhc.Light[])
                        .map((e) => [e.features.findIndex((ee) => ee.name === 'color_xy'), e.features.findIndex((ee) => ee.name === 'color_hs')])
                        .filter((d) => d[0] !== -1 && d[1] !== -1 && d[1] < d[0]).length !== 0;

                const discoveryEntry: DiscoveryEntry = {
                    type: 'light',
                    object_id: endpoint ? `light_${endpoint}` : 'light',
                    mockProperties: [{property: state.property, value: null}],
                    discovery_payload: {
                        name: endpoint ? utils.capitalize(endpoint) : null,
                        brightness: !!hasBrightness,
                        schema: 'json',
                        command_topic: true,
                        brightness_scale: 254,
                        command_topic_prefix: endpoint,
                        state_topic_postfix: endpoint,
                    },
                };

                const colorModes = [
                    hasColorXY && !preferHS ? 'xy' : null,
                    (!hasColorXY || preferHS) && hasColorHS ? 'hs' : null,
                    hasColorTemp ? 'color_temp' : null,
                ].filter((c) => c);

                if (colorModes.length) {
                    discoveryEntry.discovery_payload.supported_color_modes = colorModes;
                }

                if (hasColorTemp) {
                    const colorTemps = (exposes as zhc.Light[])
                        .map((expose) => expose.features.find((e) => e.name === 'color_temp'))
                        .filter((e) => e !== undefined && isNumericExpose(e));
                    const max = Math.min(...colorTemps.map((e) => e.value_max).filter((e) => e !== undefined));
                    const min = Math.max(...colorTemps.map((e) => e.value_min).filter((e) => e !== undefined));
                    discoveryEntry.discovery_payload.max_mireds = max;
                    discoveryEntry.discovery_payload.min_mireds = min;
                }

                const effects = utils.arrayUnique(
                    utils.flatten(
                        allExposes
                            .filter(isEnumExpose)
                            .filter((e) => e.name === 'effect')
                            .map((e) => e.values),
                    ),
                );
                if (effects.length) {
                    discoveryEntry.discovery_payload.effect = true;
                    discoveryEntry.discovery_payload.effect_list = effects;
                }

                discoveryEntries.push(discoveryEntry);
                break;
            }
            case 'switch': {
                const state = (firstExpose as zhc.Switch).features.filter(isBinaryExpose).find((f) => f.name === 'state');
                assert(state, `Switch expose must have a 'state'`);
                const property = getProperty(state);
                const discoveryEntry: DiscoveryEntry = {
                    type: 'switch',
                    object_id: endpoint ? `switch_${endpoint}` : 'switch',
                    mockProperties: [{property: property, value: null}],
                    discovery_payload: {
                        name: endpoint ? utils.capitalize(endpoint) : null,
                        payload_off: state.value_off,
                        payload_on: state.value_on,
                        value_template: `{{ value_json.${property} }}`,
                        command_topic: true,
                        command_topic_prefix: endpoint,
                    },
                };

                if (SWITCH_DIFFERENT.includes(property)) {
                    discoveryEntry.discovery_payload.name = firstExpose.label;
                    discoveryEntry.discovery_payload.command_topic_postfix = property;
                    discoveryEntry.discovery_payload.state_off = state.value_off;
                    discoveryEntry.discovery_payload.state_on = state.value_on;
                    discoveryEntry.object_id = property;

                    if (property === 'window_detection') {
                        discoveryEntry.discovery_payload.icon = 'mdi:window-open-variant';
                    }
                }

                discoveryEntries.push(discoveryEntry);
                break;
            }
            case 'climate': {
                const setpointProperties = ['occupied_heating_setpoint', 'current_heating_setpoint'];
                const setpoint = (firstExpose as zhc.Climate).features.filter(isNumericExpose).find((f) => setpointProperties.includes(f.name));
                assert(
                    setpoint && setpoint.value_min !== undefined && setpoint.value_max !== undefined,
                    'No setpoint found or it is missing value_min/max',
                );
                const temperature = (firstExpose as zhc.Climate).features.find((f) => f.name === 'local_temperature');
                assert(temperature, 'No temperature found');

                const discoveryEntry: DiscoveryEntry = {
                    type: 'climate',
                    object_id: endpoint ? `climate_${endpoint}` : 'climate',
                    mockProperties: [],
                    discovery_payload: {
                        name: endpoint ? utils.capitalize(endpoint) : null,
                        // Static
                        state_topic: false,
                        temperature_unit: 'C',
                        // Setpoint
                        temp_step: setpoint.value_step,
                        min_temp: setpoint.value_min.toString(),
                        max_temp: setpoint.value_max.toString(),
                        // Temperature
                        current_temperature_topic: true,
                        current_temperature_template: `{{ value_json.${temperature.property} }}`,
                        command_topic_prefix: endpoint,
                    },
                };

                const mode = (firstExpose as zhc.Climate).features.filter(isEnumExpose).find((f) => f.name === 'system_mode');
                if (mode) {
                    if (mode.values.includes('sleep')) {
                        // 'sleep' is not supported by Home Assistant, but is valid according to ZCL
                        // TRV that support sleep (e.g. Viessmann) will have it removed from here,
                        // this allows other expose consumers to still use it, e.g. the frontend.
                        mode.values.splice(mode.values.indexOf('sleep'), 1);
                    }
                    discoveryEntry.discovery_payload.mode_state_topic = true;
                    discoveryEntry.discovery_payload.mode_state_template = `{{ value_json.${mode.property} }}`;
                    discoveryEntry.discovery_payload.modes = mode.values;
                    discoveryEntry.discovery_payload.mode_command_topic = true;
                }

                const state = (firstExpose as zhc.Climate).features.find((f) => f.name === 'running_state');
                if (state) {
                    discoveryEntry.mockProperties.push({property: state.property, value: null});
                    discoveryEntry.discovery_payload.action_topic = true;
                    discoveryEntry.discovery_payload.action_template =
                        `{% set values = ` +
                        `{None:None,'idle':'idle','heat':'heating','cool':'cooling','fan_only':'fan'}` +
                        ` %}{{ values[value_json.${state.property}] }}`;
                }

                const coolingSetpoint = (firstExpose as zhc.Climate).features.find((f) => f.name === 'occupied_cooling_setpoint');
                if (coolingSetpoint) {
                    discoveryEntry.discovery_payload.temperature_low_command_topic = setpoint.name;
                    discoveryEntry.discovery_payload.temperature_low_state_template = `{{ value_json.${setpoint.property} }}`;
                    discoveryEntry.discovery_payload.temperature_low_state_topic = true;
                    discoveryEntry.discovery_payload.temperature_high_command_topic = coolingSetpoint.name;
                    discoveryEntry.discovery_payload.temperature_high_state_template = `{{ value_json.${coolingSetpoint.property} }}`;
                    discoveryEntry.discovery_payload.temperature_high_state_topic = true;
                } else {
                    discoveryEntry.discovery_payload.temperature_command_topic = setpoint.name;
                    discoveryEntry.discovery_payload.temperature_state_template = `{{ value_json.${setpoint.property} }}`;
                    discoveryEntry.discovery_payload.temperature_state_topic = true;
                }

                const fanMode = (firstExpose as zhc.Climate).features.filter(isEnumExpose).find((f) => f.name === 'fan_mode');
                if (fanMode) {
                    discoveryEntry.discovery_payload.fan_modes = fanMode.values;
                    discoveryEntry.discovery_payload.fan_mode_command_topic = true;
                    discoveryEntry.discovery_payload.fan_mode_state_template = `{{ value_json.${fanMode.property} }}`;
                    discoveryEntry.discovery_payload.fan_mode_state_topic = true;
                }

                const swingMode = (firstExpose as zhc.Climate).features.filter(isEnumExpose).find((f) => f.name === 'swing_mode');
                if (swingMode) {
                    discoveryEntry.discovery_payload.swing_modes = swingMode.values;
                    discoveryEntry.discovery_payload.swing_mode_command_topic = true;
                    discoveryEntry.discovery_payload.swing_mode_state_template = `{{ value_json.${swingMode.property} }}`;
                    discoveryEntry.discovery_payload.swing_mode_state_topic = true;
                }

                const preset = (firstExpose as zhc.Climate).features.filter(isEnumExpose).find((f) => f.name === 'preset');
                if (preset) {
                    discoveryEntry.discovery_payload.preset_modes = preset.values;
                    discoveryEntry.discovery_payload.preset_mode_command_topic = 'preset';
                    discoveryEntry.discovery_payload.preset_mode_value_template = `{{ value_json.${preset.property} }}`;
                    discoveryEntry.discovery_payload.preset_mode_state_topic = true;
                }

                const tempCalibration = (firstExpose as zhc.Climate).features
                    .filter(isNumericExpose)
                    .find((f) => f.name === 'local_temperature_calibration');
                if (tempCalibration) {
                    const discoveryEntry: DiscoveryEntry = {
                        type: 'number',
                        object_id: endpoint ? `${tempCalibration.name}_${endpoint}` : `${tempCalibration.name}`,
                        mockProperties: [{property: tempCalibration.property, value: null}],
                        discovery_payload: {
                            name: endpoint ? `${tempCalibration.label} ${endpoint}` : tempCalibration.label,
                            value_template: `{{ value_json.${tempCalibration.property} }}`,
                            command_topic: true,
                            command_topic_prefix: endpoint,
                            command_topic_postfix: tempCalibration.property,
                            device_class: 'temperature',
                            entity_category: 'config',
                            icon: 'mdi:math-compass',
                            ...(tempCalibration.unit && {unit_of_measurement: tempCalibration.unit}),
                        },
                    };

                    // istanbul ignore else
                    if (tempCalibration.value_min != null) discoveryEntry.discovery_payload.min = tempCalibration.value_min;
                    // istanbul ignore else
                    if (tempCalibration.value_max != null) discoveryEntry.discovery_payload.max = tempCalibration.value_max;
                    // istanbul ignore else
                    if (tempCalibration.value_step != null) {
                        discoveryEntry.discovery_payload.step = tempCalibration.value_step;
                    }
                    discoveryEntries.push(discoveryEntry);
                }

                const piHeatingDemand = (firstExpose as zhc.Climate).features.filter(isNumericExpose).find((f) => f.name === 'pi_heating_demand');
                if (piHeatingDemand) {
                    const discoveryEntry: DiscoveryEntry = {
                        type: 'sensor',
                        object_id: endpoint ? /* istanbul ignore next */ `${piHeatingDemand.name}_${endpoint}` : `${piHeatingDemand.name}`,
                        mockProperties: [{property: piHeatingDemand.property, value: null}],
                        discovery_payload: {
                            name: endpoint ? /* istanbul ignore next */ `${piHeatingDemand.label} ${endpoint}` : piHeatingDemand.label,
                            value_template: `{{ value_json.${piHeatingDemand.property} }}`,
                            ...(piHeatingDemand.unit && {unit_of_measurement: piHeatingDemand.unit}),
                            entity_category: 'diagnostic',
                            icon: 'mdi:radiator',
                        },
                    };

                    discoveryEntries.push(discoveryEntry);
                }

                discoveryEntries.push(discoveryEntry);
                break;
            }
            case 'lock': {
                assert(!endpoint, `Endpoint not supported for lock type`);
                const state = (firstExpose as zhc.Lock).features.filter(isBinaryExpose).find((f) => f.name === 'state');
                assert(state, `Lock expose must have a 'state'`);
                const discoveryEntry: DiscoveryEntry = {
                    type: 'lock',
                    object_id: 'lock',
                    mockProperties: [{property: state.property, value: null}],
                    discovery_payload: {
                        name: null,
                        command_topic: true,
                        value_template: `{{ value_json.${state.property} }}`,
                    },
                };

                // istanbul ignore if
                if (state.property === 'keypad_lockout') {
                    // deprecated: keypad_lockout is messy, but changing is breaking
                    discoveryEntry.discovery_payload.name = firstExpose.label;
                    discoveryEntry.discovery_payload.payload_lock = state.value_on;
                    discoveryEntry.discovery_payload.payload_unlock = state.value_off;
                    discoveryEntry.discovery_payload.state_topic = true;
                    discoveryEntry.object_id = 'keypad_lock';
                } else if (state.property === 'child_lock') {
                    // deprecated: child_lock is messy, but changing is breaking
                    discoveryEntry.discovery_payload.name = firstExpose.label;
                    discoveryEntry.discovery_payload.payload_lock = state.value_on;
                    discoveryEntry.discovery_payload.payload_unlock = state.value_off;
                    discoveryEntry.discovery_payload.state_locked = 'LOCK';
                    discoveryEntry.discovery_payload.state_unlocked = 'UNLOCK';
                    discoveryEntry.discovery_payload.state_topic = true;
                    discoveryEntry.object_id = 'child_lock';
                } else {
                    discoveryEntry.discovery_payload.state_locked = state.value_on;
                    discoveryEntry.discovery_payload.state_unlocked = state.value_off;
                }

                if (state.property !== 'state') {
                    discoveryEntry.discovery_payload.command_topic_postfix = state.property;
                }

                discoveryEntries.push(discoveryEntry);
                break;
            }
            case 'cover': {
                const state = (exposes as zhc.Cover[])
                    .find((expose) => expose.features.find((e) => e.name === 'state'))
                    ?.features.find((f) => f.name === 'state');
                assert(state, `Cover expose must have a 'state'`);
                const position = (exposes as zhc.Cover[])
                    .find((expose) => expose.features.find((e) => e.name === 'position'))
                    ?.features.find((f) => f.name === 'position');
                const tilt = (exposes as zhc.Cover[])
                    .find((expose) => expose.features.find((e) => e.name === 'tilt'))
                    ?.features.find((f) => f.name === 'tilt');
                const motorState = allExposes
                    ?.filter(isEnumExpose)
                    .find((e) => ['motor_state', 'moving'].includes(e.name) && e.access === ACCESS_STATE);
                const running = allExposes?.find((e) => e.type === 'binary' && e.name === 'running');

                const discoveryEntry: DiscoveryEntry = {
                    type: 'cover',
                    mockProperties: [{property: state.property, value: null}],
                    object_id: endpoint ? `cover_${endpoint}` : 'cover',
                    discovery_payload: {
                        name: endpoint ? utils.capitalize(endpoint) : null,
                        command_topic_prefix: endpoint,
                        command_topic: true,
                        state_topic: true,
                        state_topic_postfix: endpoint,
                    },
                };

                // If curtains have `running` property, use this in discovery.
                // The movement direction is calculated (assumed) in this case.
                if (running) {
                    assert(position, `Cover must have 'position' when it has 'running'`);
                    discoveryEntry.discovery_payload.value_template =
                        `{% if "${running.property}" in value_json ` +
                        `and value_json.${running.property} %} {% if value_json.${position.property} > 0 %} closing ` +
                        `{% else %} opening {% endif %} {% else %} stopped {% endif %}`;
                }

                // If curtains have `motor_state` or `moving` property, lookup for possible
                // state names to detect movement direction and use this in discovery.
                if (motorState) {
                    const openingState = motorState.values.find((s) => COVER_OPENING_LOOKUP.includes(s.toString().toLowerCase()));
                    const closingState = motorState.values.find((s) => COVER_CLOSING_LOOKUP.includes(s.toString().toLowerCase()));
                    const stoppedState = motorState.values.find((s) => COVER_STOPPED_LOOKUP.includes(s.toString().toLowerCase()));

                    // istanbul ignore else
                    if (openingState && closingState && stoppedState) {
                        discoveryEntry.discovery_payload.state_opening = openingState;
                        discoveryEntry.discovery_payload.state_closing = closingState;
                        discoveryEntry.discovery_payload.state_stopped = stoppedState;
                        discoveryEntry.discovery_payload.value_template =
                            `{% if "${motorState.property}" in value_json ` +
                            `and value_json.${motorState.property} %} {{ value_json.${motorState.property} }} {% else %} ` +
                            `${stoppedState} {% endif %}`;
                    }
                }

                // If curtains do not have `running`, `motor_state` or `moving` properties.
                if (!discoveryEntry.discovery_payload.value_template) {
                    discoveryEntry.discovery_payload.value_template = `{{ value_json.${featurePropertyWithoutEndpoint(state)} }}`;
                    discoveryEntry.discovery_payload.state_open = 'OPEN';
                    discoveryEntry.discovery_payload.state_closed = 'CLOSE';
                    discoveryEntry.discovery_payload.state_stopped = 'STOP';
                }

                // istanbul ignore if
                if (!position && !tilt) {
                    discoveryEntry.discovery_payload.optimistic = true;
                }

                if (position) {
                    discoveryEntry.discovery_payload = {
                        ...discoveryEntry.discovery_payload,
                        position_template: `{{ value_json.${featurePropertyWithoutEndpoint(position)} }}`,
                        set_position_template: `{ "${getProperty(position)}": {{ position }} }`,
                        set_position_topic: true,
                        position_topic: true,
                    };
                }

                if (tilt) {
                    discoveryEntry.discovery_payload = {
                        ...discoveryEntry.discovery_payload,
                        tilt_command_topic: true,
                        tilt_status_topic: true,
                        tilt_status_template: `{{ value_json.${featurePropertyWithoutEndpoint(tilt)} }}`,
                    };
                }

                discoveryEntries.push(discoveryEntry);
                break;
            }
            case 'fan': {
                assert(!endpoint, `Endpoint not supported for fan type`);
                const discoveryEntry: DiscoveryEntry = {
                    type: 'fan',
                    object_id: 'fan',
                    mockProperties: [{property: 'fan_state', value: null}],
                    discovery_payload: {
                        name: null,
                        state_topic: true,
                        state_value_template: '{{ value_json.fan_state }}',
                        command_topic: true,
                        command_topic_postfix: 'fan_state',
                    },
                };

                const speed = (firstExpose as zhc.Fan).features.filter(isEnumExpose).find((e) => e.name === 'mode');
                // istanbul ignore else
                if (speed) {
                    // A fan entity in Home Assistant 2021.3 and above may have a speed,
                    // controlled by a percentage from 1 to 100, and/or non-speed presets.
                    // The MQTT Fan integration allows the speed percentage to be mapped
                    // to a narrower range of speeds (e.g. 1-3), and for these speeds to be
                    // translated to and from MQTT messages via templates.
                    //
                    // For the fixed fan modes in ZCL hvacFanCtrl, we model speeds "low",
                    // "medium", and "high" as three speeds covering the full percentage
                    // range as done in Home Assistant's zigpy fan integration, plus
                    // presets "on", "auto" and "smart" to cover the remaining modes in
                    // ZCL. This supports a generic ZCL HVAC Fan Control fan. "Off" is
                    // always a valid speed.
                    let speeds = ['off'].concat(
                        ['low', 'medium', 'high', '1', '2', '3', '4', '5', '6', '7', '8', '9'].filter((s) => speed.values.includes(s)),
                    );
                    let presets = ['on', 'auto', 'smart'].filter((s) => speed.values.includes(s));

                    if (['99432'].includes(definition!.model)) {
                        // The Hampton Bay 99432 fan implements 4 speeds using the ZCL
                        // hvacFanCtrl values `low`, `medium`, `high`, and `on`, and
                        // 1 preset called "Comfort Breeze" using the ZCL value `smart`.
                        // ZCL value `auto` is unused.
                        speeds = ['off', 'low', 'medium', 'high', 'on'];
                        presets = ['smart'];
                    }

                    const allowed = [...speeds, ...presets];
                    speed.values.forEach((s) => assert(allowed.includes(s.toString())));
                    const percentValues = speeds.map((s, i) => `'${s}':${i}`).join(', ');
                    const percentCommands = speeds.map((s, i) => `${i}:'${s}'`).join(', ');
                    const presetList = presets.map((s) => `'${s}'`).join(', ');

                    discoveryEntry.discovery_payload.percentage_state_topic = true;
                    discoveryEntry.discovery_payload.percentage_command_topic = true;
                    discoveryEntry.discovery_payload.percentage_value_template = `{{ {${percentValues}}[value_json.${speed.property}] | default('None') }}`;
                    discoveryEntry.discovery_payload.percentage_command_template = `{{ {${percentCommands}}[value] | default('') }}`;
                    discoveryEntry.discovery_payload.speed_range_min = 1;
                    discoveryEntry.discovery_payload.speed_range_max = speeds.length - 1;
                    assert(presets.length !== 0);
                    discoveryEntry.discovery_payload.preset_mode_state_topic = true;
                    discoveryEntry.discovery_payload.preset_mode_command_topic = 'fan_mode';
                    discoveryEntry.discovery_payload.preset_mode_value_template = `{{ value_json.${speed.property} if value_json.${speed.property} in [${presetList}] else 'None' | default('None') }}`;
                    discoveryEntry.discovery_payload.preset_modes = presets;
                }

                discoveryEntries.push(discoveryEntry);
                break;
            }
            case 'binary': {
                /**
                 * If Z2M binary attribute has SET access then expose it as `switch` in HA
                 * There is also a check on the values for typeof boolean to prevent invalid values and commands
                 * silently failing - commands work fine but some devices won't reject unexpected values.
                 * https://github.com/Koenkk/zigbee2mqtt/issues/7740
                 */
                assertBinaryExpose(firstExpose);
                if (firstExpose.access & ACCESS_SET) {
                    const discoveryEntry: DiscoveryEntry = {
                        type: 'switch',
                        mockProperties: [{property: firstExpose.property, value: null}],
                        object_id: endpoint ? `switch_${firstExpose.name}_${endpoint}` : `switch_${firstExpose.name}`,
                        discovery_payload: {
                            name: endpoint ? `${firstExpose.label} ${endpoint}` : firstExpose.label,
                            value_template:
                                typeof firstExpose.value_on === 'boolean'
                                    ? `{% if value_json.${firstExpose.property} %}true{% else %}false{% endif %}`
                                    : `{{ value_json.${firstExpose.property} }}`,
                            payload_on: firstExpose.value_on.toString(),
                            payload_off: firstExpose.value_off.toString(),
                            command_topic: true,
                            command_topic_prefix: endpoint,
                            command_topic_postfix: firstExpose.property,
                            ...(BINARY_DISCOVERY_LOOKUP[firstExpose.name] || {}),
                        },
                    };

                    discoveryEntries.push(discoveryEntry);
                } else {
                    const discoveryEntry: DiscoveryEntry = {
                        type: 'binary_sensor',
                        object_id: endpoint ? `${firstExpose.name}_${endpoint}` : `${firstExpose.name}`,
                        mockProperties: [{property: firstExpose.property, value: null}],
                        discovery_payload: {
                            name: endpoint ? `${firstExpose.label} ${endpoint}` : firstExpose.label,
                            value_template: `{{ value_json.${firstExpose.property} }}`,
                            payload_on: firstExpose.value_on,
                            payload_off: firstExpose.value_off,
                            ...(BINARY_DISCOVERY_LOOKUP[firstExpose.name] || {}),
                        },
                    };

                    discoveryEntries.push(discoveryEntry);
                }
                break;
            }
            case 'numeric': {
                assertNumericExpose(firstExpose);
                const extraAttrs = {};

                // If a variable includes Wh, mark it as energy
                if (firstExpose.unit && ['Wh', 'kWh'].includes(firstExpose.unit)) {
                    Object.assign(extraAttrs, {device_class: 'energy', state_class: 'total_increasing'});
                }

                const allowsSet = firstExpose.access & ACCESS_SET;

                let key = firstExpose.name;

                // Home Assistant uses a different voc device_class for µg/m³ versus ppb or ppm.
                if (firstExpose.name === 'voc' && firstExpose.unit && ['ppb', 'ppm'].includes(firstExpose.unit)) {
                    key = 'voc_parts';
                }

                const discoveryEntry: DiscoveryEntry = {
                    type: 'sensor',
                    object_id: endpoint ? `${firstExpose.name}_${endpoint}` : `${firstExpose.name}`,
                    mockProperties: [{property: firstExpose.property, value: null}],
                    discovery_payload: {
                        name: endpoint ? `${firstExpose.label} ${endpoint}` : firstExpose.label,
                        value_template: `{{ value_json.${firstExpose.property} }}`,
                        enabled_by_default: !allowsSet,
                        ...(firstExpose.unit && {unit_of_measurement: firstExpose.unit}),
                        ...NUMERIC_DISCOVERY_LOOKUP[key],
                        ...extraAttrs,
                    },
                };

                // When a device_class is set, unit_of_measurement must be set, otherwise warnings are generated.
                // https://github.com/Koenkk/zigbee2mqtt/issues/15958#issuecomment-1377483202
                if (discoveryEntry.discovery_payload.device_class && !discoveryEntry.discovery_payload.unit_of_measurement) {
                    delete discoveryEntry.discovery_payload.device_class;
                }

                // entity_category config is not allowed for sensors
                // https://github.com/Koenkk/zigbee2mqtt/issues/20252
                if (discoveryEntry.discovery_payload.entity_category === 'config') {
                    discoveryEntry.discovery_payload.entity_category = 'diagnostic';
                }

                discoveryEntries.push(discoveryEntry);

                /**
                 * If numeric attribute has SET access then expose as SELECT entity too.
                 * Note: currently both sensor and number are discovered, this is to avoid
                 * breaking changes for sensors already existing in HA (legacy).
                 */
                if (allowsSet) {
                    const discoveryEntry: DiscoveryEntry = {
                        type: 'number',
                        object_id: endpoint ? `${firstExpose.name}_${endpoint}` : `${firstExpose.name}`,
                        mockProperties: [{property: firstExpose.property, value: null}],
                        discovery_payload: {
                            name: endpoint ? `${firstExpose.label} ${endpoint}` : firstExpose.label,
                            value_template: `{{ value_json.${firstExpose.property} }}`,
                            command_topic: true,
                            command_topic_prefix: endpoint,
                            command_topic_postfix: firstExpose.property,
                            ...(firstExpose.unit && {unit_of_measurement: firstExpose.unit}),
                            ...(firstExpose.value_step && {step: firstExpose.value_step}),
                            ...NUMERIC_DISCOVERY_LOOKUP[firstExpose.name],
                        },
                    };

                    if (NUMERIC_DISCOVERY_LOOKUP[firstExpose.name]?.device_class === 'temperature') {
                        discoveryEntry.discovery_payload.device_class = NUMERIC_DISCOVERY_LOOKUP[firstExpose.name]?.device_class;
                    } else {
                        delete discoveryEntry.discovery_payload.device_class;
                    }

                    // istanbul ignore else
                    if (firstExpose.value_min != null) discoveryEntry.discovery_payload.min = firstExpose.value_min;
                    // istanbul ignore else
                    if (firstExpose.value_max != null) discoveryEntry.discovery_payload.max = firstExpose.value_max;

                    discoveryEntries.push(discoveryEntry);
                }
                break;
            }
            case 'enum': {
                assertEnumExpose(firstExpose);
                const valueTemplate = firstExpose.access & ACCESS_STATE ? `{{ value_json.${firstExpose.property} }}` : undefined;

                if (firstExpose.access & ACCESS_STATE) {
                    discoveryEntries.push({
                        type: 'sensor',
                        object_id: firstExpose.property,
                        mockProperties: [{property: firstExpose.property, value: null}],
                        discovery_payload: {
                            name: endpoint ? `${firstExpose.label} ${endpoint}` : firstExpose.label,
                            value_template: valueTemplate,
                            enabled_by_default: !(firstExpose.access & ACCESS_SET),
                            ...ENUM_DISCOVERY_LOOKUP[firstExpose.name],
                        },
                    });
                }

                /**
                 * If enum attribute has SET access then expose as SELECT entity too.
                 * Note: currently both sensor and select are discovered, this is to avoid
                 * breaking changes for sensors already existing in HA (legacy).
                 */
                if (firstExpose.access & ACCESS_SET) {
                    discoveryEntries.push({
                        type: 'select',
                        object_id: firstExpose.property,
                        mockProperties: [], // Already mocked above in case access STATE is supported
                        discovery_payload: {
                            name: endpoint ? `${firstExpose.label} ${endpoint}` : firstExpose.label,
                            value_template: valueTemplate,
                            state_topic: !!(firstExpose.access & ACCESS_STATE),
                            command_topic_prefix: endpoint,
                            command_topic: true,
                            command_topic_postfix: firstExpose.property,
                            options: firstExpose.values.map((v) => v.toString()),
                            enabled_by_default: firstExpose.values.length !== 1, // hide if button is exposed
                            ...ENUM_DISCOVERY_LOOKUP[firstExpose.name],
                        },
                    });
                }

                /**
                 * If enum has only item and only supports SET then expose as button entity.
                 * Note: select entity is hidden by default to avoid breaking changes
                 * for selects already existing in HA (legacy).
                 */
                if (firstExpose.access & ACCESS_SET && firstExpose.values.length === 1) {
                    discoveryEntries.push({
                        type: 'button',
                        object_id: firstExpose.property,
                        mockProperties: [],
                        discovery_payload: {
                            name: endpoint ? /* istanbul ignore next */ `${firstExpose.label} ${endpoint}` : firstExpose.label,
                            state_topic: false,
                            command_topic_prefix: endpoint,
                            command_topic: true,
                            command_topic_postfix: firstExpose.property,
                            payload_press: firstExpose.values[0].toString(),
                            ...ENUM_DISCOVERY_LOOKUP[firstExpose.name],
                        },
                    });
                }
                break;
            }
            case 'text':
            case 'composite':
            case 'list': {
                // Deprecated: remove text sensor
                const firstExposeTyped = firstExpose as zhc.Text | zhc.Composite | zhc.List;
                const settableText = firstExposeTyped.type === 'text' && firstExposeTyped.access & ACCESS_SET;
                if (firstExposeTyped.access & ACCESS_STATE) {
                    const discoveryEntry: DiscoveryEntry = {
                        type: 'sensor',
                        object_id: firstExposeTyped.property,
                        mockProperties: [{property: firstExposeTyped.property, value: null}],
                        discovery_payload: {
                            name: endpoint ? `${firstExposeTyped.label} ${endpoint}` : firstExposeTyped.label,
                            // Truncate text if it's too long
                            // https://github.com/Koenkk/zigbee2mqtt/issues/23199
                            value_template: `{{ value_json.${firstExposeTyped.property} | default('',True) | string | truncate(254, True, '', 0) }}`,
                            enabled_by_default: !settableText,
                            ...LIST_DISCOVERY_LOOKUP[firstExposeTyped.name],
                        },
                    };
                    discoveryEntries.push(discoveryEntry);
                }
                if (settableText) {
                    discoveryEntries.push({
                        type: 'text',
                        object_id: firstExposeTyped.property,
                        mockProperties: [], // Already mocked above in case access STATE is supported
                        discovery_payload: {
                            name: endpoint ? `${firstExposeTyped.label} ${endpoint}` : firstExposeTyped.label,
                            state_topic: firstExposeTyped.access & ACCESS_STATE,
                            value_template: `{{ value_json.${firstExposeTyped.property} }}`,
                            command_topic_prefix: endpoint,
                            command_topic: true,
                            command_topic_postfix: firstExposeTyped.property,
                            ...LIST_DISCOVERY_LOOKUP[firstExposeTyped.name],
                        },
                    });
                }
                break;
            }
            /* istanbul ignore next */
            default:
                throw new Error(`Unsupported exposes type: '${firstExpose.type}'`);
        }

        // Exposes with category 'config' or 'diagnostic' are always added to the respective category.
        // This takes precedence over definitions in this file.
        if (firstExpose.category === 'config') {
            discoveryEntries.forEach((d) => (d.discovery_payload.entity_category = 'config'));
        } else if (firstExpose.category === 'diagnostic') {
            discoveryEntries.forEach((d) => (d.discovery_payload.entity_category = 'diagnostic'));
        }

        discoveryEntries.forEach((d) => {
            // If a sensor has entity category `config`, then change
            // it to `diagnostic`. Sensors have no input, so can't be configured.
            // https://github.com/Koenkk/zigbee2mqtt/pull/19474
            if (['binary_sensor', 'sensor'].includes(d.type) && d.discovery_payload.entity_category === 'config') {
                d.discovery_payload.entity_category = 'diagnostic';
            }
        });

        discoveryEntries.forEach((d) => {
            // Let Home Assistant generate entity name when device_class is present
            if (d.discovery_payload.device_class) {
                delete d.discovery_payload.name;
            }
        });

        return discoveryEntries;
    }

    @bind async onEntityRemoved(data: eventdata.EntityRemoved): Promise<void> {
        logger.debug(`Clearing Home Assistant discovery for '${data.name}'`);
        const discovered = this.getDiscovered(data.id);

        for (const topic of Object.keys(discovered.messages)) {
            await this.mqtt.publish(topic, '', {retain: true, qos: 1}, this.discoveryTopic, false, false);
        }

        delete this.discovered[data.id];
    }

    @bind async onGroupMembersChanged(data: eventdata.GroupMembersChanged): Promise<void> {
        await this.discover(data.group);
    }

    @bind async onPublishEntityState(data: eventdata.PublishEntityState): Promise<void> {
        /**
         * In case we deal with a lightEndpoint configuration Zigbee2MQTT publishes
         * e.g. {state_l1: ON, brightness_l1: 250} to zigbee2mqtt/mydevice.
         * As the Home Assistant MQTT JSON light cannot be configured to use state_l1/brightness_l1
         * as the state variables, the state topic is set to zigbee2mqtt/mydevice/l1.
         * Here we retrieve all the attributes with the _l1 values and republish them on
         * zigbee2mqtt/mydevice/l1.
         */
        const entity = this.zigbee.resolveEntity(data.entity.name)!;
        if (entity.isDevice()) {
            for (const topic in this.getDiscovered(entity).messages) {
                const topicMatch = topic.match(this.discoveryRegexWoTopic);

                // istanbul ignore if
                if (!topicMatch) {
                    continue;
                }

                const objectID = topicMatch[3];
                const lightMatch = /^light_(.*)/.exec(objectID);
                const coverMatch = /^cover_(.*)/.exec(objectID);

                const match = lightMatch || coverMatch;

                if (match) {
                    const endpoint = match[1];
                    const endpointRegExp = new RegExp(`(.*)_${endpoint}`);
                    const payload: KeyValue = {};
                    for (const key of Object.keys(data.message)) {
                        const keyMatch = endpointRegExp.exec(key);
                        if (keyMatch) {
                            payload[keyMatch[1]] = data.message[key];
                        }
                    }

                    await this.mqtt.publish(`${data.entity.name}/${endpoint}`, stringify(payload), {});
                }
            }
        }

        /**
         * Publish an empty value for click and action payload, in this way Home Assistant
         * can use Home Assistant entities in automations.
         * https://github.com/Koenkk/zigbee2mqtt/issues/959#issuecomment-480341347
         */
        if (this.legacyTrigger) {
            const keys = ['action', 'click'].filter((k) => data.message[k]);
            for (const key of keys) {
                await this.publishEntityState(data.entity, {[key]: ''});
            }
        }

        /**
         * Implements the MQTT device trigger (https://www.home-assistant.io/integrations/device_trigger.mqtt/)
         * The MQTT device trigger does not support JSON parsing, so it cannot listen to zigbee2mqtt/my_device
         * Whenever a device publish an {action: *} we discover an MQTT device trigger sensor
         * and republish it to zigbee2mqtt/my_device/action
         */
        if (entity.isDevice() && entity.definition) {
            const keys = ['action', 'click'].filter((k) => data.message[k]);
            for (const key of keys) {
                const value = data.message[key].toString();
                await this.publishDeviceTriggerDiscover(entity, key, value);
                await this.mqtt.publish(`${data.entity.name}/${key}`, value, {});
            }
        }
    }

    @bind async onEntityRenamed(data: eventdata.EntityRenamed): Promise<void> {
        logger.debug(`Refreshing Home Assistant discovery topic for '${data.entity.name}'`);

        // Clear before rename so Home Assistant uses new friendly_name
        // https://github.com/Koenkk/zigbee2mqtt/issues/4096#issuecomment-674044916
        if (data.homeAssisantRename) {
            const discovered = this.getDiscovered(data.entity);
            for (const topic of Object.keys(discovered.messages)) {
                await this.mqtt.publish(topic, '', {retain: true, qos: 1}, this.discoveryTopic, false, false);
            }
            discovered.messages = {};

            // Make sure Home Assistant deletes the old entity first otherwise another one (_2) is created
            // https://github.com/Koenkk/zigbee2mqtt/issues/12610
            await utils.sleep(2);
        }

        await this.discover(data.entity);

        if (data.entity.isDevice()) {
            for (const config of this.getDiscovered(data.entity).triggers) {
                const key = config.substring(0, config.indexOf('_'));
                const value = config.substring(config.indexOf('_') + 1);
                await this.publishDeviceTriggerDiscover(data.entity, key, value, true);
            }
        }
    }

    private getConfigs(entity: Device | Group | Bridge): DiscoveryEntry[] {
        const isDevice = entity.isDevice();
        const isGroup = entity.isGroup();
        /* istanbul ignore next */
        if (!entity || (isDevice && !entity.definition)) return [];

        let configs: DiscoveryEntry[] = [];
        if (isDevice) {
            const exposes = entity.exposes(); // avoid calling it hundred of times/s
            for (const expose of exposes) {
                configs.push(...this.exposeToConfig([expose], 'device', exposes, entity.definition));
            }

            for (const mapping of LEGACY_MAPPING) {
                if (mapping.models.includes(entity.definition!.model)) {
                    configs.push(mapping.discovery);
                }
            }

            // @ts-expect-error deprecated in favour of exposes
            const haConfig = entity.definition?.homeassistant;

            /* istanbul ignore if */
            if (haConfig != undefined) {
                configs.push(haConfig);
            }
        } else if (isGroup) {
            // group
            const exposesByType: {[s: string]: zhc.Expose[]} = {};
            const allExposes: zhc.Expose[] = [];

            entity.zh.members
                .map((e) => this.zigbee.resolveEntity(e.getDevice()) as Device)
                .filter((d) => d.definition)
                .forEach((device) => {
                    const exposes = device.exposes();
                    allExposes.push(...exposes);
                    for (const expose of exposes.filter((e) => GROUP_SUPPORTED_TYPES.includes(e.type))) {
                        let key = expose.type;
                        if (['switch', 'lock', 'cover'].includes(expose.type) && expose.endpoint) {
                            // A device can have multiple of these types which have to discovered separately.
                            // e.g. switch with property state and valve_detection.
                            const state = (expose as zhc.Switch | zhc.Lock | zhc.Cover).features.find((f) => f.name === 'state');
                            assert(state, `'switch', 'lock' or 'cover' is missing state`);
                            key += featurePropertyWithoutEndpoint(state);
                        }

                        if (!exposesByType[key]) exposesByType[key] = [];
                        exposesByType[key].push(expose);
                    }
                });

            configs = ([] as DiscoveryEntry[]).concat(
                ...Object.values(exposesByType).map((exposes) => this.exposeToConfig(exposes, 'group', allExposes)),
            );
        } else {
            // Discover bridge config.
            configs.push(...entity.configs);
        }

        if (isDevice && settings.get().advanced.last_seen !== 'disable') {
            const config: DiscoveryEntry = {
                type: 'sensor',
                object_id: 'last_seen',
                mockProperties: [{property: 'last_seen', value: null}],
                discovery_payload: {
                    name: 'Last seen',
                    value_template: '{{ value_json.last_seen }}',
                    icon: 'mdi:clock',
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                },
            };

            /* istanbul ignore else */
            if (settings.get().advanced.last_seen.startsWith('ISO_8601')) {
                config.discovery_payload.device_class = 'timestamp';
            }

            configs.push(config);
        }

        if (isDevice && entity.definition?.ota) {
            const updateStateSensor: DiscoveryEntry = {
                type: 'sensor',
                object_id: 'update_state',
                mockProperties: [], // update is mocked below with updateSensor
                discovery_payload: {
                    name: 'Update state',
                    icon: 'mdi:update',
                    value_template: `{{ value_json['update']['state'] }}`,
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                },
            };

            configs.push(updateStateSensor);
            const updateAvailableSensor: DiscoveryEntry = {
                type: 'binary_sensor',
                object_id: 'update_available',
                mockProperties: [{property: 'update_available', value: null}],
                discovery_payload: {
                    name: null,
                    payload_on: true,
                    payload_off: false,
                    value_template: `{{ value_json['update']['state'] == "available" }}`,
                    enabled_by_default: false,
                    device_class: 'update',
                    entity_category: 'diagnostic',
                },
            };
            configs.push(updateAvailableSensor);
            const updateSensor: DiscoveryEntry = {
                type: 'update',
                object_id: 'update',
                mockProperties: [{property: 'update', value: {state: null}}],
                discovery_payload: {
                    name: null,
                    entity_picture: 'https://github.com/Koenkk/zigbee2mqtt/raw/master/images/logo.png',
                    latest_version_topic: true,
                    state_topic: true,
                    device_class: 'firmware',
                    entity_category: 'config',
                    command_topic: `${settings.get().mqtt.base_topic}/bridge/request/device/ota_update/update`,
                    payload_install: `{"id": "${entity.ieeeAddr}"}`,
                    value_template: `{{ value_json['update']['installed_version'] }}`,
                    latest_version_template: `{{ value_json['update']['latest_version'] }}`,
                    json_attributes_topic: `${settings.get().mqtt.base_topic}/${entity.name}`, // state topic
                    json_attributes_template: `{"in_progress": {{ iif(value_json['update']['state'] == 'updating', 'true', 'false') }} }`,
                },
            };
            configs.push(updateSensor);
        }

        // Discover scenes.
        const endpointsOrGroups = isDevice ? entity.zh.endpoints : isGroup ? [entity.zh] : [];
        endpointsOrGroups.forEach((endpointOrGroup) => {
            utils.getScenes(endpointOrGroup).forEach((scene) => {
                const sceneEntry: DiscoveryEntry = {
                    type: 'scene',
                    object_id: `scene_${scene.id}`,
                    mockProperties: [],
                    discovery_payload: {
                        name: `${scene.name}`,
                        state_topic: false,
                        command_topic: true,
                        payload_on: `{ "scene_recall": ${scene.id} }`,
                        object_id_postfix: `_${scene.name.replace(/\s+/g, '_').toLowerCase()}`,
                    },
                };

                configs.push(sceneEntry);
            });
        });

        if (isDevice && entity.options.legacy !== undefined && !entity.options.legacy) {
            configs = configs.filter((c) => c !== SENSOR_CLICK);
        }

        if (!this.legacyTrigger) {
            configs = configs.filter((c) => c.object_id !== 'action' && c.object_id !== 'click');
        }

        // deep clone of the config objects
        configs = JSON.parse(JSON.stringify(configs));

        if (entity.options.homeassistant) {
            const s = entity.options.homeassistant;
            configs = configs.filter((config) => s[config.object_id] === undefined || s[config.object_id] != null);
            configs.forEach((config) => {
                const configOverride = s[config.object_id];
                if (configOverride) {
                    config.object_id = configOverride.object_id || config.object_id;
                    config.type = configOverride.type || config.type;
                }
            });
        }

        return configs;
    }

    private async discover(entity: Device | Group | Bridge, publish: boolean = true): Promise<void> {
        // Handle type differences.
        const isDevice = entity.isDevice();
        const isGroup = entity.isGroup();

        if (isGroup && entity.zh.members.length === 0) {
            return;
        } else if (
            isDevice &&
            (!entity.definition || entity.zh.interviewing || (entity.options.homeassistant !== undefined && !entity.options.homeassistant))
        ) {
            return;
        }

        const discovered = this.getDiscovered(entity);
        discovered.discovered = true;
        const lastDiscoveredTopics = Object.keys(discovered.messages);
        const newDiscoveredTopics: Set<string> = new Set();

        for (const config of this.getConfigs(entity)) {
            const payload = {...config.discovery_payload};
            const baseTopic = `${settings.get().mqtt.base_topic}/${entity.name}`;
            let stateTopic = baseTopic;
            if (payload.state_topic_postfix) {
                stateTopic += `/${payload.state_topic_postfix}`;
                delete payload.state_topic_postfix;
            }

            if (payload.state_topic === undefined || payload.state_topic) {
                payload.state_topic = stateTopic;
            } else {
                /* istanbul ignore else */
                if (payload.state_topic !== undefined) {
                    delete payload.state_topic;
                }
            }

            if (payload.position_topic) {
                payload.position_topic = stateTopic;
            }

            if (payload.tilt_status_topic) {
                payload.tilt_status_topic = stateTopic;
            }

            if (this.entityAttributes && (isDevice || isGroup)) {
                payload.json_attributes_topic = stateTopic;
            }

            const devicePayload = this.getDevicePayload(entity);

            // Suggest object_id (entity_id) for entity
            payload.object_id = devicePayload.name.replace(/\s+/g, '_').toLowerCase();
            if (config.object_id.startsWith(config.type) && config.object_id.includes('_')) {
                payload.object_id += `_${config.object_id.split(/_(.+)/)[1]}`;
            } else if (!config.object_id.startsWith(config.type)) {
                payload.object_id += `_${config.object_id}`;
            }

            // Allow customization of the `payload.object_id` without touching the other uses of `config.object_id`
            // (e.g. for setting the `payload.unique_id` and as an internal key).
            payload.object_id = `${payload.object_id}${payload.object_id_postfix ?? ''}`;
            delete payload.object_id_postfix;

            // Set unique_id
            payload.unique_id = `${entity.options.ID}_${config.object_id}_${settings.get().mqtt.base_topic}`;

            // Attributes for device registry and origin
            payload.device = devicePayload;
            payload.origin = this.discoveryOrigin;

            // Availability payload (can be disabled by setting `payload.availability = false`).
            if (payload.availability === undefined || payload.availability) {
                payload.availability = [{topic: `${settings.get().mqtt.base_topic}/bridge/state`}];

                if (isDevice || isGroup) {
                    if (utils.isAvailabilityEnabledForEntity(entity, settings.get())) {
                        payload.availability_mode = 'all';
                        payload.availability.push({topic: `${baseTopic}/availability`});
                    }
                } else {
                    // Bridge availability is different.
                    payload.availability_mode = 'all';
                }

                if (isDevice && entity.options.disabled) {
                    // Mark disabled device always as unavailable
                    payload.availability.forEach((a: KeyValue) => (a.value_template = '{{ "offline" }}'));
                } else if (!settings.get().advanced.legacy_availability_payload) {
                    payload.availability.forEach((a: KeyValue) => (a.value_template = '{{ value_json.state }}'));
                }
            } else {
                delete payload.availability;
            }

            const commandTopicPrefix = payload.command_topic_prefix ? `${payload.command_topic_prefix}/` : '';
            delete payload.command_topic_prefix;
            const commandTopicPostfix = payload.command_topic_postfix ? `/${payload.command_topic_postfix}` : '';
            delete payload.command_topic_postfix;
            const commandTopic = `${baseTopic}/${commandTopicPrefix}set${commandTopicPostfix}`;

            if (payload.command_topic && typeof payload.command_topic !== 'string') {
                payload.command_topic = commandTopic;
            }

            if (payload.set_position_topic) {
                payload.set_position_topic = commandTopic;
            }

            if (payload.tilt_command_topic) {
                payload.tilt_command_topic = `${baseTopic}/${commandTopicPrefix}set/tilt`;
            }

            if (payload.mode_state_topic) {
                payload.mode_state_topic = stateTopic;
            }

            if (payload.mode_command_topic) {
                payload.mode_command_topic = `${baseTopic}/${commandTopicPrefix}set/system_mode`;
            }

            if (payload.current_temperature_topic) {
                payload.current_temperature_topic = stateTopic;
            }

            if (payload.temperature_state_topic) {
                payload.temperature_state_topic = stateTopic;
            }

            if (payload.temperature_low_state_topic) {
                payload.temperature_low_state_topic = stateTopic;
            }

            if (payload.temperature_high_state_topic) {
                payload.temperature_high_state_topic = stateTopic;
            }

            if (payload.temperature_command_topic) {
                payload.temperature_command_topic = `${baseTopic}/${commandTopicPrefix}set/${payload.temperature_command_topic}`;
            }

            if (payload.temperature_low_command_topic) {
                payload.temperature_low_command_topic = `${baseTopic}/${commandTopicPrefix}set/${payload.temperature_low_command_topic}`;
            }

            if (payload.temperature_high_command_topic) {
                payload.temperature_high_command_topic = `${baseTopic}/${commandTopicPrefix}set/${payload.temperature_high_command_topic}`;
            }

            if (payload.fan_mode_state_topic) {
                payload.fan_mode_state_topic = stateTopic;
            }

            if (payload.latest_version_topic) {
                payload.latest_version_topic = stateTopic;
            }

            if (payload.fan_mode_command_topic) {
                payload.fan_mode_command_topic = `${baseTopic}/${commandTopicPrefix}set/fan_mode`;
            }

            if (payload.swing_mode_state_topic) {
                payload.swing_mode_state_topic = stateTopic;
            }

            if (payload.swing_mode_command_topic) {
                payload.swing_mode_command_topic = `${baseTopic}/${commandTopicPrefix}set/swing_mode`;
            }

            if (payload.percentage_state_topic) {
                payload.percentage_state_topic = stateTopic;
            }

            if (payload.percentage_command_topic) {
                payload.percentage_command_topic = `${baseTopic}/${commandTopicPrefix}set/fan_mode`;
            }

            if (payload.preset_mode_state_topic) {
                payload.preset_mode_state_topic = stateTopic;
            }

            if (payload.preset_mode_command_topic) {
                payload.preset_mode_command_topic = `${baseTopic}/${commandTopicPrefix}set/` + payload.preset_mode_command_topic;
            }

            if (payload.action_topic) {
                payload.action_topic = stateTopic;
            }

            // Override configuration with user settings.
            if (entity.options.homeassistant != undefined) {
                const add = (obj: KeyValue, ignoreName: boolean): void => {
                    Object.keys(obj).forEach((key) => {
                        if (['type', 'object_id'].includes(key)) {
                            return;
                        } else if (ignoreName && key === 'name') {
                            return;
                        } else if (['number', 'string', 'boolean'].includes(typeof obj[key]) || Array.isArray(obj[key])) {
                            payload[key] = obj[key];
                        } else if (obj[key] === null) {
                            delete payload[key];
                        } else if (key === 'device' && typeof obj[key] === 'object') {
                            Object.keys(obj['device']).forEach((key) => {
                                payload['device'][key] = obj['device'][key];
                            });
                        }
                    });
                };

                add(entity.options.homeassistant, true);

                if (entity.options.homeassistant[config.object_id] != undefined) {
                    add(entity.options.homeassistant[config.object_id], false);
                }
            }

            if (entity.isDevice()) {
                entity.definition?.meta?.overrideHaDiscoveryPayload?.(payload);
            }

            const topic = this.getDiscoveryTopic(config, entity);
            const payloadStr = stringify(payload);
            newDiscoveredTopics.add(topic);

            // Only discover when not discovered yet
            const discoveredMessage = discovered.messages[topic];
            if (!discoveredMessage || discoveredMessage.payload !== payloadStr || !discoveredMessage.published) {
                discovered.messages[topic] = {payload: payloadStr, published: publish};
                if (publish) {
                    await this.mqtt.publish(topic, payloadStr, {retain: true, qos: 1}, this.discoveryTopic, false, false);
                }
            } else {
                logger.debug(`Skipping discovery of '${topic}', already discovered`);
            }
            config.mockProperties?.forEach((mockProperty) => discovered.mockProperties.add(mockProperty));
        }

        for (const topic of lastDiscoveredTopics) {
            const isDeviceAutomation = topic.match(this.discoveryRegexWoTopic)?.[1] === 'device_automation';
            if (!newDiscoveredTopics.has(topic) && !isDeviceAutomation) {
                await this.mqtt.publish(topic, '', {retain: true, qos: 1}, this.discoveryTopic, false, false);
            }
        }
    }

    @bind private async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const discoveryMatch = data.topic.match(this.discoveryRegex);
        const isDeviceAutomation = discoveryMatch && discoveryMatch[1] === 'device_automation';
        if (discoveryMatch) {
            // Clear outdated discovery configs and remember already discovered device_automations
            let message: KeyValue;

            try {
                message = JSON.parse(data.message);
                const baseTopic = settings.get().mqtt.base_topic + '/';
                if (isDeviceAutomation && (!message.topic || !message.topic.startsWith(baseTopic))) {
                    return;
                }

                if (!isDeviceAutomation && (!message.availability || !message.availability[0].topic.startsWith(baseTopic))) {
                    return;
                }
            } catch {
                return;
            }

            // Group discovery topic uses "ENCODEDBASETOPIC_GROUPID", device use ieeeAddr
            const ID = discoveryMatch[2].includes('_') ? discoveryMatch[2].split('_')[1] : discoveryMatch[2];
            const entity = ID === this.bridge.ID ? this.bridge : this.zigbee.resolveEntity(ID);
            let clear = !entity || (entity.isDevice() && !entity.definition);

            // Only save when topic matches otherwise config is not updated when renamed by editing configuration.yaml
            if (entity) {
                const key = `${discoveryMatch[3].substring(0, discoveryMatch[3].indexOf('_'))}`;
                const triggerTopic = `${settings.get().mqtt.base_topic}/${entity.name}/${key}`;
                if (isDeviceAutomation && message.topic === triggerTopic) {
                    this.getDiscovered(ID).triggers.add(discoveryMatch[3]);
                }
            }

            const topic = data.topic.substring(this.discoveryTopic.length + 1);
            if (!clear && !isDeviceAutomation && entity && !(topic in this.getDiscovered(entity).messages)) {
                clear = true;
            }

            // Device was flagged to be excluded from homeassistant discovery
            clear = clear || Boolean(entity && entity.options.homeassistant !== undefined && !entity.options.homeassistant);

            /* istanbul ignore else */
            if (clear) {
                logger.debug(`Clearing outdated Home Assistant config '${data.topic}'`);
                await this.mqtt.publish(topic, '', {retain: true, qos: 1}, this.discoveryTopic, false, false);
            } else if (entity) {
                this.getDiscovered(entity).messages[topic] = {payload: stringify(message), published: true};
            }
        } else if ((data.topic === this.statusTopic || data.topic === DEFAULT_STATUS_TOPIC) && data.message.toLowerCase() === 'online') {
            const timer = setTimeout(async () => {
                // Publish all device states.
                for (const entity of this.zigbee.devicesAndGroupsIterator(utils.deviceNotCoordinator)) {
                    if (this.state.exists(entity)) {
                        await this.publishEntityState(entity, this.state.get(entity), 'publishCached');
                    }
                }

                clearTimeout(timer);
            }, 30000);
        }
    }

    @bind async onZigbeeEvent(data: {device: Device}): Promise<void> {
        if (!this.getDiscovered(data.device).discovered) {
            await this.discover(data.device);
        }
    }

    @bind async onScenesChanged(data: eventdata.ScenesChanged): Promise<void> {
        // Re-trigger MQTT discovery of changed devices and groups, similar to bridge.ts

        // First, clear existing scene discovery topics
        logger.debug(`Clearing Home Assistant scene discovery for '${data.entity.name}'`);
        const discovered = this.getDiscovered(data.entity);

        for (const topic of Object.keys(discovered.messages)) {
            if (topic.startsWith('scene')) {
                await this.mqtt.publish(topic, '', {retain: true, qos: 1}, this.discoveryTopic, false, false);
                delete discovered.messages[topic];
            }
        }

        // Make sure Home Assistant deletes the old entity first otherwise another one (_2) is created
        // https://github.com/Koenkk/zigbee2mqtt/issues/12610
        logger.debug(`Finished clearing scene discovery topics, waiting for Home Assistant.`);
        await utils.sleep(2);

        // Re-discover entity (including any new scenes).
        logger.debug(`Re-discovering entities with their scenes.`);
        await this.discover(data.entity);
    }

    private getDevicePayload(entity: Device | Group | Bridge): KeyValue {
        const identifierPostfix = entity.isGroup() ? `zigbee2mqtt_${this.getEncodedBaseTopic()}` : 'zigbee2mqtt';

        // Allow device name to be overridden by homeassistant config
        let deviceName = entity.name;
        if (typeof entity.options.homeassistant?.name === 'string') {
            deviceName = entity.options.homeassistant.name;
        }

        const payload: KeyValue = {
            identifiers: [`${identifierPostfix}_${entity.options.ID}`],
            name: deviceName,
            sw_version: `Zigbee2MQTT ${this.zigbee2MQTTVersion}`,
        };

        const url = settings.get().frontend?.url ?? '';
        if (entity.isDevice()) {
            assert(entity.definition, `Cannot 'getDevicePayload' for unsupported device`);
            payload.model = `${entity.definition.description} (${entity.definition.model})`;
            payload.manufacturer = entity.definition.vendor;
            payload.sw_version = entity.zh.softwareBuildID;
            payload.configuration_url = `${url}/#/device/${entity.ieeeAddr}/info`;
        } else if (entity.isGroup()) {
            payload.model = 'Group';
            payload.manufacturer = 'Zigbee2MQTT';
            payload.configuration_url = `${url}/#/group/${entity.ID}`;
        } else {
            payload.model = 'Bridge';
            payload.manufacturer = 'Zigbee2MQTT';
            payload.hw_version = `${entity.hardwareVersion} ${entity.firmwareVersion}`;
            payload.sw_version = this.zigbee2MQTTVersion;
            payload.configuration_url = `${url}/#/settings`;
        }

        if (!url) {
            delete payload.configuration_url;
        }

        // Link devices & groups to bridge.
        if (entity !== this.bridge) {
            payload.via_device = this.bridgeIdentifier;
        }

        return payload;
    }

    override adjustMessageBeforePublish(entity: Device | Group | Bridge, message: KeyValue): void {
        this.getDiscovered(entity).mockProperties.forEach((mockProperty) => {
            if (message[mockProperty.property] === undefined) {
                message[mockProperty.property] = mockProperty.value;
            }
        });

        // Copy hue -> h, saturation -> s to make homeassistant happy
        if (message.color !== undefined) {
            if (message.color.hue !== undefined) {
                message.color.h = message.color.hue;
            }
            if (message.color.saturation !== undefined) {
                message.color.s = message.color.saturation;
            }
        }

        if (entity.isDevice() && entity.definition?.ota && message.update?.latest_version == null) {
            message.update = {...message.update, installed_version: -1, latest_version: -1};
        }
    }

    private getEncodedBaseTopic(): string {
        return settings
            .get()
            .mqtt.base_topic.split('')
            .map((s) => s.charCodeAt(0).toString())
            .join('');
    }

    private getDiscoveryTopic(config: DiscoveryEntry, entity: Device | Group | Bridge): string {
        const key = entity.isDevice() ? entity.ieeeAddr : `${this.getEncodedBaseTopic()}_${entity.ID}`;
        return `${config.type}/${key}/${config.object_id}/config`;
    }

    private async publishDeviceTriggerDiscover(device: Device, key: string, value: string, force = false): Promise<void> {
        const haConfig = device.options.homeassistant;
        if (
            device.options.homeassistant !== undefined &&
            (haConfig == null || (haConfig.device_automation !== undefined && typeof haConfig === 'object' && haConfig.device_automation == null))
        ) {
            return;
        }

        const discovered = this.getDiscovered(device);
        const discoveredKey = `${key}_${value}`;
        if (discovered.triggers.has(discoveredKey) && !force) {
            return;
        }

        const config: DiscoveryEntry = {
            type: 'device_automation',
            object_id: `${key}_${value}`,
            mockProperties: [],
            discovery_payload: {
                automation_type: 'trigger',
                type: key,
            },
        };

        const topic = this.getDiscoveryTopic(config, device);
        const payload = {
            ...config.discovery_payload,
            subtype: value,
            payload: value,
            topic: `${settings.get().mqtt.base_topic}/${device.name}/${key}`,
            device: this.getDevicePayload(device),
            origin: this.discoveryOrigin,
        };

        await this.mqtt.publish(topic, stringify(payload), {retain: true, qos: 1}, this.discoveryTopic, false, false);
        discovered.triggers.add(discoveredKey);
    }

    private getBridgeEntity(coordinatorVersion: zh.CoordinatorVersion): Bridge {
        const coordinatorIeeeAddress = this.zigbee.firstCoordinatorEndpoint().deviceIeeeAddress;
        const discovery: DiscoveryEntry[] = [];
        const bridge = new Bridge(coordinatorIeeeAddress, coordinatorVersion, discovery);
        const baseTopic = `${settings.get().mqtt.base_topic}/${bridge.name}`;
        const legacyAvailability = settings.get().advanced.legacy_availability_payload;

        discovery.push(
            // Binary sensors.
            {
                type: 'binary_sensor',
                object_id: 'connection_state',
                mockProperties: [],
                discovery_payload: {
                    name: 'Connection state',
                    device_class: 'connectivity',
                    entity_category: 'diagnostic',
                    state_topic: true,
                    state_topic_postfix: 'state',
                    value_template: !legacyAvailability ? '{{ value_json.state }}' : '{{ value }}',
                    payload_on: 'online',
                    payload_off: 'offline',
                    availability: false,
                },
            },
            {
                type: 'binary_sensor',
                object_id: 'restart_required',
                mockProperties: [],
                discovery_payload: {
                    name: 'Restart required',
                    device_class: 'problem',
                    entity_category: 'diagnostic',
                    enabled_by_default: false,
                    state_topic: true,
                    state_topic_postfix: 'info',
                    value_template: '{{ value_json.restart_required }}',
                    payload_on: true,
                    payload_off: false,
                },
            },

            // Buttons.
            {
                type: 'button',
                object_id: 'restart',
                mockProperties: [],
                discovery_payload: {
                    name: 'Restart',
                    device_class: 'restart',
                    state_topic: false,
                    command_topic: `${baseTopic}/request/restart`,
                    payload_press: '',
                },
            },

            // Selects.
            {
                type: 'select',
                object_id: 'log_level',
                mockProperties: [],
                discovery_payload: {
                    name: 'Log level',
                    entity_category: 'config',
                    state_topic: true,
                    state_topic_postfix: 'info',
                    value_template: '{{ value_json.log_level | lower }}',
                    command_topic: `${baseTopic}/request/options`,
                    command_template: '{"options": {"advanced": {"log_level": "{{ value }}" } } }',
                    options: settings.LOG_LEVELS,
                },
            },
            // Sensors:
            {
                type: 'sensor',
                object_id: 'version',
                mockProperties: [],
                discovery_payload: {
                    name: 'Version',
                    icon: 'mdi:zigbee',
                    entity_category: 'diagnostic',
                    state_topic: true,
                    state_topic_postfix: 'info',
                    value_template: '{{ value_json.version }}',
                },
            },
            {
                type: 'sensor',
                object_id: 'coordinator_version',
                mockProperties: [],
                discovery_payload: {
                    name: 'Coordinator version',
                    icon: 'mdi:chip',
                    entity_category: 'diagnostic',
                    enabled_by_default: false,
                    state_topic: true,
                    state_topic_postfix: 'info',
                    value_template: '{{ value_json.coordinator.meta.revision }}',
                },
            },
            {
                type: 'sensor',
                object_id: 'network_map',
                mockProperties: [],
                discovery_payload: {
                    name: 'Network map',
                    entity_category: 'diagnostic',
                    enabled_by_default: false,
                    state_topic: true,
                    state_topic_postfix: 'response/networkmap',
                    value_template: "{{ now().strftime('%Y-%m-%d %H:%M:%S') }}",
                    json_attributes_topic: `${baseTopic}/response/networkmap`,
                    json_attributes_template: '{{ value_json.data.value | tojson }}',
                },
            },
            {
                type: 'sensor',
                object_id: 'permit_join_timeout',
                mockProperties: [],
                discovery_payload: {
                    name: 'Permit join timeout',
                    device_class: 'duration',
                    unit_of_measurement: 's',
                    entity_category: 'diagnostic',
                    state_topic: true,
                    state_topic_postfix: 'info',
                    value_template: '{{ iif(value_json.permit_join_timeout is defined, value_json.permit_join_timeout, None) }}',
                },
            },

            // Switches.
            {
                type: 'switch',
                object_id: 'permit_join',
                mockProperties: [],
                discovery_payload: {
                    name: 'Permit join',
                    icon: 'mdi:human-greeting-proximity',
                    state_topic: true,
                    state_topic_postfix: 'info',
                    value_template: '{{ value_json.permit_join | lower }}',
                    command_topic: `${baseTopic}/request/permit_join`,
                    payload_on: 'true',
                    payload_off: 'false',
                },
            },
        );

        return bridge;
    }
}
