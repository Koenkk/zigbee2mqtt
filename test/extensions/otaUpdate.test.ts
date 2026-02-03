// biome-ignore assist/source/organizeImports: import mocks first
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import * as data from "../mocks/data";
import {mockLogger} from "../mocks/logger";
import {events as mockMQTTEvents, mockMQTTPublishAsync} from "../mocks/mqtt";
import * as mockSleep from "../mocks/sleep";
import {flushPromises} from "../mocks/utils";
import {devices, events as mockZHEvents} from "../mocks/zigbeeHerdsman";

import {join} from "node:path";
import {existsSync, readFileSync, rmSync} from "node:fs";
import stringify from "json-stable-stringify-without-jsonify";
import {Controller} from "../../lib/controller";
import OTAUpdate from "../../lib/extension/otaUpdate";
import * as settings from "../../lib/util/settings";
import type {OtaDataSettings, ZigbeeOtaImageMeta} from "zigbee-herdsman/dist/controller/tstype";
import * as zh from "zigbee-herdsman";
import type {TClusterCommandPayload} from "zigbee-herdsman/dist/zspec/zcl/definition/clusters-types";

const DEFAULT_CONFIG: OtaDataSettings = {
    requestTimeout: 150000,
    responseDelay: 250,
    baseSize: 50,
};

const DEFAULT_CURRENT: TClusterCommandPayload<"genOta", "queryNextImageRequest"> = {
    fieldControl: 0,
    fileVersion: 1,
    manufacturerCode: 2,
    imageType: 3,
};

const DEFAULT_AVAILABLE_META: ZigbeeOtaImageMeta = {
    fileName: "my.ota",
    fileVersion: 1,
    manufacturerCode: 2,
    imageType: 3,
    url: "https://example.com/my.ota",
};

