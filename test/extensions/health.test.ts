import * as data from "../mocks/data";
import {mockLogger} from "../mocks/logger";
import {mockMQTTPublishAsync} from "../mocks/mqtt";
import {flushPromises} from "../mocks/utils";
import {devices, events as mockZHEvents, returnDevices} from "../mocks/zigbeeHerdsman";

import {Controller} from "../../lib/controller";
import {Health} from "../../lib/extension/health";
import * as settings from "../../lib/util/settings";
import {minutes, seconds} from "../../lib/util/utils";

const mocksClear = [mockMQTTPublishAsync, mockLogger.warning, mockLogger.info];

returnDevices.push(devices.bulb_color.ieeeAddr, devices.bulb_color_2.ieeeAddr, devices.coordinator.ieeeAddr);

describe("Extension: Health", () => {
    let controller: Controller;

    const resetExtension = async (): Promise<void> => {
        await controller.removeExtension(controller.getExtension("Health")!);
        await controller.addExtension(new Health(...controller.extensionArgs));
    };

    beforeAll(async () => {
        vi.useFakeTimers();
        settings.reRead();
        settings.set(["health"], {enabled: true});

        controller = new Controller(vi.fn(), vi.fn());

        await controller.start();
        await flushPromises();
    });

    beforeEach(() => {
        data.writeDefaultConfiguration();
        settings.reRead();
        settings.set(["health"], {enabled: true});
        settings.set(["devices", devices.bulb_color_2.ieeeAddr, "health"], false);

        for (const mock of mocksClear) {
            mock.mockClear();
        }
    });

    afterEach(async () => {});

    afterAll(async () => {
        await controller?.stop();
        await flushPromises();
        vi.useRealTimers();
    });

    it("checks health at default interval", async () => {
        mockLogger.debug.mockImplementation(console.log);
        await resetExtension();
        await vi.advanceTimersByTimeAsync(minutes(11));

        const calls = mockMQTTPublishAsync.mock.calls.filter((call) => call[0] === "zigbee2mqtt/bridge/health");

        expect(calls.length).toStrictEqual(1);
        expect(JSON.parse(calls[0][1])).toStrictEqual({
            timestamp: expect.stringMatching(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/),
            response_time: expect.stringMatching(/0x[0-9a-z]+/),
            os: {
                load_average: [expect.any(Number), expect.any(Number), expect.any(Number)],
                memory_used_mb: expect.any(Number),
                memory_percent: expect.any(Number),
            },
            process: {uptime_sec: expect.any(Number), memory_used_mb: expect.any(Number), memory_percent: expect.any(Number)},
            mqtt: {
                connected: true,
                queued: 0,
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
            timestamp: expect.stringMatching(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/),
            response_time: expect.stringMatching(/0x[0-9a-z]+/),
            os: {
                load_average: [expect.any(Number), expect.any(Number), expect.any(Number)],
                memory_used_mb: expect.any(Number),
                memory_percent: expect.any(Number),
            },
            process: {uptime_sec: expect.any(Number), memory_used_mb: expect.any(Number), memory_percent: expect.any(Number)},
            mqtt: {
                connected: true,
                queued: 0,
            },
        });
        expect(calls[0][2]).toStrictEqual({retain: true, qos: 1});
    });

    it("checks health with devices", async () => {
        settings.set(["health", "include_devices"], true);
        await resetExtension();
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color});
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color_2});
        await mockZHEvents.deviceLeave({ieeeAddr: devices.bulb_color.ieeeAddr});
        await mockZHEvents.deviceJoined({device: devices.bulb_color});
        await vi.advanceTimersByTimeAsync(seconds(1));
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color});
        await vi.advanceTimersByTimeAsync(seconds(1));
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color});
        await vi.advanceTimersByTimeAsync(seconds(1));
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color});
        await vi.advanceTimersByTimeAsync(minutes(11));

        let calls = mockMQTTPublishAsync.mock.calls.filter((call) => call[0] === "zigbee2mqtt/bridge/health");

        expect(calls.length).toStrictEqual(1);
        expect(JSON.parse(calls[0][1])).toStrictEqual({
            timestamp: expect.stringMatching(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/),
            response_time: expect.stringMatching(/0x[0-9a-z]+/),
            os: {
                load_average: [expect.any(Number), expect.any(Number), expect.any(Number)],
                memory_used_mb: expect.any(Number),
                memory_percent: expect.any(Number),
            },
            process: {uptime_sec: expect.any(Number), memory_used_mb: expect.any(Number), memory_percent: expect.any(Number)},
            mqtt: {
                connected: true,
                queued: 0,
            },
            devices: {
                bulb_color: {
                    leave_count: 1,
                    messages: 4,
                    messages_per_sec: 1.3333,
                },
            },
        });
        expect(calls[0][2]).toStrictEqual({retain: true, qos: 1});

        mockMQTTPublishAsync.mockClear();
        await vi.advanceTimersByTimeAsync(minutes(11));

        calls = mockMQTTPublishAsync.mock.calls.filter((call) => call[0] === "zigbee2mqtt/bridge/health");

        expect(calls.length).toStrictEqual(1);
        expect(JSON.parse(calls[0][1])).toStrictEqual({
            timestamp: expect.stringMatching(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/),
            response_time: expect.stringMatching(/0x[0-9a-z]+/),
            os: {
                load_average: [expect.any(Number), expect.any(Number), expect.any(Number)],
                memory_used_mb: expect.any(Number),
                memory_percent: expect.any(Number),
            },
            process: {uptime_sec: expect.any(Number), memory_used_mb: expect.any(Number), memory_percent: expect.any(Number)},
            mqtt: {
                connected: true,
                queued: 0,
            },
            devices: {
                bulb_color: {
                    leave_count: 1,
                    messages: 4,
                    messages_per_sec: 1.3333,
                },
            },
        });
        expect(calls[0][2]).toStrictEqual({retain: true, qos: 1});
    });

    it("checks health then resets possible stats", async () => {
        settings.set(["health", "include_devices"], true);
        settings.set(["health", "reset_on_check"], true);
        await resetExtension();
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color});
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color}); // coverage no time diff first/last
        await mockZHEvents.lastSeenChanged({device: devices.bulb_color_2});
        await vi.advanceTimersByTimeAsync(minutes(11));

        let calls = mockMQTTPublishAsync.mock.calls.filter((call) => call[0] === "zigbee2mqtt/bridge/health");

        expect(calls.length).toStrictEqual(1);
        expect(JSON.parse(calls[0][1])).toStrictEqual({
            timestamp: expect.stringMatching(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/),
            response_time: expect.stringMatching(/0x[0-9a-z]+/),
            os: {
                load_average: [expect.any(Number), expect.any(Number), expect.any(Number)],
                memory_used_mb: expect.any(Number),
                memory_percent: expect.any(Number),
            },
            process: {uptime_sec: expect.any(Number), memory_used_mb: expect.any(Number), memory_percent: expect.any(Number)},
            mqtt: {
                connected: true,
                queued: 0,
            },
            devices: {
                bulb_color: {
                    leave_count: 0,
                    messages: 2,
                    messages_per_sec: 0,
                },
            },
        });
        expect(calls[0][2]).toStrictEqual({retain: true, qos: 1});

        mockMQTTPublishAsync.mockClear();
        await vi.advanceTimersByTimeAsync(minutes(11));

        calls = mockMQTTPublishAsync.mock.calls.filter((call) => call[0] === "zigbee2mqtt/bridge/health");

        expect(calls.length).toStrictEqual(1);
        expect(JSON.parse(calls[0][1])).toStrictEqual({
            timestamp: expect.stringMatching(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/),
            response_time: expect.stringMatching(/0x[0-9a-z]+/),
            os: {
                load_average: [expect.any(Number), expect.any(Number), expect.any(Number)],
                memory_used_mb: expect.any(Number),
                memory_percent: expect.any(Number),
            },
            process: {uptime_sec: expect.any(Number), memory_used_mb: expect.any(Number), memory_percent: expect.any(Number)},
            mqtt: {
                connected: true,
                queued: 0,
            },
        });
        expect(calls[0][2]).toStrictEqual({retain: true, qos: 1});
    });
});
