import {describe, expect, it} from "vitest";
import type * as zhc from "zigbee-herdsman-converters";
import {presets as e} from "zigbee-herdsman-converters/lib/exposes";
import type Device from "../lib/model/device";
import type Group from "../lib/model/group";
import {exposedColorModes, normalizeColorMode, toSupportedColorMode} from "../lib/util/colorMode";

// https://github.com/Koenkk/zigbee2mqtt/issues/28757
describe("Color mode", () => {
    const colorTempLight = e.light().withBrightness().withColorTemp([153, 500]);
    const xyLight = e.light().withBrightness().withColor(["xy"]).withColorTemp([153, 500]);
    const brightnessLight = e.light().withBrightness();

    const device = (exposes: zhc.Expose[] | undefined) =>
        ({
            isDevice: () => true,
            isGroup: () => false,
            definition: exposes ? {} : undefined,
            exposes: () => {
                if (!exposes) throw new Error("Cannot retreive exposes before definition is resolved");
                return exposes;
            },
        }) as unknown as Device;
    const group = (members: (zhc.Expose[] | undefined)[]) =>
        ({isDevice: () => false, isGroup: () => true, membersDevices: () => members.map(device)}) as unknown as Group;

    it("exposedColorModes collects the color modes of the light exposes", () => {
        expect(exposedColorModes([colorTempLight])).toStrictEqual(new Set(["color_temp"]));
        expect(exposedColorModes([xyLight, e.battery()])).toStrictEqual(new Set(["xy", "color_temp"]));
        expect(exposedColorModes([brightnessLight])).toStrictEqual(new Set());
        expect(exposedColorModes([e.battery()])).toBeUndefined();
    });

    it("exposedColorModes uses the light of the given endpoint", () => {
        const exposes = [colorTempLight.clone().withEndpoint("l1"), xyLight.clone().withEndpoint("l2")];
        expect(exposedColorModes(exposes, "l1")).toStrictEqual(new Set(["color_temp"]));
        expect(exposedColorModes(exposes, "l2")).toStrictEqual(new Set(["xy", "color_temp"]));
        expect(exposedColorModes(exposes, "l3")).toBeUndefined();
    });

    it.each([
        ["hs", ["hs", "color_temp"], "hs"],
        ["hs", ["xy", "color_temp"], "xy"],
        ["xy", ["hs", "color_temp"], "hs"],
        ["hs", ["color_temp"], "color_temp"],
        ["xy", ["color_temp"], "color_temp"],
        ["color_temp", ["xy"], "xy"],
        ["color_temp", ["hs"], "hs"],
        ["hs", [], undefined],
    ] as const)("toSupportedColorMode(%s, %j) = %s", (mode, supported, expected) => {
        expect(toSupportedColorMode(mode, new Set(supported))).toStrictEqual(expected);
    });

    it("normalizeColorMode maps an unsupported mode and keeps everything else", () => {
        const state = {state: "ON", color_mode: "hs", color_temp: 300};
        normalizeColorMode(device([colorTempLight]), state);
        expect(state).toStrictEqual({state: "ON", color_mode: "color_temp", color_temp: 300});

        const supported = {color_mode: "xy"};
        normalizeColorMode(device([xyLight]), supported);
        expect(supported).toStrictEqual({color_mode: "xy"});
    });

    it("normalizeColorMode removes the mode for a light without color modes", () => {
        const state = {state: "ON", color_mode: "color_temp"};
        normalizeColorMode(device([brightnessLight]), state);
        expect(state).toStrictEqual({state: "ON"});
    });

    it("normalizeColorMode leaves unknown values and entities without a light alone", () => {
        const unknown = {color_mode: 3};
        normalizeColorMode(device([colorTempLight]), unknown);
        expect(unknown).toStrictEqual({color_mode: 3});

        const noLight = {color_mode: "hs"};
        normalizeColorMode(device([e.battery()]), noLight);
        expect(noLight).toStrictEqual({color_mode: "hs"});
    });
    
    it("normalizeColorMode skips devices without a resolved definition", () => {
        const state = {color_mode: "hs"};
        normalizeColorMode(device(undefined), state);
        expect(state).toStrictEqual({color_mode: "hs"});

        const groupState = {color_mode: "hs"};
        normalizeColorMode(group([undefined, [colorTempLight]]), groupState);
        expect(groupState).toStrictEqual({color_mode: "color_temp"});
    });

    it("normalizeColorMode handles endpoints", () => {
        const state = {color_mode_l1: "hs", color_mode_l2: "hs"};
        normalizeColorMode(device([colorTempLight.clone().withEndpoint("l1"), xyLight.clone().withEndpoint("l2")]), state);
        expect(state).toStrictEqual({color_mode_l1: "color_temp", color_mode_l2: "xy"});
    });

    it("normalizeColorMode uses the combined exposes of group members", () => {
        const colorTempOnly = {color_mode: "hs"};
        normalizeColorMode(group([[colorTempLight], [colorTempLight.clone().withEndpoint("l1")]]), colorTempOnly);
        expect(colorTempOnly).toStrictEqual({color_mode: "color_temp"});

        const mixed = {color_mode: "hs"};
        normalizeColorMode(group([[colorTempLight], [xyLight]]), mixed);
        expect(mixed).toStrictEqual({color_mode: "xy"});
    });
});