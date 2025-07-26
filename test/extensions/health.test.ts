// biome-ignore assist/source/organizeImports: import mocks first
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import * as data from "../mocks/data";
import {mockLogger} from "../mocks/logger";
import {events as mockMQTTEvents, mockMQTTPublishAsync} from "../mocks/mqtt";
import {flushPromises} from "../mocks/utils";
import {devices, events as mockZHEvents, returnDevices} from "../mocks/zigbeeHerdsman";

import {Controller} from "../../lib/controller";
import Health from "../../lib/extension/health";
import * as settings from "../../lib/util/settings";
import {minutes, seconds} from "../../lib/util/utils";

const mocksClear = [mockMQTTPublishAsync, mockLogger.warning, mockLogger.info];

returnDevices.push(devices.bulb_color.ieeeAddr, devices.bulb_color_2.ieeeAddr, devices.coordinator.ieeeAddr);

describe("Extension: Health", () => {
    let controller: Controller;

    const getExtension = (): Health => controller.getExtension("Health") as Health;

    const resetExtension = async (): Promise<void> => {
        await controller.removeExtension(getExtension());
        await controller.addExtension(new Health(...controller.extensionArgs));
    };

    beforeAll(async () => {
        vi.useFakeTimers();
        settings.reRead();

        controller = new Controller(vi.fn(), vi.fn());

        await controller.start();
        await flushPromises();
    });

    beforeEach(() => {
        data.writeDefaultConfiguration();
        settings.reRead();
        settings.set(["devices", devices.bulb_color_2.ieeeAddr, "health"], false);

        for (const mock of mocksClear) {
            mock.mockClear();
        }

        getExtension().clearStats();
    });

    afterEach(async () => {});

    afterAll(async () => {
        await controller?.stop();
        await flushPromises();
        vi.useRealTimers();
    });

    it("checks health at default interval", async () => {
        await resetExtension();
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color});
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color_2});
        await mockZHEvents.deviceLeave({ieeeAddr: devices.bulb_color.ieeeAddr});
        await mockZHEvents.deviceJoined({device: devices.bulb_color});
        await mockZHEvents.deviceNetworkAddressChanged({device: devices.bulb_color});
        await vi.advanceTimersByTimeAsync(seconds(1));
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color});
        await vi.advanceTimersByTimeAsync(seconds(1));
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color});
        await vi.advanceTimersByTimeAsync(seconds(1));
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color});
        await mockMQTTEvents.message("zigbee2mqtt/mock", "mocked");
        await vi.advanceTimersByTimeAsync(minutes(11));

        let calls = mockMQTTPublishAsync.mock.calls.filter((call) => call[0] === "zigbee2mqtt/bridge/health");

        expect(calls.length).toStrictEqual(1);
        expect(JSON.parse(calls[0][1])).toStrictEqual({
            response_time: expect.any(Number),
            os: {
                load_average: [expect.any(Number), expect.any(Number), expect.any(Number)],
                memory_used_mb: expect.any(Number),
                memory_percent: expect.any(Number),
            },
            process: {uptime_sec: expect.any(Number), memory_used_mb: expect.any(Number), memory_percent: expect.any(Number)},
            mqtt: {
                connected: true,
                queued: 0,
                published: expect.any(Number),
                received: 1,
            },
            devices: {
                [devices.bulb_color.ieeeAddr]: {
                    leave_count: 1,
                    messages: 4,
                    messages_per_sec: 0.0067,
                    network_address_changes: 1,
                },
                [devices.bulb_color_2.ieeeAddr]: {
                    leave_count: 0,
                    messages: 1,
                    messages_per_sec: 0.0017,
                    network_address_changes: 0,
                },
            },
        });
        expect(calls[0][2]).toStrictEqual({retain: true, qos: 1});

        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message("zigbee2mqtt/mock2", "mocked2");
        await vi.advanceTimersByTimeAsync(minutes(11));

        calls = mockMQTTPublishAsync.mock.calls.filter((call) => call[0] === "zigbee2mqtt/bridge/health");

        expect(calls.length).toStrictEqual(1);
        expect(JSON.parse(calls[0][1])).toStrictEqual({
            response_time: expect.any(Number),
            os: {
                load_average: [expect.any(Number), expect.any(Number), expect.any(Number)],
                memory_used_mb: expect.any(Number),
                memory_percent: expect.any(Number),
            },
            process: {uptime_sec: expect.any(Number), memory_used_mb: expect.any(Number), memory_percent: expect.any(Number)},
            mqtt: {
                connected: true,
                queued: 0,
                published: expect.any(Number),
                received: 2,
            },
            devices: {
                [devices.bulb_color.ieeeAddr]: {
                    leave_count: 1,
                    messages: 4,
                    messages_per_sec: 0.0033,
                    network_address_changes: 1,
                },
                [devices.bulb_color_2.ieeeAddr]: {
                    leave_count: 0,
                    messages: 1,
                    messages_per_sec: 0.0008,
                    network_address_changes: 0,
                },
            },
        });
        expect(calls[0][2]).toStrictEqual({retain: true, qos: 1});
    });

    it("checks health at given interval", async () => {
        settings.set(["health", "interval"], 20);
        await resetExtension();
        await vi.advanceTimersByTimeAsync(minutes(11));

        let calls = mockMQTTPublishAsync.mock.calls.filter((call) => call[0] === "zigbee2mqtt/bridge/health");

        expect(calls.length).toStrictEqual(0);

        await vi.advanceTimersByTimeAsync(minutes(10));

        calls = mockMQTTPublishAsync.mock.calls.filter((call) => call[0] === "zigbee2mqtt/bridge/health");

        expect(calls.length).toStrictEqual(1);
        expect(JSON.parse(calls[0][1])).toStrictEqual({
            response_time: expect.any(Number),
            os: {
                load_average: [expect.any(Number), expect.any(Number), expect.any(Number)],
                memory_used_mb: expect.any(Number),
                memory_percent: expect.any(Number),
            },
            process: {uptime_sec: expect.any(Number), memory_used_mb: expect.any(Number), memory_percent: expect.any(Number)},
            mqtt: {
                connected: true,
                queued: 0,
                published: expect.any(Number),
                received: 0,
            },
            devices: {},
        });
        expect(calls[0][2]).toStrictEqual({retain: true, qos: 1});
    });

    it("init device health from leave", async () => {
        await resetExtension();
        await mockZHEvents.deviceLeave({ieeeAddr: devices.bulb_color.ieeeAddr});
        await mockZHEvents.deviceJoined({device: devices.bulb_color});
        await vi.advanceTimersByTimeAsync(minutes(11));

        const calls = mockMQTTPublishAsync.mock.calls.filter((call) => call[0] === "zigbee2mqtt/bridge/health");

        expect(calls.length).toStrictEqual(1);
        expect(JSON.parse(calls[0][1])).toStrictEqual({
            response_time: expect.any(Number),
            os: {
                load_average: [expect.any(Number), expect.any(Number), expect.any(Number)],
                memory_used_mb: expect.any(Number),
                memory_percent: expect.any(Number),
            },
            process: {uptime_sec: expect.any(Number), memory_used_mb: expect.any(Number), memory_percent: expect.any(Number)},
            mqtt: {
                connected: true,
                queued: 0,
                published: expect.any(Number),
                received: 0,
            },
            devices: {
                [devices.bulb_color.ieeeAddr]: {
                    leave_count: 1,
                    messages: 0,
                    messages_per_sec: 0,
                    network_address_changes: 0,
                },
            },
        });
        expect(calls[0][2]).toStrictEqual({retain: true, qos: 1});
    });

    it("init device health from network address change", async () => {
        await resetExtension();
        await mockZHEvents.deviceNetworkAddressChanged({device: devices.bulb_color});
        await vi.advanceTimersByTimeAsync(minutes(11));

        const calls = mockMQTTPublishAsync.mock.calls.filter((call) => call[0] === "zigbee2mqtt/bridge/health");

        expect(calls.length).toStrictEqual(1);
        expect(JSON.parse(calls[0][1])).toStrictEqual({
            response_time: expect.any(Number),
            os: {
                load_average: [expect.any(Number), expect.any(Number), expect.any(Number)],
                memory_used_mb: expect.any(Number),
                memory_percent: expect.any(Number),
            },
            process: {uptime_sec: expect.any(Number), memory_used_mb: expect.any(Number), memory_percent: expect.any(Number)},
            mqtt: {
                connected: true,
                queued: 0,
                published: expect.any(Number),
                received: 0,
            },
            devices: {
                [devices.bulb_color.ieeeAddr]: {
                    leave_count: 0,
                    messages: 0,
                    messages_per_sec: 0,
                    network_address_changes: 1,
                },
            },
        });
        expect(calls[0][2]).toStrictEqual({retain: true, qos: 1});
    });

    it("checks health then resets possible stats", async () => {
        settings.set(["health", "reset_on_check"], true);
        await resetExtension();
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color});
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color}); // coverage no time diff first/last
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color_2});
        await vi.advanceTimersByTimeAsync(minutes(11));

        let calls = mockMQTTPublishAsync.mock.calls.filter((call) => call[0] === "zigbee2mqtt/bridge/health");

        expect(calls.length).toStrictEqual(1);
        expect(JSON.parse(calls[0][1])).toStrictEqual({
            response_time: expect.any(Number),
            os: {
                load_average: [expect.any(Number), expect.any(Number), expect.any(Number)],
                memory_used_mb: expect.any(Number),
                memory_percent: expect.any(Number),
            },
            process: {uptime_sec: expect.any(Number), memory_used_mb: expect.any(Number), memory_percent: expect.any(Number)},
            mqtt: {
                connected: true,
                queued: 0,
                published: expect.any(Number),
                received: 0,
            },
            devices: {
                [devices.bulb_color.ieeeAddr]: {
                    leave_count: 0,
                    messages: 2,
                    messages_per_sec: 0.0033,
                    network_address_changes: 0,
                },
                [devices.bulb_color_2.ieeeAddr]: {
                    leave_count: 0,
                    messages: 1,
                    messages_per_sec: 0.0017,
                    network_address_changes: 0,
                },
            },
        });
        expect(calls[0][2]).toStrictEqual({retain: true, qos: 1});

        mockMQTTPublishAsync.mockClear();
        await vi.advanceTimersByTimeAsync(minutes(11));

        calls = mockMQTTPublishAsync.mock.calls.filter((call) => call[0] === "zigbee2mqtt/bridge/health");

        expect(calls.length).toStrictEqual(1);
        expect(JSON.parse(calls[0][1])).toStrictEqual({
            response_time: expect.any(Number),
            os: {
                load_average: [expect.any(Number), expect.any(Number), expect.any(Number)],
                memory_used_mb: expect.any(Number),
                memory_percent: expect.any(Number),
            },
            process: {uptime_sec: expect.any(Number), memory_used_mb: expect.any(Number), memory_percent: expect.any(Number)},
            mqtt: {
                connected: true,
                queued: 0,
                published: expect.any(Number),
                received: 0,
            },
            devices: {},
        });
        expect(calls[0][2]).toStrictEqual({retain: true, qos: 1});
    });
});
