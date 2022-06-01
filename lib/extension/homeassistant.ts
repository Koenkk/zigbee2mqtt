import * as settings from '../util/settings';
import logger from '../util/logger';
import utils from '../util/utils';
import stringify from 'json-stable-stringify-without-jsonify';
import assert from 'assert';
import Extension from './extension';
import bind from 'bind-decorator';

interface MockProperty {property: string, value: KeyValue | string}

// eslint-disable-next-line camelcase
interface DiscoveryEntry {mockProperties: MockProperty[], type: string, object_id: string, discovery_payload: KeyValue}

const sensorClick: DiscoveryEntry = {
    type: 'sensor',
    object_id: 'click',
    mockProperties: [{property: 'click', value: null}],
    discovery_payload: {
        icon: 'mdi:toggle-switch',
        value_template: '{{ value_json.click }}',
    },
};

const ACCESS_STATE = 0b001;
const ACCESS_SET = 0b010;
const groupSupportedTypes = ['light', 'switch', 'lock', 'cover'];
const defaultStatusTopic = 'homeassistant/status';

const legacyMapping = [
    {
        models: ['WXKG01LM', 'HS1EB/HS1EB-E', 'ICZB-KPD14S', 'TERNCY-SD01', 'TERNCY-PP01', 'ICZB-KPD18S',
            'E1766', 'ZWallRemote0', 'ptvo.switch', '2AJZ4KPKEY', 'ZGRC-KEY-013', 'HGZB-02S', 'HGZB-045',
            'HGZB-1S', 'AV2010/34', 'IM6001-BTP01', 'WXKG11LM', 'WXKG03LM', 'WXKG02LM_rev1', 'WXKG02LM_rev2',
            'QBKG04LM', 'QBKG03LM', 'QBKG11LM', 'QBKG21LM', 'QBKG22LM', 'WXKG12LM', 'QBKG12LM',
            'E1743'],
        discovery: sensorClick,
    },
    {
        models: ['ICTC-G-1'],
        discovery: {
            type: 'sensor',
            mockProperties: [{property: 'brightness', value: null}],
            object_id: 'brightness',
            discovery_payload: {
                unit_of_measurement: 'brightness',
                icon: 'mdi:brightness-5',
                value_template: '{{ value_json.brightness }}',
            },
        },
    },
];

const featurePropertyWithoutEndpoint = (feature: zhc.DefinitionExposeFeature): string => {
    if (feature.endpoint) {
        return feature.property.slice(0, -1 + -1 * feature.endpoint.length);
    } else {
        return feature.property;
    }
};

/**
 * This extensions handles integration with HomeAssistant
 */
export default class HomeAssistant extends Extension {
    private discovered: {[s: string]:
        {topics: Set<string>, mockProperties: Set<MockProperty>, objectIDs: Set<string>}} = {};
    private discoveredTriggers : {[s: string]: Set<string>}= {};
    private discoveryTopic = settings.get().homeassistant.discovery_topic;
    private statusTopic = settings.get().homeassistant.status_topic;
    private entityAttributes = settings.get().homeassistant.legacy_entity_attributes;
    private zigbee2MQTTVersion: string;

