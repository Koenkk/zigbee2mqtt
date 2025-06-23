// biome-ignore assist/source/organizeImports: import mocks first
import * as data from "../mocks/data";
import {mockLogger} from "../mocks/logger";
import {mockMQTTPublishAsync} from "../mocks/mqtt";
import {flushPromises} from "../mocks/utils";
import type {Device as ZhDevice} from "../mocks/zigbeeHerdsman";
import {devices, events as mockZHEvents, returnDevices} from "../mocks/zigbeeHerdsman";

import type {MockInstance} from "vitest";
import * as zhc from "zigbee-herdsman-converters";
import type {OnEvent as DefinitionOnEvent} from "zigbee-herdsman-converters/lib/types";
import {Controller} from "../../lib/controller";
import OnEvent from "../../lib/extension/onEvent";
import type Device from "../../lib/model/device";
import * as settings from "../../lib/util/settings";

const mocksClear = [mockMQTTPublishAsync, mockLogger.warning, mockLogger.debug];

returnDevices.push(devices.bulb.ieeeAddr, devices.LIVOLO.ieeeAddr, devices.coordinator.ieeeAddr);

describe("Extension: OnEvent", () => {
    let controller: Controller;
    let onEventSpy: MockInstance<typeof zhc.onEvent>;
    let deviceOnEventSpy: MockInstance<DefinitionOnEvent>;

    const getZ2MDevice = (zhDevice: string | number | ZhDevice): Device => {
        // @ts-expect-error private
        return controller.zigbee.resolveEntity(zhDevice)! as Device;
    };

    const clearOnEventSpies = (): void => {
        onEventSpy.mockClear();
        deviceOnEventSpy.mockClear();
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
        clearOnEventSpies();
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
        expect(deviceOnEventSpy).toHaveBeenNthCalledWith(
            1,
            "start",
            {},
            devices.LIVOLO,
            settings.getDevice(devices.LIVOLO.ieeeAddr),
            {},
            {deviceExposesChanged: expect.any(Function)},
        );

        await controller.stop();

        expect(onEventSpy).toHaveBeenCalledTimes(4);
        expect(deviceOnEventSpy).toHaveBeenCalledTimes(2);
        expect(deviceOnEventSpy).toHaveBeenNthCalledWith(
            2,
            "stop",
            {},
            devices.LIVOLO,
            settings.getDevice(devices.LIVOLO.ieeeAddr),
            {},
            {deviceExposesChanged: expect.any(Function)},
        );
    });

    it("calls on device events", async () => {
        clearOnEventSpies();
        await mockZHEvents.deviceAnnounce({device: devices.LIVOLO});
        await flushPromises();

        expect(deviceOnEventSpy).toHaveBeenCalledTimes(1);
        expect(deviceOnEventSpy).toHaveBeenNthCalledWith(
            1,
            "deviceAnnounce",
            {},
            devices.LIVOLO,
            settings.getDevice(devices.LIVOLO.ieeeAddr),
            {},
            {deviceExposesChanged: expect.any(Function)},
        );

        const emitExposesAndDevicesChangedSpy = vi.spyOn(
            // @ts-expect-error protected
            controller.getExtension("OnEvent")!.eventBus,
            "emitExposesAndDevicesChanged",
        );

        deviceOnEventSpy.mock.calls[0][5]!.deviceExposesChanged();

        expect(emitExposesAndDevicesChangedSpy).toHaveBeenCalledTimes(1);
        expect(emitExposesAndDevicesChangedSpy).toHaveBeenCalledWith(getZ2MDevice(devices.LIVOLO));

        await mockZHEvents.deviceLeave({ieeeAddr: devices.LIVOLO.ieeeAddr});
        await flushPromises();

        expect(deviceOnEventSpy).toHaveBeenCalledTimes(2);
        expect(deviceOnEventSpy).toHaveBeenNthCalledWith(
            2,
            "stop",
            {},
            devices.LIVOLO,
            settings.getDevice(devices.LIVOLO.ieeeAddr),
            {},
            {deviceExposesChanged: expect.any(Function)},
        );
    });

    it("calls on device message", async () => {
        clearOnEventSpies();

        await mockZHEvents.message({
            type: "attributeReport",
            device: devices.LIVOLO,
            endpoint: devices.LIVOLO.endpoints[0],
            linkquality: 213,
            groupID: 0,
            cluster: "genBasic",
            data: {zclVersion: 8},
            meta: {zclTransactionSequenceNumber: 1, manufacturerCode: devices.LIVOLO.manufacturerID},
        });
        await flushPromises();

        expect(deviceOnEventSpy).toHaveBeenCalledTimes(1);
        expect(deviceOnEventSpy).toHaveBeenCalledWith(
            "message",
            {
                type: "attributeReport",
                endpoint: devices.LIVOLO.endpoints[0],
                cluster: "genBasic",
                data: {zclVersion: 8},
                meta: {zclTransactionSequenceNumber: 1, manufacturerCode: devices.LIVOLO.manufacturerID},
            },
            devices.LIVOLO,
            settings.getDevice(devices.LIVOLO.ieeeAddr),
            {},
            {deviceExposesChanged: expect.any(Function)},
        );
    });

    it("does not block startup on failure", async () => {
        await controller.removeExtension(controller.getExtension("OnEvent")!);
        clearOnEventSpies();
        deviceOnEventSpy.mockImplementationOnce(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10000));
            throw new Error("Failed");
        });
        await controller.addExtension(new OnEvent(...controller.extensionArgs));

        expect(onEventSpy).toHaveBeenCalledTimes(2);
        expect(deviceOnEventSpy).toHaveBeenCalledTimes(1);
    });
});
