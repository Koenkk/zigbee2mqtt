// biome-ignore assist/source/organizeImports: import mocks first
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import * as data from "../mocks/data";
import {mockLogger} from "../mocks/logger";
import {events as mockMQTTEvents, mockMQTTPublishAsync} from "../mocks/mqtt";
import {flushPromises} from "../mocks/utils";
import {type Device, devices, type Endpoint, events as mockZHEvents} from "../mocks/zigbeeHerdsman";

import stringify from "json-stable-stringify-without-jsonify";
import {InterviewState} from "zigbee-herdsman/dist/controller/model/device";
import {Controller} from "../../lib/controller";
import Configure from "../../lib/extension/configure";
import * as settings from "../../lib/util/settings";

const mocksClear = [mockMQTTPublishAsync, mockLogger.warning, mockLogger.debug];

describe("Extension: Configure", () => {
    let controller: Controller;
    let coordinatorEndpoint: Endpoint;

    const resetExtension = async (): Promise<void> => {
        await controller.removeExtension(controller.getExtension("Configure")!);
        await controller.addExtension(new Configure(...controller.extensionArgs));
    };

    const mockClear = (device: Device): void => {
        for (const endpoint of device.endpoints) {
            endpoint.read.mockClear();
            endpoint.write.mockClear();
            endpoint.configureReporting.mockClear();
            endpoint.bind.mockClear();
        }
    };

    const expectRemoteConfigured = (): void => {
        const device = devices.remote;
        const endpoint1 = device.getEndpoint(1)!;
        expect(endpoint1.bind).toHaveBeenCalledTimes(2);
        expect(endpoint1.bind).toHaveBeenCalledWith("genOnOff", coordinatorEndpoint);
        expect(endpoint1.bind).toHaveBeenCalledWith("genLevelCtrl", coordinatorEndpoint);

        const endpoint2 = device.getEndpoint(2)!;
        expect(endpoint2.write).toHaveBeenCalledTimes(1);
        expect(endpoint2.write).toHaveBeenCalledWith("genBasic", {49: {type: 25, value: 11}}, {disableDefaultResponse: true, manufacturerCode: 4107});
        expect(device.meta.configured).toBe(332242049);
    };

    const expectBulbConfigured = (): void => {
        const device = devices.bulb;
        const endpoint1 = device.getEndpoint(1)!;
        expect(endpoint1.read).toHaveBeenCalledTimes(2);
        expect(endpoint1.read).toHaveBeenCalledWith("lightingColorCtrl", ["colorCapabilities"]);
        expect(endpoint1.read).toHaveBeenCalledWith("lightingColorCtrl", ["colorTempPhysicalMin", "colorTempPhysicalMax"]);
    };

    const expectBulbNotConfigured = (): void => {
        const device = devices.bulb;
        const endpoint1 = device.getEndpoint(1)!;
        expect(endpoint1.read).toHaveBeenCalledTimes(0);
    };

    const expectRemoteNotConfigured = (): void => {
        const device = devices.remote;
        const endpoint1 = device.getEndpoint(1)!;
        expect(endpoint1.bind).toHaveBeenCalledTimes(0);
    };

    const wait = async (ms: number): Promise<void> => await new Promise((resolve) => setTimeout(resolve, ms));

    beforeAll(async () => {
        vi.useFakeTimers();
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        await vi.runOnlyPendingTimersAsync();
    });

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings.reRead();
        for (const mock of mocksClear) mock.mockClear();
        coordinatorEndpoint = devices.coordinator.getEndpoint(1)!;
        await resetExtension();
        await vi.runOnlyPendingTimersAsync();
    });

    afterAll(async () => {
        await controller?.stop();
        await flushPromises();
        vi.useRealTimers();
    });

    it("Should configure Router on startup", () => {
        expectBulbConfigured();
    });

    it("Should not configure EndDevice on startup", () => {
        expectRemoteNotConfigured();
    });

    it("Should re-configure when device rejoins", async () => {
        expectBulbConfigured();
        const device = devices.bulb;
        await flushPromises();
        mockClear(device);
        const payload = {device};
        mockZHEvents.deviceJoined(payload);
        await flushPromises();
        expectBulbConfigured();
    });

    it("Should not re-configure disabled devices", async () => {
        expectBulbConfigured();
        const device = devices.bulb;
        await flushPromises();
        mockClear(device);
        settings.set(["devices", device.ieeeAddr, "disabled"], true);
        mockZHEvents.deviceJoined({device});
        await flushPromises();
        expectBulbNotConfigured();
    });

    it("Should reconfigure reporting on reconfigure event", async () => {
        expectBulbConfigured();
        const device = controller.zigbee.resolveEntity(devices.bulb)!;
        mockClear(device.zh);
        expectBulbNotConfigured();
        controller.eventBus.emitReconfigure({device});
        await flushPromises();
        expectBulbConfigured();
    });

    it("Should not configure twice", async () => {
        expectBulbConfigured();
        const device = devices.bulb;
        mockClear(device);
        await mockZHEvents.deviceInterview({device});
        await flushPromises();
        expectBulbNotConfigured();
    });

    it("Should configure on zigbee message when not configured yet", async () => {
        const device = devices.bulb;
        delete device.meta.configured;
        mockClear(device);
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        expectBulbConfigured();
    });

    it("Should allow to configure via MQTT", async () => {
        mockClear(devices.remote);
        expectRemoteNotConfigured();
        await mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/configure", "remote");
        await flushPromises();
        expectRemoteConfigured();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/configure",
            stringify({data: {id: "remote"}, status: "ok"}),
            {},
        );
    });

    it("Fail to configure via MQTT when device does not exist", async () => {
        await mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/configure", stringify({id: "not_existing_device"}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/configure",
            stringify({data: {}, status: "error", error: "Device 'not_existing_device' does not exist"}),
            {},
        );
    });

    it("Fail to configure via MQTT when configure fails", async () => {
        devices.remote.getEndpoint(1)!.bind.mockRejectedValueOnce(new Error("Bind timeout after 10s"));
        await mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/configure", stringify({id: "remote"}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/configure",
            stringify({data: {}, status: "error", error: "Failed to configure (Bind timeout after 10s)"}),
            {},
        );
    });

    it("Fail to configure via MQTT when device has no configure", async () => {
        await mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/configure", stringify({id: "0x0017980134e45545", transaction: 20}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/configure",
            stringify({data: {}, status: "error", error: "Device '0x0017980134e45545' cannot be configured", transaction: 20}),
            {},
        );
    });

    it("Handles invalid payload for configure via MQTT", async () => {
        await mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/configure", stringify({idx: "0x0017882104a44559"}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/configure",
            stringify({data: {}, status: "error", error: "Invalid payload"}),
            {},
        );
    });

    it("Should not configure when interview not completed", async () => {
        const device = devices.remote;
        delete device.meta.configured;
        device.interviewState = InterviewState.Pending;
        mockClear(device);
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        expectRemoteNotConfigured();
        device.interviewState = InterviewState.Successful;
    });

    it("Should not configure when already configuring", async () => {
        const device = devices.remote;
        delete device.meta.configured;
        const endpoint = device.getEndpoint(1)!;
        endpoint.bind.mockImplementationOnce(async () => await wait(500));
        mockClear(device);
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
    });

    it("Should configure max 3 times when fails", async () => {
        // @ts-expect-error private
        (controller.getExtension("Configure")! as Configure).attempts = {};
        const device = devices.remote;
        delete device.meta.configured;
        const endpoint = device.getEndpoint(1)!;
        mockClear(device);
        endpoint.bind.mockRejectedValueOnce(new Error("BLA"));
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        endpoint.bind.mockRejectedValueOnce(new Error("BLA"));
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        endpoint.bind.mockRejectedValueOnce(new Error("BLA"));
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        endpoint.bind.mockRejectedValueOnce(new Error("BLA"));
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        endpoint.bind.mockRejectedValueOnce(new Error("BLA"));
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
    });
});