    constructor(zigbee: Zigbee, mqtt: MQTT, state: State, publishEntityState: PublishEntityState,
        eventBus: EventBus, enableDisableExtension: (enable: boolean, name: string) => Promise<void>,
        restartCallback: () => void, addExtension: (extension: Extension) => Promise<void>) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);
        if (settings.get().advanced.output === 'attribute') {
            throw new Error('Home Assistant integration is not possible with attribute output!');
        }
    }

    override async start(): Promise<void> {
        if (!settings.get().advanced.cache_state) {
            logger.warn('In order for Home Assistant integration to work properly set `cache_state: true');
        }

        this.zigbee2MQTTVersion = (await utils.getZigbee2MQTTVersion(false)).version;

        this.eventBus.onDeviceRemoved(this, this.onDeviceRemoved);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onEntityRenamed(this, this.onEntityRenamed);
        this.eventBus.onPublishEntityState(this, this.onPublishEntityState);
        this.eventBus.onGroupMembersChanged(this, this.onGroupMembersChanged);
        this.eventBus.onDeviceAnnounce(this, this.onZigbeeEvent);
        this.eventBus.onDeviceJoined(this, this.onZigbeeEvent);
        this.eventBus.onDeviceInterview(this, this.onZigbeeEvent);
        this.eventBus.onDeviceMessage(this, this.onZigbeeEvent);
        this.eventBus.onEntityOptionsChanged(this, (data) => this.discover(data.entity, true));

        this.mqtt.subscribe(this.statusTopic);
        this.mqtt.subscribe(defaultStatusTopic);
        this.mqtt.subscribe(`${this.discoveryTopic}/#`);

        // MQTT discovery of all paired devices on startup.
        for (const entity of [...this.zigbee.devices(false), ...this.zigbee.groups()]) {
            this.discover(entity, true);
        }

        // Send availability messages, this is required if the legacy_availability_payload option has been changed.
        this.eventBus.emitPublishAvailability();
    }

    private exposeToConfig(exposes: zhc.DefinitionExpose[], entityType: 'device' | 'group',
        definition?: zhc.Definition, definitionExposes?: zhc.DefinitionExpose[]): DiscoveryEntry[] {
        // For groups an array of exposes (of the same type) is passed, this is to determine e.g. what features
        // to use for a bulb (e.g. color_xy/color_temp)
        assert(entityType === 'group' || exposes.length === 1, 'Multiple exposes for device not allowed');
        const firstExpose = exposes[0];
        assert(entityType === 'device' || groupSupportedTypes.includes(firstExpose.type),
            `Unsupported expose type ${firstExpose.type} for group`);

        const discoveryEntries: DiscoveryEntry[] = [];
        const endpoint = entityType === 'device' ? exposes[0].endpoint : undefined;
        const getProperty = (feature: zhc.DefinitionExposeFeature): string => entityType === 'group' ?
            featurePropertyWithoutEndpoint(feature) : feature.property;

        /* istanbul ignore else */
        if (firstExpose.type === 'light') {
            const hasColorXY = exposes.find((expose) => expose.features.find((e) => e.name === 'color_xy'));
            const hasColorHS = exposes.find((expose) => expose.features.find((e) => e.name === 'color_hs'));
            const hasBrightness = exposes.find((expose) => expose.features.find((e) => e.name === 'brightness'));
            const hasColorTemp = exposes.find((expose) => expose.features.find((e) => e.name === 'color_temp'));
            const state = firstExpose.features.find((f) => f.name === 'state');
            // Prefer HS over XY when at least one of the lights in the group prefers HS over XY.
            // A light prefers HS over XY when HS is earlier in the feature array than HS.
            const preferHS = exposes.map((e) => [e.features.findIndex((ee) => ee.name === 'color_xy'),
                e.features.findIndex((ee) => ee.name === 'color_hs')])
                .filter((d) => d[0] !== -1 && d[1] !== -1 && d[1] < d[0]).length !== 0;

            const discoveryEntry: DiscoveryEntry = {
                type: 'light',
                object_id: endpoint ? `light_${endpoint}` : 'light',
                mockProperties: [{property: state.property, value: null}],
                discovery_payload: {
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
                discoveryEntry.discovery_payload.color_mode = true;
                discoveryEntry.discovery_payload.supported_color_modes = colorModes;
            }

            if (hasColorTemp) {
                const colorTemps = exposes.map((expose) => expose.features.find((e) => e.name === 'color_temp'))
                    .filter((e) => e);
                const max = Math.min(...colorTemps.map((e) => e.value_max));
                const min = Math.max(...colorTemps.map((e) => e.value_min));
                discoveryEntry.discovery_payload.max_mireds = max;
                discoveryEntry.discovery_payload.min_mireds = min;
            }

            const effect = definitionExposes?.find((e) => e.type === 'enum' && e.name === 'effect');
            if (effect) {
                discoveryEntry.discovery_payload.effect = true;
                discoveryEntry.discovery_payload.effect_list = effect.values;
            }

            discoveryEntries.push(discoveryEntry);
        } else if (firstExpose.type === 'switch') {
            const state = firstExpose.features.find((f) => f.name === 'state');
            const property = getProperty(state);
            const discoveryEntry: DiscoveryEntry = {
                type: 'switch',
                object_id: endpoint ? `switch_${endpoint}` : 'switch',
                mockProperties: [{property: property, value: null}],
                discovery_payload: {
                    payload_off: state.value_off,
                    payload_on: state.value_on,
                    value_template: `{{ value_json.${property} }}`,
                    command_topic: true,
                    command_topic_prefix: endpoint,
                },
            };

            const different = ['valve_detection', 'window_detection', 'auto_lock', 'away_mode'];
            if (different.includes(property)) {
                discoveryEntry.discovery_payload.command_topic_postfix = property;
                discoveryEntry.discovery_payload.state_off = state.value_off;
                discoveryEntry.discovery_payload.state_on = state.value_on;
                discoveryEntry.object_id = property;

                if (property === 'window_detection') {
                    discoveryEntry.discovery_payload.icon = 'mdi:window-open-variant';
                }
            }

            discoveryEntries.push(discoveryEntry);
        } else if (firstExpose.type === 'climate') {
            const setpointProperties = ['occupied_heating_setpoint', 'current_heating_setpoint'];
            const setpoint = firstExpose.features.find((f) => setpointProperties.includes(f.name));
            assert(setpoint, 'No setpoint found');
            const temperature = firstExpose.features.find((f) => f.name === 'local_temperature');
            assert(temperature, 'No temperature found');

            const discoveryEntry: DiscoveryEntry = {
                type: 'climate',
                object_id: endpoint ? `climate_${endpoint}` : 'climate',
                mockProperties: [],
                discovery_payload: {
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

            const mode = firstExpose.features.find((f) => f.name === 'system_mode');
            if (mode) {
                if (mode.values.includes('sleep')) {
                    // 'sleep' is not supported by homeassistent, but is valid according to ZCL
                    // TRV that support sleep (e.g. Viessmann) will have it removed from here,
                    // this allows other expose consumers to still use it, e.g. the frontend.
                    mode.values.splice(mode.values.indexOf('sleep'), 1);
                }
                discoveryEntry.discovery_payload.mode_state_topic = true;
                discoveryEntry.discovery_payload.mode_state_template = `{{ value_json.${mode.property} }}`;
                discoveryEntry.discovery_payload.modes = mode.values;
                discoveryEntry.discovery_payload.mode_command_topic = true;
            }

            const state = firstExpose.features.find((f) => f.name === 'running_state');
            if (state) {
                discoveryEntry.mockProperties.push({property: state.property, value: null});
                discoveryEntry.discovery_payload.action_topic = true;
                discoveryEntry.discovery_payload.action_template = `{% set values = ` +
                        `{None:None,'idle':'off','heat':'heating','cool':'cooling','fan_only':'fan'}` +
                        ` %}{{ values[value_json.${state.property}] }}`;
            }

            const coolingSetpoint = firstExpose.features.find((f) => f.name === 'occupied_cooling_setpoint');
            if (coolingSetpoint) {
                discoveryEntry.discovery_payload.temperature_low_command_topic = setpoint.name;
                discoveryEntry.discovery_payload.temperature_low_state_template =
                    `{{ value_json.${setpoint.property} }}`;
                discoveryEntry.discovery_payload.temperature_low_state_topic = true;
                discoveryEntry.discovery_payload.temperature_high_command_topic = coolingSetpoint.name;
                discoveryEntry.discovery_payload.temperature_high_state_template =
                    `{{ value_json.${coolingSetpoint.property} }}`;
                discoveryEntry.discovery_payload.temperature_high_state_topic = true;
            } else {
                discoveryEntry.discovery_payload.temperature_command_topic = setpoint.name;
                discoveryEntry.discovery_payload.temperature_state_template =
                    `{{ value_json.${setpoint.property} }}`;
                discoveryEntry.discovery_payload.temperature_state_topic = true;
            }

            const fanMode = firstExpose.features.find((f) => f.name === 'fan_mode');
            if (fanMode) {
                discoveryEntry.discovery_payload.fan_modes = fanMode.values;
                discoveryEntry.discovery_payload.fan_mode_command_topic = true;
                discoveryEntry.discovery_payload.fan_mode_state_template =
                    `{{ value_json.${fanMode.property} }}`;
                discoveryEntry.discovery_payload.fan_mode_state_topic = true;
            }

            const preset = firstExpose.features.find((f) => f.name === 'preset');
            if (preset) {
                discoveryEntry.discovery_payload.hold_modes = preset.values;
                discoveryEntry.discovery_payload.hold_command_topic = true;
                discoveryEntry.discovery_payload.hold_state_template =
                    `{{ value_json.${preset.property} }}`;
                discoveryEntry.discovery_payload.hold_state_topic = true;
            }

            const awayMode = firstExpose.features.find((f) => f.name === 'away_mode');
            if (awayMode) {
                discoveryEntry.discovery_payload.away_mode_command_topic = true;
                discoveryEntry.discovery_payload.away_mode_state_topic = true;
                discoveryEntry.discovery_payload.away_mode_state_template =
                    `{{ value_json.${awayMode.property} }}`;
            }

            const tempCalibration = firstExpose.features.find((f) => f.name === 'local_temperature_calibration');
            if (tempCalibration) {
                const discoveryEntry: DiscoveryEntry = {
                    type: 'number',
                    object_id: endpoint ? `${tempCalibration.name}_${endpoint}` : `${tempCalibration.name}`,
                    mockProperties: [{property: tempCalibration.property, value: null}],
                    discovery_payload: {
                        value_template: `{{ value_json.${tempCalibration.property} }}`,
                        command_topic: true,
                        command_topic_prefix: endpoint,
                        command_topic_postfix: tempCalibration.property,
                        entity_category: 'config',
                        icon: 'mdi:math-compass',
                        ...(tempCalibration.unit && {unit_of_measurement: tempCalibration.unit}),
                    },
                };

                if (tempCalibration.value_min != null) discoveryEntry.discovery_payload.min = tempCalibration.value_min;
                if (tempCalibration.value_max != null) discoveryEntry.discovery_payload.max = tempCalibration.value_max;
                discoveryEntries.push(discoveryEntry);
            }

            const piHeatingDemand = firstExpose.features.find((f) => f.name === 'pi_heating_demand');
            if (piHeatingDemand) {
                const discoveryEntry: DiscoveryEntry = {
                    type: 'sensor',
                    object_id: endpoint ? `${piHeatingDemand.name}_${endpoint}` : `${piHeatingDemand.name}`,
                    mockProperties: [{property: piHeatingDemand.property, value: null}],
                    discovery_payload: {
                        value_template: `{{ value_json.${piHeatingDemand.property} }}`,
                        ...(piHeatingDemand.unit && {unit_of_measurement: piHeatingDemand.unit}),
                        entity_category: 'diagnostic',
                        icon: 'mdi:radiator',
                    },
                };

                discoveryEntries.push(discoveryEntry);
            }

            discoveryEntries.push(discoveryEntry);
        } else if (firstExpose.type === 'lock') {
            assert(!endpoint, `Endpoint not supported for lock type`);
            const state = firstExpose.features.find((f) => f.name === 'state');
            assert(state, 'No state found');
            const discoveryEntry: DiscoveryEntry = {
                type: 'lock',
                object_id: 'lock',
                mockProperties: [{property: state.property, value: null}],
                discovery_payload: {
                    command_topic: true,
                    value_template: `{{ value_json.${state.property} }}`,
                },
            };

            if (state.property === 'keypad_lockout') {
                // deprecated: keypad_lockout is messy, but changing is breaking
                discoveryEntry.discovery_payload.payload_lock = state.value_on;
                discoveryEntry.discovery_payload.payload_unlock = state.value_off;
                discoveryEntry.discovery_payload.state_topic = true;
                discoveryEntry.object_id = 'keypad_lock';
            } else if (state.property === 'child_lock') {
                // deprecated: child_lock is messy, but changing is breaking
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
        } else if (firstExpose.type === 'cover') {
            const position = exposes.find((expose) => expose.features.find((e) => e.name === 'position'));
            const tilt = exposes.find((expose) => expose.features.find((e) => e.name === 'tilt'));
            const motorState = definitionExposes?.find((e) => e.type === 'enum' && e.name === 'motor_state' &&
                e.access === ACCESS_STATE);

            const discoveryEntry: DiscoveryEntry = {
                type: 'cover',
                mockProperties: [],
                object_id: endpoint ? `cover_${endpoint}` : 'cover',
                discovery_payload: {
                    command_topic_prefix: endpoint,
                },
            };

            // For covers only supporting tilt don't discover the command/state_topic, otherwise
            // HA does not correctly reflect the state
            // - https://github.com/home-assistant/core/issues/51793
            // - https://github.com/Koenkk/zigbee-herdsman-converters/pull/2663
            if (!tilt || (tilt && position)) {
                discoveryEntry.discovery_payload.command_topic = true;
                discoveryEntry.discovery_payload.state_topic = !position;
                discoveryEntry.discovery_payload.command_topic_prefix = endpoint;

                // For curtains that have `motor_state` lookup a possible state names and make this
                // available for discovery. If the curtains only support the `running` value,
                // then we use it anyway. The movement direction is calculated (assumed) in this case.
                if (motorState) {
                    const openingLookup = ['opening', 'open', 'forward', 'up', 'rising'];
                    const closingLookup = ['closing', 'close', 'backward', 'back', 'reverse', 'down', 'declining'];
                    const stoppedLookup = ['stopped', 'stop', 'pause', 'paused'];

                    const openingState = motorState.values.find((s) => openingLookup.includes(s.toLowerCase()));
                    const closingState = motorState.values.find((s) => closingLookup.includes(s.toLowerCase()));
                    const stoppedState = motorState.values.find((s) => stoppedLookup.includes(s.toLowerCase()));

                    if (openingState && closingState && stoppedState) {
                        discoveryEntry.discovery_payload.state_topic = true;
                        discoveryEntry.discovery_payload.state_opening = openingState;
                        discoveryEntry.discovery_payload.state_closing = closingState;
                        discoveryEntry.discovery_payload.state_stopped = stoppedState;
                        discoveryEntry.discovery_payload.value_template = `{% if not value_json.motor_state %} ` +
                            `${stoppedState} {% else %} {{ value_json.motor_state }} {% endif %}`;
                    }
                } else {
                    const running = definitionExposes?.find((e) => e.type === 'binary' && e.name === 'running');

                    if (running) {
                        discoveryEntry.discovery_payload.state_topic = true;
                        discoveryEntry.discovery_payload.value_template = `{% if not value_json.running %} ` +
                            `stopped {% else %} {% if value_json.position > 0 %} closing {% else %} ` +
                            `opening {% endif %} {% endif %}`;
                    }
                }
            }

            if (!position && !tilt) {
                discoveryEntry.discovery_payload.optimistic = true;
            }

            if (position) {
                const p = position.features.find((f) => f.name === 'position');
                discoveryEntry.discovery_payload = {...discoveryEntry.discovery_payload,
                    position_template: `{{ value_json.${getProperty(p)} }}`,
                    set_position_template: `{ "${getProperty(p)}": {{ position }} }`,
                    set_position_topic: true,
                    position_topic: true,
                };
            }

            if (tilt) {
                const t = tilt.features.find((f) => f.name === 'tilt');
                discoveryEntry.discovery_payload = {...discoveryEntry.discovery_payload,
                    tilt_command_topic: true,
                    tilt_status_topic: true,
                    tilt_status_template: `{{ value_json.${getProperty(t)} }}`,
                };
            }

            discoveryEntries.push(discoveryEntry);
        } else if (firstExpose.type === 'fan') {
            assert(!endpoint, `Endpoint not supported for fan type`);
            const discoveryEntry: DiscoveryEntry = {
                type: 'fan',
                object_id: 'fan',
                mockProperties: [{property: 'fan_state', value: null}],
                discovery_payload: {
                    state_topic: true,
                    state_value_template: '{{ value_json.fan_state }}',
                    command_topic: true,
                    command_topic_postfix: 'fan_state',
                },
            };

            const speed = firstExpose.features.find((e) => e.name === 'mode');
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
                let speeds = ['off'].concat(['low', 'medium', 'high', '1', '2', '3', '4', '5',
                    '6', '7', '8', '9'].filter((s) => speed.values.includes(s)));
                let presets = ['on', 'auto', 'smart'].filter((s) => speed.values.includes(s));

                if (['99432'].includes(definition.model)) {
                    // The Hampton Bay 99432 fan implements 4 speeds using the ZCL
                    // hvacFanCtrl values `low`, `medium`, `high`, and `on`, and
                    // 1 preset called "Comfort Breeze" using the ZCL value `smart`.
                    // ZCL value `auto` is unused.
                    speeds = ['off', 'low', 'medium', 'high', 'on'];
                    presets = ['smart'];
                }

                const allowed = [...speeds, ...presets];
                speed.values.forEach((s) => assert(allowed.includes(s)));
                const percentValues = speeds.map((s, i) => `'${s}':${i}`).join(', ');
                const percentCommands = speeds.map((s, i) => `${i}:'${s}'`).join(', ');
                const presetList = presets.map((s) => `'${s}'`).join(', ');

                discoveryEntry.discovery_payload.percentage_state_topic = true;
                discoveryEntry.discovery_payload.percentage_command_topic = true;
                discoveryEntry.discovery_payload.percentage_value_template =
                    `{{ {${percentValues}}[value_json.${speed.property}] | default('None') }}`;
                discoveryEntry.discovery_payload.percentage_command_template =
                    `{{ {${percentCommands}}[value] | default('') }}`;
                discoveryEntry.discovery_payload.speed_range_min = 1;
                discoveryEntry.discovery_payload.speed_range_max = speeds.length - 1;
                assert(presets.length !== 0);
                discoveryEntry.discovery_payload.preset_mode_state_topic = true;
                discoveryEntry.discovery_payload.preset_mode_command_topic = true;
                discoveryEntry.discovery_payload.preset_mode_value_template =
                    `{{ value_json.${speed.property} if value_json.${speed.property} in [${presetList}]` +
                    ` else 'None' | default('None') }}`;
                discoveryEntry.discovery_payload.preset_modes = presets;
            }

            discoveryEntries.push(discoveryEntry);
        } else if (firstExpose.type === 'binary') {
            const lookup: {[s: string]: KeyValue}= {
                battery_low: {entity_category: 'diagnostic', device_class: 'battery'},
                button_lock: {entity_category: 'config', icon: 'mdi:lock'},
                calibration: {entity_category: 'config', icon: 'mdi:progress-wrench'},
                carbon_monoxide: {device_class: 'safety'},
                card: {entity_category: 'config', icon: 'mdi:clipboard-check'},
                child_lock: {entity_category: 'config', icon: 'mdi:account-lock'},
                color_sync: {entity_category: 'config', icon: 'mdi:sync-circle'},
                consumer_connected: {entity_category: 'diagnostic', device_class: 'connectivity'},
                contact: {device_class: 'door'},
                garage_door_contact: {device_class: 'garage_door', payload_on: false, payload_off: true},
                eco_mode: {entity_category: 'config', icon: 'mdi:leaf'},
                expose_pin: {entity_category: 'config', icon: 'mdi:pin'},
                gas: {device_class: 'gas'},
                invert_cover: {entity_category: 'config', icon: 'mdi:arrow-left-right'},
                led_disabled_night: {entity_category: 'config', icon: 'mdi:led-off'},
                led_indication: {entity_category: 'config', icon: 'mdi:led-on'},
                legacy: {entity_category: 'config', icon: 'mdi:cog'},
                motor_reversal: {entity_category: 'config', icon: 'mdi:arrow-left-right'},
                moving: {device_class: 'moving'},
                no_position_support: {entity_category: 'config', icon: 'mdi:minus-circle-outline'},
                occupancy: {device_class: 'motion'},
                power_outage_memory: {entity_category: 'config', icon: 'mdi:memory'},
                presence: {device_class: 'presence'},
                smoke: {device_class: 'smoke'},
                sos: {device_class: 'safety'},
                tamper: {device_class: 'tamper'},
                temperature_scale: {entity_category: 'config', icon: 'mdi:temperature-celsius'},
                test: {entity_category: 'diagnostic', icon: 'mdi:test-tube'},
                vibration: {device_class: 'vibration'},
                water_leak: {device_class: 'moisture'},
            };

            /**
             * If Z2M binary attribute has SET access then expose it as `switch` in HA
             * There is also a check on the values for typeof boolean to prevent invalid values and commands
             * silently failing - commands work fine but some devices won't reject unexpected values.
             * https://github.com/Koenkk/zigbee2mqtt/issues/7740
             */
            if (firstExpose.access & ACCESS_SET) {
                const discoveryEntry: DiscoveryEntry = {
                    type: 'switch',
                    mockProperties: [{property: firstExpose.property, value: null}],
                    object_id: endpoint ?
                        `switch_${firstExpose.name}_${endpoint}` :
                        `switch_${firstExpose.name}`,
                    discovery_payload: {
                        value_template: typeof firstExpose.value_on === 'boolean' ?
                            `{% if value_json.${firstExpose.property} %} true {% else %} false {% endif %}` :
                            `{{ value_json.${firstExpose.property} }}`,
                        payload_on: firstExpose.value_on.toString(),
                        payload_off: firstExpose.value_off.toString(),
                        command_topic: true,
                        command_topic_prefix: endpoint,
                        command_topic_postfix: firstExpose.property,
                        ...(lookup[firstExpose.name] || {}),
                    },
                };
                discoveryEntries.push(discoveryEntry);
            } else {
                const discoveryEntry: DiscoveryEntry = {
                    type: 'binary_sensor',
                    object_id: endpoint ? `${firstExpose.name}_${endpoint}` : `${firstExpose.name}`,
                    mockProperties: [{property: firstExpose.property, value: null}],
                    discovery_payload: {
                        value_template: `{{ value_json.${firstExpose.property} }}`,
                        payload_on: firstExpose.value_on,
                        payload_off: firstExpose.value_off,
                        ...(lookup[firstExpose.name] || {}),
                    },
                };
                discoveryEntries.push(discoveryEntry);
            }
        } else if (firstExpose.type === 'numeric') {
            const lookup: {[s: string]: KeyValue} = {
                ac_frequency: {device_class: 'frequency', enabled_by_default: false, entity_category: 'diagnostic',
                    state_class: 'measurement'},
                alarm_humidity_max: {device_class: 'humidity', icon: 'mdi:water-plus'},
                alarm_humidity_min: {device_class: 'humidity', icon: 'mdi:water-minus'},
                alarm_temperature_max: {device_class: 'temperature', icon: 'mdi:thermometer-high'},
                alarm_temperature_min: {device_class: 'temperature', icon: 'mdi:thermometer-low'},
                angle: {icon: 'angle-acute'},
                angle_axis: {icon: 'angle-acute'},
                aqi: {device_class: 'aqi', state_class: 'measurement'},
                auto_relock_time: {entity_category: 'config', icon: 'mdi:timer'},
                away_preset_days: {entity_category: 'config', icon: 'mdi:timer'},
                away_preset_temperature: {entity_category: 'config', icon: 'mdi:thermometer'},
                battery: {device_class: 'battery', entity_category: 'diagnostic', state_class: 'measurement'},
                battery2: {device_class: 'battery', entity_category: 'diagnostic', state_class: 'measurement'},
                battery_voltage: {device_class: 'voltage', entity_category: 'diagnostic', state_class: 'measurement'},
                boost_time: {entity_category: 'config', icon: 'mdi:timer'},
                calibration: {entity_category: 'config', icon: 'mdi:wrench-clock'},
                calibration_time: {entity_category: 'config', icon: 'mdi:wrench-clock'},
                co2: {device_class: 'carbon_dioxide', state_class: 'measurement'},
                comfort_temperature: {entity_category: 'config', icon: 'mdi:thermometer'},
                cpu_temperature: {
                    device_class: 'temperature', entity_category: 'diagnostic', state_class: 'measurement',
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
                device_temperature: {
                    device_class: 'temperature', entity_category: 'diagnostic', state_class: 'measurement',
                },
                duration: {entity_category: 'config', icon: 'mdi:timer'},
                eco2: {device_class: 'carbon_dioxide', state_class: 'measurement'},
                eco_temperature: {entity_category: 'config', icon: 'mdi:thermometer'},
                energy: {device_class: 'energy', state_class: 'total_increasing'},
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
                max_temperature: {entity_category: 'config', icon: 'mdi:thermometer'},
                max_temperature_limit: {entity_category: 'config', icon: 'mdi:thermometer'},
                min_temperature: {entity_category: 'config', icon: 'mdi:thermometer'},
                measurement_poll_interval: {entity_category: 'config', icon: 'mdi:clock-out'},
                occupancy_timeout: {entity_category: 'config', icon: 'mdi:timer'},
                pm10: {device_class: 'pm10', state_class: 'measurement'},
                pm25: {device_class: 'pm25', state_class: 'measurement'},
                people: {state_class: 'measurement', icon: 'mdi:account-multiple'},
                position: {icon: 'mdi:valve', state_class: 'measurement'},
                power: {device_class: 'power', entity_category: 'diagnostic', state_class: 'measurement'},
                power_factor: {device_class: 'power_factor', enabled_by_default: false,
                    entity_category: 'diagnostic', state_class: 'measurement'},
                precision: {entity_category: 'config', icon: 'mdi:decimal-comma-increase'},
                pressure: {device_class: 'pressure', state_class: 'measurement'},
                presence_timeout: {entity_category: 'config', icon: 'mdi:timer'},
                reporting_time: {entity_category: 'config', icon: 'mdi:clock-time-one-outline'},
                requested_brightness_level: {
                    enabled_by_default: false, entity_category: 'diagnostic', icon: 'mdi:brightness-5',
                },
                requested_brightness_percent: {
                    enabled_by_default: false, entity_category: 'diagnostic', icon: 'mdi:brightness-5',
                },
                smoke_density: {icon: 'mdi:google-circles-communities', state_class: 'measurement'},
                soil_moisture: {icon: 'mdi:water-percent', state_class: 'measurement'},
                temperature: {device_class: 'temperature', state_class: 'measurement'},
                temperature_calibration: {entity_category: 'config', icon: 'mdi:wrench-clock'},
                temperature_max: {entity_category: 'config', icon: 'mdi:thermometer-plus'},
                temperature_min: {entity_category: 'config', icon: 'mdi:thermometer-minus'},
                transition: {entity_category: 'config', icon: 'mdi:transition'},
                voc: {device_class: 'volatile_organic_compounds', state_class: 'measurement'},
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
                x_axis: {icon: 'mdi:axis-x-arrow'},
                y_axis: {icon: 'mdi:axis-y-arrow'},
                z_axis: {icon: 'mdi:axis-z-arrow'},
            };

            const extraAttrs = {};

            // If a variable includes Wh, mark it as energy
            if (firstExpose.unit && ['Wh', 'kWh'].includes(firstExpose.unit)) {
                Object.assign(extraAttrs, {device_class: 'energy', state_class: 'total_increasing'});
            }

            const allowsSet = firstExpose.access & ACCESS_SET;

            const discoveryEntry: DiscoveryEntry = {
                type: 'sensor',
                object_id: endpoint ? `${firstExpose.name}_${endpoint}` : `${firstExpose.name}`,
                mockProperties: [{property: firstExpose.property, value: null}],
                discovery_payload: {
                    value_template: `{{ value_json.${firstExpose.property} }}`,
                    enabled_by_default: !allowsSet,
                    ...(firstExpose.unit && {unit_of_measurement: firstExpose.unit}),
                    ...lookup[firstExpose.name],
                    ...extraAttrs,
                },
            };
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
                        value_template: `{{ value_json.${firstExpose.property} }}`,
                        command_topic: true,
                        command_topic_prefix: endpoint,
                        command_topic_postfix: firstExpose.property,
                        ...(firstExpose.unit && {unit_of_measurement: firstExpose.unit}),
                        ...lookup[firstExpose.name],
                    },
                };

                if (firstExpose.value_min != null) discoveryEntry.discovery_payload.min = firstExpose.value_min;
                if (firstExpose.value_max != null) discoveryEntry.discovery_payload.max = firstExpose.value_max;

                discoveryEntries.push(discoveryEntry);
            }
        } else if (firstExpose.type === 'enum') {
            const lookup: {[s: string]: KeyValue} = {
                action: {icon: 'mdi:gesture-double-tap'},
                alarm_humidity: {icon: 'mdi:water-percent-alert'},
                alarm_temperature: {icon: 'mdi:thermometer-alert'},
                backlight_auto_dim: {entity_category: 'config', icon: 'mdi:brightness-auto'},
                backlight_mode: {entity_category: 'config', icon: 'mdi:lightbulb'},
                color_power_on_behavior: {entity_category: 'config', icon: 'mdi:palette'},
                control_mode: {entity_category: 'config', icon: 'mdi:tune'},
                device_mode: {entity_category: 'config', icon: 'mdi:tune'},
                effect: {enabled_by_default: false, icon: 'mdi:palette'},
                force: {enabled_by_default: false, icon: 'mdi:valve'},
                keep_time: {entity_category: 'config', icon: 'mdi:av-timer'},
                keypad_lockout: {entity_category: 'config', icon: 'mdi:lock'},
                load_detection_mode: {entity_category: 'config', icon: 'mdi:tune'},
                load_dimmable: {entity_category: 'diagnostic', icon: 'mdi:chart-bell-curve'},
                load_type: {entity_category: 'diagnostic', icon: 'mdi:led-on'},
                melody: {entity_category: 'config', icon: 'mdi:music-note'},
                mode_phase_control: {entity_category: 'config', icon: 'mdi:tune'},
                mode: {entity_category: 'config', icon: 'mdi:tune'},
                motion_sensitivity: {entity_category: 'config', icon: 'mdi:tune'},
                operation_mode: {entity_category: 'config', icon: 'mdi:tune'},
                power_on_behavior: {entity_category: 'config', icon: 'mdi:power-settings'},
                power_outage_memory: {entity_category: 'config', icon: 'mdi:power-settings'},
                power_supply_mode: {entity_category: 'diagnostic', icon: 'mdi:power-settings'},
                power_type: {entity_category: 'diagnostic', icon: 'mdi:lightning-bolt-circle'},
                sensitivity: {entity_category: 'config', icon: 'mdi:tune'},
                sensors_type: {entity_category: 'config', icon: 'mdi:tune'},
                sound_volume: {entity_category: 'config', icon: 'mdi:volume-high'},
                status: {icon: 'mdi:state-machine'},
                switch_type: {entity_category: 'config', icon: 'mdi:tune'},
                thermostat_unit: {entity_category: 'config', icon: 'mdi:thermometer'},
                volume: {entity_category: 'config', icon: 'mdi: volume-high'},
                week: {entity_category: 'config', icon: 'mdi:calendar-clock'},
            };

            if (firstExpose.access & ACCESS_STATE) {
                discoveryEntries.push({
                    type: 'sensor',
                    object_id: firstExpose.property,
                    mockProperties: [{property: firstExpose.property, value: null}],
                    discovery_payload: {
                        value_template: `{{ value_json.${firstExpose.property} }}`,
                        enabled_by_default: !(firstExpose.access & ACCESS_SET),
                        ...lookup[firstExpose.name],
                    },
                });

                /**
                 * If enum attribute has SET access then expose as SELECT entity too.
                 * Note: currently both sensor and select are discovered, this is to avoid
                 * breaking changes for sensors already existing in HA (legacy).
                 */
                if ((firstExpose.access & ACCESS_SET)) {
                    discoveryEntries.push({
                        type: 'select',
                        object_id: firstExpose.property,
                        mockProperties: [{property: firstExpose.property, value: null}],
                        discovery_payload: {
                            value_template: `{{ value_json.${firstExpose.property} }}`,
                            state_topic: true,
                            command_topic_prefix: endpoint,
                            command_topic: true,
                            command_topic_postfix: firstExpose.property,
                            options: firstExpose.values.map((v) => v.toString()),
                            ...lookup[firstExpose.name],
                        },
                    });
                }
            }
        } else if (firstExpose.type === 'text' || firstExpose.type === 'composite') {
            if (firstExpose.access & ACCESS_STATE) {
                const lookup: {[s: string]: KeyValue} = {
                    action: {icon: 'mdi:gesture-double-tap'},
                };

                const discoveryEntry: DiscoveryEntry = {
                    type: 'sensor',
                    object_id: firstExpose.property,
                    mockProperties: [{property: firstExpose.property, value: null}],
                    discovery_payload: {
                        value_template: `{{ value_json.${firstExpose.property} }}`,
                        ...lookup[firstExpose.name],
                    },
                };
                discoveryEntries.push(discoveryEntry);
            }
        } else {
            throw new Error(`Unsupported exposes type: '${firstExpose.type}'`);
        }

        return discoveryEntries;
    }

    @bind onDeviceRemoved(data: eventdata.DeviceRemoved): void {
        logger.debug(`Clearing Home Assistant discovery topic for '${data.name}'`);
        this.discovered[data.ieeeAddr]?.topics.forEach((topic) => {
            this.mqtt.publish(topic, null, {retain: true, qos: 0}, this.discoveryTopic, false, false);
        });

        delete this.discovered[data.ieeeAddr];
    }

    @bind onGroupMembersChanged(data: eventdata.GroupMembersChanged): void {
        this.discover(data.group, true);
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
        const entity = this.zigbee.resolveEntity(data.entity.name);
        if (entity.isDevice() && this.discovered[entity.ieeeAddr]) {
            for (const objectID of this.discovered[entity.ieeeAddr].objectIDs) {
                const match = /light_(.*)/.exec(objectID);
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

                    await this.mqtt.publish(
                        `${data.entity.name}/${endpoint}`, stringify(payload), {},
                    );
                }
            }
        }

        /**
         * Publish an empty value for click and action payload, in this way Home Assistant
         * can use Home Assistant entities in automations.
         * https://github.com/Koenkk/zigbee2mqtt/issues/959#issuecomment-480341347
         */
        if (settings.get().homeassistant.legacy_triggers) {
            const keys = ['action', 'click'].filter((k) => data.message[k]);
            for (const key of keys) {
                this.publishEntityState(data.entity, {[key]: ''});
            }
        }

        /**
         * Implements the MQTT device trigger (https://www.home-assistant.io/integrations/device_trigger.mqtt/)
         * The MQTT device trigger does not support JSON parsing, so it cannot listen to zigbee2mqtt/my_device
         * Whenever a device publish an {action: *} we discover an MQTT device trigger sensor
         * and republish it to zigbee2mqtt/my_devic/action
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

    @bind onEntityRenamed(data: eventdata.EntityRenamed): void {
        logger.debug(`Refreshing Home Assistant discovery topic for '${data.entity.name}'`);

        // Clear before rename so Home Assistant uses new friendly_name
        // https://github.com/Koenkk/zigbee2mqtt/issues/4096#issuecomment-674044916
        if (data.homeAssisantRename) {
            for (const config of this.getConfigs(data.entity)) {
                const topic = this.getDiscoveryTopic(config, data.entity);
                this.mqtt.publish(topic, null, {retain: true, qos: 0}, this.discoveryTopic, false, false);
            }
        }

        this.discover(data.entity, true);

        if (data.entity.isDevice() && this.discoveredTriggers[data.entity.ieeeAddr]) {
            for (const config of this.discoveredTriggers[data.entity.ieeeAddr]) {
                const key = config.substring(0, config.indexOf('_'));
                const value = config.substring(config.indexOf('_') + 1);
                this.publishDeviceTriggerDiscover(data.entity, key, value, true);
            }
        }
    }

    private getConfigs(entity: Device | Group): DiscoveryEntry[] {
        const isDevice = entity.isDevice();
        /* istanbul ignore next */
        if (!entity || (isDevice && !entity.definition)) return [];

        let configs: DiscoveryEntry[] = [];
        if (isDevice) {
            const exposes = entity.exposes(); // avoid calling it hundred of times/s
            for (const expose of exposes) {
                configs.push(...this.exposeToConfig([expose], 'device', entity.definition, exposes));
            }

            for (const mapping of legacyMapping) {
                if (mapping.models.includes(entity.definition.model)) {
                    configs.push(mapping.discovery);
                }
            }

            // Deprecated in favour of exposes
            /* istanbul ignore if */
            if (entity.definition.hasOwnProperty('homeassistant')) {
                // @ts-ignore
                configs.push(entity.definition.homeassistant);
            }
        } else { // group
            const exposesByType: {[s: string]: zhc.DefinitionExpose[]} = {};

            entity.zh.members.map((e) => this.zigbee.resolveEntity(e.getDevice()) as Device)
                .filter((d) => d.definition).forEach((device) => {
                    for (const expose of device.exposes().filter((e) => groupSupportedTypes.includes(e.type))) {
                        let key = expose.type;
                        if (['switch', 'lock', 'cover'].includes(expose.type) && expose.endpoint) {
                            // A device can have multiple of these types which have to discovered seperately.
                            // e.g. switch with property state and valve_detection.
                            const state = expose.features.find((f) => f.name === 'state');
                            key += featurePropertyWithoutEndpoint(state);
                        }

                        if (!exposesByType[key]) exposesByType[key] = [];
                        exposesByType[key].push(expose);
                    }
                });

            configs = [].concat(...Object.values(exposesByType)
                .map((exposes) => this.exposeToConfig(exposes, 'group')));
        }

        if (isDevice && settings.get().advanced.last_seen !== 'disable') {
            const config: DiscoveryEntry = {
                type: 'sensor',
                object_id: 'last_seen',
                mockProperties: [{property: 'last_seen', value: null}],
                discovery_payload: {
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

        if (isDevice && entity.definition.hasOwnProperty('ota')) {
            const updateStateSensor: DiscoveryEntry = {
                type: 'sensor',
                object_id: 'update_state',
                mockProperties: [{property: 'update', value: {state: null}}],
                discovery_payload: {
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
                    payload_on: true,
                    payload_off: false,
                    value_template: `{{ value_json['update']['state'] == "available" }}`,
                    enabled_by_default: true,
                    device_class: 'update',
                    entity_category: 'diagnostic',
                },
            };
            configs.push(updateAvailableSensor);
        }

        if (isDevice && entity.options.hasOwnProperty('legacy') && !entity.options.legacy) {
            configs = configs.filter((c) => c !== sensorClick);
        }

        if (!settings.get().homeassistant.legacy_triggers) {
            configs = configs.filter((c) => c.object_id !== 'action' && c.object_id !== 'click');
        }

        // deep clone of the config objects
        configs = JSON.parse(JSON.stringify(configs));

        if (entity.options.homeassistant) {
            const s = entity.options.homeassistant;
            configs = configs.filter((config) => !s.hasOwnProperty(config.object_id) || s[config.object_id] != null);
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

    private getDiscoverKey(entity: Device | Group): string | number {
        return entity.isDevice() ? entity.ieeeAddr : entity.ID;
    }

    private discover(entity: Device | Group, force=false): void {
        // Check if already discovered and check if there are configs.
        const discoverKey = this.getDiscoverKey(entity);
        const discover = force || !this.discovered[discoverKey];

        if (entity.isGroup()) {
            if (!discover || entity.zh.members.length === 0) return;
        } else if (!discover || !entity.definition || entity.zh.interviewing ||
            (entity.options.hasOwnProperty('homeassistant') && !entity.options.homeassistant)) {
            return;
        }

        this.discovered[discoverKey] = {topics: new Set(), mockProperties: new Set(), objectIDs: new Set()};
        this.getConfigs(entity).forEach((config) => {
            const payload = {...config.discovery_payload};
            const baseTopic = `${settings.get().mqtt.base_topic}/${entity.name}`;
            let stateTopic = baseTopic;
            if (payload.state_topic_postfix) {
                stateTopic += `/${payload.state_topic_postfix}`;
                delete payload.state_topic_postfix;
            }

            if (!payload.hasOwnProperty('state_topic') || payload.state_topic) {
                payload.state_topic = stateTopic;
            } else {
                /* istanbul ignore else */
                if (payload.hasOwnProperty('state_topic')) {
                    delete payload.state_topic;
                }
            }

            if (payload.position_topic) {
                payload.position_topic = stateTopic;
            }

            if (payload.tilt_status_topic) {
                payload.tilt_status_topic = stateTopic;
            }

            if (this.entityAttributes) {
                payload.json_attributes_topic = stateTopic;
            }

            const devicePayload = this.getDevicePayload(entity);

            // Set (unique) name, separate by space if device name contains space.
            const nameSeparator = devicePayload.name.includes('_') ? '_' : ' ';
            payload.name = devicePayload.name;
            if (config.object_id.startsWith(config.type) && config.object_id.includes('_')) {
                payload.name += `${nameSeparator}${config.object_id.split(/_(.+)/)[1]}`;
            } else if (!config.object_id.startsWith(config.type)) {
                payload.name += `${nameSeparator}${config.object_id.replace(/_/g, nameSeparator)}`;
            }

            // Set unique_id
            payload.unique_id = `${entity.options.ID}_${config.object_id}_${settings.get().mqtt.base_topic}`;

            // Attributes for device registry
            payload.device = devicePayload;

            // Availability payload
            payload.availability = [{topic: `${settings.get().mqtt.base_topic}/bridge/state`}];

            /* istanbul ignore next */
            if (utils.isAvailabilityEnabledForEntity(entity, settings.get())) {
                payload.availability_mode = 'all';
                payload.availability.push({topic: `${baseTopic}/availability`});
            }

            if (!settings.get().advanced.legacy_availability_payload) {
                payload.availability.forEach((a: KeyValue) => a.value_template = '{{ value_json.state }}');
            }

            const commandTopicPrefix = payload.command_topic_prefix ? `${payload.command_topic_prefix}/` : '';
            delete payload.command_topic_prefix;
            const commandTopicPostfix = payload.command_topic_postfix ? `/${payload.command_topic_postfix}` : '';
            delete payload.command_topic_postfix;
            const commandTopic = `${baseTopic}/${commandTopicPrefix}set${commandTopicPostfix}`;

            if (payload.command_topic) {
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

            if (payload.hold_command_topic) {
                payload.hold_command_topic = `${baseTopic}/${commandTopicPrefix}set/preset`;
            }

            if (payload.hold_state_topic) {
                payload.hold_state_topic = stateTopic;
            }

            if (payload.away_mode_state_topic) {
                payload.away_mode_state_topic = stateTopic;
            }

            if (payload.away_mode_command_topic) {
                payload.away_mode_command_topic = `${baseTopic}/${commandTopicPrefix}set/away_mode`;
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
                payload.temperature_command_topic =
                    `${baseTopic}/${commandTopicPrefix}set/${payload.temperature_command_topic}`;
            }

            if (payload.temperature_low_command_topic) {
                payload.temperature_low_command_topic =
                    `${baseTopic}/${commandTopicPrefix}set/${payload.temperature_low_command_topic}`;
            }

            if (payload.temperature_high_command_topic) {
                payload.temperature_high_command_topic =
                    `${baseTopic}/${commandTopicPrefix}set/${payload.temperature_high_command_topic}`;
            }

            if (payload.fan_mode_state_topic) {
                payload.fan_mode_state_topic = stateTopic;
            }

            if (payload.fan_mode_command_topic) {
                payload.fan_mode_command_topic = `${baseTopic}/${commandTopicPrefix}set/fan_mode`;
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
                payload.preset_mode_command_topic = `${baseTopic}/${commandTopicPrefix}set/fan_mode`;
            }

            if (payload.action_topic) {
                payload.action_topic = stateTopic;
            }

            // Override configuration with user settings.
            if (entity.options.hasOwnProperty('homeassistant')) {
                const add = (obj: KeyValue, ignoreName: boolean): void => {
                    Object.keys(obj).forEach((key) => {
                        if (['type', 'object_id'].includes(key)) {
                            return;
                        } else if (ignoreName && key === 'name') {
                            return;
                        } else if (['number', 'string', 'boolean'].includes(typeof obj[key]) ||
                            Array.isArray(obj[key])) {
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

                if (entity.options.homeassistant.hasOwnProperty(config.object_id)) {
                    add(entity.options.homeassistant[config.object_id], false);
                }
            }

            const topic = this.getDiscoveryTopic(config, entity);
            this.mqtt.publish(topic, stringify(payload), {retain: true, qos: 0}, this.discoveryTopic, false, false);
            this.discovered[discoverKey].topics.add(topic);
            this.discovered[discoverKey].objectIDs.add(config.object_id);
            config.mockProperties?.forEach((mockProperty) =>
                this.discovered[discoverKey].mockProperties.add(mockProperty));
        });
    }

    @bind private onMQTTMessage(data: eventdata.MQTTMessage): void {
        const discoveryRegex = new RegExp(`${this.discoveryTopic}/(.*)/(.*)/(.*)/config`);
        const discoveryMatch = data.topic.match(discoveryRegex);
        const isDeviceAutomation = discoveryMatch && discoveryMatch[1] === 'device_automation';
        if (discoveryMatch) {
            // Clear outdated discovery configs and remember already discovered device_automations
            let message: KeyValue = null;
            try {
                message = JSON.parse(data.message);
                const baseTopic = settings.get().mqtt.base_topic + '/';
                if (isDeviceAutomation && (!message.topic || !message.topic.startsWith(baseTopic))) {
                    return;
                }

                if (!isDeviceAutomation &&
                    (!message.availability || !message.availability[0].topic.startsWith(baseTopic))) {
                    return;
                }
            } catch (e) {
                return;
            }

            // Group discovery topic uses "ENCODEDBASETOPIC_GROUPID", device use ieeeAddr
            const ID = discoveryMatch[2].includes('_') ? discoveryMatch[2].split('_')[1] : discoveryMatch[2];
            const entity = this.zigbee.resolveEntity(ID);
            let clear = !entity || entity.isDevice() && !entity.definition;

            // Only save when topic matches otherwise config is not updated when renamed by editing configuration.yaml
            if (entity) {
                const key = `${discoveryMatch[3].substring(0, discoveryMatch[3].indexOf('_'))}`;
                const triggerTopic = `${settings.get().mqtt.base_topic}/${entity.name}/${key}`;
                if (isDeviceAutomation && message.topic === triggerTopic) {
                    if (!this.discoveredTriggers[ID]) {
                        this.discoveredTriggers[ID] = new Set();
                    }
                    this.discoveredTriggers[ID].add(discoveryMatch[3]);
                }
            }

            if (!clear && !isDeviceAutomation) {
                const type = discoveryMatch[1];
                const objectID = discoveryMatch[3];
                clear = !this.getConfigs(entity)
                    .find((c) => c.type === type && c.object_id === objectID &&
                    `${this.discoveryTopic}/${this.getDiscoveryTopic(c, entity)}` === data.topic);
            }
            // Device was flagged to be excluded from homeassistant discovery
            clear = clear || (entity.options.hasOwnProperty('homeassistant') && !entity.options.homeassistant);

            if (clear) {
                logger.debug(`Clearing Home Assistant config '${data.topic}'`);
                const topic = data.topic.substring(this.discoveryTopic.length + 1);
                this.mqtt.publish(topic, null, {retain: true, qos: 0}, this.discoveryTopic, false, false);
            }
        } else if ((data.topic === this.statusTopic || data.topic === defaultStatusTopic) &&
            data.message.toLowerCase() === 'online') {
            const timer = setTimeout(async () => {
                // Publish all device states.
                for (const device of this.zigbee.devices(false)) {
                    if (this.state.exists(device)) {
                        this.publishEntityState(device, this.state.get(device));
                    }
                }

                clearTimeout(timer);
            }, 30000);
        }
    }

    @bind onZigbeeEvent(data: {device: Device}): void {
        this.discover(data.device);
    }

    private getDevicePayload(entity: Device | Group): KeyValue {
        const identifierPostfix = entity.isGroup() ?
            `zigbee2mqtt_${this.getEncodedBaseTopic()}` : 'zigbee2mqtt';

        // Allow device name to be overriden by homeassistant config
        let deviceName = entity.name;
        if (typeof entity.options.homeassistant?.name === 'string') {
            deviceName = entity.options.homeassistant.name;
        }

        const payload: KeyValue = {
            identifiers: [`${identifierPostfix}_${entity.options.ID}`],
            name: deviceName,
            sw_version: `Zigbee2MQTT ${this.zigbee2MQTTVersion}`,
        };

        if (entity.isDevice()) {
            payload.model = `${entity.definition.description} (${entity.definition.model})`;
            payload.manufacturer = entity.definition.vendor;
            payload.sw_version = entity.zh.softwareBuildID;
        }

        if (settings.get().frontend?.url) {
            const url = settings.get().frontend?.url;
            payload.configuration_url = entity.isDevice() ? `${url}/#/device/${entity.ieeeAddr}/info` :
                `${url}/#/group/${entity.ID}`;
        }

        return payload;
    }

    override adjustMessageBeforePublish(entity: Device | Group, message: KeyValue): void {
        const discoverKey = this.getDiscoverKey(entity);
        this.discovered[discoverKey]?.mockProperties?.forEach((mockProperty) => {
            if (!message.hasOwnProperty(mockProperty.property)) {
                message[mockProperty.property] = mockProperty.value;
            }
        });

        // Copy hue -> h, saturation -> s to make homeassitant happy
        if (message.hasOwnProperty('color')) {
            if (message.color.hasOwnProperty('hue')) {
                message.color.h = message.color.hue;
            }
            if (message.color.hasOwnProperty('saturation')) {
                message.color.s = message.color.saturation;
            }
        }
    }

    private getEncodedBaseTopic(): string {
        return settings.get().mqtt.base_topic.split('').map((s) => s.charCodeAt(0).toString()).join('');
    }

    private getDiscoveryTopic(config: DiscoveryEntry, entity: Device | Group): string {
        const key = entity.isDevice() ? entity.ieeeAddr : `${this.getEncodedBaseTopic()}_${entity.ID}`;
        return `${config.type}/${key}/${config.object_id}/config`;
    }

    private async publishDeviceTriggerDiscover(device: Device, key: string, value: string, force=false): Promise<void> {
        const haConfig = device.options.homeassistant;
        if (device.options.hasOwnProperty('homeassistant') && (haConfig == null ||
                (haConfig.hasOwnProperty('device_automation') && typeof haConfig === 'object' &&
                    haConfig.device_automation == null))) {
            return;
        }

        if (!this.discoveredTriggers[device.ieeeAddr]) {
            this.discoveredTriggers[device.ieeeAddr] = new Set();
        }

        const discoveredKey = `${key}_${value}`;
        if (this.discoveredTriggers[device.ieeeAddr].has(discoveredKey) && !force) {
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
        };

        await this.mqtt.publish(topic, stringify(payload), {retain: true, qos: 0}, this.discoveryTopic, false, false);
        this.discoveredTriggers[device.ieeeAddr].add(discoveredKey);
    }

    _clearDiscoveredTrigger(): void {
        this.discoveredTriggers = {};
    }
}
