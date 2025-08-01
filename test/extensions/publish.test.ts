// biome-ignore assist/source/organizeImports: import mocks first
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import * as data from "../mocks/data";
import {mockLogger} from "../mocks/logger";
import {events as mockMQTTEvents, mockMQTTPublishAsync} from "../mocks/mqtt";
import * as mockSleep from "../mocks/sleep";
import {flushPromises} from "../mocks/utils";
import {devices, groups, events as mockZHEvents} from "../mocks/zigbeeHerdsman";

import stringify from "json-stable-stringify-without-jsonify";
import {clearGlobalStore} from "zigbee-herdsman-converters";
import {Controller} from "../../lib/controller";
import {loadTopicGetSetRegex} from "../../lib/extension/publish";
import * as settings from "../../lib/util/settings";

const mocksClear = [mockMQTTPublishAsync, mockLogger.warning, mockLogger.debug];

describe("Extension: Publish", () => {
    let controller: Controller;

    const expectNothingPublished = (): void => {
        for (const key in devices) {
            for (const ep of devices[key as keyof typeof devices].endpoints) {
                expect(ep.command).toHaveBeenCalledTimes(0);
                expect(ep.read).toHaveBeenCalledTimes(0);
                expect(ep.write).toHaveBeenCalledTimes(0);
            }
        }
        for (const key in groups) {
            expect(groups[key as keyof typeof groups].command).toHaveBeenCalledTimes(0);
        }
    };

    beforeAll(async () => {
        vi.useFakeTimers();
        data.writeEmptyState();
        controller = new Controller(vi.fn(), vi.fn());
        mockSleep.mock();
        await controller.start();
        await flushPromises();
    });

    beforeEach(() => {
        data.writeDefaultConfiguration();
        controller.state.clear();
        settings.reRead();
        loadTopicGetSetRegex();
        for (const mock of mocksClear) mock.mockClear();
        for (const key in devices) {
            for (const ep of devices[key as keyof typeof devices].endpoints) {
                ep.command.mockClear();
                ep.read.mockClear();
                ep.write.mockClear();
            }
        }
        for (const key in groups) {
            groups[key as keyof typeof groups].command.mockClear();
        }

        clearGlobalStore();
    });

    afterAll(async () => {
        await vi.runOnlyPendingTimersAsync();
        mockSleep.restore();
        await controller?.stop();
        await flushPromises();
        vi.useRealTimers();
    });

    it("Should publish messages to zigbee devices", async () => {
        const endpoint = devices.bulb_color.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness: "200"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 200, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({brightness: 200, state: "ON"});
        expect(mockMQTTPublishAsync.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it("Should corretly handle mallformed messages", async () => {
        await mockMQTTEvents.message("zigbee2mqtt/foo", "");
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", "");
        await flushPromises();
        expectNothingPublished();
    });

    it("Should publish messages to zigbee devices when there is no converters", async () => {
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness_no: "200"}));
        await flushPromises();
        expectNothingPublished();
    });

    it("Should publish messages to zigbee devices when there is a get converter but no set", async () => {
        await mockMQTTEvents.message("zigbee2mqtt/thermostat/set", stringify({relay_status_log_rsp: "200"}));
        await flushPromises();
        expectNothingPublished();
    });

    it("Should publish messages to zigbee devices with complicated topic", async () => {
        const device = devices.bulb_color;
        settings.set(["devices", device.ieeeAddr, "friendly_name"], "wohnzimmer.light.wall.right");
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/wohnzimmer.light.wall.right/set", stringify({state: "ON"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/wohnzimmer.light.wall.right");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({state: "ON"});
        expect(mockMQTTPublishAsync.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it("Should publish messages to zigbee devices when brightness is in %", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness_percent: "92"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 235, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({state: "ON", brightness: 235});
        expect(mockMQTTPublishAsync.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it("Should publish messages to zigbee devices when brightness is in number", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness: 230}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 230, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({state: "ON", brightness: 230});
        expect(mockMQTTPublishAsync.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it("Should publish messages to zigbee devices with color_temp", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({color_temp: "222"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColorTemp", {colortemp: 222, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({color_mode: "color_temp", color_temp: 222});
        expect(mockMQTTPublishAsync.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it("Should publish messages to zigbee devices with color_temp in %", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({color_temp_percent: 100}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColorTemp", {colortemp: 500, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({color_mode: "color_temp", color_temp: 500});
        expect(mockMQTTPublishAsync.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it("Should publish messages to zigbee devices with non-default ep", async () => {
        const device = devices.QBKG04LM;
        const endpoint = device.getEndpoint(2)!;
        await mockMQTTEvents.message("zigbee2mqtt/wall_switch/set", stringify({state: "OFF"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "off", {}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/wall_switch");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({state: "OFF"});
        expect(mockMQTTPublishAsync.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it("Should publish messages to zigbee devices with non-default ep and postfix", async () => {
        const device = devices.QBKG03LM;
        const endpoint = device.getEndpoint(3)!;
        await mockMQTTEvents.message("zigbee2mqtt/wall_switch_double/right/set", stringify({state: "OFF"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "off", {}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(2);
        expect(mockMQTTPublishAsync.mock.calls[1][0]).toStrictEqual("zigbee2mqtt/wall_switch_double");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[1][1])).toStrictEqual({state_right: "OFF"});
        expect(mockMQTTPublishAsync.mock.calls[1][2]).toStrictEqual({qos: 0, retain: false});
    });

    it("Should publish messages to zigbee devices with endpoint ID", async () => {
        const device = devices.QBKG03LM;
        const endpoint = device.getEndpoint(3)!;
        await mockMQTTEvents.message("zigbee2mqtt/wall_switch_double/3/set", stringify({state: "OFF"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "off", {}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/wall_switch_double", stringify({state_right: "OFF"}), {
            qos: 0,
            retain: false,
        });
    });

    it("Should publish messages to zigbee devices to non default-ep with state_[EP]", async () => {
        const device = devices.QBKG03LM;
        const endpoint = device.getEndpoint(3)!;
        await mockMQTTEvents.message("zigbee2mqtt/wall_switch_double/set", stringify({state_right: "OFF"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "off", {}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/wall_switch_double");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({state_right: "OFF"});
        expect(mockMQTTPublishAsync.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it("Should publish messages to zigbee devices to non default-ep with brightness_[EP]", async () => {
        const device = devices.QS_Zigbee_D02_TRIAC_2C_LN;
        const endpoint = device.getEndpoint(2)!;
        await mockMQTTEvents.message("zigbee2mqtt/0x0017882194e45543/set", stringify({state_l2: "ON", brightness_l2: 50}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 50, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/QS-Zigbee-D02-TRIAC-2C-LN", stringify({brightness_l2: 50, state_l2: "ON"}), {
            retain: false,
            qos: 0,
        });
    });

    it("Should publish messages to Tuya switch with dummy endpoints", async () => {
        const device = devices.TS0601_switch;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/TS0601_switch/set", stringify({state_l2: "ON"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith(
            "manuSpecificTuya",
            "dataRequest",
            {dpValues: [{data: [1], datatype: 1, dp: 2}], seq: expect.any(Number)},
            {disableDefaultResponse: true},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/TS0601_switch", stringify({state_l2: "ON"}), {retain: false, qos: 0});
    });

    it("Should publish messages to Tuya cover switch with dummy endpoints", async () => {
        const device = devices.TS0601_cover_switch;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/TS0601_cover_switch/set", stringify({state: "OPEN"}));
        await mockMQTTEvents.message("zigbee2mqtt/TS0601_cover_switch/set", stringify({state_l1: "ON"}));
        await mockMQTTEvents.message("zigbee2mqtt/TS0601_cover_switch/l2/set", stringify({state: "OFF"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(3);
        expect(endpoint.command).toHaveBeenCalledWith(
            "manuSpecificTuya",
            "dataRequest",
            {dpValues: [{data: [0], datatype: 4, dp: 1}], seq: expect.any(Number)},
            {disableDefaultResponse: true},
        );
        expect(endpoint.command).toHaveBeenCalledWith(
            "manuSpecificTuya",
            "dataRequest",
            {dpValues: [{data: [1], datatype: 1, dp: 102}], seq: expect.any(Number)},
            {disableDefaultResponse: true},
        );
        expect(endpoint.command).toHaveBeenCalledWith(
            "manuSpecificTuya",
            "dataRequest",
            {dpValues: [{data: [0], datatype: 1, dp: 101}], seq: expect.any(Number)},
            {disableDefaultResponse: true},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/TS0601_cover_switch",
            stringify({state_l2: "OFF", state_l1: "ON", state: "OPEN"}),
            {retain: false, qos: 0},
        );
    });

    it("Should publish messages to zigbee devices with color xy", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({color: {x: 100, y: 50}}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 6553500, colory: 3276750, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({color_mode: "xy", color: {x: 100, y: 50}});
        expect(mockMQTTPublishAsync.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it("Should publish messages to zigbee devices with color xy and state", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({color: {x: 100, y: 50}, state: "ON"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 6553500, colory: 3276750, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb_color",
            stringify({color_mode: "xy", color: {x: 100, y: 50}, state: "ON"}),
            {retain: false, qos: 0},
        );
    });

    it("Should publish messages to zigbee devices with color xy and brightness", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({color: {x: 100, y: 50}, brightness: 20}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 0}, {});
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 6553500, colory: 3276750, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb_color",
            stringify({color_mode: "xy", color: {x: 100, y: 50}, state: "ON", brightness: 20}),
            {retain: false, qos: 0},
        );
    });

    it("Should publish messages to zigbee devices with color xy, brightness and state on", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({color: {x: 100, y: 50}, brightness: 20, state: "ON"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 0}, {});
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 6553500, colory: 3276750, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb_color",
            stringify({color: {x: 100, y: 50}, state: "ON", brightness: 20, color_mode: "xy"}),
            {retain: false, qos: 0},
        );
    });

    it("Should publish messages to zigbee devices with color xy, brightness and state off", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({color: {x: 100, y: 50}, brightness: 20, state: "OFF"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command).toHaveBeenNthCalledWith(1, "lightingColorCtrl", "moveToColor", {colorx: 6553500, colory: 3276750, transtime: 0}, {});
        expect(endpoint.command).toHaveBeenNthCalledWith(2, "genOnOff", "off", {}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb_color",
            stringify({color_mode: "xy", color: {x: 100, y: 50}, state: "OFF"}),
            {retain: false, qos: 0},
        );
    });

    it("Should publish messages to zigbee devices with color rgb object", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({color: {r: 100, g: 200, b: 10}}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 17806, colory: 43155, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({color: {x: 0.2717, y: 0.6585}, color_mode: "xy"});
    });

    it("Should publish messages to zigbee devices with color rgb string", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({color: {rgb: "100,200,10"}}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 17806, colory: 43155, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({color: {x: 0.2717, y: 0.6585}, color_mode: "xy"});
    });

    it("Should publish messages to zigbee devices with brightness", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON", brightness: "50"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 50, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({state: "ON", brightness: 50});
    });

    it("Should publish messages groups", async () => {
        const group = groups.group_1;
        group.members.push(devices.bulb_color.getEndpoint(1)!);
        await mockMQTTEvents.message("zigbee2mqtt/group_1/set", stringify({state: "ON"}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(2); // 'zigbee2mqtt/bulb_color' + below
        expect(mockMQTTPublishAsync.mock.calls[1][0]).toStrictEqual("zigbee2mqtt/group_1");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[1][1])).toStrictEqual({state: "ON"});
        group.members.pop();
    });

    it("Should publish messages to groups with brightness_percent", async () => {
        const group = groups.group_1;
        group.members.push(devices.bulb_color.getEndpoint(1)!);
        await mockMQTTEvents.message("zigbee2mqtt/group_1/set", stringify({brightness_percent: 50}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 128, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(2); // 'zigbee2mqtt/bulb_color' + below
        expect(mockMQTTPublishAsync.mock.calls[1][0]).toStrictEqual("zigbee2mqtt/group_1");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[1][1])).toStrictEqual({state: "ON", brightness: 128});
        group.members.pop();
    });

    it("Should publish messages to groups when converter is not in the default list but device in it supports it", async () => {
        const group = groups.thermostat_group;
        await mockMQTTEvents.message("zigbee2mqtt/thermostat_group/set", stringify({child_lock: "LOCK"}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith(
            "manuSpecificTuya",
            "dataRequest",
            {dpValues: [{data: [1], datatype: 1, dp: 7}], seq: expect.any(Number)},
            {disableDefaultResponse: true},
        );
    });

    it("Should publish messages to group with just 1 Hue Twilight in int (convers have an `endpoint` on it)", async () => {
        // https://github.com/Koenkk/zigbee2mqtt/issues/24792
        const group = groups.hue_twilight_group;
        await mockMQTTEvents.message("zigbee2mqtt/hue_twilight_group/set", stringify({state: "ON"}));
        await flushPromises();
        console.log(mockLogger.warning.mock.calls);
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(2);
        expect(mockMQTTPublishAsync.mock.calls[1][0]).toStrictEqual("zigbee2mqtt/hue_twilight_group");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[1][1])).toStrictEqual({state: "ON"});
    });

    it("Should publish messages to groups with on and brightness", async () => {
        const group = groups.group_1;
        group.members.push(devices.bulb_color.getEndpoint(1)!);
        await mockMQTTEvents.message("zigbee2mqtt/group_1/set", stringify({state: "ON", brightness: 50}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 50, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(2); // 'zigbee2mqtt/bulb_color' + below
        expect(mockMQTTPublishAsync.mock.calls[1][0]).toStrictEqual("zigbee2mqtt/group_1");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[1][1])).toStrictEqual({state: "ON", brightness: 50});
        group.members.pop();
    });

    it("Should publish messages to groups with off and brightness", async () => {
        const group = groups.group_1;
        group.members.push(devices.bulb_color.getEndpoint(1)!);
        await mockMQTTEvents.message("zigbee2mqtt/group_1/set", stringify({state: "OFF", brightness: 50}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genOnOff", "off", {}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(2); // 'zigbee2mqtt/bulb_color' + below
        expect(mockMQTTPublishAsync.mock.calls[1][0]).toStrictEqual("zigbee2mqtt/group_1");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[1][1])).toStrictEqual({state: "OFF"});
        group.members.pop();
    });

    it("Should publish messages to groups color", async () => {
        const group = groups.group_1;
        group.members.push(devices.bulb_color.getEndpoint(1)!);
        await mockMQTTEvents.message("zigbee2mqtt/group_1/set", stringify({color: {x: 0.37, y: 0.28}}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 24248, colory: 18350, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(2); // 'zigbee2mqtt/bulb_color' + below
        expect(mockMQTTPublishAsync.mock.calls[1][0]).toStrictEqual("zigbee2mqtt/group_1");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[1][1])).toStrictEqual({color: {x: 0.37, y: 0.28}, color_mode: "xy"});
        group.members.pop();
    });

    it("Should publish messages to groups color temperature", async () => {
        const group = groups.group_1;
        group.members.push(devices.bulb_color.getEndpoint(1)!);
        await mockMQTTEvents.message("zigbee2mqtt/group_1/set", stringify({color_temp: 100}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColorTemp", {colortemp: 100, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(2); // 'zigbee2mqtt/bulb_color' + below
        expect(mockMQTTPublishAsync.mock.calls[1][0]).toStrictEqual("zigbee2mqtt/group_1");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[1][1])).toStrictEqual({color_temp: 100, color_mode: "color_temp"});
        group.members.pop();
    });

    it("Should create and publish to group which is in configuration.yaml but not in zigbee-herdsman", async () => {
        settings.addGroup("group_12312", "12312");
        expect(Object.values(groups).length).toBe(11);
        await mockMQTTEvents.message("zigbee2mqtt/group_12312/set", stringify({state: "ON"}));
        await flushPromises();
        expect(Object.values(groups).length).toBe(12);
        // group contains no device
        // @ts-expect-error runtime mock
        expect(groups.group_12312.command).toHaveBeenCalledTimes(0);
        // @ts-expect-error runtime mock
        delete groups.group_12312;
    });

    it("Shouldnt publish new state when optimistic = false", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        settings.set(["devices", device.ieeeAddr, "optimistic"], false);
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness: "200"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 200, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(0);
    });

    it("Shouldnt publish new brightness state when filtered_optimistic is used", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        settings.set(["devices", device.ieeeAddr, "filtered_optimistic"], ["brightness"]);
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness: "200"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 200, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({state: "ON"});
    });

    it("Shouldnt publish new state when optimistic = false for group", async () => {
        settings.set(["groups", "2", "optimistic"], false);
        await mockMQTTEvents.message("zigbee2mqtt/group_2/set", stringify({brightness: "200"}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(0);
    });

    it("Should handle non-valid topics", async () => {
        await mockMQTTEvents.message("zigbee2mqtt1/bulb_color/set", stringify({state: "ON"}));
        await flushPromises();
        expectNothingPublished();
    });

    it("Should handle non-valid topics", async () => {
        await mockMQTTEvents.message("zigbee2mqtt1/bulb_color/sett", stringify({state: "ON"}));
        await flushPromises();
        expectNothingPublished();
    });

    it("Should handle non-valid topics", async () => {
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/write", stringify({state: "ON"}));
        await flushPromises();
        expectNothingPublished();
    });

    it("Should handle non-valid topics", async () => {
        await mockMQTTEvents.message("zigbee2mqtt/set", stringify({state: "ON"}));
        await flushPromises();
        expectNothingPublished();
    });

    it("Should handle non-valid topics", async () => {
        await mockMQTTEvents.message("set", stringify({state: "ON"}));
        await flushPromises();
        expectNothingPublished();
    });

    it("Should handle get", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/get", stringify({state: "", brightness: ""}));
        await flushPromises();
        expect(endpoint.read).toHaveBeenCalledTimes(2);
        expect(endpoint.read).toHaveBeenCalledWith("genOnOff", ["onOff"]);
        expect(endpoint.read).toHaveBeenCalledWith("genLevelCtrl", ["currentLevel"]);
    });

    it("Should handle get with multiple endpoints", async () => {
        const device = devices.QBKG03LM;
        const endpoint2 = device.getEndpoint(2)!;
        const endpoint3 = device.getEndpoint(3)!;
        await mockMQTTEvents.message("zigbee2mqtt/0x0017880104e45542/get", stringify({state_left: "", state_right: ""}));
        await flushPromises();
        expect(endpoint2.read).toHaveBeenCalledTimes(1);
        expect(endpoint2.read).toHaveBeenCalledWith("genOnOff", ["onOff"]);
        expect(endpoint3.read).toHaveBeenCalledTimes(1);
        expect(endpoint3.read).toHaveBeenCalledWith("genOnOff", ["onOff"]);
    });

    it("Should handle get with multiple cover endpoints", async () => {
        const device = devices.zigfred_plus;
        const endpoint11 = device.getEndpoint(11)!;
        const endpoint12 = device.getEndpoint(12)!;
        await mockMQTTEvents.message("zigbee2mqtt/zigfred_plus/get", stringify({state_l6: "", state_l7: ""}));
        await flushPromises();
        expect(endpoint11.read).toHaveBeenCalledTimes(1);
        expect(endpoint11.read).toHaveBeenCalledWith("closuresWindowCovering", ["currentPositionLiftPercentage"]);
        expect(endpoint12.read).toHaveBeenCalledTimes(1);
        expect(endpoint12.read).toHaveBeenCalledWith("closuresWindowCovering", ["currentPositionLiftPercentage"]);
    });

    it("Should log error when device has no such endpoint (via topic)", async () => {
        const device = devices.QBKG03LM;
        const endpoint2 = device.getEndpoint(2)!;
        mockLogger.error.mockClear();
        await mockMQTTEvents.message("zigbee2mqtt/0x0017880104e45542/center/get", stringify({state: ""}));
        await flushPromises();
        expect(mockLogger.error).toHaveBeenCalledWith(`Device 'wall_switch_double' has no endpoint 'center'`);
        expect(endpoint2.read).toHaveBeenCalledTimes(0);
    });

    it("Should log error when device has no definition", async () => {
        const device = devices.interviewing;
        mockLogger.error.mockClear();
        await mockMQTTEvents.message(`zigbee2mqtt/${device.ieeeAddr}/set`, stringify({state: "OFF"}));
        await flushPromises();
        expect(mockLogger.log).toHaveBeenCalledWith("error", `Cannot publish to unsupported device 'button_double_key_interviewing'`, "z2m");
    });

    it("Should log error when device has no such endpoint (via property)", async () => {
        const device = devices.QBKG03LM;
        const endpoint2 = device.getEndpoint(2)!;
        const endpoint3 = device.getEndpoint(3)!;
        mockLogger.error.mockClear();
        await mockMQTTEvents.message("zigbee2mqtt/0x0017880104e45542/get", stringify({state_center: "", state_right: ""}));
        await flushPromises();
        expect(mockLogger.error).toHaveBeenCalledWith(`No converter available for 'state_center' on 'wall_switch_double': ("")`);
        expect(endpoint2.read).toHaveBeenCalledTimes(0);
        expect(endpoint3.read).toHaveBeenCalledTimes(1);
        expect(endpoint3.read).toHaveBeenCalledWith("genOnOff", ["onOff"]);
    });

    it("Should parse topic with when base topic has multiple slashes", async () => {
        settings.set(["mqtt", "base_topic"], "zigbee2mqtt/at/my/home");
        loadTopicGetSetRegex();
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/at/my/home/bulb_color/get", stringify({state: ""}));
        await flushPromises();
        expect(endpoint.read).toHaveBeenCalledTimes(1);
        expect(endpoint.read).toHaveBeenCalledWith("genOnOff", ["onOff"]);
    });

    it("Should parse topic with when deviceID has multiple slashes", async () => {
        const device = devices.bulb_color;
        settings.set(["devices", device.ieeeAddr, "friendly_name"], "floor0/basement/my_device_id2");
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/floor0/basement/my_device_id2/get", stringify({state: ""}));
        await flushPromises();
        expect(endpoint.read).toHaveBeenCalledTimes(1);
        expect(endpoint.read).toHaveBeenCalledWith("genOnOff", ["onOff"]);
    });

    it("Should parse topic with when base and deviceID have multiple slashes", async () => {
        settings.set(["mqtt", "base_topic"], "zigbee2mqtt/at/my/basement");
        loadTopicGetSetRegex();
        const device = devices.bulb_color;
        settings.set(["devices", device.ieeeAddr, "friendly_name"], "floor0/basement/my_device_id2");
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/at/my/basement/floor0/basement/my_device_id2/get", stringify({state: ""}));
        await flushPromises();
        expect(endpoint.read).toHaveBeenCalledTimes(1);
        expect(endpoint.read).toHaveBeenCalledWith("genOnOff", ["onOff"]);
    });

    it("Should parse set with attribute topic", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set/state", "ON");
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
    });

    it("Should parse set with color attribute topic", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set/color", "#64C80A");
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 17806, colory: 43155, transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({color: {x: 0.2717, y: 0.6585}, color_mode: "xy"});
    });

    it("Should parse set with ieeeAddr topic", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/0x000b57fffec6a5b3/set", stringify({state: "ON"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
    });

    it("Should parse set with non-existing postfix", async () => {
        await mockMQTTEvents.message("zigbee2mqtt/wall_switch_double/invalid/set", stringify({state: "ON"}));
        await flushPromises();
        expectNothingPublished();
    });

    it("Should allow to invert cover", async () => {
        const device = devices.J1_cover;
        const endpoint = device.getEndpoint(1)!;

        // Non-inverted (open = 100, close = 0)
        await mockMQTTEvents.message("zigbee2mqtt/J1_cover/set", stringify({position: 90}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("closuresWindowCovering", "goToLiftPercentage", {percentageliftvalue: 10}, {});

        // // Inverted
        endpoint.command.mockClear();
        settings.set(["devices", device.ieeeAddr, "invert_cover"], true);
        await mockMQTTEvents.message("zigbee2mqtt/J1_cover/set", stringify({position: 90}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("closuresWindowCovering", "goToLiftPercentage", {percentageliftvalue: 90}, {});
    });

    it("Should send state update on toggle specific endpoint", async () => {
        const device = devices.QBKG03LM;
        const endpoint = device.getEndpoint(2)!;
        await mockMQTTEvents.message("zigbee2mqtt/wall_switch_double/left/set", "ON");
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/wall_switch_double/left/set", "TOGGLE");
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "toggle", {}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(2);
        expect(mockMQTTPublishAsync.mock.calls[0]).toEqual([
            "zigbee2mqtt/wall_switch_double",
            stringify({state_left: "ON"}),
            {qos: 0, retain: false},
        ]);
        expect(mockMQTTPublishAsync.mock.calls[1]).toEqual([
            "zigbee2mqtt/wall_switch_double",
            stringify({state_left: "OFF"}),
            {qos: 0, retain: false},
        ]);
    });

    it("Should not use state converter on non-json message when value is not on/off/toggle", async () => {
        const device = devices.QBKG03LM;
        const endpoint = device.getEndpoint(2)!;
        await mockMQTTEvents.message("zigbee2mqtt/wall_switch_double/left/set", "ON_RANDOM");
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(0);
    });

    it("Should parse set with postfix topic and attribute", async () => {
        const device = devices.QBKG03LM;
        const endpoint = device.getEndpoint(2)!;
        await mockMQTTEvents.message("zigbee2mqtt/wall_switch_double/left/set", "ON");
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
    });

    it("Should parse set with and slashes in base and deviceID postfix topic", async () => {
        settings.set(["mqtt", "base_topic"], "zigbee2mqtt/at/my/home");
        loadTopicGetSetRegex();
        const device = devices.QBKG03LM;
        settings.set(["devices", device.ieeeAddr, "friendly_name"], "in/basement/wall_switch_double");
        const endpoint = device.getEndpoint(2)!;
        await mockMQTTEvents.message("zigbee2mqtt/at/my/home/in/basement/wall_switch_double/left/set", stringify({state: "ON"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
    });

    it("Should parse set with number at the end of friendly_name and postfix", async () => {
        const device = devices.QBKG03LM;
        settings.set(["devices", device.ieeeAddr, "friendly_name"], "ground_floor/kitchen/wall_switch/2");
        const endpoint = device.getEndpoint(2)!;
        await mockMQTTEvents.message("zigbee2mqtt/ground_floor/kitchen/wall_switch/2/left/set", stringify({state: "ON"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
    });

    it("Should not publish messages to zigbee devices when payload is invalid", async () => {
        await mockMQTTEvents.message("zigbee2mqtt/wall_switch_double/left/set", stringify({state: true}));
        await mockMQTTEvents.message("zigbee2mqtt/wall_switch_double/left/set", stringify({state: 1}));
        await flushPromises();
        expectNothingPublished();
    });

    it("Should set state before color", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const payload = {state: "ON", color: {x: 0.701, y: 0.299}};
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[0]).toEqual(["genOnOff", "on", {}, {}]);
        expect(endpoint.command.mock.calls[1]).toEqual(["lightingColorCtrl", "moveToColor", {colorx: 45940, colory: 19595, transtime: 0}, {}]);
    });

    it("Should also use on/off cluster when controlling group with switch", async () => {
        const group = groups.group_with_switch;

        mockMQTTPublishAsync.mockClear();
        group.command.mockClear();
        await mockMQTTEvents.message("zigbee2mqtt/switch_group/set", stringify({state: "ON", brightness: 100}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(2);
        expect(group.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 100, transtime: 0}, {});
        expect(group.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/switch_group", stringify({state: "ON", brightness: 100}), {
            retain: false,
            qos: 0,
        });

        mockMQTTPublishAsync.mockClear();
        group.command.mockClear();
        await mockMQTTEvents.message("zigbee2mqtt/switch_group/set", stringify({state: "OFF"}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genOnOff", "off", {}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/switch_group", stringify({state: "OFF", brightness: 100}), {
            retain: false,
            qos: 0,
        });
    });

    it("Should use transition when brightness with group", async () => {
        const group = groups.group_1;
        group.members.push(devices.bulb_color.getEndpoint(1)!);
        settings.set(["groups", "1", "transition"], 20);
        await mockMQTTEvents.message("zigbee2mqtt/group_1/set", stringify({brightness: 100}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 100, transtime: 200}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(2); // zigbee2mqtt/bulb_color + below
        expect(mockMQTTPublishAsync.mock.calls[1][0]).toStrictEqual("zigbee2mqtt/group_1");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[1][1])).toStrictEqual({state: "ON", brightness: 100});
        group.members.pop();
    });

    it("Should use transition on brightness command", async () => {
        const device = devices.bulb_color;
        settings.set(["devices", device.ieeeAddr, "transition"], 20);
        const endpoint = device.getEndpoint(1)!;
        const payload = {brightness: 20};
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 200}, {}]);
    });

    it("Should use transition from device_options on brightness command", async () => {
        const device = devices.bulb_color;
        settings.set(["device_options"], {transition: 20});
        const endpoint = device.getEndpoint(1)!;
        const payload = {brightness: 20};
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 200}, {}]);
    });

    it("Should turn bulb on with correct brightness when device is turned off twice and brightness is reported", async () => {
        // Test case for: https://github.com/Koenkk/zigbee2mqtt/issues/5413
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON", brightness: 200}));
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "OFF", transition: 0}));
        await flushPromises();
        await mockZHEvents.message({
            data: {currentLevel: 1},
            cluster: "genLevelCtrl",
            device,
            endpoint,
            type: "attributeReport",
            linkquality: 10,
        });
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "OFF", transition: 0}));
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON", transition: 0}));
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(5);
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(1, "zigbee2mqtt/bulb_color", stringify({state: "ON", brightness: 200}), {
            retain: false,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(2, "zigbee2mqtt/bulb_color", stringify({state: "OFF", brightness: 200}), {
            retain: false,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(3, "zigbee2mqtt/bulb_color", stringify({state: "OFF", brightness: 1}), {
            retain: false,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(4, "zigbee2mqtt/bulb_color", stringify({state: "OFF", brightness: 1}), {
            retain: false,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(5, "zigbee2mqtt/bulb_color", stringify({state: "ON", brightness: 200}), {
            retain: false,
            qos: 0,
        });

        expect(endpoint.command).toHaveBeenCalledTimes(4);
        expect(endpoint.command).toHaveBeenNthCalledWith(1, "genLevelCtrl", "moveToLevelWithOnOff", {level: 200, transtime: 0}, {});
        expect(endpoint.command).toHaveBeenNthCalledWith(2, "genLevelCtrl", "moveToLevelWithOnOff", {level: 0, transtime: 0}, {});
        expect(endpoint.command).toHaveBeenNthCalledWith(3, "genLevelCtrl", "moveToLevelWithOnOff", {level: 0, transtime: 0}, {});
        expect(endpoint.command).toHaveBeenNthCalledWith(4, "genLevelCtrl", "moveToLevelWithOnOff", {level: 200, transtime: 0}, {});
    });

    it("Should turn bulb on with full brightness when transition is used and no brightness is known", async () => {
        // https://github.com/Koenkk/zigbee2mqtt/issues/3799
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "OFF", transition: 0.5}));
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON", transition: 0.5}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(1, "zigbee2mqtt/bulb_color", stringify({state: "OFF"}), {retain: false, qos: 0});
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(2, "zigbee2mqtt/bulb_color", stringify({state: "ON", brightness: 254}), {
            retain: false,
            qos: 0,
        });
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 0, transtime: 5}, {}]);
        expect(endpoint.command.mock.calls[1]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 254, transtime: 5}, {}]);
    });

    it("Transition parameter should not influence brightness on state ON", async () => {
        // https://github.com/Koenkk/zigbee2mqtt/issues/3563
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON", brightness: 50}));
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON"}));
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON", transition: 1}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(3);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 50, transtime: 0}, {}]);
        expect(endpoint.command.mock.calls[1]).toEqual(["genOnOff", "on", {}, {}]);
        expect(endpoint.command.mock.calls[2]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 50, transtime: 10}, {}]);
    });

    it("Should use transition when color temp", async () => {
        const device = devices.bulb_color;
        settings.set(["devices", device.ieeeAddr, "transition"], 20);
        const endpoint = device.getEndpoint(1)!;
        const payload = {color_temp: 200};
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["lightingColorCtrl", "moveToColorTemp", {colortemp: 200, transtime: 200}, {}]);
    });

    it("Should use transition only once when setting brightness and color temperature for TRADFRI", async () => {
        const device = devices.bulb;
        const endpoint = device.getEndpoint(1)!;
        const payload = {state: "ON", brightness: 20, color_temp: 200, transition: 20};
        await mockMQTTEvents.message("zigbee2mqtt/bulb/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 0}, {}]);
        expect(endpoint.command.mock.calls[1]).toEqual(["lightingColorCtrl", "moveToColorTemp", {colortemp: 200, transtime: 200}, {}]);
    });

    it("Should use transition only once when setting brightness and color temperature for group which contains TRADFRI", async () => {
        const group = groups.group_with_tradfri;
        await mockMQTTEvents.message("zigbee2mqtt/group_with_tradfri/set", stringify({state: "ON", transition: 60, brightness: 20, color_temp: 400}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(2);
        expect(group.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 0}, {}]);
        expect(group.command.mock.calls[1]).toEqual(["lightingColorCtrl", "moveToColorTemp", {colortemp: 400, transtime: 600}, {}]);
    });

    it("Message transition should overrule options transition", async () => {
        const device = devices.bulb_color;
        settings.set(["devices", device.ieeeAddr, "transition"], 20);
        const endpoint = device.getEndpoint(1)!;
        const payload = {brightness: 200, transition: 10};
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 200, transtime: 100}, {}]);
    });

    it("Should set state with brightness before color", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const payload = {state: "ON", color: {x: 0.701, y: 0.299}, transition: 3, brightness: 100};
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 100, transtime: 30}, {}]);
        expect(endpoint.command.mock.calls[1]).toEqual(["lightingColorCtrl", "moveToColor", {colorx: 45940, colory: 19595, transtime: 30}, {}]);
    });

    it("Should turn device off when brightness 0 is send", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness: 50, state: "ON"}));
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness: 0}));
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(3);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 50, transtime: 0}, {}]);
        expect(endpoint.command.mock.calls[1]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 0, transtime: 0}, {}]);
        expect(endpoint.command.mock.calls[2]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 50, transtime: 0}, {}]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(3);
        expect(mockMQTTPublishAsync.mock.calls[0]).toEqual([
            "zigbee2mqtt/bulb_color",
            stringify({state: "ON", brightness: 50}),
            {qos: 0, retain: false},
        ]);
        expect(mockMQTTPublishAsync.mock.calls[1]).toEqual([
            "zigbee2mqtt/bulb_color",
            stringify({state: "OFF", brightness: 0}),
            {qos: 0, retain: false},
        ]);
        expect(mockMQTTPublishAsync.mock.calls[2]).toEqual([
            "zigbee2mqtt/bulb_color",
            stringify({state: "ON", brightness: 50}),
            {qos: 0, retain: false},
        ]);
    });

    it("Should turn device off when brightness 0 is send with transition", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness: 50, state: "ON"}));
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness: 0, transition: 3}));
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(3);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 50, transtime: 0}, {}]);
        expect(endpoint.command.mock.calls[1]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 0, transtime: 30}, {}]);
        expect(endpoint.command.mock.calls[2]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 50, transtime: 0}, {}]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(3);
        expect(mockMQTTPublishAsync.mock.calls[0]).toEqual([
            "zigbee2mqtt/bulb_color",
            stringify({state: "ON", brightness: 50}),
            {qos: 0, retain: false},
        ]);
        expect(mockMQTTPublishAsync.mock.calls[1]).toEqual([
            "zigbee2mqtt/bulb_color",
            stringify({state: "OFF", brightness: 0}),
            {qos: 0, retain: false},
        ]);
        expect(mockMQTTPublishAsync.mock.calls[2]).toEqual([
            "zigbee2mqtt/bulb_color",
            stringify({state: "ON", brightness: 50}),
            {qos: 0, retain: false},
        ]);
    });

    it("Should allow to set color via hue and saturation", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const payload = {color: {hue: 250, saturation: 50}};
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual([
            "lightingColorCtrl",
            "enhancedMoveToHueAndSaturation",
            {direction: 0, enhancehue: 45510, saturation: 127, transtime: 0},
            {},
        ]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({color: {hue: 250, saturation: 50}, color_mode: "hs"});
    });

    it("ZNCLDJ11LM open", async () => {
        const device = devices.ZNCLDJ11LM;
        const endpoint = device.getEndpoint(1)!;
        const payload = {state: "OPEN"};
        await mockMQTTEvents.message("zigbee2mqtt/curtain/set", stringify(payload));
        await flushPromises();
        expect(endpoint.write).toHaveBeenCalledTimes(1);
        expect(endpoint.write).toHaveBeenCalledWith("genAnalogOutput", {presentValue: 100});
    });

    it("ZNCLDJ11LM position", async () => {
        const device = devices.ZNCLDJ11LM;
        const endpoint = device.getEndpoint(1)!;
        const payload = {position: 10};
        await mockMQTTEvents.message("zigbee2mqtt/curtain/set", stringify(payload));
        await flushPromises();
        expect(endpoint.write).toHaveBeenCalledTimes(1);
        expect(endpoint.write).toHaveBeenCalledWith("genAnalogOutput", {presentValue: 10});
    });

    it("ZNCLDJ11LM position", async () => {
        const device = devices.ZNCLDJ11LM;
        const endpoint = device.getEndpoint(1)!;
        const payload = {state: "CLOSE"};
        await mockMQTTEvents.message("zigbee2mqtt/curtain/set", stringify(payload));
        await flushPromises();
        expect(endpoint.write).toHaveBeenCalledTimes(1);
        expect(endpoint.write).toHaveBeenCalledWith("genAnalogOutput", {presentValue: 0});
    });

    it("ZNCLDJ11LM position", async () => {
        const device = devices.ZNCLDJ11LM;
        const endpoint = device.getEndpoint(1)!;
        const payload = {state: "STOP"};
        await mockMQTTEvents.message("zigbee2mqtt/curtain/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("closuresWindowCovering", "stop", {}, {});
    });

    it("Should turn device on with on/off when transition is provided", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const payload = {state: "ON", transition: 3};
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 254, transtime: 30}, {}]);
    });

    it("Should turn device on with on/off with transition when transition 0 is provided", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const payload = {state: "ON", transition: 0};
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 254, transtime: 0}, {}]);
    });

    it("Should turn device off with onOff on off with transition", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const payload = {state: "OFF", transition: 1};
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 0, transtime: 10}, {}]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({state: "OFF"});
    });

    it("When device is turned off and on with transition with report enabled it should restore correct brightness", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        // Set initial brightness in state
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness: 200}));
        await flushPromises();
        endpoint.command.mockClear();
        mockMQTTPublishAsync.mockClear();

        // Turn off
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "OFF", transition: 3}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 0, transtime: 30}, {}]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0]).toEqual([
            "zigbee2mqtt/bulb_color",
            stringify({state: "OFF", brightness: 200}),
            {qos: 0, retain: false},
        ]);

        // Bulb reports brightness while decreasing brightness
        await mockZHEvents.message({
            data: {currentLevel: 1},
            cluster: "genLevelCtrl",
            device,
            endpoint,
            type: "attributeReport",
            linkquality: 10,
        });
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(2);
        expect(mockMQTTPublishAsync.mock.calls[1]).toEqual([
            "zigbee2mqtt/bulb_color",
            stringify({state: "OFF", brightness: 1}),
            {qos: 0, retain: false},
        ]);

        // Turn on again
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON", transition: 3}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[1]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 200, transtime: 30}, {}]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(3);
        expect(mockMQTTPublishAsync.mock.calls[2]).toEqual([
            "zigbee2mqtt/bulb_color",
            stringify({state: "ON", brightness: 200}),
            {qos: 0, retain: false},
        ]);
    });

    it("When device is turned off with transition and turned on WITHOUT transition it should restore the brightness", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        // Set initial brightness in state
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness: 200}));
        await flushPromises();
        endpoint.command.mockClear();
        mockMQTTPublishAsync.mockClear();

        // Turn off
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "OFF", transition: 3}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 0, transtime: 30}, {}]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0]).toEqual([
            "zigbee2mqtt/bulb_color",
            stringify({state: "OFF", brightness: 200}),
            {qos: 0, retain: false},
        ]);

        // Turn on again
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[1]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 200, transtime: 0}, {}]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(2);
        expect(mockMQTTPublishAsync.mock.calls[1]).toEqual([
            "zigbee2mqtt/bulb_color",
            stringify({state: "ON", brightness: 200}),
            {qos: 0, retain: false},
        ]);
    });

    it("Home Assistant: should set state", async () => {
        settings.set(["homeassistant"], {enabled: true});
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const payload = {state: "ON"};
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genOnOff", "on", {}, {}]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({state: "ON"});
    });

    it("Home Assistant: should not set state when color temperature is also set and device is already on", async () => {
        settings.set(["homeassistant"], {enabled: true});
        const device = controller.zigbee.resolveEntity(devices.bulb_color.ieeeAddr)!;
        controller.state.remove(devices.bulb_color.ieeeAddr);
        controller.state.set(device, {state: "ON"});
        const endpoint = device.zh.getEndpoint(1)!;
        const payload = {state: "ON", color_temp: 100};
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["lightingColorCtrl", "moveToColorTemp", {colortemp: 100, transtime: 0}, {}]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({state: "ON", color_temp: 100, color_mode: "color_temp"});
    });

    it("Home Assistant: should set state when color temperature is also set and device is off", async () => {
        settings.set(["homeassistant"], {enabled: true});
        const device = controller.zigbee.resolveEntity(devices.bulb_color.ieeeAddr)!;
        controller.state.remove(devices.bulb_color.ieeeAddr);
        controller.state.set(device, {state: "OFF"});
        const endpoint = device.zh.getEndpoint(1)!;
        const payload = {state: "ON", color_temp: 100};
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[0]).toEqual(["genOnOff", "on", {}, {}]);
        expect(endpoint.command.mock.calls[1]).toEqual(["lightingColorCtrl", "moveToColorTemp", {colortemp: 100, transtime: 0}, {}]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb_color",
            stringify({state: "ON", color_temp: 100, color_mode: "color_temp"}),
            {retain: false, qos: 0},
        );
    });

    it("Home Assistant: should not set state when color is also set", async () => {
        settings.set(["homeassistant"], {enabled: true});
        const device = controller.zigbee.resolveEntity(devices.bulb_color.ieeeAddr)!;
        controller.state.remove(devices.bulb_color.ieeeAddr);
        controller.state.set(device, {state: "ON"});
        const endpoint = device.zh.getEndpoint(1)!;
        const payload = {state: "ON", color: {x: 0.41, y: 0.25}};
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["lightingColorCtrl", "moveToColor", {colorx: 26869, colory: 16384, transtime: 0}, {}]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({color: {x: 0.41, y: 0.25}, state: "ON", color_mode: "xy"});
    });

    it("Should publish correct state on toggle command to zigbee bulb", async () => {
        const endpoint = devices.bulb_color.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "TOGGLE"}));
        await flushPromises();

        // At this point the bulb has no state yet, so we cannot determine the next state and therefore shouldn't publish it to mockMQTT.
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "toggle", {}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(0);

        // Turn bulb off so that the bulb gets a state.
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "OFF"}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(1, "zigbee2mqtt/bulb_color", stringify({state: "OFF"}), {retain: false, qos: 0});

        // Toggle again, now that we have state it should publish state ON
        endpoint.read.mockImplementationOnce((cluster, attrs) => {
            if (cluster === "genLevelCtrl" && attrs.includes("currentLevel")) {
                return {currentLevel: 100};
            }
        });
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "TOGGLE"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(3);
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(2);
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(2, "zigbee2mqtt/bulb_color", stringify({state: "ON"}), {retain: false, qos: 0});
    });

    it("Should publish messages with options disableDefaultResponse", async () => {
        const device = devices.GLEDOPTO1112;
        const endpoint = device.getEndpoint(11)!;
        await mockMQTTEvents.message("zigbee2mqtt/led_controller_1/set", stringify({state: "OFF"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "off", {}, {disableDefaultResponse: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/led_controller_1");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({state: "OFF"});
        expect(mockMQTTPublishAsync.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it("Should publish messages to zigbee devices", async () => {
        settings.set(["advanced", "last_seen"], "ISO_8601");
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness: "200"}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/bulb_color");
        expect(typeof JSON.parse(mockMQTTPublishAsync.mock.calls[0][1]).last_seen).toStrictEqual("string");
        expect(mockMQTTPublishAsync.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it("Should publish brightness_move up to zigbee devices", async () => {
        const endpoint = devices.bulb_color.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness_move: -40}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "move", {movemode: 1, rate: 40}, {});
    });

    it("Should publish brightness_move down to zigbee devices", async () => {
        const endpoint = devices.bulb_color.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness_move: 30}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "move", {movemode: 0, rate: 30}, {});
    });

    it("HS2WD-E burglar warning", async () => {
        const endpoint = devices.HS2WD.getEndpoint(1)!;
        const payload = {warning: {duration: 100, mode: "burglar", strobe: true, level: "high"}};
        await mockMQTTEvents.message("zigbee2mqtt/siren/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith(
            "ssIasWd",
            "startWarning",
            {startwarninginfo: 22, warningduration: 100, strobedutycycle: 0, strobelevel: 1},
            {disableDefaultResponse: true},
        );
    });

    it("HS2WD-E emergency warning", async () => {
        const endpoint = devices.HS2WD.getEndpoint(1)!;
        const payload = {warning: {duration: 10, mode: "emergency", strobe: false, level: "very_high"}};
        await mockMQTTEvents.message("zigbee2mqtt/siren/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith(
            "ssIasWd",
            "startWarning",
            {startwarninginfo: 51, warningduration: 10, strobedutycycle: 0, strobelevel: 1},
            {disableDefaultResponse: true},
        );
    });

    it("HS2WD-E emergency without level", async () => {
        const endpoint = devices.HS2WD.getEndpoint(1)!;
        const payload = {warning: {duration: 10, mode: "emergency", strobe: false}};
        await mockMQTTEvents.message("zigbee2mqtt/siren/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith(
            "ssIasWd",
            "startWarning",
            {startwarninginfo: 49, warningduration: 10, strobedutycycle: 0, strobelevel: 1},
            {disableDefaultResponse: true},
        );
    });

    it("HS2WD-E wrong payload (should use defaults)", async () => {
        const endpoint = devices.HS2WD.getEndpoint(1)!;
        const payload = {warning: "wrong"};
        await mockMQTTEvents.message("zigbee2mqtt/siren/set", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith(
            "ssIasWd",
            "startWarning",
            {startwarninginfo: 53, warningduration: 10, strobedutycycle: 0, strobelevel: 1},
            {disableDefaultResponse: true},
        );
    });

    it("Shouldnt do anything when device is not supported", async () => {
        const payload = {state: "ON"};
        await mockMQTTEvents.message("zigbee2mqtt/unsupported2/set", stringify(payload));
        await flushPromises();
        expectNothingPublished();
    });

    it("Should publish state to roller shutter", async () => {
        const endpoint = devices.roller_shutter.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/roller_shutter/set", stringify({state: "OPEN"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: "255", transtime: 0}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/roller_shutter");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({position: 100});
        expect(mockMQTTPublishAsync.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it("Should publish to MKS-CM-W5", async () => {
        const device = devices["MKS-CM-W5"];
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/MKS-CM-W5/l3/set", stringify({state: "ON"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith(
            "manuSpecificTuya",
            "dataRequest",
            {dpValues: [{data: [1], datatype: 1, dp: 3}], seq: expect.any(Number)},
            {disableDefaultResponse: true},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual("zigbee2mqtt/MKS-CM-W5");
        expect(JSON.parse(mockMQTTPublishAsync.mock.calls[0][1])).toStrictEqual({state_l3: "ON"});
        expect(mockMQTTPublishAsync.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it("Should publish separate genOnOff to GL-S-007ZS when setting state and brightness as bulb doesnt turn on with moveToLevelWithOnOff", async () => {
        // https://github.com/Koenkk/zigbee2mqtt/issues/2757
        const device = devices["GL-S-007ZS"];
        const endpoint = device.getEndpoint(1)!;
        await mockMQTTEvents.message("zigbee2mqtt/GL-S-007ZS/set", stringify({state: "ON", brightness: 20}));
        await flushPromises();
        await vi.runOnlyPendingTimersAsync();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[0]).toEqual(["genOnOff", "on", {}, {}]);
        expect(endpoint.command.mock.calls[1]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 0}, {}]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/GL-S-007ZS", stringify({state: "ON", brightness: 20}), {
            qos: 0,
            retain: false,
        });
    });

    it("Should log as error when setting property with no defined converter", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const payload = {brightness_move: 20};
        mockLogger.error.mockClear();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/get", stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(0);
        expect(mockLogger.error).toHaveBeenCalledWith("No converter available for 'get' 'brightness_move' (20)");
    });

    it("Should restore brightness when its turned on with transition, Z2M is restarted and turned on again", async () => {
        // https://github.com/Koenkk/zigbee2mqtt/issues/7106
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        endpoint.command.mockClear();

        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON", brightness: 20, transition: 0.0}));
        await flushPromises();

        clearGlobalStore();

        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON", transition: 1.0}));
        await flushPromises();

        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 0}, {});
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 10}, {});
    });

    it("Should restore brightness when its turned off without transition and is turned on with", async () => {
        // https://github.com/Koenkk/zigbee-herdsman-converters/issues/1097
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        endpoint.command.mockClear();

        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genOnOff", "on", {}, {}]);

        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON", brightness: 123}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[1]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 123, transtime: 0}, {}]);

        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "OFF"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(3);
        expect(endpoint.command.mock.calls[2]).toEqual(["genOnOff", "off", {}, {}]);

        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON", transition: 1.0}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(4);
        expect(endpoint.command.mock.calls[3]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 123, transtime: 10}, {}]);
    });

    it("Shouldnt use moveToLevelWithOnOff on turn on when no transition has been used as some devices do not turn on in that case", async () => {
        // https://github.com/Koenkk/zigbee2mqtt/issues/3332
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;

        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON"}));
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness: 150}));
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "OFF"}));
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({state: "ON"}));
        await flushPromises();

        expect(endpoint.command).toHaveBeenCalledTimes(4);
        expect(endpoint.command.mock.calls[0]).toEqual(["genOnOff", "on", {}, {}]);
        expect(endpoint.command.mock.calls[1]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 150, transtime: 0}, {}]);
        expect(endpoint.command.mock.calls[2]).toEqual(["genOnOff", "off", {}, {}]);
        expect(endpoint.command.mock.calls[3]).toEqual(["genOnOff", "on", {}, {}]);

        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(4);
        expect(mockMQTTPublishAsync.mock.calls[0]).toEqual(["zigbee2mqtt/bulb_color", stringify({state: "ON"}), {qos: 0, retain: false}]);
        expect(mockMQTTPublishAsync.mock.calls[1]).toEqual([
            "zigbee2mqtt/bulb_color",
            stringify({state: "ON", brightness: 150}),
            {qos: 0, retain: false},
        ]);
        expect(mockMQTTPublishAsync.mock.calls[2]).toEqual([
            "zigbee2mqtt/bulb_color",
            stringify({state: "OFF", brightness: 150}),
            {qos: 0, retain: false},
        ]);
        expect(mockMQTTPublishAsync.mock.calls[3]).toEqual([
            "zigbee2mqtt/bulb_color",
            stringify({state: "ON", brightness: 150}),
            {qos: 0, retain: false},
        ]);
    });

    it("Scenes", async () => {
        const group = groups.group_tradfri_remote;
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color_2/set", stringify({state: "ON", brightness: 50, color_temp: 290}));
        await mockMQTTEvents.message("zigbee2mqtt/bulb_2/set", stringify({state: "ON", brightness: 100}));
        await flushPromises();

        await mockMQTTEvents.message("zigbee2mqtt/group_tradfri_remote/set", stringify({scene_store: 1}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genScenes", "store", {groupid: 15071, sceneid: 1}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/devices", expect.any(String), {retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/groups", expect.any(String), {retain: true});

        await mockMQTTEvents.message("zigbee2mqtt/bulb_color_2/set", stringify({state: "ON", brightness: 250, color_temp: 20}));
        await mockMQTTEvents.message("zigbee2mqtt/bulb_2/set", stringify({state: "ON", brightness: 110}));
        await flushPromises();

        mockMQTTPublishAsync.mockClear();
        group.command.mockClear();
        await mockMQTTEvents.message("zigbee2mqtt/group_tradfri_remote/set", stringify({scene_recall: 1}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genScenes", "recall", {groupid: 15071, sceneid: 1}, {});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(8);
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            1,
            "zigbee2mqtt/group_tradfri_remote",
            stringify({brightness: 50, color_temp: 290, state: "ON", color_mode: "color_temp"}),
            {retain: false, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            2,
            "zigbee2mqtt/bulb_color_2",
            stringify({color_mode: "color_temp", brightness: 50, color_temp: 290, state: "ON"}),
            {retain: false, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            3,
            "zigbee2mqtt/ha_discovery_group",
            stringify({brightness: 50, color_mode: "color_temp", color_temp: 290, state: "ON"}),
            {retain: false, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            4,
            "zigbee2mqtt/group_tradfri_remote",
            stringify({brightness: 100, color_temp: 290, state: "ON", color_mode: "color_temp"}),
            {retain: false, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            5,
            "zigbee2mqtt/bulb_2",
            stringify({brightness: 100, color_mode: "color_temp", color_temp: 290, state: "ON"}),
            {retain: false, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            6,
            "zigbee2mqtt/group_with_tradfri",
            stringify({brightness: 100, color_mode: "color_temp", color_temp: 290, state: "ON"}),
            {retain: false, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            7,
            "zigbee2mqtt/switch_group",
            stringify({brightness: 100, color_mode: "color_temp", color_temp: 290, state: "ON"}),
            {retain: false, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            8,
            "zigbee2mqtt/ha_discovery_group",
            stringify({brightness: 100, color_mode: "color_temp", color_temp: 290, state: "ON"}),
            {retain: false, qos: 0},
        );
    });

    it("Should sync colors", async () => {
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({color_temp: 100}));
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({color: {x: 0.1, y: 0.5}}));
        await flushPromises();
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({color_temp: 300}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(3);
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(1, "zigbee2mqtt/bulb_color", stringify({color_mode: "color_temp", color_temp: 100}), {
            retain: false,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            2,
            "zigbee2mqtt/bulb_color",
            stringify({color: {x: 0.1, y: 0.5}, color_mode: "xy", color_temp: 79}),
            {retain: false, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            3,
            "zigbee2mqtt/bulb_color",
            stringify({color: {x: 0.4152, y: 0.3954}, color_mode: "color_temp", color_temp: 300}),
            {retain: false, qos: 0},
        );
    });

    it("Log an error when entity is not found", async () => {
        await mockMQTTEvents.message("zigbee2mqtt/an_unknown_entity/set", stringify({}));
        await flushPromises();
        expect(mockLogger.error).toHaveBeenCalledWith("Entity 'an_unknown_entity' is unknown");
    });
});
