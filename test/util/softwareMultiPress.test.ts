import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {presets} from "zigbee-herdsman-converters/lib/exposes";
import type {SoftwareMultiPressOptions} from "../../lib/types/api";
import logger from "../../lib/util/logger";
import SoftwareMultiPress, {softwareMultiPressActions, softwareMultiPressButtons} from "../../lib/util/softwareMultiPress";

vi.mock("../../lib/util/logger", () => ({default: {error: vi.fn()}}));

describe("software multi-press", () => {
    const exposes = [presets.battery(), presets.action(["click", "press", "hold", "release", "other"])];
    let config: SoftwareMultiPressOptions;
    let counter: SoftwareMultiPress;
    const publish = vi.fn();
    const device = {
        ieeeAddr: "one",
        nativeExposes: () => exposes,
        options: {friendly_name: "test", software_multi_press: undefined as SoftwareMultiPressOptions | undefined},
        get softwareMultiPressOptions() {
            return this.options.software_multi_press;
        },
    };
    const send = (action = "click", endpoint = 1, target = device) => counter.process(target, endpoint, action, publish);
    beforeEach(() => {
        vi.useFakeTimers();
        config = {enabled: true, buttons: [{name: "tap", click: "click"}]};
        device.options.software_multi_press = config;
        counter = new SoftwareMultiPress();
        publish.mockReset();
        vi.mocked(logger.error).mockClear();
    });
    afterEach(() => {
        counter.clear();
        vi.useRealTimers();
    });

    it.each([undefined, {enabled: false, buttons: []}])("requires opt-in: %s", (options) => {
        expect(softwareMultiPressButtons(exposes, options)).toEqual([]);
    });
    it("exposes generated actions only for valid mappings", () => {
        expect(softwareMultiPressActions(exposes, config)).toEqual([
            "software_tap_single_press",
            "software_tap_double_press",
            "software_tap_triple_press",
        ]);
        config.buttons.push({name: "bad", click: "missing"});
        expect(softwareMultiPressButtons(exposes, config)).toHaveLength(1);
        config.buttons = [
            {name: "bad", click: "press", press: "press"},
            {name: "bad2", click: "click", cancel: ["click"]},
        ];
        expect(softwareMultiPressButtons(exposes, config)).toEqual([]);
        config.buttons = [
            {name: "tap", click: "click"},
            {name: "tap", click: "other"},
        ];
        expect(softwareMultiPressButtons(exposes, config)).toEqual([]);
    });
    it.each(["double", "triple_press", "button_quadruple", "quintuple_right"])("prefers native action %s", (action) => {
        expect(softwareMultiPressButtons([presets.action(["click", action])], config)).toEqual([]);
    });
    it.each([1, 2, 3, 4])("classifies %s clicks once", async (count) => {
        for (let i = 0; i < count; i++) {
            send();
            await vi.advanceTimersByTimeAsync(50);
        }
        expect(publish).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(300);
        expect(publish.mock.calls).toEqual([[device, {action: `software_tap_${["single", "double", "triple"][Math.min(count, 3) - 1]}_press`}]]);
    });
    it("uses a configured timeout", async () => {
        config.timeout = 100;
        send();
        await vi.advanceTimersByTimeAsync(99);
        expect(publish).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(publish).toHaveBeenCalledOnce();
    });
    it("ignores unmatched actions and endpoint mappings", async () => {
        config.buttons[0].endpoint = 2;
        send();
        send("other", 2);
        send("click", 2);
        await vi.advanceTimersByTimeAsync(300);
        expect(publish).toHaveBeenCalledOnce();
    });
    it("separates devices, endpoints and buttons", async () => {
        config.buttons.push({name: "other", click: "other"});
        send();
        send("other");
        send("click", 2);
        send("click", 1, {...device, ieeeAddr: "two"});
        await vi.advanceTimersByTimeAsync(300);
        expect(publish).toHaveBeenCalledTimes(4);
        expect(publish.mock.calls.map((call) => call[1].action)).toEqual([
            "software_tap_single_press",
            "software_other_single_press",
            "software_tap_single_press",
            "software_tap_single_press",
        ]);
    });
    it("matches short press/release pairs and pauses the window while pressed", async () => {
        config.buttons = [{name: "tap", click: "release", press: "press", cancel: ["hold"]}];
        send("release");
        send("press");
        send("release");
        await vi.advanceTimersByTimeAsync(299);
        send("press");
        await vi.advanceTimersByTimeAsync(500);
        expect(publish).not.toHaveBeenCalled();
        send("release");
        send("release");
        await vi.advanceTimersByTimeAsync(300);
        expect(publish).toHaveBeenCalledWith(device, {action: "software_tap_double_press"});
    });
    it("keeps earlier clicks separate from a hold", async () => {
        config.buttons = [{name: "tap", click: "release", press: "press", cancel: ["hold"]}];
        send("hold");
        send("press");
        send("release");
        send("press");
        send("hold");
        send("release");
        await vi.advanceTimersByTimeAsync(300);
        expect(publish.mock.calls).toEqual([[device, {action: "software_tap_single_press"}]]);
    });
    it("checks the deadline if a timer was delayed", async () => {
        send();
        vi.setSystemTime(Date.now() + 300);
        send();
        await vi.advanceTimersByTimeAsync(300);
        expect(publish).toHaveBeenCalledTimes(2);
    });
    it("separates press/release sequences at a delayed deadline", async () => {
        config.buttons = [{name: "tap", click: "release", press: "press"}];
        send("press");
        send("release");
        vi.setSystemTime(Date.now() + 300);
        send("press");
        send("release");
        await vi.advanceTimersByTimeAsync(300);
        expect(publish.mock.calls).toEqual([
            [device, {action: "software_tap_single_press"}],
            [device, {action: "software_tap_single_press"}],
        ]);
    });
    it("clears one device or all devices", async () => {
        send();
        send("click", 1, {...device, ieeeAddr: "two"});
        counter.clear("one");
        await vi.advanceTimersByTimeAsync(300);
        expect(publish).toHaveBeenCalledOnce();
        send();
        counter.clear();
        await vi.advanceTimersByTimeAsync(300);
        expect(publish).toHaveBeenCalledOnce();
    });
    it("cancels pending clicks when disabled", async () => {
        send();
        config.enabled = false;
        send();
        await vi.advanceTimersByTimeAsync(300);
        expect(publish).not.toHaveBeenCalled();
    });
    it.each([false, true])("catches publishing errors (async: %s)", async (asyncError) => {
        publish.mockImplementationOnce(() => {
            if (asyncError) return Promise.reject(new Error("offline"));
            throw new Error("offline");
        });
        send();
        await vi.advanceTimersByTimeAsync(300);
        expect(logger.error).toHaveBeenCalledOnce();
    });
});