describe("Extension: OTAUpdate", () => {
    let controller: Controller;

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
        rmSync(data.mockDir, {force: true, recursive: true});
    });

    beforeEach(async () => {
        zh.setOtaConfiguration(data.mockDir, undefined);
        const extension = controller.getExtension("OTAUpdate")! as OTAUpdate;
        extension.clearState();

        await vi.advanceTimersByTimeAsync(10000); // go past the init routines

        mockMQTTPublishAsync.mockClear();
        mockLogger.info.mockClear();
        mockLogger.error.mockClear();
        devices.HGZB04D.mockClear();
        devices.SV01.mockClear();
        devices.bulb.mockClear();
        devices.bulb_color.mockClear();
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
        devices.bulb.updateOta.mockImplementationOnce(
            async (source, _requestPayload, _requestTsn, _extraMetas, onProgress, _dataSettings, _endpoint) => {
                expect(source?.downgrade).toStrictEqual(downgrade);

                onProgress(0, 36000.5678);
                onProgress(10, 3600.2123);
                return await Promise.resolve([
                    {
                        ...DEFAULT_CURRENT,
                        fileVersion: 1,
                    },
                    {
                        ...DEFAULT_CURRENT,
                        fileVersion: 90,
                    },
                ]);
            },
        );

        mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${type}`, stringify({id: "bulb"}));
        await flushPromises();
        await vi.advanceTimersByTimeAsync(5100);

        const fromSwBuildId = 10 + (downgrade ? -1 : +1);
        const toSwBuildId = 10 + (downgrade ? -2 : +2); // 2x from `#readSoftwareBuildIDAndDateCode`
        const fromDateCode = `201901${fromSwBuildId}`;
        const toDateCode = `201901${toSwBuildId}`;
        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(0);
        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(1);
        expect(devices.bulb.updateOta).toHaveBeenCalledWith(
            {downgrade},
            undefined,
            undefined,
            {},
            expect.any(Function),
            {...DEFAULT_CONFIG},
            undefined,
        );

        const infoCalls = mockLogger.info.mock.calls.map((c) => (typeof c[0] === "string" ? c[0] : c[0]()));
        expect(infoCalls[0]).toStrictEqual(`OTA updating 'bulb' to ${downgrade ? "previous" : "latest"} firmware`);
        expect(infoCalls[3]).toStrictEqual(`Finished update of 'bulb'`);
        expect(infoCalls[5]).toStrictEqual(`Device 'bulb' was OTA updated from '1' to '90'`);
        expect(infoCalls[7]).toStrictEqual(`Interviewing 'bulb'`);
        expect(infoCalls[8]).toStrictEqual(`Configuring 'bulb'`);
        expect(infoCalls[10]).toStrictEqual(`Successfully interviewed 'bulb'`);
        expect(infoCalls[11]).toStrictEqual(`Successfully configured 'bulb' (version 0.0.0)`);

        expect(devices.bulb.save).toHaveBeenCalledTimes(1);
        expect(devices.bulb.endpoints[0].read).toHaveBeenCalledWith("genBasic", ["dateCode", "swBuildId"], {sendPolicy: "immediate"});
        expect(devices.bulb.endpoints[0].read).toHaveBeenCalledWith("genBasic", ["dateCode", "swBuildId"], {sendPolicy: undefined});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "updating", progress: 0, remaining: 36001}}),
            {
                retain: true,
                qos: 0,
            },
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "updating", progress: 10, remaining: 3600}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "idle", installed_version: 90, latest_version: 90, latest_release_notes: null, latest_source: null}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/update",
            stringify({
                data: {
                    from: {date_code: fromDateCode, software_build_id: fromSwBuildId, file_version: 1},
                    id: "bulb",
                    to: {date_code: toDateCode, software_build_id: toSwBuildId, file_version: 90},
                },
                status: "ok",
            }),
            {},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/info", expect.any(String), {retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/definitions", expect.any(String), {retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/devices", expect.any(String), {retain: true});
    });

    it("re-interviews and re-configures after successful update", async () => {
        devices.bulb.meta.configured = 123;

        devices.bulb.updateOta.mockImplementationOnce(
            async (_source, _requestPayload, _requestTsn, _extraMetas, _onProgress, _dataSettings, _endpoint) => {
                return await Promise.resolve([
                    {
                        ...DEFAULT_CURRENT,
                        fileVersion: 1,
                    },
                    {
                        ...DEFAULT_CURRENT,
                        fileVersion: 2,
                    },
                ]);
            },
        );

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/update", stringify({id: "bulb"}));
        await flushPromises();
        await vi.advanceTimersByTimeAsync(5100);

        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(0);
        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(1);
        expect(devices.bulb.interview).toHaveBeenCalledTimes(1);
        expect(devices.bulb.save).toHaveBeenCalledTimes(2);

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "idle", installed_version: 2, latest_version: 2, latest_release_notes: null, latest_source: null}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/info", expect.any(String), {retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/definitions", expect.any(String), {retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/devices", expect.any(String), {retain: true});

        delete devices.bulb.meta.configured;
    });

    it("handles re-interview failure post-update", async () => {
        devices.bulb.meta.configured = 123;

        devices.bulb.interview.mockRejectedValueOnce(new Error("dragons"));
        devices.bulb.updateOta.mockImplementationOnce(
            async (_source, _requestPayload, _requestTsn, _extraMetas, _onProgress, _dataSettings, _endpoint) => {
                return await Promise.resolve([
                    {
                        ...DEFAULT_CURRENT,
                        fileVersion: 1,
                    },
                    {
                        ...DEFAULT_CURRENT,
                        fileVersion: 2,
                    },
                ]);
            },
        );

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/update", stringify({id: "bulb"}));
        await flushPromises();
        await vi.advanceTimersByTimeAsync(5100);

        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(0);
        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(1);
        expect(devices.bulb.interview).toHaveBeenCalledTimes(1);
        expect(devices.bulb.save).toHaveBeenCalledTimes(2);

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "idle", installed_version: 2, latest_version: 2, latest_release_notes: null, latest_source: null}}),
            {retain: true, qos: 0},
        );
        expect(mockLogger.error).toHaveBeenCalledWith(
            `Interview of 'bulb' (${devices.bulb.ieeeAddr}) failed: Error: dragons. Re-try manually after some time.`,
        );
    });

    it("updates with url payload", async () => {
        devices.bulb.updateOta.mockImplementationOnce(
            async (_source, _requestPayload, _requestTsn, _extraMetas, _onProgress, _dataSettings, _endpoint) => {
                return await Promise.resolve([
                    {
                        ...DEFAULT_CURRENT,
                        fileVersion: 1,
                    },
                    {
                        ...DEFAULT_CURRENT,
                        fileVersion: 2,
                    },
                ]);
            },
        );

        mockMQTTEvents.message(
            "zigbee2mqtt/bridge/request/device/ota_update/update",
            stringify({id: "bulb", url: "https://example.com/myremote.ota"}),
        );
        await flushPromises();
        await vi.advanceTimersByTimeAsync(5100);

        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(0);
        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(1);
        expect(devices.bulb.updateOta).toHaveBeenNthCalledWith(
            1,
            {url: "https://example.com/myremote.ota", downgrade: false},
            undefined,
            undefined,
            {},
            expect.any(Function),
            {baseSize: 50, requestTimeout: 150000, responseDelay: 250},
            undefined,
        );
        expect(devices.bulb.interview).toHaveBeenCalledTimes(1);

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "idle", installed_version: 2, latest_version: 2, latest_release_notes: null, latest_source: null}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/info", expect.any(String), {retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/definitions", expect.any(String), {retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/devices", expect.any(String), {retain: true});
    });

    it("updates with hex payload", async () => {
        const now = 123401234;
        vi.setSystemTime(now);
        const genFileName = `${devices.bulb.ieeeAddr}_${now}`;
        const saveFilePath = join(data.mockDir, "ota", genFileName);

        devices.bulb.updateOta.mockImplementationOnce(
            async (_source, _requestPayload, _requestTsn, _extraMetas, _onProgress, _dataSettings, _endpoint) => {
                return await Promise.resolve([
                    {
                        ...DEFAULT_CURRENT,
                        fileVersion: 1,
                    },
                    {
                        ...DEFAULT_CURRENT,
                        fileVersion: 2,
                    },
                ]);
            },
        );

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/update", stringify({id: "bulb", hex: {data: "010203"}}));
        await flushPromises();
        await vi.advanceTimersByTimeAsync(5100);

        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(0);
        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(1);
        expect(devices.bulb.updateOta).toHaveBeenNthCalledWith(
            1,
            {url: saveFilePath, downgrade: false},
            undefined,
            undefined,
            {},
            expect.any(Function),
            {baseSize: 50, requestTimeout: 150000, responseDelay: 250},
            undefined,
        );
        expect(devices.bulb.interview).toHaveBeenCalledTimes(1);

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "idle", installed_version: 2, latest_version: 2, latest_release_notes: null, latest_source: null}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/info", expect.any(String), {retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/definitions", expect.any(String), {retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/devices", expect.any(String), {retain: true});
        expect(existsSync(saveFilePath)).toStrictEqual(true);
        expect(readFileSync(saveFilePath)).toStrictEqual(Buffer.from([0x01, 0x02, 0x03]));
    });

    it("updates with hex and file name payload", async () => {
        const saveFilePath = join(data.mockDir, "ota", "my.ota");

        devices.bulb.updateOta.mockImplementationOnce(
            async (_source, _requestPayload, _requestTsn, _extraMetas, _onProgress, _dataSettings, _endpoint) => {
                return await Promise.resolve([
                    {
                        ...DEFAULT_CURRENT,
                        fileVersion: 1,
                    },
                    {
                        ...DEFAULT_CURRENT,
                        fileVersion: 2,
                    },
                ]);
            },
        );

        mockMQTTEvents.message(
            "zigbee2mqtt/bridge/request/device/ota_update/update",
            stringify({id: "bulb", hex: {data: "010203", file_name: "my.ota"}}),
        );
        await flushPromises();
        await vi.advanceTimersByTimeAsync(5100);

        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(0);
        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(1);
        expect(devices.bulb.updateOta).toHaveBeenNthCalledWith(
            1,
            {url: saveFilePath, downgrade: false},
            undefined,
            undefined,
            {},
            expect.any(Function),
            {baseSize: 50, requestTimeout: 150000, responseDelay: 250},
            undefined,
        );
        expect(devices.bulb.interview).toHaveBeenCalledTimes(1);

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "idle", installed_version: 2, latest_version: 2, latest_release_notes: null, latest_source: null}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/info", expect.any(String), {retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/definitions", expect.any(String), {retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/devices", expect.any(String), {retain: true});
        expect(existsSync(saveFilePath)).toStrictEqual(true);
        expect(readFileSync(saveFilePath)).toStrictEqual(Buffer.from([0x01, 0x02, 0x03]));
    });

    it("updates with override data settings", async () => {
        devices.bulb.updateOta.mockImplementationOnce(
            async (_source, _requestPayload, _requestTsn, _extraMetas, _onProgress, _dataSettings, _endpoint) => {
                return await Promise.resolve([
                    {
                        ...DEFAULT_CURRENT,
                        fileVersion: 1,
                    },
                    {
                        ...DEFAULT_CURRENT,
                        fileVersion: 2,
                    },
                ]);
            },
        );

        mockMQTTEvents.message(
            "zigbee2mqtt/bridge/request/device/ota_update/update",
            stringify({id: "bulb", image_block_request_timeout: 200000, image_block_response_delay: 50, default_maximum_data_size: 64}),
        );
        await flushPromises();
        await vi.advanceTimersByTimeAsync(5100);

        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(0);
        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(1);
        expect(devices.bulb.updateOta).toHaveBeenNthCalledWith(
            1,
            {downgrade: false},
            undefined,
            undefined,
            {},
            expect.any(Function),
            {baseSize: 64, requestTimeout: 200000, responseDelay: 50},
            undefined,
        );
        expect(devices.bulb.interview).toHaveBeenCalledTimes(1);

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "idle", installed_version: 2, latest_version: 2, latest_release_notes: null, latest_source: null}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/info", expect.any(String), {retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/definitions", expect.any(String), {retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/devices", expect.any(String), {retain: true});
    });

    it("schedules with hex payload", async () => {
        const now = 123401234;
        vi.setSystemTime(now);
        const genFileName = `${devices.bulb.ieeeAddr}_${now}`;
        const saveFilePath = join(data.mockDir, "ota", genFileName);

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/schedule", stringify({id: "bulb", hex: {data: "010203"}}));
        await flushPromises();

        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(0);
        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(0);
        expect(devices.bulb.scheduleOta).toHaveBeenCalledTimes(1);
        expect(devices.bulb.scheduleOta).toHaveBeenNthCalledWith(1, {url: saveFilePath, downgrade: false});

        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(1, "zigbee2mqtt/bulb", stringify({update: {state: "scheduled"}}), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            2,
            "zigbee2mqtt/bridge/response/device/ota_update/schedule",
            stringify({data: {id: "bulb", url: saveFilePath}, status: "ok"}),
            {},
        );
        expect(devices.bulb.scheduledOta).toStrictEqual({url: saveFilePath, downgrade: false});
        expect(existsSync(saveFilePath)).toStrictEqual(true);
        expect(readFileSync(saveFilePath)).toStrictEqual(Buffer.from([0x01, 0x02, 0x03]));

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/unschedule", stringify({id: "bulb"}));
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(3, "zigbee2mqtt/bulb", stringify({update: {state: "idle"}}), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            4,
            "zigbee2mqtt/bridge/response/device/ota_update/unschedule",
            stringify({data: {id: "bulb"}, status: "ok"}),
            {},
        );
        expect(devices.bulb.scheduledOta).toStrictEqual(undefined);
        expect(existsSync(saveFilePath)).toStrictEqual(false);
    });

    it("schedules with hex and file name payload", async () => {
        const saveFilePath = join(data.mockDir, "ota", "my.ota");

        mockMQTTEvents.message(
            "zigbee2mqtt/bridge/request/device/ota_update/schedule",
            stringify({id: "bulb", hex: {data: "010203", file_name: "my.ota"}}),
        );
        await flushPromises();

        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(0);
        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(0);
        expect(devices.bulb.scheduleOta).toHaveBeenCalledTimes(1);
        expect(devices.bulb.scheduleOta).toHaveBeenNthCalledWith(1, {url: saveFilePath, downgrade: false});

        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(1, "zigbee2mqtt/bulb", stringify({update: {state: "scheduled"}}), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            2,
            "zigbee2mqtt/bridge/response/device/ota_update/schedule",
            stringify({data: {id: "bulb", url: saveFilePath}, status: "ok"}),
            {},
        );
        expect(devices.bulb.scheduledOta).toStrictEqual({url: saveFilePath, downgrade: false});
        expect(existsSync(saveFilePath)).toStrictEqual(true);
        expect(readFileSync(saveFilePath)).toStrictEqual(Buffer.from([0x01, 0x02, 0x03]));

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/unschedule", stringify({id: "bulb"}));
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(3, "zigbee2mqtt/bulb", stringify({update: {state: "idle"}}), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            4,
            "zigbee2mqtt/bridge/response/device/ota_update/unschedule",
            stringify({data: {id: "bulb"}, status: "ok"}),
            {},
        );
        expect(devices.bulb.scheduledOta).toStrictEqual(undefined);
        expect(existsSync(saveFilePath)).toStrictEqual(false);
    });

    it("handles when OTA update fails", async () => {
        devices.bulb.endpoints[0].read.mockImplementation(() => {
            return {swBuildId: 1, dateCode: "2019010"};
        });
        devices.bulb.save.mockClear();
        devices.bulb.updateOta.mockRejectedValueOnce(new Error("Update failed"));

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/update", stringify({id: "bulb"}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb", stringify({update: {state: "available"}}), {retain: true, qos: 0});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/update",
            stringify({data: {}, status: "error", error: "OTA update of 'bulb' failed (Update failed)"}),
            {},
        );
    });

    it("handles when OTA update returns no image available", async () => {
        devices.bulb.endpoints[0].read.mockImplementation(() => {
            return {swBuildId: 1, dateCode: "2019010"};
        });
        devices.bulb.save.mockClear();
        devices.bulb.updateOta.mockResolvedValueOnce([{fieldControl: 0, fileVersion: 1, manufacturerCode: 1, imageType: 1}, undefined]);

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/update", stringify({id: "bulb"}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {installed_version: 1, latest_version: 1, latest_release_notes: null, latest_source: null, state: "idle"}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/update",
            stringify({data: {}, status: "error", error: "Update of 'bulb' failed (No image currently available)"}),
            {},
        );
    });

    it("is able to check if OTA update is available", async () => {
        devices.bulb.checkOta.mockResolvedValueOnce({available: false, current: {...DEFAULT_CURRENT, fileVersion: 10}});
        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/check", stringify({id: "bulb"}));
        await flushPromises();
        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(1);
        expect(devices.bulb.checkOta).toHaveBeenNthCalledWith(1, {downgrade: false}, undefined, {});
        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/check",
            stringify({data: {id: "bulb", update_available: false, downgrade: false}, status: "ok"}),
            {},
        );

        mockMQTTPublishAsync.mockClear();
        devices.bulb.checkOta.mockResolvedValueOnce({
            available: true,
            current: {...DEFAULT_CURRENT, fileVersion: 10},
            availableMeta: {...DEFAULT_AVAILABLE_META, fileVersion: 12},
        });
        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/check", stringify({id: "bulb"}));
        await flushPromises();
        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(2);
        expect(devices.bulb.checkOta).toHaveBeenNthCalledWith(2, {downgrade: false}, undefined, {});
        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/check",
            stringify({data: {id: "bulb", update_available: true, downgrade: false, source: "https://example.com/my.ota"}, status: "ok"}),
            {},
        );
        devices.bulb.checkOta.mockResolvedValueOnce({available: false, current: {...DEFAULT_CURRENT, fileVersion: 10}});
        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/check/downgrade", stringify({id: "bulb"}));
        await flushPromises();
        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(3);
        expect(devices.bulb.checkOta).toHaveBeenNthCalledWith(3, {downgrade: true}, undefined, {});
        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/check",
            stringify({data: {id: "bulb", update_available: false, downgrade: true}, status: "ok"}),
            {},
        );

        // @ts-expect-error private
        const device = controller.zigbee.resolveDevice(devices.bulb.ieeeAddr)!;
        const originalDefinition = device.definition;
        device.definition = Object.assign({}, originalDefinition, {ota: {modelId: "dragons"}});

        mockMQTTPublishAsync.mockClear();
        devices.bulb.checkOta.mockResolvedValueOnce({
            available: true,
            current: {...DEFAULT_CURRENT, fileVersion: 10},
            availableMeta: {...DEFAULT_AVAILABLE_META, fileVersion: 8},
        });
        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/check/downgrade", stringify({id: "bulb"}));
        await flushPromises();
        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(4);
        expect(devices.bulb.checkOta).toHaveBeenNthCalledWith(4, {downgrade: true}, undefined, {modelId: "dragons"});
        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/check",
            stringify({data: {id: "bulb", update_available: true, downgrade: true, source: "https://example.com/my.ota"}, status: "ok"}),
            {},
        );

        device.definition = originalDefinition;
    });

    it("handles if OTA update check fails", async () => {
        devices.bulb.checkOta.mockRejectedValueOnce(new Error("RF signals disturbed because of dogs barking"));

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/check", stringify({id: "bulb"}));
        await flushPromises();
        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(1);
        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/check",
            stringify({
                data: {},
                status: "error",
                error: `Failed to check if OTA update available for 'bulb' (RF signals disturbed because of dogs barking)`,
            }),
            {},
        );
    });

    it("fails when device does not exist", async () => {
        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/check", stringify({id: "not_existing_deviceooo"}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/check",
            stringify({data: {}, status: "error", error: `Device 'not_existing_deviceooo' does not exist`}),
            {},
        );
    });

    it.each(["check", "update", "schedule"])("does not OTA %s when device does not support it", async (api) => {
        mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${api}`, stringify({id: "dimmer_wall_switch"}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            `zigbee2mqtt/bridge/response/device/ota_update/${api}`,
            stringify({data: {}, status: "error", error: `Device 'dimmer_wall_switch' does not support OTA updates`}),
            {},
        );
    });

    it("allows check OTA with custom URL even when device does not support it", async () => {
        devices.HGZB04D.checkOta.mockResolvedValueOnce({
            available: true,
            current: {...DEFAULT_CURRENT, fileVersion: 10},
            availableMeta: {...DEFAULT_AVAILABLE_META, fileVersion: 14, releaseNotes: "New features"},
        });
        mockMQTTEvents.message(
            "zigbee2mqtt/bridge/request/device/ota_update/check",
            stringify({id: "dimmer_wall_switch", url: "https://example.com/myindex.json"}),
        );
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/check",
            stringify({
                data: {
                    id: "dimmer_wall_switch",
                    update_available: true,
                    downgrade: false,
                    source: "https://example.com/my.ota",
                    release_notes: "New features",
                },
                status: "ok",
            }),
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
            devices.bulb.checkOta.mockImplementationOnce(async () => {
                return await new Promise((resolve) => {
                    setTimeout(
                        () =>
                            resolve({
                                available: false,
                                current: {...DEFAULT_CURRENT, fileVersion: 1},
                            }),
                        99999,
                    );
                });
            });
        } else {
            devices.bulb.updateOta.mockImplementationOnce(async () => {
                return await new Promise((resolve) => {
                    setTimeout(
                        () =>
                            resolve([
                                {...DEFAULT_CURRENT, fileVersion: 1},
                                {...DEFAULT_CURRENT, fileVersion: 10},
                            ]),
                        99999,
                    );
                });
            });
        }

        mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${type.includes("schedule") ? "check" : type}`, stringify({id: "bulb"}));
        await flushPromises();
        mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${type}`, stringify({id: "bulb"}));
        await flushPromises();

        if (type.includes("schedule") || type.includes("check")) {
            expect(devices.bulb.checkOta).toHaveBeenCalledTimes(1);
        } else {
            expect(devices.bulb.updateOta).toHaveBeenCalledTimes(1);
        }

        await vi.runOnlyPendingTimersAsync();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            `zigbee2mqtt/bridge/response/device/ota_update/${type.replace("/downgrade", "")}`,
            stringify({data: {}, status: "error", error: `OTA update or check for update already in progress for 'bulb'`}),
            {},
        );
    });

    it("does not crash when read modelID before/after OTA update fails", async () => {
        devices.bulb.endpoints[0].read
            .mockRejectedValueOnce("Failed from")
            .mockResolvedValueOnce({}) // configure
            .mockRejectedValueOnce("Failed to")
            .mockResolvedValueOnce({}); // configure
        devices.bulb.updateOta.mockResolvedValueOnce([
            {...DEFAULT_CURRENT, fileVersion: 1},
            {...DEFAULT_CURRENT, fileVersion: 2},
        ]);

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/update", stringify({id: "bulb"}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/response/device/ota_update/update",
            stringify({data: {id: "bulb", from: {file_version: 1}, to: {file_version: 2}}, status: "ok"}),
            {},
        );
    });

    it("checks for update when device requests it", async () => {
        const data = {imageType: 12382, manufacturerCode: 2134, fileVersion: 33};
        devices.bulb.checkOta.mockResolvedValueOnce({
            available: true,
            current: {...DEFAULT_CURRENT, ...data},
            availableMeta: {...DEFAULT_AVAILABLE_META, fileVersion: 34},
        });
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
        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(1);
        expect(devices.bulb.checkOta).toHaveBeenCalledWith({downgrade: false}, {...data}, {}, devices.bulb.endpoints[0]);
        expect(mockLogger.info).toHaveBeenCalledWith(`OTA update available for 'bulb'`);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledWith("genOta", "queryNextImageResponse", {status: 0x98}, undefined, 10);

        // Should not request again when device asks again after a short time
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(1);

        mockLogger.info.mockClear();
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(mockLogger.info).not.toHaveBeenCalledWith(`Update available for 'bulb'`);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({
                update: {
                    state: "available",
                    installed_version: 33,
                    latest_version: 34,
                    latest_release_notes: null,
                    latest_source: "https://example.com/my.ota",
                },
            }),
            {retain: true, qos: 0},
        );
    });

    it("responds with NO_IMAGE_AVAILABLE when update available request fails", async () => {
        const data = {imageType: 12382, manufacturerCode: 2134, fileVersion: 33};
        devices.bulb.checkOta.mockRejectedValueOnce("Nothing to find here");
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
        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(1);
        expect(devices.bulb.checkOta).toHaveBeenCalledWith({downgrade: false}, {...data}, {}, devices.bulb.endpoints[0]);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledWith("genOta", "queryNextImageResponse", {status: 0x98}, undefined, 10);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb", stringify({update: {state: "idle"}}), {retain: true, qos: 0});
    });

    it("checks for update when device requests it and it is not available", async () => {
        const data = {imageType: 12382, manufacturerCode: 2134, fileVersion: 33};
        devices.bulb.checkOta.mockResolvedValueOnce({
            available: false,
            current: {...DEFAULT_CURRENT, ...data},
            availableMeta: {...DEFAULT_AVAILABLE_META, fileVersion: 33},
        });
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
        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(1);
        expect(devices.bulb.checkOta).toHaveBeenCalledWith({downgrade: false}, {...data}, {}, devices.bulb.endpoints[0]);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledWith("genOta", "queryNextImageResponse", {status: 0x98}, undefined, 10);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({
                update: {
                    state: "idle",
                    installed_version: 33,
                    latest_version: 33,
                    latest_release_notes: null,
                    latest_source: "https://example.com/my.ota",
                },
            }),
            {retain: true, qos: 0},
        );
    });

    it("does not check for update when device requests it and disable_automatic_update_check is set to true", async () => {
        settings.set(["ota", "disable_automatic_update_check"], true);
        const data = {imageType: 12382, manufacturerCode: 2134, fileVersion: 33};
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
        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(0);
    });

    it("does not check for update when device requests it and device disable_automatic_update_check is set to true", async () => {
        settings.set(["devices", "0x000b57fffec6a5b2", "disable_automatic_update_check"], true);
        const data = {imageType: 12382, manufacturerCode: 2134, fileVersion: 33};
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
        expect(devices.bulb.checkOta).toHaveBeenCalledTimes(0);
    });

    it.each(["schedule", "schedule/downgrade"])("schedules and performs an update with topic %s", async (type) => {
        const downgrade = type === "schedule/downgrade";

        if (downgrade) {
            settings.set(["ota", "disable_automatic_update_check"], true); // coverage, scheduling not affected by this
        }

        const data = {imageType: 12382, manufacturerCode: 2134, fileVersion: 1};
        devices.bulb.updateOta.mockImplementationOnce(
            async (source, _requestPayload, _requestTsn, _extraMetas, onProgress, _dataSettings, _endpoint) => {
                expect(source).toStrictEqual(undefined); // scheduled

                onProgress(0, 36000.5678);
                onProgress(10, 3600.2123);
                return await Promise.resolve([
                    {
                        ...DEFAULT_CURRENT,
                        ...data,
                        fileVersion: 1,
                    },
                    {
                        ...DEFAULT_CURRENT,
                        ...data,
                        fileVersion: 2,
                    },
                ]);
            },
        );
        mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${type}`, stringify({id: "bulb"}));
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
        await vi.advanceTimersByTimeAsync(5100);

        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(1);

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb", stringify({update: {state: "scheduled"}}), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "updating", progress: 0, remaining: 36001}}),
            {
                retain: true,
                qos: 0,
            },
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "updating", progress: 10, remaining: 3600}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({update: {state: "idle", installed_version: 2, latest_version: 2, latest_release_notes: null, latest_source: null}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/devices", expect.any(String), {retain: true});
    });

    it("schedules and cancels an update when no image available", async () => {
        const data = {imageType: 12382, manufacturerCode: 2134, fileVersion: 1};
        devices.bulb.updateOta.mockResolvedValueOnce([{...DEFAULT_CURRENT, ...data}, undefined]);

        mockMQTTEvents.message(
            "zigbee2mqtt/bridge/request/device/ota_update/schedule",
            stringify({id: "bulb", url: "https://example.com/mycustom.ota"}),
        );
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(1, "zigbee2mqtt/bulb", stringify({update: {state: "scheduled"}}), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            2,
            "zigbee2mqtt/bridge/response/device/ota_update/schedule",
            stringify({data: {id: "bulb", url: "https://example.com/mycustom.ota"}, status: "ok"}),
            {},
        );

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

        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            3,
            "zigbee2mqtt/bulb",
            stringify({update: {state: "idle", installed_version: 1, latest_version: 1, latest_release_notes: null, latest_source: null}}),
            {retain: true, qos: 0},
        );
    });

    it("schedules and re-schedules an update when failed", async () => {
        const data = {imageType: 12382, manufacturerCode: 2134, fileVersion: 1};
        devices.bulb.updateOta
            .mockRejectedValueOnce("Update failed")
            .mockImplementationOnce(async (source, _requestPayload, _requestTsn, _extraMetas, onProgress, _dataSettings, _endpoint) => {
                expect(source).toStrictEqual(undefined); // scheduled

                onProgress(0, 36000.5678);
                onProgress(10, 3600.2123);
                return await Promise.resolve([
                    {
                        ...DEFAULT_CURRENT,
                        ...data,
                        fileVersion: 1,
                    },
                    {
                        ...DEFAULT_CURRENT,
                        ...data,
                        fileVersion: 2,
                    },
                ]);
            });

        mockMQTTEvents.message(
            "zigbee2mqtt/bridge/request/device/ota_update/schedule",
            stringify({id: "bulb", url: "https://example.com/mycustom.ota"}),
        );
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(1, "zigbee2mqtt/bulb", stringify({update: {state: "scheduled"}}), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            2,
            "zigbee2mqtt/bridge/response/device/ota_update/schedule",
            stringify({data: {id: "bulb", url: "https://example.com/mycustom.ota"}, status: "ok"}),
            {},
        );

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

        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(3, "zigbee2mqtt/bulb", stringify({update: {state: "scheduled"}}), {
            retain: true,
            qos: 0,
        });

        await mockZHEvents.message(payload);
        await flushPromises();
        await vi.advanceTimersByTimeAsync(5100);

        expect(devices.bulb.updateOta).toHaveBeenCalledTimes(2);
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            4,
            "zigbee2mqtt/bulb",
            stringify({update: {state: "updating", progress: 0, remaining: 36001}}),
            {
                retain: true,
                qos: 0,
            },
        );
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            5,
            "zigbee2mqtt/bulb",
            stringify({update: {state: "updating", progress: 10, remaining: 3600}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            6,
            "zigbee2mqtt/bulb",
            stringify({update: {state: "idle", installed_version: 2, latest_version: 2, latest_release_notes: null, latest_source: null}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(7, "zigbee2mqtt/bridge/devices", expect.any(String), {retain: true});
    });

    it("overwrites current schedule on re-schedule", async () => {
        for (const [type, overwriteType] of [
            ["schedule", "schedule/downgrade"],
            ["schedule/downgrade", "schedule"],
        ]) {
            mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${type}`, stringify({id: "bulb"}));
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
            expect(devices.bulb.scheduledOta).toStrictEqual({downgrade: type.includes("downgrade")});

            mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${overwriteType}`, stringify({id: "bulb"}));
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
            expect(devices.bulb.scheduledOta).toStrictEqual({downgrade: overwriteType.includes("downgrade")});
        }
    });

    it.each(["schedule", "schedule/downgrade"])("unschedules", async (type) => {
        mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${type}`, stringify({id: "bulb"}));
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

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/unschedule", stringify({id: "bulb"}));
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(3, "zigbee2mqtt/bulb", stringify({update: {state: "idle"}}), {retain: true, qos: 0});

        expect(mockMQTTPublishAsync).toHaveBeenNthCalledWith(
            4,
            "zigbee2mqtt/bridge/response/device/ota_update/unschedule",
            stringify({data: {id: "bulb"}, status: "ok"}),
            {},
        );
        expect(devices.bulb.scheduledOta).toStrictEqual(undefined);
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
        const setOtaConfigurationSpy = vi.spyOn(zh, "setOtaConfiguration");
        settings.set(["ota", "zigbee_ota_override_index_location"], "local.index.json");
        await resetExtension();
        expect(setOtaConfigurationSpy).toHaveBeenCalledWith(data.mockDir, "local.index.json");
        setOtaConfigurationSpy.mockClear();

        settings.set(["ota", "zigbee_ota_override_index_location"], "http://my.site/index.json");
        await resetExtension();
        expect(setOtaConfigurationSpy).toHaveBeenCalledWith(data.mockDir, "http://my.site/index.json");
        setOtaConfigurationSpy.mockClear();
    });

    it("uses given configuration when updating", async () => {
        settings.set(["ota", "image_block_request_timeout"], 1500000);
        settings.set(["ota", "image_block_response_delay"], 10000);
        settings.set(["ota", "default_maximum_data_size"], 10);
        await resetExtension();

        devices.bulb.updateOta.mockResolvedValueOnce([
            {...DEFAULT_CURRENT, fileVersion: 1},
            {...DEFAULT_CURRENT, fileVersion: 2},
        ]);

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/update", stringify({id: "bulb"}));
        await flushPromises();

        expect(devices.bulb.updateOta).toHaveBeenCalledWith(
            {downgrade: false},
            undefined,
            undefined,
            {},
            expect.any(Function),
            {
                responseDelay: 10000,
                baseSize: 10,
                requestTimeout: 1500000,
            },
            undefined,
        );

        settings.set(["ota", "image_block_request_timeout"], 50000);
        settings.set(["ota", "image_block_response_delay"], 50);
        settings.set(["ota", "default_maximum_data_size"], 100);
        await resetExtension();

        devices.bulb.updateOta.mockResolvedValueOnce([
            {...DEFAULT_CURRENT, fileVersion: 1},
            {...DEFAULT_CURRENT, fileVersion: 2},
        ]);

        mockMQTTEvents.message("zigbee2mqtt/bridge/request/device/ota_update/update", stringify({id: "bulb"}));
        await flushPromises();

        expect(devices.bulb.updateOta).toHaveBeenCalledWith(
            {downgrade: false},
            undefined,
            undefined,
            {},
            expect.any(Function),
            {
                responseDelay: 50,
                baseSize: 100,
                requestTimeout: 50000,
            },
            undefined,
        );
    });

    it("clear update state on startup", async () => {
        const device = controller.zigbee.resolveEntity(devices.bulb_color.ieeeAddr);
        controller.state.set(device, {update: {progress: 100, remaining: 10, state: "updating"}});
        await resetExtension();
        expect(controller.state.get(device)).toStrictEqual({update: {state: "idle"}});
    });

    it("[DEPRECATED] handles message as device id string", async () => {
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
    });

    it.each(["check", "update", "schedule"])("[DEPRECATED] does not OTA %s when device does not support it", async (api) => {
        mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${api}`, "dimmer_wall_switch");
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            `zigbee2mqtt/bridge/response/device/ota_update/${api}`,
            stringify({data: {}, status: "error", error: `Device 'dimmer_wall_switch' does not support OTA updates`}),
            {},
        );
    });
});
