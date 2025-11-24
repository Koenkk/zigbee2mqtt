// biome-ignore assist/source/organizeImports: import mocks first
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import * as data from "../mocks/data";
import {mockLogger} from "../mocks/logger";
import {events as mockMQTTEvents, mockMQTTPublishAsync} from "../mocks/mqtt";
import * as mockSleep from "../mocks/sleep";
import {flushPromises} from "../mocks/utils";
import {devices, events as mockZHEvents} from "../mocks/zigbeeHerdsman";

import path from "node:path";
import stringify from "json-stable-stringify-without-jsonify";
import * as zhc from "zigbee-herdsman-converters";
import {Controller} from "../../lib/controller";
import OTAUpdate from "../../lib/extension/otaUpdate";
import * as settings from "../../lib/util/settings";

const mocksClear = [mockMQTTPublishAsync, devices.bulb.save, mockLogger.info];

const DEFAULT_CONFIG: zhc.Ota.Settings = {
    dataDir: data.mockDir,
    imageBlockResponseDelay: 250,
    defaultMaximumDataSize: 50,
};

describe("Extension: OTAUpdate", () => {
    let controller: Controller;
    const updateSpy = vi.spyOn(zhc.ota, "update");
    const isUpdateAvailableSpy = vi.spyOn(zhc.ota, "isUpdateAvailable");

    const resetExtension = async (): Promise<void> => {
        await controller.removeExtension(controller.getExtension("OTAUpdate")!);
        await controller.addExtension(new OTAUpdate(...controller.extensionArgs));
    };

    beforeAll(async () => {
        vi.useFakeTimers();
        mockSleep.mock();
        data.writeDefaultConfiguration();
        settings.reRead();
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        await flushPromises();
    });

    afterAll(async () => {
        mockSleep.restore();
        await controller?.stop();
        await flushPromises();
        vi.useRealTimers();
    });

    beforeEach(() => {
        zhc.ota.setConfiguration(DEFAULT_CONFIG);
        const extension = controller.getExtension("OTAUpdate")! as OTAUpdate;
        // @ts-expect-error private
        extension.lastChecked = new Map();
        // @ts-expect-error private
        extension.inProgress = new Set();
        // @ts-expect-error private
        extension.scheduledUpgrades = new Set();
        // @ts-expect-error private
        extension.scheduledDowngrades = new Set();

        for (const mock of mocksClear) {
            mock.mockClear();
        }

        devices.bulb.mockClear();
        updateSpy.mockClear();
        isUpdateAvailableSpy.mockClear();
        controller.state.clear();
    });

    afterEach(() => {
        settings.set(["ota", "disable_automatic_update_check"], false);
    });

    it.each(["update", "update/downgrade"])("updates a device with topic %s", async (type) => {
        const downgrade = type === "update/downgrade";
        let count = 10;
        devices.bulb.endpoints[0].read.mockImplementation(() => {
            if (downgrade) {
                count--;
            } else {
                count++;
            }

            return {swBuildId: count, dateCode: `201901${count}`};
        });
        updateSpy.mockImplementationOnce(async (_device, _extraMetas, previous, onProgress) => {
            expect(previous).toStrictEqual(downgrade);

            onProgress(0, undefined);
            onProgress(10, 3600.2123);
            return await Promise.resolve(90);
        });

        mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${type}`, "bulb");
        await flushPromises();
        const fromSwBuildId = 10 + (downgrade ? -1 : +1);
        const toSwBuildId = 10 + (downgrade ? -2 : +2);
        const fromDateCode = `201901${fromSwBuildId}`;
        const toDateCode = `201901${toSwBuildId}`;
        expect(mockLogger.info).toHaveBeenCalledWith(`Updating 'bulb' to ${downgrade ? "previous" : "latest"} firmware`);
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(0);
        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledWith(devices.bulb, {}, downgrade, expect.any(Function));
        expect(mockLogger.info).toHaveBeenCalledWith(`Update of 'bulb' at 0.00%`);
        expect(mockLogger.info).toHaveBeenCalledWith(`Update of 'bulb' at 10.00%, ≈ 60 minutes remaining`);
        expect(mockLogger.info).toHaveBeenCalledWith(`Finished update of 'bulb'`);
        // note this is a lambda for `info`, so go down to `log` call to get actual message
        expect(mockLogger.log).toHaveBeenCalledWith(
            "info",
            `Device 'bulb' was updated from '{"dateCode":"${fromDateCode}","softwareBuildID":${fromSwBuildId}}' to '{"dateCode":"${toDateCode}","softwareBuildID":${toSwBuildId}}'`,
            "z2m",
        );
        expect(devices.bulb.save).toHaveBeenCalledTimes(1);
        expect(devices.bulb.endpoints[0].read).toHaveBeenCalledWith("genBasic", ["dateCode", "swBuildId"], {sendPolicy: "immediate"});
        expect(devices.bulb.endpoints[0].read).toHaveBeenCalledWith("genBasic", ["dateCode", "swBuildId"], {sendPolicy: undefined});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb", stringify({update: {state: "updating", progress: 0}}), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "updating", progress: 10, remaining: 3600}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "idle", installed_version: 90, latest_version: 90}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/update",
            stringify({
                data: {
                    from: {date_code: fromDateCode, software_build_id: fromSwBuildId},
                    id: "bulb",
                    to: {date_code: toDateCode, software_build_id: toSwBuildId},
                },
                status: "ok",
            }),
            {},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/devices", expect.any(String), {retain: true});
    });

    it("handles when OTA update fails", async () => {
        devices.bulb.endpoints[0].read.mockImplementation(() => {
            return {swBuildId: 1, dateCode: "2019010"};
        });
        devices.bulb.save.mockClear();
        updateSpy.mockRejectedValueOnce(new Error("Update failed"));

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/update", stringify({id: "bulb"}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb", stringify({update: {state: "available"}}), {retain: true, qos: 0});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/update",
            stringify({data: {}, status: "error", error: "Update of 'bulb' failed (Update failed)"}),
            {},
        );
    });

    it("handles when OTA update returns no image available", async () => {
        devices.bulb.endpoints[0].read.mockImplementation(() => {
            return {swBuildId: 1, dateCode: "2019010"};
        });
        devices.bulb.save.mockClear();
        updateSpy.mockResolvedValueOnce(undefined);

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/update", stringify({id: "bulb"}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb", stringify({update: {state: "available"}}), {retain: true, qos: 0});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/update",
            stringify({data: {}, status: "error", error: "Update of 'bulb' failed (No image currently available)"}),
            {},
        );
    });

    it("is able to check if OTA update is available", async () => {
        isUpdateAvailableSpy.mockResolvedValueOnce({available: false, currentFileVersion: 10, otaFileVersion: 10});
        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/check", "bulb");
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);
        expect(isUpdateAvailableSpy).toHaveBeenNthCalledWith(1, devices.bulb, {}, undefined, false);
        expect(updateSpy).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/check",
            stringify({data: {id: "bulb", update_available: false}, status: "ok"}),
            {},
        );

        mockMQTTPublishAsync.mockClear();
        isUpdateAvailableSpy.mockResolvedValueOnce({available: true, currentFileVersion: 10, otaFileVersion: 12});
        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/check", "bulb");
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(2);
        expect(isUpdateAvailableSpy).toHaveBeenNthCalledWith(2, devices.bulb, {}, undefined, false);
        expect(updateSpy).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/check",
            stringify({data: {id: "bulb", update_available: true}, status: "ok"}),
            {},
        );
        isUpdateAvailableSpy.mockResolvedValueOnce({available: false, currentFileVersion: 10, otaFileVersion: 10});
        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/check/downgrade", "bulb");
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(3);
        expect(isUpdateAvailableSpy).toHaveBeenNthCalledWith(3, devices.bulb, {}, undefined, true);
        expect(updateSpy).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/check",
            stringify({data: {id: "bulb", update_available: false}, status: "ok"}),
            {},
        );

        // @ts-expect-error private
        const device = controller.zigbee.resolveDevice(devices.bulb.ieeeAddr)!;
        const originalDefinition = device.definition;
        device.definition = Object.assign({}, originalDefinition, {ota: {suppressElementImageParseFailure: true}});

        mockMQTTPublishAsync.mockClear();
        isUpdateAvailableSpy.mockResolvedValueOnce({available: true, currentFileVersion: 10, otaFileVersion: 12});
        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/check/downgrade", "bulb");
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(4);
        expect(isUpdateAvailableSpy).toHaveBeenNthCalledWith(4, devices.bulb, {suppressElementImageParseFailure: true}, undefined, true);
        expect(updateSpy).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/check",
            stringify({data: {id: "bulb", update_available: true}, status: "ok"}),
            {},
        );

        device.definition = originalDefinition;
    });

    it("handles if OTA update check fails", async () => {
        isUpdateAvailableSpy.mockRejectedValueOnce(new Error("RF signals disturbed because of dogs barking"));

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/check", "bulb");
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/check",
            stringify({
                data: {},
                status: "error",
                error: `Failed to check if update available for 'bulb' (RF signals disturbed because of dogs barking)`,
            }),
            {},
        );
    });

    it("fails when device does not exist", async () => {
        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/check", "not_existing_deviceooo");
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/check",
            stringify({data: {}, status: "error", error: `Device 'not_existing_deviceooo' does not exist`}),
            {},
        );
    });

    it("does not check for OTA when device does not support it", async () => {
        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/check", "dimmer_wall_switch");
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/check",
            stringify({data: {}, status: "error", error: `Device 'dimmer_wall_switch' does not support OTA updates`}),
            {},
        );
    });

    it.each([
        "check",
        "check/downgrade",
        "update",
        "update/downgrade",
        "schedule",
        "schedule/downgrade",
        "unschedule",
    ])("refuses to %s when already in progress", async (type) => {
        if (type.includes("schedule") || type.includes("check")) {
            isUpdateAvailableSpy.mockImplementationOnce(async () => {
                return await new Promise((resolve) => {
                    setTimeout(
                        () =>
                            resolve({
                                available: false,
                                currentFileVersion: 1,
                                otaFileVersion: 1,
                            }),
                        99999,
                    );
                });
            });
        } else {
            updateSpy.mockImplementationOnce(async () => {
                return await new Promise((resolve) => {
                    setTimeout(() => resolve(1), 99999);
                });
            });
        }

        mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${type.includes("schedule") ? "check" : type}`, "bulb");
        await flushPromises();
        mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${type}`, "bulb");
        await flushPromises();

        if (type.includes("schedule") || type.includes("check")) {
            expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);
        } else {
            expect(updateSpy).toHaveBeenCalledTimes(1);
        }

        await vi.runOnlyPendingTimersAsync();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            `zigbee2mqtt/bridge/response/device/ota_update/${type.replace("/downgrade", "")}`,
            stringify({data: {}, status: "error", error: `Update or check for update already in progress for 'bulb'`}),
            {},
        );
    });

    it("does not crash when read modelID before/after OTA update fails", async () => {
        devices.bulb.endpoints[0].read.mockRejectedValueOnce("Failed from").mockRejectedValueOnce("Failed to");
        updateSpy.mockResolvedValueOnce(1);

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/update", "bulb");
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/update",
            stringify({data: {id: "bulb", from: undefined, to: undefined}, status: "ok"}),
            {},
        );
    });

    it("cancels scheduled when direct update requested", async () => {
        updateSpy.mockResolvedValueOnce(1);

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/schedule", "bulb");
        await flushPromises();

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/update", "bulb");
        await flushPromises();

        expect(mockLogger.info).toHaveBeenCalledWith("Previously scheduled 'bulb' upgrade was cancelled by manual update");

        updateSpy.mockResolvedValueOnce(1);

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/schedule/downgrade", "bulb");
        await flushPromises();

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/update", "bulb");
        await flushPromises();

        expect(mockLogger.info).toHaveBeenCalledWith("Previously scheduled 'bulb' downgrade was cancelled by manual update");
    });

    it("checks for update when device requests it", async () => {
        const data = {imageType: 12382};
        isUpdateAvailableSpy.mockResolvedValueOnce({available: true, currentFileVersion: 10, otaFileVersion: 12});
        const payload = {
            data,
            cluster: "genOta",
            device: devices.bulb,
            endpoint: devices.bulb.getEndpoint(1)!,
            type: "commandQueryNextImageRequest",
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 10},
        };
        mockLogger.info.mockClear();
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);
        expect(isUpdateAvailableSpy).toHaveBeenCalledWith(devices.bulb, {}, {imageType: 12382}, false);
        expect(mockLogger.info).toHaveBeenCalledWith(`Update available for 'bulb'`);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledWith("genOta", "queryNextImageResponse", {status: 0x98}, undefined, 10);

        // Should not request again when device asks again after a short time
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);

        mockLogger.info.mockClear();
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(mockLogger.info).not.toHaveBeenCalledWith(`Update available for 'bulb'`);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "available", installed_version: 10, latest_version: 12}}),
            {retain: true, qos: 0},
        );
    });

    it("responds with NO_IMAGE_AVAILABLE when update available request fails", async () => {
        const data = {imageType: 12382};
        isUpdateAvailableSpy.mockRejectedValueOnce("Nothing to find here");
        const payload = {
            data,
            cluster: "genOta",
            device: devices.bulb,
            endpoint: devices.bulb.getEndpoint(1)!,
            type: "commandQueryNextImageRequest",
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 10},
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);
        expect(isUpdateAvailableSpy).toHaveBeenCalledWith(devices.bulb, {}, {imageType: 12382}, false);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledWith("genOta", "queryNextImageResponse", {status: 0x98}, undefined, 10);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb", stringify({update: {state: "idle"}}), {retain: true, qos: 0});
    });

    it("checks for update when device requests it and it is not available", async () => {
        const data = {imageType: 12382};
        isUpdateAvailableSpy.mockResolvedValueOnce({available: false, currentFileVersion: 13, otaFileVersion: 13});
        const payload = {
            data,
            cluster: "genOta",
            device: devices.bulb,
            endpoint: devices.bulb.getEndpoint(1)!,
            type: "commandQueryNextImageRequest",
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 10},
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);
        expect(isUpdateAvailableSpy).toHaveBeenCalledWith(devices.bulb, {}, {imageType: 12382}, false);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledWith("genOta", "queryNextImageResponse", {status: 0x98}, undefined, 10);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "idle", installed_version: 13, latest_version: 13}}),
            {retain: true, qos: 0},
        );
    });

    it("does not check for update when device requests it and disable_automatic_update_check is set to true", async () => {
        settings.set(["ota", "disable_automatic_update_check"], true);
        const data = {imageType: 12382};
        isUpdateAvailableSpy.mockResolvedValueOnce({available: true, currentFileVersion: 10, otaFileVersion: 13});
        const payload = {
            data,
            cluster: "genOta",
            device: devices.bulb,
            endpoint: devices.bulb.getEndpoint(1)!,
            type: "commandQueryNextImageRequest",
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 10},
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(0);
    });

    it.each(["schedule", "schedule/downgrade"])("schedules and performs an update with topic %s", async (type) => {
        const downgrade = type === "schedule/downgrade";

        if (downgrade) {
            settings.set(["ota", "disable_automatic_update_check"], true); // coverage, scheduling not affected by this
        }

        updateSpy.mockImplementationOnce(async (_device, _extraMetas, previous, onProgress) => {
            expect(previous).toStrictEqual(downgrade);

            onProgress(0, undefined);
            onProgress(10, 3600.2123);
            return await Promise.resolve(2);
        });

        mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${type}`, "bulb");
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(1, "zigbee2mqtt/bulb", stringify({update: {state: "scheduled"}}), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            2,
            "zigbee2mqtt/bridge/response/device/ota_update/schedule",
            stringify({data: {id: "bulb"}, status: "ok"}),
            {},
        );

        const data = {imageType: 12382};
        const payload = {
            data,
            cluster: "genOta",
            device: devices.bulb,
            endpoint: devices.bulb.getEndpoint(1)!,
            type: "commandQueryNextImageRequest",
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 10},
        };

        await mockZHEvents.message(payload);
        await flushPromises();

        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(3, "zigbee2mqtt/bulb", stringify({update: {state: "updating", progress: 0}}), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            4,
            "zigbee2mqtt/bulb",
            stringify({update: {state: "updating", progress: 10, remaining: 3600}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            5,
            "zigbee2mqtt/bulb",
            stringify({update: {state: "idle", installed_version: 2, latest_version: 2}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(6, "zigbee2mqtt/bridge/devices", expect.any(String), {retain: true});
    });

    it("schedules and cancels an update when no image available", async () => {
        updateSpy.mockResolvedValueOnce(undefined);

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/schedule", "bulb");
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(1, "zigbee2mqtt/bulb", stringify({update: {state: "scheduled"}}), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            2,
            "zigbee2mqtt/bridge/response/device/ota_update/schedule",
            stringify({data: {id: "bulb"}, status: "ok"}),
            {},
        );

        const data = {imageType: 12382};
        const payload = {
            data,
            cluster: "genOta",
            device: devices.bulb,
            endpoint: devices.bulb.getEndpoint(1)!,
            type: "commandQueryNextImageRequest",
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 10},
        };

        await mockZHEvents.message(payload);
        await flushPromises();

        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(3, "zigbee2mqtt/bulb", stringify({update: {state: "idle"}}), {retain: true, qos: 0});
    });

    it("schedules and re-schedules an update when failed", async () => {
        updateSpy.mockRejectedValueOnce("Update failed").mockImplementationOnce(async (_device, _extraMetas, _previous, onProgress) => {
            onProgress(0, undefined);
            onProgress(10, 3600.2123);
            return await Promise.resolve(2);
        });

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/schedule", "bulb");
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(1, "zigbee2mqtt/bulb", stringify({update: {state: "scheduled"}}), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            2,
            "zigbee2mqtt/bridge/response/device/ota_update/schedule",
            stringify({data: {id: "bulb"}, status: "ok"}),
            {},
        );

        const data = {imageType: 12382};
        const payload = {
            data,
            cluster: "genOta",
            device: devices.bulb,
            endpoint: devices.bulb.getEndpoint(1)!,
            type: "commandQueryNextImageRequest",
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 10},
        };

        await mockZHEvents.message(payload);
        await flushPromises();

        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(3, "zigbee2mqtt/bulb", stringify({update: {state: "scheduled"}}), {
            retain: true,
            qos: 0,
        });

        await mockZHEvents.message(payload);
        await flushPromises();
        console.log(mockMQTTPublishAsync.mock.calls.map((c) => c[0]));

        expect(updateSpy).toHaveBeenCalledTimes(2);
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(4, "zigbee2mqtt/bulb", stringify({update: {state: "updating", progress: 0}}), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            5,
            "zigbee2mqtt/bulb",
            stringify({update: {state: "updating", progress: 10, remaining: 3600}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            6,
            "zigbee2mqtt/bulb",
            stringify({update: {state: "idle", installed_version: 2, latest_version: 2}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(7, "zigbee2mqtt/bridge/devices", expect.any(String), {retain: true});
    });

    it("overwrites current schedule on re-schedule", async () => {
        for (const [type, overwriteType] of [
            ["schedule", "schedule/downgrade"],
            ["schedule/downgrade", "schedule"],
        ]) {
            mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${type}`, "bulb");
            await flushPromises();

            expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(1, "zigbee2mqtt/bulb", stringify({update: {state: "scheduled"}}), {
                retain: true,
                qos: 0,
            });
            expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
                2,
                "zigbee2mqtt/bridge/response/device/ota_update/schedule",
                stringify({data: {id: "bulb"}, status: "ok"}),
                {},
            );

            mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${overwriteType}`, "bulb");
            await flushPromises();

            expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(3, "zigbee2mqtt/bulb", stringify({update: {state: "scheduled"}}), {
                retain: true,
                qos: 0,
            });
            expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
                4,
                "zigbee2mqtt/bridge/response/device/ota_update/schedule",
                stringify({data: {id: "bulb"}, status: "ok"}),
                {},
            );
        }
    });

    it.each(["schedule", "schedule/downgrade"])("unschedules", async (type) => {
        mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${type}`, "bulb");
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(1, "zigbee2mqtt/bulb", stringify({update: {state: "scheduled"}}), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            2,
            "zigbee2mqtt/bridge/response/device/ota_update/schedule",
            stringify({data: {id: "bulb"}, status: "ok"}),
            {},
        );

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/unschedule", "bulb");
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(3, "zigbee2mqtt/bulb", stringify({update: {state: "idle"}}), {retain: true, qos: 0});

        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            4,
            "zigbee2mqtt/bridge/response/device/ota_update/unschedule",
            stringify({data: {id: "bulb"}, status: "ok"}),
            {},
        );
    });

    it("responds with NO_IMAGE_AVAILABLE when not supporting OTA", async () => {
        const device = devices.HGZB04D;
        const data = {imageType: 12382};
        const payload = {
            data,
            cluster: "genOta",
            device,
            endpoint: device.getEndpoint(1)!,
            type: "commandQueryNextImageRequest",
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 10},
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(device.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(device.endpoints[0].commandResponse).toHaveBeenCalledWith("genOta", "queryNextImageResponse", {status: 152}, undefined, 10);
    });

    it("responds with NO_IMAGE_AVAILABLE when not supporting OTA and device has no OTA endpoint to standard endpoint", async () => {
        const device = devices.SV01;
        const data = {imageType: 12382};
        const payload = {
            data,
            cluster: "genOta",
            device,
            endpoint: device.getEndpoint(1)!,
            type: "commandQueryNextImageRequest",
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 10},
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(device.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(device.endpoints[0].commandResponse).toHaveBeenCalledWith("genOta", "queryNextImageResponse", {status: 152}, undefined, 10);
    });

    it("sets given configuration", async () => {
        const setConfiguration = vi.spyOn(zhc.ota, "setConfiguration");
        settings.set(["ota", "zigbee_ota_override_index_location"], "local.index.json");
        settings.set(["ota", "image_block_response_delay"], 10000);
        settings.set(["ota", "default_maximum_data_size"], 10);
        await resetExtension();
        expect(setConfiguration).toHaveBeenCalledWith({
            ...DEFAULT_CONFIG,
            overrideIndexLocation: path.join(data.mockDir, "local.index.json"),
            imageBlockResponseDelay: 10000,
            defaultMaximumDataSize: 10,
        });
        setConfiguration.mockClear();

        settings.set(["ota", "zigbee_ota_override_index_location"], "http://my.site/index.json");
        settings.set(["ota", "image_block_response_delay"], 50);
        settings.set(["ota", "default_maximum_data_size"], 100);
        await resetExtension();
        expect(setConfiguration).toHaveBeenCalledWith({
            ...DEFAULT_CONFIG,
            overrideIndexLocation: "http://my.site/index.json",
            imageBlockResponseDelay: 50,
            defaultMaximumDataSize: 100,
        });
        setConfiguration.mockClear();
    });

    it("clear update state on startup", async () => {
        const device = controller.zigbee.resolveEntity(devices.bulb_color.ieeeAddr);
        controller.state.set(device, {update: {progress: 100, remaining: 10, state: "updating"}});
        await resetExtension();
        expect(controller.state.get(device)).toStrictEqual({update: {state: "available"}});
    });
});
