// biome-ignore assist/source/organizeImports: import mocks first
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi, assert} from "vitest";
import * as data from "../mocks/data";
import {mockLogger} from "../mocks/logger";
import {mockMQTTPublishAsync} from "../mocks/mqtt";
import {flushPromises} from "../mocks/utils";
import type {Device as ZhDevice} from "../mocks/zigbeeHerdsman";
import {devices, events as mockZHEvents, returnDevices} from "../mocks/zigbeeHerdsman";

import type {MockInstance} from "vitest";
import * as zhc from "zigbee-herdsman-converters";
import type {OnEvent as ZhcOnEvent} from "zigbee-herdsman-converters/lib/types";
import {Controller} from "../../lib/controller";
import OnEvent from "../../lib/extension/onEvent";
import type Device from "../../lib/model/device";
import * as settings from "../../lib/util/settings";

const mocksClear = [mockMQTTPublishAsync, mockLogger.warning, mockLogger.debug];

returnDevices.push(devices.bulb.ieeeAddr, devices.LIVOLO.ieeeAddr, devices.coordinator.ieeeAddr);

describe("Extension: OnEvent", () => {
    let controller: Controller;
    let onEventSpy: MockInstance<typeof zhc.onEvent>;
    let deviceOnEventSpy: MockInstance<ZhcOnEvent.Handler>;

    const getZ2MDevice = (zhDevice: string | number | ZhDevice): Device => {
        return controller.zigbee.resolveEntity(zhDevice)! as Device;
    };

    beforeAll(async () => {
        vi.useFakeTimers();
        data.writeDefaultConfiguration();
        settings.reRead();

        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        await flushPromises();

        onEventSpy = vi.spyOn(zhc, "onEvent");
        deviceOnEventSpy = vi.spyOn(getZ2MDevice(devices.LIVOLO).definition!, "onEvent");
    });

    beforeEach(async () => {
        for (const mock of mocksClear) {
            mock.mockClear();
        }

        await controller.removeExtension(controller.getExtension("OnEvent")!);
        onEventSpy.mockClear();
        deviceOnEventSpy.mockClear();
        await controller.addExtension(new OnEvent(...controller.extensionArgs));
    });

    afterAll(async () => {
        await controller.stop();
        await flushPromises();
        vi.useRealTimers();
    });

    it("starts & stops", async () => {
        expect(onEventSpy).toHaveBeenCalledTimes(2);
        expect(deviceOnEventSpy).toHaveBeenCalledTimes(1);
        expect(deviceOnEventSpy).toHaveBeenNthCalledWith(1, {
            type: "start",
            data: {
                device: devices.LIVOLO,
                options: settings.getDevice(devices.LIVOLO.ieeeAddr),
                state: {},
                deviceExposesChanged: expect.any(Function),
            },
        });

        await controller.stop();

        expect(onEventSpy).toHaveBeenCalledTimes(4);
        expect(deviceOnEventSpy).toHaveBeenCalledTimes(2);
        expect(deviceOnEventSpy).toHaveBeenNthCalledWith(2, {
            type: "stop",
            data: {
                ieeeAddr: devices.LIVOLO.ieeeAddr,
            },
        });
    });

    it("calls on device events", async () => {
        await mockZHEvents.deviceAnnounce({device: devices.LIVOLO});
        await flushPromises();

        // Should always call with 'start' event first
        expect(deviceOnEventSpy).toHaveBeenCalledTimes(2);
        expect(deviceOnEventSpy).toHaveBeenNthCalledWith(1, {
            type: "start",
            data: {
                device: devices.LIVOLO,
                options: settings.getDevice(devices.LIVOLO.ieeeAddr),
                state: {},
                deviceExposesChanged: expect.any(Function),
            },
        });

        // Device announce
        expect(deviceOnEventSpy).toHaveBeenCalledTimes(2);
        expect(deviceOnEventSpy).toHaveBeenNthCalledWith(2, {
            type: "deviceAnnounce",
            data: {
                device: devices.LIVOLO,
                options: settings.getDevice(devices.LIVOLO.ieeeAddr),
                state: {},
                deviceExposesChanged: expect.any(Function),
            },
        });

        // Check deviceExposesChanged()
        const emitExposesAndDevicesChangedSpy = vi.spyOn(
            // @ts-expect-error protected
            controller.getExtension("OnEvent")!.eventBus,
            "emitExposesAndDevicesChanged",
        );
        assert(deviceOnEventSpy.mock.calls[0][0]!.type === "start");
        deviceOnEventSpy.mock.calls[0][0]!.data.deviceExposesChanged();
        expect(emitExposesAndDevicesChangedSpy).toHaveBeenCalledTimes(1);
        expect(emitExposesAndDevicesChangedSpy).toHaveBeenCalledWith(getZ2MDevice(devices.LIVOLO));

        // Call `stop` when device leaves
        await mockZHEvents.deviceLeave({ieeeAddr: devices.LIVOLO.ieeeAddr});
        await flushPromises();
        expect(deviceOnEventSpy).toHaveBeenCalledTimes(3);
        expect(deviceOnEventSpy).toHaveBeenNthCalledWith(3, {
            type: "stop",
            data: {
                ieeeAddr: devices.LIVOLO.ieeeAddr,
            },
        });

        // Call `stop` when device is removed
        // @ts-expect-error private
        controller.eventBus.emitEntityRemoved({entity: getZ2MDevice(devices.LIVOLO)});
        await flushPromises();
        expect(deviceOnEventSpy).toHaveBeenCalledTimes(4);
        expect(deviceOnEventSpy).toHaveBeenNthCalledWith(4, {
            type: "stop",
            data: {
                ieeeAddr: devices.LIVOLO.ieeeAddr,
            },
        });

        // Device interview, should call with 'start' first as 'stop' was called
        await mockZHEvents.deviceInterview({device: devices.LIVOLO, status: "started"});
        await flushPromises();
        expect(deviceOnEventSpy).toHaveBeenCalledTimes(6);
        expect(deviceOnEventSpy).toHaveBeenNthCalledWith(5, {
            type: "start",
            data: {
                device: devices.LIVOLO,
                options: settings.getDevice(devices.LIVOLO.ieeeAddr),
                state: {},
                deviceExposesChanged: expect.any(Function),
            },
        });
        expect(deviceOnEventSpy).toHaveBeenNthCalledWith(6, {
            type: "deviceInterview",
            data: {
                device: devices.LIVOLO,
                options: settings.getDevice(devices.LIVOLO.ieeeAddr),
                state: {},
                deviceExposesChanged: expect.any(Function),
                status: "started",
            },
        });
    });

    it("does not block startup on failure", async () => {
        await controller.removeExtension(controller.getExtension("OnEvent")!);
        deviceOnEventSpy.mockImplementationOnce(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10000));
            throw new Error("Failed");
        });
        await controller.addExtension(new OnEvent(...controller.extensionArgs));
    });
});
