// biome-ignore assist/source/organizeImports: import mocks first
import {afterAll, beforeAll, beforeEach, describe, expect, it, test, vi} from "vitest";
import * as data from "../mocks/data";
import {mockLogger} from "../mocks/logger";
import {events as mockMQTTEvents, mockMQTTPublishAsync, mockMQTTSubscribeAsync, mockMQTTUnsubscribeAsync} from "../mocks/mqtt";
import * as mockSleep from "../mocks/sleep";
import {flushPromises, getZhcBaseDefinitions} from "../mocks/utils";
import type {Device as ZhDevice} from "../mocks/zigbeeHerdsman";
import {devices, groups, events as mockZHEvents} from "../mocks/zigbeeHerdsman";

import assert from "node:assert";
import stringify from "json-stable-stringify-without-jsonify";
import type {MockInstance} from "vitest";
import * as zhc from "zigbee-herdsman-converters";
import type {KeyValueAny} from "zigbee-herdsman-converters/lib/types";
import {Controller} from "../../lib/controller";
import HomeAssistant from "../../lib/extension/homeassistant";

import type Device from "../../lib/model/device";
import type Group from "../../lib/model/group";
import * as settings from "../../lib/util/settings";

const mocksClear = [mockMQTTPublishAsync, mockLogger.debug, mockLogger.warning, mockLogger.error];

describe("Extension: HomeAssistant", () => {
    let controller: Controller;
    let version: string;
    let z2m_version: string;
    let extension: HomeAssistant;
    const origin = {name: "Zigbee2MQTT", sw: "", url: "https://www.zigbee2mqtt.io"};

    const resetExtension = async (runTimers = true): Promise<void> => {
        await controller.removeExtension(controller.getExtension("HomeAssistant")!);
        for (const mock of mocksClear) mock.mockClear();
        await controller.addExtension(new HomeAssistant(...controller.extensionArgs));
        extension = controller.getExtension("HomeAssistant")! as HomeAssistant;

        if (runTimers) {
            await vi.runOnlyPendingTimersAsync();
        }
    };

    const resetDiscoveryPayloads = (id: string): void => {
        // Change discovered payload, otherwise it's not re-published because it's the same.
        // @ts-expect-error private
        const messages = extension.discovered[id].messages;

        for (const key in messages) {
            messages[key].payload = "changed";
        }
    };

    const clearDiscoveredTrigger = (id: string): void => {
        // @ts-expect-error private
        extension.discovered[id].triggers = new Set();
    };

    const getZ2MEntity = (zhDeviceOrGroup: string | number | ZhDevice): Device | Group => {
        return controller.zigbee.resolveEntity(zhDeviceOrGroup)!;
    };

    beforeAll(async () => {
        const {getZigbee2MQTTVersion} = await import("../../lib/util/utils.js");
        z2m_version = (await getZigbee2MQTTVersion()).version;
        version = `Zigbee2MQTT ${z2m_version}`;
        origin.sw = z2m_version;
        vi.useFakeTimers();
        settings.set(["homeassistant"], {enabled: true});
        data.writeDefaultConfiguration();
        settings.reRead();
        data.writeEmptyState();
        mockMQTTPublishAsync.mockClear();
        mockSleep.mock();
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
    });

    afterAll(async () => {
        mockSleep.restore();
        await controller?.stop();
        await flushPromises();
        vi.useRealTimers();
    });

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings.reRead();
        settings.set(["homeassistant"], {enabled: true});
        data.writeEmptyState();
        // @ts-expect-error private
        controller.state.load();
        await resetExtension();
        await flushPromises();
    });

    it("Should discover weekly_schedule sensor with json_attributes instead of truncated value", () => {
        // Create a mock device with weekly_schedule exposed
        const mockDeviceWithWeeklySchedule = {
            definition: {
                model: "TRVZB",
                vendor: "SONOFF",
                description: "Test TRV with weekly schedule",
            },
            isDevice: (): boolean => true,
            isGroup: (): boolean => false,
            options: {},
            exposes: (): unknown[] => [
                {
                    type: "composite",
                    property: "weekly_schedule",
                    name: "weekly_schedule",
                    features: [
                        {type: "text", property: "sunday", name: "sunday", access: 7},
                        {type: "text", property: "monday", name: "monday", access: 7},
                        {type: "text", property: "tuesday", name: "tuesday", access: 7},
                        {type: "text", property: "wednesday", name: "wednesday", access: 7},
                        {type: "text", property: "thursday", name: "thursday", access: 7},
                        {type: "text", property: "friday", name: "friday", access: 7},
                        {type: "text", property: "saturday", name: "saturday", access: 7},
                    ],
                    access: 7,
                },
            ],
            zh: {endpoints: []},
        };

        // @ts-expect-error private
        const configs = extension.getConfigs(mockDeviceWithWeeklySchedule);
        const weeklyScheduleConfig = configs.find((c) => c.object_id === "weekly_schedule");

        expect(weeklyScheduleConfig).toBeDefined();
        expect(weeklyScheduleConfig!.discovery_payload.icon).toBe("mdi:calendar-clock");
        // Note: entity_category is converted from "config" to "diagnostic" for sensors in HA
        expect(weeklyScheduleConfig!.discovery_payload.entity_category).toBe("diagnostic");

        // Verify value_template shows a summary, not the raw JSON
        expect(weeklyScheduleConfig!.discovery_payload.value_template).toContain("days configured");
        expect(weeklyScheduleConfig!.discovery_payload.value_template).not.toContain("truncate");

        // Verify json_attributes are used
        expect(weeklyScheduleConfig!.discovery_payload.json_attributes_topic).toBeDefined();
        expect(weeklyScheduleConfig!.discovery_payload.json_attributes_template).toBeDefined();
        expect(weeklyScheduleConfig!.discovery_payload.json_attributes_template).toContain("schedule");
    });

    it("Should not have duplicate type/object_ids in a mapping", async () => {
        const duplicated: string[] = [];

        for (const baseDefinition of await getZhcBaseDefinitions()) {
            const d = zhc.prepareDefinition(baseDefinition);
            const exposes = typeof d.exposes === "function" ? d.exposes({isDummyDevice: true}, {}) : d.exposes;
            const device = {
                definition: d,
                isDevice: (): boolean => true,
                isGroup: (): boolean => false,
                options: {},
                exposes: (): unknown[] => exposes,
                zh: {endpoints: []},
            };
            // @ts-expect-error private
            const configs = extension.getConfigs(device);
            const cfgTypeObjectIds: string[] = [];

            for (const config of configs) {
                const id = `${config.type}/${config.object_id}`;
                if (cfgTypeObjectIds.includes(id)) {
                    // A dynamic function must exposes all possible attributes for the docs
                    if (typeof d.exposes !== "function") {
                        duplicated.push(d.model);
                    }
                } else {
                    cfgTypeObjectIds.push(id);
                }
            }
        }

        expect(duplicated).toHaveLength(0);
    });

    it("Should discover devices and groups", async () => {
        settings.set(["homeassistant", "experimental_event_entities"], true);
        await resetExtension();

        let payload;

        payload = {
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            brightness: true,
            brightness_scale: 254,
            command_topic: "zigbee2mqtt/ha_discovery_group/set",
            device: {
                identifiers: ["zigbee2mqtt_1221051039810110150109113116116_9"],
                name: "ha_discovery_group",
                sw_version: version,
                model: "Group",
                manufacturer: "Zigbee2MQTT",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            max_mireds: 454,
            min_mireds: 250,
            name: null,
            schema: "json",
            state_topic: "zigbee2mqtt/ha_discovery_group",
            supported_color_modes: ["xy", "color_temp"],
            effect: true,
            effect_list: [
                "blink",
                "breathe",
                "okay",
                "channel_change",
                "candle",
                "fireplace",
                "colorloop",
                "finish_effect",
                "stop_effect",
                "stop_hue_effect",
            ],
            object_id: "ha_discovery_group",
            default_entity_id: "light.ha_discovery_group",
            unique_id: "9_light_zigbee2mqtt",
            origin: origin,
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/light/1221051039810110150109113116116_9/light/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        payload = {
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            brightness: true,
            brightness_scale: 254,
            command_topic: "zigbee2mqtt/bulb_enddevice/set",
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45553"],
                manufacturer: "Sengled",
                model: "Element classic (A19)",
                model_id: "E11-G13",
                name: "bulb_enddevice",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            name: null,
            object_id: "bulb_enddevice",
            default_entity_id: "light.bulb_enddevice",
            origin: origin,
            schema: "json",
            state_topic: "zigbee2mqtt/bulb_enddevice",
            supported_color_modes: ["brightness"],
            unique_id: "0x0017880104e45553_light_zigbee2mqtt",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/light/0x0017880104e45553/light/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        payload = {
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            command_topic: "zigbee2mqtt/ha_discovery_group/set",
            device: {
                identifiers: ["zigbee2mqtt_1221051039810110150109113116116_9"],
                name: "ha_discovery_group",
                sw_version: version,
                model: "Group",
                manufacturer: "Zigbee2MQTT",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            name: null,
            payload_off: "OFF",
            payload_on: "ON",
            state_topic: "zigbee2mqtt/ha_discovery_group",
            object_id: "ha_discovery_group",
            default_entity_id: "switch.ha_discovery_group",
            unique_id: "9_switch_zigbee2mqtt",
            origin: origin,
            value_template: "{{ value_json.state }}",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "homeassistant/switch/1221051039810110150109113116116_9/switch/config",
            stringify(payload),
            {retain: true, qos: 1},
        );

        payload = {
            unit_of_measurement: "°C",
            device_class: "temperature",
            state_class: "measurement",
            value_template: "{{ value_json.temperature }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            object_id: "weather_sensor_temperature",
            default_entity_id: "sensor.weather_sensor_temperature",
            unique_id: "0x0017880104e45522_temperature_zigbee2mqtt",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            enabled_by_default: true,
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/temperature/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        payload = {
            unit_of_measurement: "%",
            device_class: "humidity",
            state_class: "measurement",
            value_template: "{{ value_json.humidity }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            object_id: "weather_sensor_humidity",
            default_entity_id: "sensor.weather_sensor_humidity",
            unique_id: "0x0017880104e45522_humidity_zigbee2mqtt",
            origin: origin,
            enabled_by_default: true,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/humidity/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        payload = {
            unit_of_measurement: "hPa",
            device_class: "atmospheric_pressure",
            state_class: "measurement",
            value_template: "{{ value_json.pressure }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            object_id: "weather_sensor_pressure",
            default_entity_id: "sensor.weather_sensor_pressure",
            unique_id: "0x0017880104e45522_pressure_zigbee2mqtt",
            origin: origin,
            enabled_by_default: true,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/pressure/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        payload = {
            unit_of_measurement: "%",
            device_class: "battery",
            state_class: "measurement",
            value_template: "{{ value_json.battery }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            object_id: "weather_sensor_battery",
            default_entity_id: "sensor.weather_sensor_battery",
            unique_id: "0x0017880104e45522_battery_zigbee2mqtt",
            origin: origin,
            enabled_by_default: true,
            entity_category: "diagnostic",
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/battery/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        payload = {
            icon: "mdi:signal",
            enabled_by_default: false,
            entity_category: "diagnostic",
            unit_of_measurement: "lqi",
            state_class: "measurement",
            value_template: "{{ value_json.linkquality }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            name: "Linkquality",
            object_id: "weather_sensor_linkquality",
            default_entity_id: "sensor.weather_sensor_linkquality",
            unique_id: "0x0017880104e45522_linkquality_zigbee2mqtt",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/linkquality/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        payload = {
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            command_topic: "zigbee2mqtt/wall_switch_double/left/set",
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45542"],
                manufacturer: "Aqara",
                model: "Smart wall switch (no neutral, double rocker)",
                model_id: "QBKG03LM",
                name: "wall_switch_double",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            name: "Left",
            payload_off: "OFF",
            payload_on: "ON",
            state_topic: "zigbee2mqtt/wall_switch_double",
            object_id: "wall_switch_double_left",
            default_entity_id: "switch.wall_switch_double_left",
            unique_id: "0x0017880104e45542_switch_left_zigbee2mqtt",
            origin: origin,
            value_template: "{{ value_json.state_left }}",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/switch/0x0017880104e45542/switch_left/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        payload = {
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            command_topic: "zigbee2mqtt/wall_switch_double/right/set",
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45542"],
                manufacturer: "Aqara",
                model: "Smart wall switch (no neutral, double rocker)",
                model_id: "QBKG03LM",
                name: "wall_switch_double",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            name: "Right",
            payload_off: "OFF",
            payload_on: "ON",
            state_topic: "zigbee2mqtt/wall_switch_double",
            object_id: "wall_switch_double_right",
            default_entity_id: "switch.wall_switch_double_right",
            unique_id: "0x0017880104e45542_switch_right_zigbee2mqtt",
            origin: origin,
            value_template: "{{ value_json.state_right }}",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/switch/0x0017880104e45542/switch_right/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        payload = {
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            brightness: true,
            brightness_scale: 254,
            supported_color_modes: ["color_temp"],
            min_mireds: 250,
            max_mireds: 454,
            command_topic: "zigbee2mqtt/bulb/set",
            device: {
                identifiers: ["zigbee2mqtt_0x000b57fffec6a5b2"],
                manufacturer: "IKEA",
                model: "TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm",
                model_id: "LED1545G12",
                name: "bulb",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            effect: true,
            effect_list: ["blink", "breathe", "okay", "channel_change", "finish_effect", "stop_effect"],
            name: null,
            schema: "json",
            state_topic: "zigbee2mqtt/bulb",
            object_id: "bulb",
            default_entity_id: "light.bulb",
            unique_id: "0x000b57fffec6a5b2_light_zigbee2mqtt",
            origin: origin,
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/light/0x000b57fffec6a5b2/light/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        payload = {
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45520"],
                manufacturer: "Aqara",
                model: "Wireless mini switch",
                model_id: "WXKG11LM",
                name: "button",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            event_types: ["single", "double", "triple", "quadruple", "hold", "release"],
            icon: "mdi:gesture-double-tap",
            name: "Action",
            object_id: "button_action",
            default_entity_id: "event.button_action",
            origin,
            state_topic: "zigbee2mqtt/button",
            unique_id: "0x0017880104e45520_action_zigbee2mqtt",
            // Needs to be updated whenever one of the ACTION_*_PATTERN constants changes.
            value_template:
                "{% set patterns = [\n{\"pattern\": '^(?P<button>(?:button_)?[a-z0-9]+)_(?P<action>(?:press|hold)(?:_release)?)$', \"groups\": [\"button\", \"action\"]},\n{\"pattern\": '^(?P<action>recall|scene)_(?P<scene>[0-2][0-9]{0,2})$', \"groups\": [\"action\", \"scene\"]},\n{\"pattern\": '^(?P<actionPrefix>region_)(?P<region>[1-9]|10)_(?P<action>enter|leave|occupied|unoccupied)$', \"groups\": [\"actionPrefix\", \"region\", \"action\"]},\n{\"pattern\": '^(?P<action>dial_rotate)_(?P<direction>left|right)_(?P<speed>step|slow|fast)$', \"groups\": [\"action\", \"direction\", \"speed\"]},\n{\"pattern\": '^(?P<action>brightness_step)(?:_(?P<direction>up|down))?$', \"groups\": [\"action\", \"direction\"]}\n] %}\n{% set action_value = value_json.action|default('') %}\n{% set ns = namespace(r=[('action', action_value)]) %}\n{% for p in patterns %}\n  {% set m = action_value|regex_findall(p.pattern) %}\n  {% if m[0] is undefined %}{% continue %}{% endif %}\n  {% for key, value in zip(p.groups, m[0]) %}\n    {% set ns.r = ns.r|rejectattr(0, 'eq', key)|list + [(key, value)] %}\n  {% endfor %}\n{% endfor %}\n{% if (ns.r|selectattr(0, 'eq', 'actionPrefix')|first) is defined %}\n  {% set ns.r = ns.r|rejectattr(0, 'eq', 'action')|list + [('action', ns.r|selectattr(0, 'eq', 'actionPrefix')|map(attribute=1)|first + ns.r|selectattr(0, 'eq', 'action')|map(attribute=1)|first)] %}\n{% endif %}\n{% set ns.r = ns.r + [('event_type', ns.r|selectattr(0, 'eq', 'action')|map(attribute=1)|first)] %}\n{{dict.from_keys(ns.r|rejectattr(0, 'in', ('action', 'actionPrefix'))|reject('eq', ('event_type', None))|reject('eq', ('event_type', '')))|to_json}}",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/event/0x0017880104e45520/action/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        // Should NOT discovery leagcy action sensor as option is not enabled.
        expect(mockMQTTPublishAsync).not.toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45520/action/config", expect.any(String), {
            retain: true,
            qos: 1,
        });
    });

    it.each([
        ["recall_1", {action: "recall", scene: "1"}],
        ["recall_*", {action: "recall", scene: "wildcard"}],
        ["on", {action: "on"}],
        ["on_1", {action: "on_1"}],
        ["release_left", {action: "release_left"}],
        ["region_1_enter", {action: "region_enter", region: "1"}],
        ["region_*_leave", {action: "region_leave", region: "wildcard"}],
        ["left_press", {action: "press", button: "left"}],
        ["left_press_release", {action: "press_release", button: "left"}],
        ["right_hold", {action: "hold", button: "right"}],
        ["right_hold_release", {action: "hold_release", button: "right"}],
        ["button_4_hold_release", {action: "hold_release", button: "button_4"}],
        ["dial_rotate_left_step", {action: "dial_rotate", direction: "left", speed: "step"}],
        ["dial_rotate_right_fast", {action: "dial_rotate", direction: "right", speed: "fast"}],
        ["brightness_step_up", {action: "brightness_step", direction: "up"}],
        ["brightness_stop", {action: "brightness_stop"}],
    ])("Should parse action names correctly", (action, expected) => {
        expect(extension.parseActionValue(action)).toStrictEqual(expected);
    });

    it("Should not discovery devices which are already discovered", async () => {
        await resetExtension(false);
        const topic1 = "homeassistant/sensor/0x0017880104e45522/humidity/config";
        const payload1 = stringify({
            unit_of_measurement: "%",
            device_class: "humidity",
            state_class: "measurement",
            value_template: "{{ value_json.humidity }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            object_id: "weather_sensor_humidity",
            default_entity_id: "sensor.weather_sensor_humidity",
            unique_id: "0x0017880104e45522_humidity_zigbee2mqtt",
            origin: origin,
            enabled_by_default: true,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        });
        const topic2 = "homeassistant/device_automation/0x0017880104e45522/action_double/config";
        const payload2 = stringify({
            automation_type: "trigger",
            type: "action",
            subtype: "double",
            payload: "double",
            topic: "zigbee2mqtt/weather_sensor_renamed/action",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor_renamed",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
        });

        // Should subscribe to `homeassistant/#` to find out what devices are already discovered.
        expect(mockMQTTSubscribeAsync).toHaveBeenCalledWith("homeassistant/#");

        // Retained Home Assistant discovery message arrives
        await mockMQTTEvents.message(topic1, payload1);
        await mockMQTTEvents.message(topic2, payload2);

        await vi.runOnlyPendingTimersAsync();

        // Should unsubscribe to not receive all messages that are going to be published to `homeassistant/#` again.
        expect(mockMQTTUnsubscribeAsync).toHaveBeenCalledWith("homeassistant/#");

        expect(mockMQTTPublishAsync).not.toHaveBeenCalledWith(topic1, expect.anything(), expect.any(Object));
        // Device automation should not be cleared
        expect(mockMQTTPublishAsync).not.toHaveBeenCalledWith(topic2, "", expect.any(Object));
        expect(mockLogger.debug).toHaveBeenCalledWith(`Skipping discovery of 'sensor/0x0017880104e45522/humidity/config', already discovered`);
    });

    it("Should discover devices with precision", async () => {
        settings.set(["devices", "0x0017880104e45522"], {
            humidity_precision: 0,
            temperature_precision: 1,
            pressure_precision: 2,
            friendly_name: "weather_sensor",
            retain: false,
        });

        await resetExtension();

        let payload;
        await flushPromises();

        payload = {
            unit_of_measurement: "°C",
            device_class: "temperature",
            state_class: "measurement",
            enabled_by_default: true,
            value_template: "{{ value_json.temperature }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            object_id: "weather_sensor_temperature",
            default_entity_id: "sensor.weather_sensor_temperature",
            unique_id: "0x0017880104e45522_temperature_zigbee2mqtt",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/temperature/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        payload = {
            unit_of_measurement: "%",
            device_class: "humidity",
            state_class: "measurement",
            value_template: "{{ value_json.humidity }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            object_id: "weather_sensor_humidity",
            default_entity_id: "sensor.weather_sensor_humidity",
            unique_id: "0x0017880104e45522_humidity_zigbee2mqtt",
            origin: origin,
            enabled_by_default: true,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/humidity/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        payload = {
            unit_of_measurement: "hPa",
            device_class: "atmospheric_pressure",
            state_class: "measurement",
            value_template: "{{ value_json.pressure }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            enabled_by_default: true,
            object_id: "weather_sensor_pressure",
            default_entity_id: "sensor.weather_sensor_pressure",
            unique_id: "0x0017880104e45522_pressure_zigbee2mqtt",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/pressure/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should discover devices with overridden user configuration", async () => {
        settings.set(["devices", "0x0017880104e45522"], {
            homeassistant: {
                expire_after: 30,
                icon: "mdi:test",
                temperature: {
                    expire_after: 90,
                    device: {
                        manufacturer: "From Aqara",
                        sw_version: "test",
                    },
                },
                humidity: {
                    unique_id: null,
                },
                device: {
                    manufacturer: "Not from Aqara",
                    model: "custom model",
                    model_id: "custom id",
                },
            },
            friendly_name: "weather_sensor",
            retain: false,
        });

        await resetExtension();

        let payload;
        await flushPromises();

        payload = {
            unit_of_measurement: "°C",
            device_class: "temperature",
            state_class: "measurement",
            value_template: "{{ value_json.temperature }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            enabled_by_default: true,
            object_id: "weather_sensor_temperature",
            default_entity_id: "sensor.weather_sensor_temperature",
            unique_id: "0x0017880104e45522_temperature_zigbee2mqtt",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor",
                sw_version: "test",
                model: "custom model",
                model_id: "custom id",
                manufacturer: "From Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            expire_after: 90,
            icon: "mdi:test",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/temperature/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        payload = {
            unit_of_measurement: "%",
            device_class: "humidity",
            state_class: "measurement",
            value_template: "{{ value_json.humidity }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            enabled_by_default: true,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor",
                model: "custom model",
                model_id: "custom id",
                manufacturer: "Not from Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            origin: origin,
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            expire_after: 30,
            icon: "mdi:test",
            object_id: "weather_sensor_humidity",
            default_entity_id: "sensor.weather_sensor_humidity",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/humidity/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should discover devices with overridden name", async () => {
        settings.set(["devices", "0x0017880104e45522"], {
            homeassistant: {
                name: "Weather Sensor",
            },
            friendly_name: "weather_sensor",
            retain: false,
        });

        await resetExtension();

        let payload;
        await flushPromises();

        payload = {
            unit_of_measurement: "°C",
            device_class: "temperature",
            state_class: "measurement",
            value_template: "{{ value_json.temperature }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            object_id: "weather_sensor_temperature",
            default_entity_id: "sensor.weather_sensor_temperature",
            unique_id: "0x0017880104e45522_temperature_zigbee2mqtt",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "Weather Sensor",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            enabled_by_default: true,
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/temperature/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        payload = {
            unit_of_measurement: "%",
            device_class: "humidity",
            state_class: "measurement",
            value_template: "{{ value_json.humidity }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            object_id: "weather_sensor_humidity",
            default_entity_id: "sensor.weather_sensor_humidity",
            unique_id: "0x0017880104e45522_humidity_zigbee2mqtt",
            origin: origin,
            enabled_by_default: true,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "Weather Sensor",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/humidity/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should discover devices with overridden user configuration affecting type and object_id", async () => {
        settings.set(["devices", "0x0017880104e45541"], {
            friendly_name: "my_switch",
            homeassistant: {
                switch: {
                    type: "light",
                    object_id: "light",
                    default_entity_id: "light.light",
                },
                light: {
                    type: "this should be ignored",
                    name: "my_light_name_override",
                },
            },
        });

        await resetExtension();

        await flushPromises();

        const payload = {
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            command_topic: "zigbee2mqtt/my_switch/set",
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45541"],
                manufacturer: "Aqara",
                model: "Smart wall switch (no neutral, single rocker)",
                model_id: "QBKG04LM",
                name: "my_switch",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            name: "my_light_name_override",
            payload_off: "OFF",
            payload_on: "ON",
            state_topic: "zigbee2mqtt/my_switch",
            object_id: "my_switch",
            default_entity_id: "light.my_switch",
            unique_id: "0x0017880104e45541_light_zigbee2mqtt",
            origin: origin,
            value_template: "{{ value_json.state }}",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/light/0x0017880104e45541/light/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Shouldnt discover devices when homeassistant null is set in device options", async () => {
        settings.set(["devices", "0x0017880104e45522"], {
            homeassistant: null,
            friendly_name: "weather_sensor",
            retain: false,
        });

        await resetExtension();
        await flushPromises();

        const topics = mockMQTTPublishAsync.mock.calls.map((c) => c[0]);
        expect(topics).not.toContain("homeassistant/sensor/0x0017880104e45522/humidity/config");
        expect(topics).not.toContain("homeassistant/sensor/0x0017880104e45522/temperature/config");
    });

    it("Shouldnt discover sensor when set to null", async () => {
        mockLogger.error.mockClear();
        settings.set(["devices", "0x0017880104e45522"], {
            homeassistant: {humidity: null},
            friendly_name: "weather_sensor",
            retain: false,
        });

        await resetExtension();

        const topics = mockMQTTPublishAsync.mock.calls.map((c) => c[0]);
        expect(topics).not.toContain("homeassistant/sensor/0x0017880104e45522/humidity/config");
        expect(topics).toContain("homeassistant/sensor/0x0017880104e45522/temperature/config");
    });

    it("Should discover devices with fan", () => {
        const payload = {
            state_topic: "zigbee2mqtt/fan",
            state_value_template: "{{ value_json.fan_state }}",
            command_topic: "zigbee2mqtt/fan/set/fan_state",
            percentage_state_topic: "zigbee2mqtt/fan",
            percentage_command_topic: "zigbee2mqtt/fan/set/fan_mode",
            percentage_value_template: "{{ {'off':0, 'low':1, 'medium':2, 'high':3, 'on':4}[value_json.fan_mode] | default('None') }}",
            percentage_command_template: "{{ {0:'off', 1:'low', 2:'medium', 3:'high', 4:'on'}[value] | default('') }}",
            preset_mode_state_topic: "zigbee2mqtt/fan",
            preset_mode_command_topic: "zigbee2mqtt/fan/set/fan_mode",
            preset_mode_value_template: "{{ value_json.fan_mode if value_json.fan_mode in ['smart'] else 'None' | default('None') }}",
            preset_modes: ["smart"],
            speed_range_min: 1,
            speed_range_max: 4,
            name: null,
            object_id: "fan",
            default_entity_id: "fan.fan",
            unique_id: "0x0017880104e45548_fan_zigbee2mqtt",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45548"],
                name: "fan",
                model: "Universal wink enabled white ceiling fan premier remote control",
                model_id: "99432",
                manufacturer: "Hampton Bay",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/fan/0x0017880104e45548/fan/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should discover devices with speed-controlled fan", () => {
        const payload = {
            state_topic: "zigbee2mqtt/fanbee",
            state_value_template: "{{ value_json.state }}",
            command_topic: "zigbee2mqtt/fanbee/set/state",
            percentage_state_topic: "zigbee2mqtt/fanbee",
            percentage_command_topic: "zigbee2mqtt/fanbee/set/speed",
            percentage_value_template: "{{ value_json.speed | default('None') }}",
            percentage_command_template: "{{ value | default('') }}",
            speed_range_min: 1,
            speed_range_max: 254,
            name: null,
            object_id: "fanbee",
            default_entity_id: "fan.fanbee",
            unique_id: "0x00124b00cfcf3298_fan_zigbee2mqtt",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x00124b00cfcf3298"],
                name: "fanbee",
                model: "Fan with valve",
                model_id: "FanBee",
                manufacturer: "Lorenz Brun",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [
                {
                    topic: "zigbee2mqtt/bridge/state",
                    value_template: "{{ value_json.state }}",
                },
            ],
        };

        const idx = mockMQTTPublishAsync.mock.calls.findIndex((c) => c[0] === "homeassistant/fan/0x00124b00cfcf3298/fan/config");
        expect(idx).not.toBe(-1);
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[idx][1])).toStrictEqual(payload);
    });

    it("Should discover thermostat devices", () => {
        const payload = {
            action_template:
                "{% set values = {None:None,'idle':'idle','heat':'heating','cool':'cooling','fan_only':'fan'} %}{{ values[value_json.running_state] }}",
            action_topic: "zigbee2mqtt/TS0601_thermostat",
            availability: [
                {
                    topic: "zigbee2mqtt/bridge/state",
                    value_template: "{{ value_json.state }}",
                },
            ],
            current_temperature_template: "{{ value_json.local_temperature }}",
            current_temperature_topic: "zigbee2mqtt/TS0601_thermostat",
            device: {
                identifiers: ["zigbee2mqtt_0x0017882104a44559"],
                manufacturer: "Tuya",
                model: "Radiator valve with thermostat",
                model_id: "TS0601_thermostat",
                name: "TS0601_thermostat",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            preset_mode_command_topic: "zigbee2mqtt/TS0601_thermostat/set/preset",
            preset_modes: ["schedule", "manual", "boost", "complex", "comfort", "eco", "away"],
            preset_mode_value_template: "{{ value_json.preset }}",
            preset_mode_state_topic: "zigbee2mqtt/TS0601_thermostat",
            max_temp: "35",
            min_temp: "5",
            mode_command_topic: "zigbee2mqtt/TS0601_thermostat/set/system_mode",
            mode_state_template: "{{ value_json.system_mode }}",
            mode_state_topic: "zigbee2mqtt/TS0601_thermostat",
            modes: ["heat", "auto", "off"],
            name: null,
            temp_step: 0.5,
            temperature_command_topic: "zigbee2mqtt/TS0601_thermostat/set/current_heating_setpoint",
            temperature_state_template: "{{ value_json.current_heating_setpoint }}",
            temperature_state_topic: "zigbee2mqtt/TS0601_thermostat",
            temperature_unit: "C",
            object_id: "ts0601_thermostat",
            default_entity_id: "climate.ts0601_thermostat",
            unique_id: "0x0017882104a44559_climate_zigbee2mqtt",
            origin: origin,
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/climate/0x0017882104a44559/climate/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should discover thermostat devices with read-only PI heating demand", () => {
        const payload = {
            availability: [
                {
                    topic: "zigbee2mqtt/bridge/state",
                    value_template: "{{ value_json.state }}",
                },
            ],
            default_entity_id: "sensor.thermostat_pi_heating_demand",
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45550"],
                manufacturer: "eCozy",
                model: "Smart heating thermostat",
                model_id: "1TST-EU",
                name: "thermostat",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            entity_category: "diagnostic",
            icon: "mdi:radiator",
            name: "PI heating demand",
            object_id: "thermostat_pi_heating_demand",
            origin: origin,
            state_topic: "zigbee2mqtt/thermostat",
            unique_id: "0x0017880104e45550_pi_heating_demand_zigbee2mqtt",
            unit_of_measurement: "%",
            value_template: "{{ value_json.pi_heating_demand }}",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45550/pi_heating_demand/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should discover thermostat devices with writable PI heating demand", () => {
        const payload = {
            availability: [
                {
                    topic: "zigbee2mqtt/bridge/state",
                    value_template: "{{ value_json.state }}",
                },
            ],
            command_topic: "zigbee2mqtt/bosch_radiator/set/pi_heating_demand",
            default_entity_id: "number.bosch_radiator_pi_heating_demand",
            device: {
                identifiers: ["zigbee2mqtt_0x18fc2600000d7ae2"],
                manufacturer: "Bosch",
                model: "Radiator thermostat II",
                model_id: "BTH-RA",
                name: "bosch_radiator",
                sw_version: "3.05.09",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            icon: "mdi:radiator",
            max: 100,
            min: 0,
            name: "PI heating demand",
            object_id: "bosch_radiator_pi_heating_demand",
            origin: origin,
            state_topic: "zigbee2mqtt/bosch_radiator",
            unique_id: "0x18fc2600000d7ae2_pi_heating_demand_zigbee2mqtt",
            unit_of_measurement: "%",
            value_template: "{{ value_json.pi_heating_demand }}",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/number/0x18fc2600000d7ae2/pi_heating_demand/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should discover Bosch BTH-RA with a compatibility mapping", () => {
        const payload = {
            action_template:
                "{% set values = {None:None,'idle':'idle','heat':'heating','cool':'cooling','fan_only':'fan'} %}{{ values[value_json.running_state] }}",
            action_topic: "zigbee2mqtt/bosch_radiator",
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            current_temperature_template: "{{ value_json.local_temperature }}",
            current_temperature_topic: "zigbee2mqtt/bosch_radiator",
            device: {
                identifiers: ["zigbee2mqtt_0x18fc2600000d7ae2"],
                manufacturer: "Bosch",
                model: "Radiator thermostat II",
                model_id: "BTH-RA",
                name: "bosch_radiator",
                sw_version: "3.05.09",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            max_temp: "30",
            min_temp: "5",
            mode_command_template: `{% set values = { 'auto':'schedule','heat':'manual','off':'pause'} %}{"operating_mode": "{{ values[value] if value in values.keys() else 'pause' }}"}`,
            mode_command_topic: "zigbee2mqtt/bosch_radiator/set",
            mode_state_template:
                "{% set values = {'schedule':'auto','manual':'heat','pause':'off'} %}{% set value = value_json.operating_mode %}{{ values[value] if value in values.keys() else 'off' }}",
            mode_state_topic: "zigbee2mqtt/bosch_radiator",
            modes: ["off", "heat", "auto"],
            name: null,
            object_id: "bosch_radiator",
            default_entity_id: "climate.bosch_radiator",
            origin: origin,
            temp_step: 0.5,
            temperature_command_topic: "zigbee2mqtt/bosch_radiator/set/occupied_heating_setpoint",
            temperature_state_template: "{{ value_json.occupied_heating_setpoint }}",
            temperature_state_topic: "zigbee2mqtt/bosch_radiator",
            temperature_unit: "C",
            unique_id: "0x18fc2600000d7ae2_climate_zigbee2mqtt",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/climate/0x18fc2600000d7ae2/climate/config", stringify(payload), {
            qos: 1,
            retain: true,
        });
    });

    it("does not throw when discovery payload override throws", async () => {
        const bosch = getZ2MEntity(devices["RBSH-TRV0-ZB-EU"]) as Device;
        assert(typeof bosch.definition?.meta?.overrideHaDiscoveryPayload === "function");
        const overrideSpy = vi.spyOn(bosch.definition.meta, "overrideHaDiscoveryPayload") as MockInstance;

        overrideSpy.mockImplementation((payload) => {
            if (payload.mode_command_topic?.endsWith("/system_mode")) {
                throw new Error("Failed");
            }
        });

        await resetExtension();

        const payload = {
            action_template:
                "{% set values = {None:None,'idle':'idle','heat':'heating','cool':'cooling','fan_only':'fan'} %}{{ values[value_json.running_state] }}",
            action_topic: "zigbee2mqtt/bosch_radiator",
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            current_temperature_template: "{{ value_json.local_temperature }}",
            current_temperature_topic: "zigbee2mqtt/bosch_radiator",
            device: {
                identifiers: ["zigbee2mqtt_0x18fc2600000d7ae2"],
                manufacturer: "Bosch",
                model: "Radiator thermostat II",
                model_id: "BTH-RA",
                name: "bosch_radiator",
                sw_version: "3.05.09",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            max_temp: "30",
            min_temp: "5",
            mode_command_topic: "zigbee2mqtt/bosch_radiator/set/system_mode",
            mode_state_template: "{{ value_json.system_mode }}",
            mode_state_topic: "zigbee2mqtt/bosch_radiator",
            modes: ["heat"],
            name: null,
            object_id: "bosch_radiator",
            default_entity_id: "climate.bosch_radiator",
            origin: origin,
            temp_step: 0.5,
            temperature_command_topic: "zigbee2mqtt/bosch_radiator/set/occupied_heating_setpoint",
            temperature_state_template: "{{ value_json.occupied_heating_setpoint }}",
            temperature_state_topic: "zigbee2mqtt/bosch_radiator",
            temperature_unit: "C",
            unique_id: "0x18fc2600000d7ae2_climate_zigbee2mqtt",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/climate/0x18fc2600000d7ae2/climate/config", stringify(payload), {
            qos: 1,
            retain: true,
        });
        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Failed to override HA discovery payload"));

        overrideSpy.mockRestore();
    });

    it("Should discover Bosch BTH-RM230Z with a current_humidity attribute", () => {
        const payload = {
            action_template:
                "{% set values = {None:None,'idle':'idle','heat':'heating','cool':'cooling','fan_only':'fan'} %}{{ values[value_json.running_state] }}",
            action_topic: "zigbee2mqtt/bosch_rm230z",
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            current_humidity_template: "{{ value_json.humidity }}",
            current_humidity_topic: "zigbee2mqtt/bosch_rm230z",
            current_temperature_template: "{{ value_json.local_temperature }}",
            current_temperature_topic: "zigbee2mqtt/bosch_rm230z",
            default_entity_id: "climate.bosch_rm230z",
            device: {
                identifiers: ["zigbee2mqtt_0x18fc2600000d7ae3"],
                manufacturer: "Bosch",
                model: "Room thermostat II 230V",
                model_id: "BTH-RM230Z",
                name: "bosch_rm230z",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            max_temp: "30",
            min_temp: "5",
            mode_command_topic: "zigbee2mqtt/bosch_rm230z/set/system_mode",
            mode_state_template: "{{ value_json.system_mode }}",
            mode_state_topic: "zigbee2mqtt/bosch_rm230z",
            modes: ["off", "heat", "cool"],
            name: null,
            object_id: "bosch_rm230z",
            origin,
            temp_step: 0.5,
            temperature_high_command_topic: "zigbee2mqtt/bosch_rm230z/set/occupied_cooling_setpoint",
            temperature_high_state_template: "{{ value_json.occupied_cooling_setpoint }}",
            temperature_high_state_topic: "zigbee2mqtt/bosch_rm230z",
            temperature_low_command_topic: "zigbee2mqtt/bosch_rm230z/set/occupied_heating_setpoint",
            temperature_low_state_template: "{{ value_json.occupied_heating_setpoint }}",
            temperature_low_state_topic: "zigbee2mqtt/bosch_rm230z",
            temperature_unit: "C",
            unique_id: "0x18fc2600000d7ae3_climate_zigbee2mqtt",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/climate/0x18fc2600000d7ae3/climate/config", stringify(payload), {
            qos: 1,
            retain: true,
        });
    });

    it("Should discover devices with cover_position", () => {
        let payload;

        payload = {
            command_topic: "zigbee2mqtt/smart vent/set",
            position_topic: "zigbee2mqtt/smart vent",
            set_position_topic: "zigbee2mqtt/smart vent/set",
            set_position_template: '{ "position": {{ position }} }',
            position_template: "{{ value_json.position }}",
            state_topic: "zigbee2mqtt/smart vent",
            value_template: "{{ value_json.state }}",
            state_open: "OPEN",
            state_closed: "CLOSE",
            state_stopped: "STOP",
            name: null,
            object_id: "smart_vent",
            default_entity_id: "cover.smart_vent",
            unique_id: "0x0017880104e45551_cover_zigbee2mqtt",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45551"],
                name: "smart vent",
                model: "Smart vent",
                model_id: "SV01",
                manufacturer: "Keen Home",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/cover/0x0017880104e45551/cover/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        payload = {
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            command_topic: "zigbee2mqtt/zigfred_plus/l6/set",
            device: {
                identifiers: ["zigbee2mqtt_0xf4ce368a38be56a1"],
                manufacturer: "Siglis",
                model: "zigfred plus smart in-wall switch",
                model_id: "ZFP-1A-CH",
                name: "zigfred_plus",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            name: "L6",
            position_template: "{{ value_json.position }}",
            position_topic: "zigbee2mqtt/zigfred_plus/l6",
            set_position_template: '{ "position_l6": {{ position }} }',
            set_position_topic: "zigbee2mqtt/zigfred_plus/l6/set",
            state_stopped: "STOP",
            state_closed: "CLOSE",
            state_open: "OPEN",
            state_topic: "zigbee2mqtt/zigfred_plus/l6",
            tilt_command_topic: "zigbee2mqtt/zigfred_plus/l6/set/tilt",
            tilt_status_template: "{{ value_json.tilt }}",
            tilt_status_topic: "zigbee2mqtt/zigfred_plus/l6",
            object_id: "zigfred_plus_l6",
            default_entity_id: "cover.zigfred_plus_l6",
            unique_id: "0xf4ce368a38be56a1_cover_l6_zigbee2mqtt",
            origin: origin,
            value_template: "{{ value_json.state }}",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/cover/0xf4ce368a38be56a1/cover_l6/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should discover dual cover devices", () => {
        const payload_left = {
            availability: [
                {
                    topic: "zigbee2mqtt/bridge/state",
                    value_template: "{{ value_json.state }}",
                },
            ],
            command_topic: "zigbee2mqtt/0xa4c138018cf95021/left/set",
            device: {
                identifiers: ["zigbee2mqtt_0xa4c138018cf95021"],
                manufacturer: "Girier",
                model: "Dual smart curtain switch",
                model_id: "TS130F_GIRIER_DUAL",
                name: "0xa4c138018cf95021",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            name: "Left",
            object_id: "0xa4c138018cf95021_left",
            default_entity_id: "cover.0xa4c138018cf95021_left",
            origin: origin,
            position_template: "{{ value_json.position }}",
            position_topic: "zigbee2mqtt/0xa4c138018cf95021/left",
            set_position_template: '{ "position_left": {{ position }} }',
            set_position_topic: "zigbee2mqtt/0xa4c138018cf95021/left/set",
            state_closing: "DOWN",
            state_opening: "UP",
            state_stopped: "STOP",
            state_topic: "zigbee2mqtt/0xa4c138018cf95021/left",
            unique_id: "0xa4c138018cf95021_cover_left_zigbee2mqtt",
            value_template: '{% if "moving" in value_json and value_json.moving %} {{ value_json.moving }} {% else %} STOP {% endif %}',
        };
        const payload_right = {
            availability: [
                {
                    topic: "zigbee2mqtt/bridge/state",
                    value_template: "{{ value_json.state }}",
                },
            ],
            command_topic: "zigbee2mqtt/0xa4c138018cf95021/right/set",
            device: {
                identifiers: ["zigbee2mqtt_0xa4c138018cf95021"],
                manufacturer: "Girier",
                model: "Dual smart curtain switch",
                model_id: "TS130F_GIRIER_DUAL",
                name: "0xa4c138018cf95021",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            name: "Right",
            object_id: "0xa4c138018cf95021_right",
            default_entity_id: "cover.0xa4c138018cf95021_right",
            origin: origin,
            position_template: "{{ value_json.position }}",
            position_topic: "zigbee2mqtt/0xa4c138018cf95021/right",
            set_position_template: '{ "position_right": {{ position }} }',
            set_position_topic: "zigbee2mqtt/0xa4c138018cf95021/right/set",
            state_closing: "DOWN",
            state_opening: "UP",
            state_stopped: "STOP",
            state_topic: "zigbee2mqtt/0xa4c138018cf95021/right",
            unique_id: "0xa4c138018cf95021_cover_right_zigbee2mqtt",
            value_template: '{% if "moving" in value_json and value_json.moving %} {{ value_json.moving }} {% else %} STOP {% endif %}',
        };

        console.log(mockMQTTPublishAsync.mock.calls.find((c) => c[0] === "homeassistant/cover/0xa4c138018cf95021/cover_left/config"));

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/cover/0xa4c138018cf95021/cover_left/config", stringify(payload_left), {
            retain: true,
            qos: 1,
        });
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/cover/0xa4c138018cf95021/cover_right/config", stringify(payload_right), {
            retain: true,
            qos: 1,
        });
    });

    it("Should discover devices with custom homeassistant.discovery_topic", async () => {
        settings.set(["homeassistant", "discovery_topic"], "my_custom_discovery_topic");
        await resetExtension();

        const payload = {
            unit_of_measurement: "°C",
            device_class: "temperature",
            state_class: "measurement",
            value_template: "{{ value_json.temperature }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            enabled_by_default: true,
            object_id: "weather_sensor_temperature",
            default_entity_id: "sensor.weather_sensor_temperature",
            unique_id: "0x0017880104e45522_temperature_zigbee2mqtt",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "my_custom_discovery_topic/sensor/0x0017880104e45522/temperature/config",
            stringify(payload),
            {retain: true, qos: 1},
        );
    });

    it("Should throw error when starting with attributes output", async () => {
        settings.set(["advanced", "output"], "attribute");
        settings.set(["homeassistant"], {enabled: true});
        const controller = new Controller(vi.fn(), vi.fn());

        await expect(async () => {
            await controller.start();
        }).rejects.toThrow("Home Assistant integration is not possible with attribute output!");
    });

    it("Should throw error when homeassistant.discovery_topic equals the mqtt.base_topic", async () => {
        settings.set(["mqtt", "base_topic"], "homeassistant");
        const controller = new Controller(vi.fn(), vi.fn());

        await expect(async () => {
            await controller.start();
        }).rejects.toThrow("'homeassistant.discovery_topic' cannot not be equal to the 'mqtt.base_topic' (got 'homeassistant')");
    });

    it("Should warn when starting with cache_state false", async () => {
        settings.set(["advanced", "cache_state"], false);
        mockLogger.warning.mockClear();
        await resetExtension();
        expect(mockLogger.warning).toHaveBeenCalledWith("In order for Home Assistant integration to work properly set `cache_state: true");
    });

    it("Should set missing values to null", async () => {
        // https://github.com/Koenkk/zigbee2mqtt/issues/6987
        const device = devices.WSDCGQ11LM;
        const data = {measuredValue: -85};
        const payload = {
            data,
            cluster: "msTemperatureMeasurement",
            device,
            endpoint: device.getEndpoint(1),
            type: "attributeReport",
            linkquality: 10,
        };
        mockMQTTPublishAsync.mockClear();
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/weather_sensor",
            stringify({battery: null, humidity: null, linkquality: null, pressure: null, temperature: -0.85, voltage: null}),
            {retain: false, qos: 1},
        );
    });

    it("Should copy hue/saturtion to h/s if present", async () => {
        const device = devices.bulb_color;
        const data = {currentHue: 0, currentSaturation: 254};
        const payload = {data, cluster: "lightingColorCtrl", device, endpoint: device.getEndpoint(1), type: "attributeReport", linkquality: 10};
        mockMQTTPublishAsync.mockClear();
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb_color",
            stringify({
                color: {hue: 0, saturation: 100, h: 0, s: 100},
                color_mode: "hs",
                effect: null,
                linkquality: null,
                state: null,
                power_on_behavior: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: false, qos: 0},
        );
    });

    it("Should not copy hue/saturtion if properties are missing", async () => {
        const device = devices.bulb_color;
        const data = {currentX: 29991, currentY: 26872};
        const payload = {data, cluster: "lightingColorCtrl", device, endpoint: device.getEndpoint(1), type: "attributeReport", linkquality: 10};
        mockMQTTPublishAsync.mockClear();
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb_color",
            stringify({
                color: {x: 0.4576, y: 0.41},
                color_mode: "xy",
                effect: null,
                linkquality: null,
                state: null,
                power_on_behavior: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: false, qos: 0},
        );
    });

    it("Should not copy hue/saturtion if color is missing", async () => {
        const device = devices.bulb_color;
        const data = {onOff: 1};
        const payload = {data, cluster: "genOnOff", device, endpoint: device.getEndpoint(1), type: "attributeReport", linkquality: 10};
        mockMQTTPublishAsync.mockClear();
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb_color",
            stringify({
                linkquality: null,
                effect: null,
                state: "ON",
                power_on_behavior: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: false, qos: 0},
        );
    });

    it("Shouldt discover when already discovered", async () => {
        const device = devices.WSDCGQ11LM;
        const data = {measuredValue: -85};
        const payload = {
            data,
            cluster: "msTemperatureMeasurement",
            device,
            endpoint: device.getEndpoint(1),
            type: "attributeReport",
            linkquality: 10,
        };
        mockMQTTPublishAsync.mockClear();
        await mockZHEvents.message(payload);
        await flushPromises();
        // 1 publish is the publish from receive
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
    });

    it("Should discover when not discovered yet", async () => {
        // @ts-expect-error private
        extension.discovered = {};
        const device = devices.WSDCGQ11LM;
        const data = {measuredValue: -85};
        const payload = {
            data,
            cluster: "msTemperatureMeasurement",
            device,
            endpoint: device.getEndpoint(1),
            type: "attributeReport",
            linkquality: 10,
        };
        mockMQTTPublishAsync.mockClear();
        await mockZHEvents.message(payload);
        await flushPromises();
        const payloadHA = {
            unit_of_measurement: "°C",
            device_class: "temperature",
            enabled_by_default: true,
            state_class: "measurement",
            value_template: "{{ value_json.temperature }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            object_id: "weather_sensor_temperature",
            default_entity_id: "sensor.weather_sensor_temperature",
            unique_id: "0x0017880104e45522_temperature_zigbee2mqtt",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/temperature/config", stringify(payloadHA), {
            retain: true,
            qos: 1,
        });
    });

    it("Shouldnt discover when device leaves", async () => {
        // @ts-expect-error private
        extension.discovered = {};
        const device = devices.bulb;
        const payload = {ieeeAddr: device.ieeeAddr};
        mockMQTTPublishAsync.mockClear();
        await mockZHEvents.deviceLeave(payload);
        await flushPromises();
    });

    it("Should discover when options change", async () => {
        const device = getZ2MEntity(devices.bulb)! as Device;
        assert("ieeeAddr" in device);
        resetDiscoveryPayloads(device.ieeeAddr);
        mockMQTTPublishAsync.mockClear();
        controller.eventBus.emitEntityOptionsChanged({entity: device, from: {}, to: {test: 123}});
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(`homeassistant/light/${device.ID}/light/config`, expect.any(String), expect.any(Object));
    });

    it("Should send all status when home assistant comes online (default topic)", async () => {
        data.writeDefaultState();
        // @ts-expect-error private
        extension.state.load();
        await resetExtension();
        expect(mockMQTTSubscribeAsync).toHaveBeenCalledWith("homeassistant/status");
        await flushPromises();
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message("homeassistant/status", "online");
        await flushPromises();
        await vi.runOnlyPendingTimersAsync();
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({
                state: "ON",
                color_options: null,
                brightness: 50,
                color_temp: 370,
                effect: null,
                identify: null,
                linkquality: 99,
                power_on_behavior: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/remote",
            stringify({
                action_duration: null,
                battery: null,
                brightness: 255,
                linkquality: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/group_1", stringify({state: "ON"}), {retain: false, qos: 0});
    });

    it("Should send all status when home assistant comes online", async () => {
        data.writeDefaultState();
        // @ts-expect-error private
        extension.state.load();
        await resetExtension();
        expect(mockMQTTSubscribeAsync).toHaveBeenCalledWith("homeassistant/status");
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message("homeassistant/status", "online");
        await flushPromises();
        await vi.runOnlyPendingTimersAsync();
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({
                state: "ON",
                color_options: null,
                brightness: 50,
                color_temp: 370,
                effect: null,
                identify: null,
                linkquality: 99,
                power_on_behavior: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/remote",
            stringify({
                action_duration: null,
                battery: null,
                brightness: 255,
                linkquality: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: true, qos: 0},
        );
    });

    it("Shouldnt send all status when home assistant comes offline", async () => {
        data.writeDefaultState();
        // @ts-expect-error private
        extension.state.load();
        await resetExtension();
        await flushPromises();
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message("homeassistant/status", "offline");
        await flushPromises();
        await vi.runOnlyPendingTimersAsync();
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/health", expect.any(String), expect.any(Object));
    });

    it("Shouldnt send all status when home assistant comes online with different topic", async () => {
        data.writeDefaultState();
        // @ts-expect-error private
        extension.state.load();
        await resetExtension();
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message("homeassistant/status_different", "offline");
        await flushPromises();
        await vi.runOnlyPendingTimersAsync();
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/health", expect.any(String), expect.any(Object));
    });

    it("Should discover devices with availability", async () => {
        settings.set(["availability"], {enabled: true});
        await resetExtension();

        const payload = {
            unit_of_measurement: "°C",
            device_class: "temperature",
            enabled_by_default: true,
            state_class: "measurement",
            value_template: "{{ value_json.temperature }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            object_id: "weather_sensor_temperature",
            default_entity_id: "sensor.weather_sensor_temperature",
            unique_id: "0x0017880104e45522_temperature_zigbee2mqtt",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability_mode: "all",
            availability: [
                {topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"},
                {topic: "zigbee2mqtt/weather_sensor/availability", value_template: "{{ value_json.state }}"},
            ],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/temperature/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should clear discovery when device is removed", async () => {
        mockMQTTPublishAsync.mockClear();
        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/remove", "weather_sensor");
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/temperature/config", "", {retain: true, qos: 1});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/humidity/config", "", {retain: true, qos: 1});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/pressure/config", "", {retain: true, qos: 1});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/battery/config", "", {retain: true, qos: 1});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/linkquality/config", "", {retain: true, qos: 1});
    });

    it("Should clear discovery when group is removed", async () => {
        mockMQTTPublishAsync.mockClear();
        mockMQTTEvents.message("zigbee2mqtt/bridge/request/group/remove", stringify({id: "ha_discovery_group"}));
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/light/1221051039810110150109113116116_9/light/config", "", {
            retain: true,
            qos: 1,
        });
    });

    it("Should refresh discovery when device is renamed", async () => {
        await mockMQTTEvents.message(
            "homeassistant/device_automation/0x0017880104e45522/action_double/config",
            stringify({topic: "zigbee2mqtt/weather_sensor/action"}),
        );
        await flushPromises();
        mockMQTTPublishAsync.mockClear();
        mockMQTTEvents.message(
            "zigbee2mqtt/bridge/request/device/rename",
            stringify({from: "weather_sensor", to: "weather_sensor_renamed", homeassistant_rename: true}),
        );
        await flushPromises();
        await vi.runOnlyPendingTimersAsync();
        await flushPromises();

        const payload = {
            unit_of_measurement: "°C",
            device_class: "temperature",
            state_class: "measurement",
            enabled_by_default: true,
            value_template: "{{ value_json.temperature }}",
            state_topic: "zigbee2mqtt/weather_sensor_renamed",
            object_id: "weather_sensor_renamed_temperature",
            default_entity_id: "sensor.weather_sensor_renamed_temperature",
            origin: origin,
            unique_id: "0x0017880104e45522_temperature_zigbee2mqtt",
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor_renamed",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/temperature/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/temperature/config", "", {retain: true, qos: 1});

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "homeassistant/device_automation/0x0017880104e45522/action_double/config",
            stringify({
                automation_type: "trigger",
                type: "action",
                subtype: "double",
                payload: "double",
                topic: "zigbee2mqtt/weather_sensor_renamed/action",
                origin: origin,
                device: {
                    identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                    name: "weather_sensor_renamed",
                    model: "Temperature and humidity sensor",
                    model_id: "WSDCGQ11LM",
                    manufacturer: "Aqara",
                    via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
                },
            }),
            {retain: true, qos: 1},
        );
    });

    it("Should refresh discovery when group is renamed", async () => {
        mockMQTTPublishAsync.mockClear();
        mockMQTTEvents.message(
            "zigbee2mqtt/bridge/request/group/rename",
            stringify({from: "ha_discovery_group", to: "ha_discovery_group_new", homeassistant_rename: true}),
        );
        await flushPromises();
        await vi.runOnlyPendingTimersAsync();
        await flushPromises();

        const payload = {
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            brightness: true,
            brightness_scale: 254,
            command_topic: "zigbee2mqtt/ha_discovery_group_new/set",
            device: {
                identifiers: ["zigbee2mqtt_1221051039810110150109113116116_9"],
                name: "ha_discovery_group_new",
                sw_version: version,
                model: "Group",
                manufacturer: "Zigbee2MQTT",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            max_mireds: 454,
            min_mireds: 250,
            name: null,
            schema: "json",
            state_topic: "zigbee2mqtt/ha_discovery_group_new",
            supported_color_modes: ["xy", "color_temp"],
            effect: true,
            effect_list: [
                "blink",
                "breathe",
                "okay",
                "channel_change",
                "candle",
                "fireplace",
                "colorloop",
                "finish_effect",
                "stop_effect",
                "stop_hue_effect",
            ],
            object_id: "ha_discovery_group_new",
            default_entity_id: "light.ha_discovery_group_new",
            unique_id: "9_light_zigbee2mqtt",
            origin: origin,
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/light/1221051039810110150109113116116_9/light/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/light/1221051039810110150109113116116_9/light/config", "", {
            retain: true,
            qos: 1,
        });
    });

    it("Shouldnt refresh discovery when device is renamed and homeassistant_rename is false", async () => {
        mockMQTTPublishAsync.mockClear();
        mockMQTTEvents.message(
            "zigbee2mqtt/bridge/request/device/rename",
            stringify({from: "weather_sensor", to: "weather_sensor_renamed", homeassistant_rename: false}),
        );
        await flushPromises();

        expect(mockMQTTPublishAsync).not.toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/temperature/config", "", {
            retain: true,
            qos: 1,
        });

        const payload = {
            unit_of_measurement: "°C",
            device_class: "temperature",
            state_class: "measurement",
            enabled_by_default: true,
            value_template: "{{ value_json.temperature }}",
            state_topic: "zigbee2mqtt/weather_sensor_renamed",
            object_id: "weather_sensor_renamed_temperature",
            default_entity_id: "sensor.weather_sensor_renamed_temperature",
            unique_id: "0x0017880104e45522_temperature_zigbee2mqtt",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor_renamed",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/temperature/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should discover update when device supports it", () => {
        const payload = {
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            command_topic: "zigbee2mqtt/bridge/request/device/ota_update/update",
            device: {
                identifiers: ["zigbee2mqtt_0x000b57fffec6a5b2"],
                manufacturer: "IKEA",
                model: "TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm",
                model_id: "LED1545G12",
                name: "bulb",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            device_class: "firmware",
            entity_category: "config",
            entity_picture: "https://github.com/Koenkk/zigbee2mqtt/raw/master/images/logo.png",
            name: null,
            object_id: "bulb",
            default_entity_id: "update.bulb",
            origin,
            payload_install: `{"id": "0x000b57fffec6a5b2"}`,
            state_topic: "zigbee2mqtt/bulb",
            unique_id: "0x000b57fffec6a5b2_update_zigbee2mqtt",
            value_template:
                "{\"latest_version\":\"{{ value_json['update']['latest_version'] }}\",\"installed_version\":\"{{ value_json['update']['installed_version'] }}\",\"update_percentage\":{{ value_json['update'].get('progress', 'null') }},\"in_progress\":{{ (value_json['update']['state'] == 'updating')|lower }}}",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/update/0x000b57fffec6a5b2/update/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should discover trigger when action is published", async () => {
        const discovered = mockMQTTPublishAsync.mock.calls.filter((c) => c[0].includes("0x0017880104e45520")).map((c) => c[0]);
        expect(discovered.length).toBe(5);

        mockMQTTPublishAsync.mockClear();

        const device = devices.WXKG11LM;
        const payload1 = {data: {onOff: 1}, cluster: "genOnOff", device, endpoint: device.getEndpoint(1), type: "attributeReport", linkquality: 10};
        await mockZHEvents.message(payload1);
        await flushPromises();

        const discoverPayloadAction = {
            automation_type: "trigger",
            type: "action",
            subtype: "single",
            payload: "single",
            topic: "zigbee2mqtt/button/action",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45520"],
                name: "button",
                model: "Wireless mini switch",
                model_id: "WXKG11LM",
                manufacturer: "Aqara",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "homeassistant/device_automation/0x0017880104e45520/action_single/config",
            stringify(discoverPayloadAction),
            {retain: true, qos: 1},
        );

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/button",
            stringify({
                action: "single",
                battery: null,
                linkquality: null,
                voltage: null,
                power_outage_count: null,
                device_temperature: null,
            }),
            {retain: false, qos: 0},
        );

        // Should only discover it once
        mockMQTTPublishAsync.mockClear();
        await mockZHEvents.message(payload1);
        await flushPromises();
        expect(mockMQTTPublishAsync).not.toHaveBeenCalledWith(
            "homeassistant/device_automation/0x0017880104e45520/action_single/config",
            stringify(discoverPayloadAction),
            {retain: true, qos: 1},
        );

        // Shouldn't rediscover when already discovered in previous session
        clearDiscoveredTrigger("0x0017880104e45520");
        await mockMQTTEvents.message(
            "homeassistant/device_automation/0x0017880104e45520/action_double/config",
            stringify({topic: "zigbee2mqtt/button/action"}),
        );
        await mockMQTTEvents.message(
            "homeassistant/device_automation/0x0017880104e45520/action_double/config",
            stringify({topic: "zigbee2mqtt/button/action"}),
        );
        await flushPromises();
        mockMQTTPublishAsync.mockClear();
        const payload2 = {data: {32768: 2}, cluster: "genOnOff", device, endpoint: device.getEndpoint(1), type: "attributeReport", linkquality: 10};
        await mockZHEvents.message(payload2);
        await flushPromises();
        expect(mockMQTTPublishAsync).not.toHaveBeenCalledWith(
            "homeassistant/device_automation/0x0017880104e45520/action_double/config",
            expect.any(String),
            expect.any(Object),
        );

        // Should rediscover when already discovered in previous session but with different name
        clearDiscoveredTrigger("0x0017880104e45520");
        await mockMQTTEvents.message(
            "homeassistant/device_automation/0x0017880104e45520/action_double/config",
            stringify({topic: "zigbee2mqtt/button_other_name/action"}),
        );
        await flushPromises();
        mockMQTTPublishAsync.mockClear();
        await mockZHEvents.message(payload2);
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "homeassistant/device_automation/0x0017880104e45520/action_double/config",
            expect.any(String),
            expect.any(Object),
        );
    });

    test.each(["attribute_and_json", "json", "attribute"])("Should publish /action for MQTT device trigger", async (output) => {
        settings.set(["advanced", "output"], output);
        mockMQTTPublishAsync.mockClear();

        const device = devices.WXKG11LM;
        const payload1 = {data: {onOff: 1}, cluster: "genOnOff", device, endpoint: device.getEndpoint(1), type: "attributeReport", linkquality: 10};
        await mockZHEvents.message(payload1);
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/button/action", "single", expect.any(Object));
        expect(mockMQTTPublishAsync.mock.calls.filter((c) => c[1] === "single")).toHaveLength(1);
    });

    it("Should not discover device_automation when disabled", async () => {
        settings.set(["device_options"], {
            homeassistant: {device_automation: null},
        });
        await resetExtension();
        mockMQTTPublishAsync.mockClear();

        const device = devices.WXKG11LM;
        const payload1 = {data: {onOff: 1}, cluster: "genOnOff", device, endpoint: device.getEndpoint(1), type: "attributeReport", linkquality: 10};
        await mockZHEvents.message(payload1);
        await flushPromises();

        expect(mockMQTTPublishAsync).not.toHaveBeenCalledWith(
            "homeassistant/device_automation/0x0017880104e45520/action_single/config",
            expect.any(String),
            expect.any(Object),
        );
    });

    it("Should enable experimental event entities", async () => {
        settings.set(["homeassistant", "experimental_event_entities"], true);
        settings.set(["devices", "0x0017880104e45520"], {
            friendly_name: "button",
            retain: false,
        });
        await resetExtension();

        const payload = {
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45520"],
                manufacturer: "Aqara",
                model: "Wireless mini switch",
                model_id: "WXKG11LM",
                name: "button",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            event_types: ["single", "double", "triple", "quadruple", "hold", "release"],
            icon: "mdi:gesture-double-tap",
            name: "Action",
            object_id: "button_action",
            default_entity_id: "event.button_action",
            origin: origin,
            state_topic: "zigbee2mqtt/button",
            unique_id: "0x0017880104e45520_action_zigbee2mqtt",
            // Needs to be updated whenever one of the ACTION_*_PATTERN constants changes.
            value_template:
                "{% set patterns = [\n{\"pattern\": '^(?P<button>(?:button_)?[a-z0-9]+)_(?P<action>(?:press|hold)(?:_release)?)$', \"groups\": [\"button\", \"action\"]},\n{\"pattern\": '^(?P<action>recall|scene)_(?P<scene>[0-2][0-9]{0,2})$', \"groups\": [\"action\", \"scene\"]},\n{\"pattern\": '^(?P<actionPrefix>region_)(?P<region>[1-9]|10)_(?P<action>enter|leave|occupied|unoccupied)$', \"groups\": [\"actionPrefix\", \"region\", \"action\"]},\n{\"pattern\": '^(?P<action>dial_rotate)_(?P<direction>left|right)_(?P<speed>step|slow|fast)$', \"groups\": [\"action\", \"direction\", \"speed\"]},\n{\"pattern\": '^(?P<action>brightness_step)(?:_(?P<direction>up|down))?$', \"groups\": [\"action\", \"direction\"]}\n] %}\n{% set action_value = value_json.action|default('') %}\n{% set ns = namespace(r=[('action', action_value)]) %}\n{% for p in patterns %}\n  {% set m = action_value|regex_findall(p.pattern) %}\n  {% if m[0] is undefined %}{% continue %}{% endif %}\n  {% for key, value in zip(p.groups, m[0]) %}\n    {% set ns.r = ns.r|rejectattr(0, 'eq', key)|list + [(key, value)] %}\n  {% endfor %}\n{% endfor %}\n{% if (ns.r|selectattr(0, 'eq', 'actionPrefix')|first) is defined %}\n  {% set ns.r = ns.r|rejectattr(0, 'eq', 'action')|list + [('action', ns.r|selectattr(0, 'eq', 'actionPrefix')|map(attribute=1)|first + ns.r|selectattr(0, 'eq', 'action')|map(attribute=1)|first)] %}\n{% endif %}\n{% set ns.r = ns.r + [('event_type', ns.r|selectattr(0, 'eq', 'action')|map(attribute=1)|first)] %}\n{{dict.from_keys(ns.r|rejectattr(0, 'in', ('action', 'actionPrefix'))|reject('eq', ('event_type', None))|reject('eq', ('event_type', '')))|to_json}}",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/event/0x0017880104e45520/action/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should republish payload to postfix topic with lightWithPostfix config", async () => {
        mockMQTTPublishAsync.mockClear();

        await mockMQTTEvents.message("zigbee2mqtt/U202DST600ZB/l2/set", stringify({state: "ON", brightness: 20}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/U202DST600ZB",
            stringify({
                state_l2: "ON",
                brightness_l2: 20,
                linkquality: null,
                state_l1: null,
                effect_l1: null,
                effect_l2: null,
                power_on_behavior_l1: null,
                power_on_behavior_l2: null,
            }),
            {qos: 0, retain: false},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/U202DST600ZB/l2",
            stringify({state: "ON", brightness: 20, effect: null, power_on_behavior: null}),
            {},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/U202DST600ZB/l1",
            stringify({state: null, effect: null, power_on_behavior: null}),
            {},
        );
    });

    it("Shouldnt crash in onPublishEntityState on group publish", async () => {
        mockLogger.error.mockClear();
        mockMQTTPublishAsync.mockClear();
        const group = groups.group_1;
        group.members.push(devices.bulb_color.getEndpoint(1)!);

        await mockMQTTEvents.message("zigbee2mqtt/group_1/set", stringify({state: "ON"}));
        await flushPromises();
        expect(mockLogger.error).toHaveBeenCalledTimes(0);
        group.members.pop();
    });

    it("Should clear outdated configs", async () => {
        // Non-existing group -> clear
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message(
            "homeassistant/light/1221051039810110150109113116116_91231/light/config",
            stringify({availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}]}),
        );
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/light/1221051039810110150109113116116_91231/light/config", "", {
            qos: 1,
            retain: true,
        });

        // Existing group -> dont clear
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message(
            "homeassistant/light/1221051039810110150109113116116_9/light/config",
            stringify({availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}]}),
        );
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(0);

        // Existing group with old topic structure (1.20.0) -> clear
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message(
            "homeassistant/light/9/light/config",
            stringify({availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}]}),
        );
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/light/9/light/config", "", {qos: 1, retain: true});

        // Existing group, non existing config ->  clear
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message(
            "homeassistant/light/1221051039810110150109113116116_9/switch/config",
            stringify({availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}]}),
        );
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/light/1221051039810110150109113116116_9/switch/config", "", {
            qos: 1,
            retain: true,
        });

        // Non-existing device -> clear
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message(
            "homeassistant/sensor/0x123/temperature/config",
            stringify({availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}]}),
        );
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x123/temperature/config", "", {qos: 1, retain: true});

        // Existing device -> don't clear
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message(
            "homeassistant/update/0x000b57fffec6a5b2/update/config",
            stringify({availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}]}),
        );
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(0);

        // Non-existing device of different instance -> don't clear
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message(
            "homeassistant/sensor/0x123/temperature/config",
            stringify({availability: [{topic: "zigbee2mqtt_different/bridge/state"}]}),
        );
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(0);

        // Existing device but non-existing config -> don't clear
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message(
            "homeassistant/sensor/0x000b57fffec6a5b2/update/config",
            stringify({availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}]}),
        );
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x000b57fffec6a5b2/update/config", "", {qos: 1, retain: true});

        // Non-existing device but invalid payload -> clear
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message("homeassistant/sensor/0x123/temperature/config", "1}3");
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(0);

        // Existing device, device automation -> don't clear
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message(
            "homeassistant/device_automation/0x000b57fffec6a5b2/action_button_3_single/config",
            stringify({topic: "zigbee2mqtt/0x000b57fffec6a5b2/availability"}),
        );
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(0);

        // Device automation of different instance -> don't clear
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message(
            "homeassistant/device_automation/0x000b57fffec6a5b2_not_existing/action_button_3_single/config",
            stringify({topic: "zigbee2mqtt_different/0x000b57fffec6a5b2_not_existing/availability"}),
        );
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(0);

        // Device was flagged to be excluded from homeassistant discovery
        settings.set(["devices", "0x000b57fffec6a5b2", "homeassistant"], null);
        await resetExtension();
        mockMQTTPublishAsync.mockClear();

        await mockMQTTEvents.message(
            "homeassistant/update/0x000b57fffec6a5b2/update/config",
            stringify({availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}]}),
        );
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/update/0x000b57fffec6a5b2/update/config", "", {qos: 1, retain: true});
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message(
            "homeassistant/device_automation/0x000b57fffec6a5b2/action_button_3_single/config",
            stringify({topic: "zigbee2mqtt/0x000b57fffec6a5b2/availability"}),
        );
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/device_automation/0x000b57fffec6a5b2/action_button_3_single/config", "", {
            qos: 1,
            retain: true,
        });
    });

    it("Should rediscover group when device is added to it", async () => {
        resetDiscoveryPayloads("9");
        mockMQTTPublishAsync.mockClear();
        mockMQTTEvents.message(
            "zigbee2mqtt/bridge/request/group/members/add",
            stringify({group: "ha_discovery_group", device: "wall_switch_double", endpoint: "left"}),
        );
        await flushPromises();

        const payload = {
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            brightness: true,
            brightness_scale: 254,
            command_topic: "zigbee2mqtt/ha_discovery_group/set",
            device: {
                identifiers: ["zigbee2mqtt_1221051039810110150109113116116_9"],
                name: "ha_discovery_group",
                sw_version: version,
                model: "Group",
                manufacturer: "Zigbee2MQTT",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            max_mireds: 454,
            min_mireds: 250,
            name: null,
            schema: "json",
            state_topic: "zigbee2mqtt/ha_discovery_group",
            supported_color_modes: ["xy", "color_temp"],
            effect: true,
            effect_list: [
                "blink",
                "breathe",
                "okay",
                "channel_change",
                "candle",
                "fireplace",
                "colorloop",
                "finish_effect",
                "stop_effect",
                "stop_hue_effect",
            ],
            object_id: "ha_discovery_group",
            default_entity_id: "light.ha_discovery_group",
            unique_id: "9_light_zigbee2mqtt",
            origin: origin,
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/light/1221051039810110150109113116116_9/light/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should discover with json availability payload value_template", () => {
        const payload = {
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            brightness: true,
            brightness_scale: 254,
            command_topic: "zigbee2mqtt/ha_discovery_group/set",
            device: {
                identifiers: ["zigbee2mqtt_1221051039810110150109113116116_9"],
                name: "ha_discovery_group",
                sw_version: version,
                model: "Group",
                manufacturer: "Zigbee2MQTT",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            max_mireds: 454,
            min_mireds: 250,
            name: null,
            schema: "json",
            state_topic: "zigbee2mqtt/ha_discovery_group",
            supported_color_modes: ["xy", "color_temp"],
            effect: true,
            effect_list: [
                "blink",
                "breathe",
                "okay",
                "channel_change",
                "candle",
                "fireplace",
                "colorloop",
                "finish_effect",
                "stop_effect",
                "stop_hue_effect",
            ],
            object_id: "ha_discovery_group",
            default_entity_id: "light.ha_discovery_group",
            unique_id: "9_light_zigbee2mqtt",
            origin: origin,
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/light/1221051039810110150109113116116_9/light/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should discover with availability offline when device is disabled", async () => {
        settings.set(["devices", "0x000b57fffec6a5b2", "disabled"], true);

        await resetExtension();

        const payload = {
            availability: [
                {
                    topic: "zigbee2mqtt/bridge/state",
                    value_template: `{{ "offline" }}`,
                },
            ],
            brightness: true,
            brightness_scale: 254,
            command_topic: "zigbee2mqtt/bulb/set",
            device: {
                identifiers: ["zigbee2mqtt_0x000b57fffec6a5b2"],
                manufacturer: "IKEA",
                model: "TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm",
                model_id: "LED1545G12",
                name: "bulb",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            effect: true,
            effect_list: ["blink", "breathe", "okay", "channel_change", "finish_effect", "stop_effect"],
            max_mireds: 454,
            min_mireds: 250,
            name: null,
            schema: "json",
            state_topic: "zigbee2mqtt/bulb",
            supported_color_modes: ["color_temp"],
            object_id: "bulb",
            default_entity_id: "light.bulb",
            unique_id: "0x000b57fffec6a5b2_light_zigbee2mqtt",
            origin: origin,
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/light/0x000b57fffec6a5b2/light/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should discover last_seen when enabled", async () => {
        settings.set(["advanced", "last_seen"], "ISO_8601");
        await resetExtension();

        const payload = {
            availability: [
                {
                    topic: "zigbee2mqtt/bridge/state",
                    value_template: "{{ value_json.state }}",
                },
            ],
            device: {
                identifiers: ["zigbee2mqtt_0x000b57fffec6a5b2"],
                manufacturer: "IKEA",
                model: "TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm",
                model_id: "LED1545G12",
                name: "bulb",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            enabled_by_default: false,
            icon: "mdi:clock",
            name: "Last seen",
            state_topic: "zigbee2mqtt/bulb",
            object_id: "bulb_last_seen",
            default_entity_id: "sensor.bulb_last_seen",
            unique_id: "0x000b57fffec6a5b2_last_seen_zigbee2mqtt",
            origin: origin,
            value_template: "{{ value_json.last_seen }}",
            device_class: "timestamp",
            entity_category: "diagnostic",
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x000b57fffec6a5b2/last_seen/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it.each([
        // Windfront includes the instance ID in the URL.
        ["zigbee2mqtt-windfront", "http://zigbee.mqtt/#/device/0/0x0017880104e45522/info"],
        ["zigbee2mqtt-frontend", "http://zigbee.mqtt/#/device/0x0017880104e45522/info"],
    ])("Should discover devices with configuration url (%s)", async (packageName: string, expectedUrl: string) => {
        settings.set(["frontend", "package"], packageName);
        settings.set(["frontend", "url"], "http://zigbee.mqtt");

        await resetExtension();
        await flushPromises();

        const payload = {
            unit_of_measurement: "°C",
            device_class: "temperature",
            state_class: "measurement",
            enabled_by_default: true,
            value_template: "{{ value_json.temperature }}",
            state_topic: "zigbee2mqtt/weather_sensor",
            object_id: "weather_sensor_temperature",
            default_entity_id: "sensor.weather_sensor_temperature",
            unique_id: "0x0017880104e45522_temperature_zigbee2mqtt",
            origin: origin,
            device: {
                identifiers: ["zigbee2mqtt_0x0017880104e45522"],
                name: "weather_sensor",
                model: "Temperature and humidity sensor",
                model_id: "WSDCGQ11LM",
                manufacturer: "Aqara",
                configuration_url: expectedUrl,
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45522/temperature/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Should rediscover scenes when a scene is changed", async () => {
        // Device/endpoint scenes.
        const device = getZ2MEntity(devices.bulb_color_2)! as Device;
        assert("ieeeAddr" in device);
        resetDiscoveryPayloads(device.ieeeAddr);

        mockMQTTPublishAsync.mockClear();
        controller.eventBus.emitScenesChanged({entity: device});
        await flushPromises();

        // Discovery messages for scenes have been purged.
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/scene/0x000b57fffec6a5b4/scene_1/config", "", {retain: true, qos: 1});
        await vi.runOnlyPendingTimersAsync();
        await flushPromises();

        let payload: KeyValueAny = {
            name: "Chill scene",
            command_topic: "zigbee2mqtt/bulb_color_2/set",
            payload_on: '{ "scene_recall": 1 }',
            object_id: "bulb_color_2_1_chill_scene",
            default_entity_id: "scene.bulb_color_2_1_chill_scene",
            unique_id: "0x000b57fffec6a5b4_scene_1_zigbee2mqtt",
            device: {
                identifiers: ["zigbee2mqtt_0x000b57fffec6a5b4"],
                name: "bulb_color_2",
                sw_version: "5.127.1.26581",
                model: "Hue Go",
                model_id: "7146060PH",
                manufacturer: "Philips",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            origin: origin,
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/scene/0x000b57fffec6a5b4/scene_1/config", stringify(payload), {
            retain: true,
            qos: 1,
        });

        // Group scenes.
        const group = getZ2MEntity("ha_discovery_group") as Group;
        resetDiscoveryPayloads("9");

        mockMQTTPublishAsync.mockClear();
        controller.eventBus.emitScenesChanged({entity: group});
        await flushPromises();

        // Discovery messages for scenes have been purged.
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/scene/1221051039810110150109113116116_9/scene_4/config", "", {
            retain: true,
            qos: 1,
        });
        await vi.runOnlyPendingTimersAsync();
        await flushPromises();

        payload = {
            name: "Scene 4",
            command_topic: "zigbee2mqtt/ha_discovery_group/set",
            payload_on: '{ "scene_recall": 4 }',
            object_id: "ha_discovery_group_4_scene_4",
            default_entity_id: "scene.ha_discovery_group_4_scene_4",
            unique_id: "9_scene_4_zigbee2mqtt",
            device: {
                identifiers: ["zigbee2mqtt_1221051039810110150109113116116_9"],
                name: "ha_discovery_group",
                sw_version: version,
                model: "Group",
                manufacturer: "Zigbee2MQTT",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            origin: origin,
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
        };
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "homeassistant/scene/1221051039810110150109113116116_9/scene_4/config",
            stringify(payload),
            {retain: true, qos: 1},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(7);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/health", expect.any(String), expect.any(Object));
    });

    it("Should not clear bridge entities unnecessarily", async () => {
        mockMQTTPublishAsync.mockClear();

        const topic = "homeassistant/button/1221051039810110150109113116116_0x00124b00120144ae/restart/config";
        const payload = {
            name: "Restart",
            object_id: "zigbee2mqtt_bridge_restart",
            default_entity_id: "light.zigbee2mqtt_bridge_restart",
            unique_id: "bridge_0x00124b00120144ae_restart_zigbee2mqtt",
            device_class: "restart",
            command_topic: "zigbee2mqtt/bridge/request/restart",
            payload_press: "",
            origin: origin,
            device: {
                name: "Zigbee2MQTT Bridge",
                identifiers: ["zigbee2mqtt_bridge_0x00124b00120144ae"],
                manufacturer: "Zigbee2MQTT",
                model: "Bridge",
                hw_version: "z-Stack 20190425",
                sw_version: z2m_version,
            },
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            availability_mode: "all",
        };

        controller.eventBus.emitMQTTMessage({
            topic: topic,
            message: stringify(payload),
        });
        await flushPromises();

        expect(mockMQTTPublishAsync).not.toHaveBeenCalledWith(topic, "", {retain: true, qos: 1});
    });

    it("Should discover bridge entities", () => {
        const devicePayload = {
            name: "Zigbee2MQTT Bridge",
            identifiers: ["zigbee2mqtt_bridge_0x00124b00120144ae"],
            manufacturer: "Zigbee2MQTT",
            model: "Bridge",
            hw_version: "z-Stack 20190425",
            sw_version: z2m_version,
        };

        // Binary sensors.
        let payload;
        payload = {
            name: "Connection state",
            object_id: "zigbee2mqtt_bridge_connection_state",
            default_entity_id: "binary_sensor.zigbee2mqtt_bridge_connection_state",
            entity_category: "diagnostic",
            device_class: "connectivity",
            unique_id: "bridge_0x00124b00120144ae_connection_state_zigbee2mqtt",
            state_topic: "zigbee2mqtt/bridge/state",
            value_template: "{{ value_json.state }}",
            payload_on: "online",
            payload_off: "offline",
            origin: origin,
            device: devicePayload,
        };
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "homeassistant/binary_sensor/1221051039810110150109113116116_0x00124b00120144ae/connection_state/config",
            stringify(payload),
            {retain: true, qos: 1},
        );

        payload = {
            name: "Restart required",
            object_id: "zigbee2mqtt_bridge_restart_required",
            default_entity_id: "binary_sensor.zigbee2mqtt_bridge_restart_required",
            entity_category: "diagnostic",
            device_class: "problem",
            enabled_by_default: false,
            unique_id: "bridge_0x00124b00120144ae_restart_required_zigbee2mqtt",
            state_topic: "zigbee2mqtt/bridge/info",
            value_template: "{{ value_json.restart_required }}",
            payload_on: true,
            payload_off: false,
            origin: origin,
            device: devicePayload,
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            availability_mode: "all",
        };
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "homeassistant/binary_sensor/1221051039810110150109113116116_0x00124b00120144ae/restart_required/config",
            stringify(payload),
            {retain: true, qos: 1},
        );

        // Buttons.
        payload = {
            name: "Restart",
            object_id: "zigbee2mqtt_bridge_restart",
            default_entity_id: "button.zigbee2mqtt_bridge_restart",
            unique_id: "bridge_0x00124b00120144ae_restart_zigbee2mqtt",
            device_class: "restart",
            command_topic: "zigbee2mqtt/bridge/request/restart",
            payload_press: "",
            origin: origin,
            device: devicePayload,
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            availability_mode: "all",
        };
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "homeassistant/button/1221051039810110150109113116116_0x00124b00120144ae/restart/config",
            stringify(payload),
            {retain: true, qos: 1},
        );

        // Selects.
        payload = {
            name: "Log level",
            object_id: "zigbee2mqtt_bridge_log_level",
            default_entity_id: "select.zigbee2mqtt_bridge_log_level",
            entity_category: "config",
            unique_id: "bridge_0x00124b00120144ae_log_level_zigbee2mqtt",
            state_topic: "zigbee2mqtt/bridge/info",
            value_template: "{{ value_json.log_level | lower }}",
            command_topic: "zigbee2mqtt/bridge/request/options",
            command_template: '{"options": {"advanced": {"log_level": "{{ value }}" } } }',
            options: settings.LOG_LEVELS,
            origin: origin,
            device: devicePayload,
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            availability_mode: "all",
        };
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "homeassistant/select/1221051039810110150109113116116_0x00124b00120144ae/log_level/config",
            stringify(payload),
            {retain: true, qos: 1},
        );

        // Sensors.
        payload = {
            name: "Version",
            object_id: "zigbee2mqtt_bridge_version",
            default_entity_id: "sensor.zigbee2mqtt_bridge_version",
            entity_category: "diagnostic",
            icon: "mdi:zigbee",
            unique_id: "bridge_0x00124b00120144ae_version_zigbee2mqtt",
            state_topic: "zigbee2mqtt/bridge/info",
            value_template: "{{ value_json.version }}",
            origin: origin,
            device: devicePayload,
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            availability_mode: "all",
        };
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "homeassistant/sensor/1221051039810110150109113116116_0x00124b00120144ae/version/config",
            stringify(payload),
            {retain: true, qos: 1},
        );

        payload = {
            name: "Coordinator version",
            object_id: "zigbee2mqtt_bridge_coordinator_version",
            default_entity_id: "sensor.zigbee2mqtt_bridge_coordinator_version",
            entity_category: "diagnostic",
            enabled_by_default: false,
            icon: "mdi:chip",
            unique_id: "bridge_0x00124b00120144ae_coordinator_version_zigbee2mqtt",
            state_topic: "zigbee2mqtt/bridge/info",
            value_template: "{{ value_json.coordinator.meta.revision }}",
            origin: origin,
            device: devicePayload,
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            availability_mode: "all",
        };
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "homeassistant/sensor/1221051039810110150109113116116_0x00124b00120144ae/coordinator_version/config",
            stringify(payload),
            {retain: true, qos: 1},
        );

        payload = {
            name: "Network map",
            object_id: "zigbee2mqtt_bridge_network_map",
            default_entity_id: "sensor.zigbee2mqtt_bridge_network_map",
            entity_category: "diagnostic",
            enabled_by_default: false,
            unique_id: "bridge_0x00124b00120144ae_network_map_zigbee2mqtt",
            state_topic: "zigbee2mqtt/bridge/response/networkmap",
            value_template: "{{ now().strftime('%Y-%m-%d %H:%M:%S') }}",
            json_attributes_topic: "zigbee2mqtt/bridge/response/networkmap",
            json_attributes_template: "{{ value_json.data.value | tojson }}",
            origin: origin,
            device: devicePayload,
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            availability_mode: "all",
        };
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "homeassistant/sensor/1221051039810110150109113116116_0x00124b00120144ae/network_map/config",
            stringify(payload),
            {retain: true, qos: 1},
        );

        // Switches.
        payload = {
            name: "Permit join",
            object_id: "zigbee2mqtt_bridge_permit_join",
            default_entity_id: "switch.zigbee2mqtt_bridge_permit_join",
            icon: "mdi:human-greeting-proximity",
            unique_id: "bridge_0x00124b00120144ae_permit_join_zigbee2mqtt",
            state_topic: "zigbee2mqtt/bridge/info",
            value_template: "{{ value_json.permit_join | lower }}",
            command_topic: "zigbee2mqtt/bridge/request/permit_join",
            state_on: "true",
            state_off: "false",
            payload_on: '{"time": 254}',
            payload_off: '{"time": 0}',
            origin: origin,
            device: devicePayload,
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            availability_mode: "all",
        };
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "homeassistant/switch/1221051039810110150109113116116_0x00124b00120144ae/permit_join/config",
            stringify(payload),
            {retain: true, qos: 1},
        );
    });

    it("Should remove discovery entries for removed exposes when device options change", async () => {
        mockMQTTPublishAsync.mockClear();
        mockMQTTEvents.message(
            "zigbee2mqtt/bridge/request/device/options",
            stringify({id: "0xf4ce368a38be56a1", options: {dimmer_1_enabled: "false", dimmer_1_dimming_enabled: "false"}}),
        );
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/light/0xf4ce368a38be56a1/light_l2/config", "", {retain: true, qos: 1});
    });

    it("Should publish discovery message when a converter announces changed exposes", async () => {
        mockMQTTPublishAsync.mockClear();
        const device = devices["BMCT-SLZ"];
        const data = {deviceMode: 0};
        const msg = {data, cluster: "boschEnergyDevice", device, endpoint: device.getEndpoint(1), type: "attributeReport", linkquality: 10};
        resetDiscoveryPayloads("0x18fc26000000cafe");
        await mockZHEvents.message(msg);
        await flushPromises();
        const payload = {
            availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}],
            command_topic: "zigbee2mqtt/0x18fc26000000cafe/set/device_mode",
            device: {
                identifiers: ["zigbee2mqtt_0x18fc26000000cafe"],
                manufacturer: "Bosch",
                model: "Light/shutter control unit II",
                model_id: "BMCT-SLZ",
                name: "0x18fc26000000cafe",
                via_device: "zigbee2mqtt_bridge_0x00124b00120144ae",
            },
            entity_category: "config",
            icon: "mdi:tune",
            name: "Device mode",
            object_id: "0x18fc26000000cafe_device_mode",
            default_entity_id: "select.0x18fc26000000cafe_device_mode",
            options: ["light", "shutter", "disabled"],
            origin: origin,
            state_topic: "zigbee2mqtt/0x18fc26000000cafe",
            unique_id: "0x18fc26000000cafe_device_mode_zigbee2mqtt",
            value_template: "{{ value_json.device_mode }}",
        };
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/select/0x18fc26000000cafe/device_mode/config", stringify(payload), {
            retain: true,
            qos: 1,
        });
    });

    it("Legacy action sensor", async () => {
        settings.set(["homeassistant", "legacy_action_sensor"], true);
        await resetExtension();

        // Should discovery action sensor
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("homeassistant/sensor/0x0017880104e45520/action/config", expect.any(String), {
            retain: true,
            qos: 1,
        });

        // Should counter an action payload with an empty payload
        mockMQTTPublishAsync.mockClear();
        const device = devices.WXKG11LM;
        const payload = {data: {onOff: 1}, cluster: "genOnOff", device, endpoint: device.getEndpoint(1), type: "attributeReport", linkquality: 10};
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/button");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({
            action: "single",
            battery: null,
            linkquality: null,
            voltage: null,
            power_outage_count: null,
            device_temperature: null,
        });
        expect(mockMQTTPublishAsync.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
        expect(mockMQTTPublishAsync.mock.calls[1][0]).toStrictEqual("zigbee2mqtt/button");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[1][1])).toStrictEqual({
            action: "",
            battery: null,
            linkquality: null,
            voltage: null,
            power_outage_count: null,
            device_temperature: null,
        });
        expect(mockMQTTPublishAsync.mock.calls[1][2]).toStrictEqual({qos: 0, retain: false});
        expect(mockMQTTPublishAsync.mock.calls[2][0]).toStrictEqual("homeassistant/device_automation/0x0017880104e45520/action_single/config");
        expect(mockMQTTPublishAsync.mock.calls[3][0]).toStrictEqual("zigbee2mqtt/button/action");
    });

    it("prevents mismatching setting/extension state", async () => {
        settings.set(["homeassistant", "enabled"], true);
        await resetExtension();

        await expect(async () => {
            await controller.enableDisableExtension(false, "HomeAssistant");
        }).rejects.toThrow("Tried to disable HomeAssistant extension enabled in settings");

        await expect(async () => {
            await controller.enableDisableExtension(true, "HomeAssistant");
        }).rejects.toThrow("Extension with name HomeAssistant already present");

        settings.set(["homeassistant", "enabled"], false);

        await expect(async () => {
            await controller.enableDisableExtension(true, "HomeAssistant");
        }).rejects.toThrow("Tried to enable HomeAssistant extension disabled in settings");

        settings.set(["homeassistant", "enabled"], false);
        await controller.enableDisableExtension(false, "HomeAssistant");

        await vi.waitFor(() => controller.getExtension("HomeAssistant") === undefined);
    });
});
