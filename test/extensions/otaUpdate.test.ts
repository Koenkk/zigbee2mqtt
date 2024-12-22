import * as data from '../mocks/data';
import {mockLogger} from '../mocks/logger';
import {events as mockMQTTEvents, mockMQTTPublishAsync} from '../mocks/mqtt';
import * as mockSleep from '../mocks/sleep';
import {flushPromises} from '../mocks/utils';
import {devices, events as mockZHEvents} from '../mocks/zigbeeHerdsman';

import path from 'node:path';

import stringify from 'json-stable-stringify-without-jsonify';
import OTAUpdate from 'lib/extension/otaUpdate';

import * as zhc from 'zigbee-herdsman-converters';

import {Controller} from '../../lib/controller';
import * as settings from '../../lib/util/settings';

const mocksClear = [mockMQTTPublishAsync, devices.bulb.save, mockLogger.info];

const DEFAULT_CONFIG: zhc.Ota.Settings = {
    dataDir: data.mockDir,
    imageBlockResponseDelay: 250,
    defaultMaximumDataSize: 50,
};

describe('Extension: OTAUpdate', () => {
    let controller: Controller;
    const updateSpy = vi.spyOn(zhc.ota, 'update');
    const isUpdateAvailableSpy = vi.spyOn(zhc.ota, 'isUpdateAvailable');

    const resetExtension = async (): Promise<void> => {
        await controller.enableDisableExtension(false, 'OTAUpdate');
        await controller.enableDisableExtension(true, 'OTAUpdate');
    };

    beforeAll(async () => {
        vi.useFakeTimers();
        mockSleep.mock();
        data.writeDefaultConfiguration();
        settings.reRead();
        settings.reRead();
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        await flushPromises();
    });

    afterAll(async () => {
        mockSleep.restore();
        vi.useRealTimers();
    });

    beforeEach(async () => {
        zhc.ota.setConfiguration(DEFAULT_CONFIG);
        // @ts-expect-error private
        const extension: OTAUpdate = controller.extensions.find((e) => e.constructor.name === 'OTAUpdate');
        // @ts-expect-error private
        extension.lastChecked = {};
        // @ts-expect-error private
        extension.inProgress = new Set();
        mocksClear.forEach((m) => m.mockClear());
        devices.bulb.mockClear();
        updateSpy.mockClear();
        isUpdateAvailableSpy.mockClear();
        // @ts-expect-error private
        controller.state.state = {};
    });

    afterEach(async () => {
        settings.set(['ota', 'disable_automatic_update_check'], false);
    });

    it.each(['update', 'update/downgrade'])('Should OTA update a device with topic %s', async (type) => {
        const downgrade = type === 'update/downgrade';
        let count = 10;
        devices.bulb.endpoints[0].read.mockImplementation(() => {
            if (downgrade) {
                count--;
            } else {
                count++;
            }

            return {swBuildId: count, dateCode: `201901${count}`};
        });
        updateSpy.mockImplementationOnce(async (device, extraMetas, previous, onProgress) => {
            expect(previous).toStrictEqual(downgrade);

            onProgress(0, undefined);
            onProgress(10, 3600.2123);
            return 90;
        });

        mockMQTTEvents.message(`zigbee2mqtt/bridge/request/device/ota_update/${type}`, 'bulb');
        await flushPromises();
        const fromSwBuildId = 10 + (downgrade ? -1 : +1);
        const toSwBuildId = 10 + (downgrade ? -2 : +2);
        const fromDateCode = `201901${fromSwBuildId}`;
        const toDateCode = `201901${toSwBuildId}`;
        expect(mockLogger.info).toHaveBeenCalledWith(`Updating 'bulb' to ${downgrade ? 'previous' : 'latest'} firmware`);
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(0);
        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledWith(devices.bulb, {}, downgrade, expect.any(Function));
        expect(mockLogger.info).toHaveBeenCalledWith(`Update of 'bulb' at 0.00%`);
        expect(mockLogger.info).toHaveBeenCalledWith(`Update of 'bulb' at 10.00%, ≈ 60 minutes remaining`);
        expect(mockLogger.info).toHaveBeenCalledWith(`Finished update of 'bulb'`);
        // note this is a lambda for `info`, so go down to `log` call to get actual message
        expect(mockLogger.log).toHaveBeenCalledWith(
            'info',
            `Device 'bulb' was updated from '{"dateCode":"${fromDateCode}","softwareBuildID":${fromSwBuildId}}' to '{"dateCode":"${toDateCode}","softwareBuildID":${toSwBuildId}}'`,
            'z2m',
        );
        expect(devices.bulb.save).toHaveBeenCalledTimes(1);
        expect(devices.bulb.endpoints[0].read).toHaveBeenCalledWith('genBasic', ['dateCode', 'swBuildId'], {sendPolicy: 'immediate'});
        expect(devices.bulb.endpoints[0].read).toHaveBeenCalledWith('genBasic', ['dateCode', 'swBuildId'], {sendPolicy: undefined});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/bulb', stringify({update: {state: 'updating', progress: 0}}), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({update: {state: 'updating', progress: 10, remaining: 3600}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({update: {state: 'idle', installed_version: 90, latest_version: 90}}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/update',
            stringify({
                data: {
                    from: {date_code: fromDateCode, software_build_id: fromSwBuildId},
                    id: 'bulb',
                    to: {date_code: toDateCode, software_build_id: toSwBuildId},
                },
                status: 'ok',
            }),
            {retain: false, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0});
    });

    it('Should handle when OTA update fails', async () => {
        devices.bulb.endpoints[0].read.mockImplementation(() => {
            return {swBuildId: 1, dateCode: '2019010'};
        });
        devices.bulb.save.mockClear();
        updateSpy.mockRejectedValueOnce(new Error('Update failed'));

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/update', stringify({id: 'bulb'}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/bulb', stringify({update: {state: 'available'}}), {retain: true, qos: 0});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/update',
            stringify({data: {}, status: 'error', error: "Update of 'bulb' failed (Update failed)"}),
            {retain: false, qos: 0},
        );
    });

    it('Should be able to check if OTA update is available', async () => {
        isUpdateAvailableSpy.mockResolvedValueOnce({available: false, currentFileVersion: 10, otaFileVersion: 10});
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check', 'bulb');
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);
        expect(isUpdateAvailableSpy).toHaveBeenNthCalledWith(1, devices.bulb, {}, undefined, false);
        expect(updateSpy).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/check',
            stringify({data: {id: 'bulb', update_available: false}, status: 'ok'}),
            {retain: false, qos: 0},
        );

        mockMQTTPublishAsync.mockClear();
        isUpdateAvailableSpy.mockResolvedValueOnce({available: true, currentFileVersion: 10, otaFileVersion: 12});
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check', 'bulb');
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(2);
        expect(isUpdateAvailableSpy).toHaveBeenNthCalledWith(2, devices.bulb, {}, undefined, false);
        expect(updateSpy).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/check',
            stringify({data: {id: 'bulb', update_available: true}, status: 'ok'}),
            {retain: false, qos: 0},
        );
        isUpdateAvailableSpy.mockResolvedValueOnce({available: false, currentFileVersion: 10, otaFileVersion: 10});
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check/downgrade', 'bulb');
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(3);
        expect(isUpdateAvailableSpy).toHaveBeenNthCalledWith(3, devices.bulb, {}, undefined, true);
        expect(updateSpy).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/check',
            stringify({data: {id: 'bulb', update_available: false}, status: 'ok'}),
            {retain: false, qos: 0},
        );

        // @ts-expect-error private
        const device = controller.zigbee.resolveDevice(devices.bulb.ieeeAddr)!;
        const originalDefinition = device.definition;
        device.definition = Object.assign({}, originalDefinition, {ota: {suppressElementImageParseFailure: true}});

        mockMQTTPublishAsync.mockClear();
        isUpdateAvailableSpy.mockResolvedValueOnce({available: true, currentFileVersion: 10, otaFileVersion: 12});
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check/downgrade', 'bulb');
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(4);
        expect(isUpdateAvailableSpy).toHaveBeenNthCalledWith(4, devices.bulb, {suppressElementImageParseFailure: true}, undefined, true);
        expect(updateSpy).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/check',
            stringify({data: {id: 'bulb', update_available: true}, status: 'ok'}),
            {retain: false, qos: 0},
        );

        device.definition = originalDefinition;
    });

    it('Should handle if OTA update check fails', async () => {
        isUpdateAvailableSpy.mockRejectedValueOnce(new Error('RF signals disturbed because of dogs barking'));

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check', 'bulb');
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/check',
            stringify({
                data: {},
                status: 'error',
                error: `Failed to check if update available for 'bulb' (RF signals disturbed because of dogs barking)`,
            }),
            {retain: false, qos: 0},
        );
    });

    it('Should fail when device does not exist', async () => {
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check', 'not_existing_deviceooo');
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/check',
            stringify({data: {}, status: 'error', error: `Device 'not_existing_deviceooo' does not exist`}),
            {retain: false, qos: 0},
        );
    });

    it('Should not check for OTA when device does not support it', async () => {
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check', 'dimmer_wall_switch');
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/check',
            stringify({data: {}, status: 'error', error: `Device 'dimmer_wall_switch' does not support OTA updates`}),
            {retain: false, qos: 0},
        );
    });

    it('Should refuse to check/update when already in progress', async () => {
        isUpdateAvailableSpy.mockImplementationOnce(
            // @ts-expect-error mocked as needed
            async () => {
                await new Promise<void>((resolve) => {
                    setTimeout(() => resolve(), 99999);
                });
            },
        );
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check', 'bulb');
        await flushPromises();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check', 'bulb');
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);
        vi.runOnlyPendingTimers();
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/check',
            stringify({data: {}, status: 'error', error: `Update or check for update already in progress for 'bulb'`}),
            {retain: false, qos: 0},
        );
    });

    it('Shouldnt crash when read modelID before/after OTA update fails', async () => {
        devices.bulb.endpoints[0].read.mockRejectedValueOnce('Failed from').mockRejectedValueOnce('Failed to');
        updateSpy.mockImplementationOnce(vi.fn());

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/update', 'bulb');
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/update',
            stringify({data: {id: 'bulb', from: undefined, to: undefined}, status: 'ok'}),
            {retain: false, qos: 0},
        );
    });

    it('Should check for update when device requests it', async () => {
        const data = {imageType: 12382};
        isUpdateAvailableSpy.mockResolvedValueOnce({available: true, currentFileVersion: 10, otaFileVersion: 12});
        const payload = {
            data,
            cluster: 'genOta',
            device: devices.bulb,
            endpoint: devices.bulb.getEndpoint(1)!,
            type: 'commandQueryNextImageRequest',
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
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledWith('genOta', 'queryNextImageResponse', {status: 0x98}, undefined, 10);

        // Should not request again when device asks again after a short time
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);

        mockLogger.info.mockClear();
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(mockLogger.info).not.toHaveBeenCalledWith(`Update available for 'bulb'`);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({update: {state: 'available', installed_version: 10, latest_version: 12}}),
            {retain: true, qos: 0},
        );
    });

    it('Should respond with NO_IMAGE_AVAILABLE when update available request fails', async () => {
        const data = {imageType: 12382};
        isUpdateAvailableSpy.mockRejectedValueOnce('Nothing to find here');
        const payload = {
            data,
            cluster: 'genOta',
            device: devices.bulb,
            endpoint: devices.bulb.getEndpoint(1)!,
            type: 'commandQueryNextImageRequest',
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 10},
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);
        expect(isUpdateAvailableSpy).toHaveBeenCalledWith(devices.bulb, {}, {imageType: 12382}, false);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledWith('genOta', 'queryNextImageResponse', {status: 0x98}, undefined, 10);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/bulb', stringify({update: {state: 'idle'}}), {retain: true, qos: 0});
    });

    it('Should check for update when device requests it and it is not available', async () => {
        const data = {imageType: 12382};
        isUpdateAvailableSpy.mockResolvedValueOnce({available: false, currentFileVersion: 13, otaFileVersion: 13});
        const payload = {
            data,
            cluster: 'genOta',
            device: devices.bulb,
            endpoint: devices.bulb.getEndpoint(1)!,
            type: 'commandQueryNextImageRequest',
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 10},
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);
        expect(isUpdateAvailableSpy).toHaveBeenCalledWith(devices.bulb, {}, {imageType: 12382}, false);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledWith('genOta', 'queryNextImageResponse', {status: 0x98}, undefined, 10);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({update: {state: 'idle', installed_version: 13, latest_version: 13}}),
            {retain: true, qos: 0},
        );
    });

    it('Should not check for update when device requests it and disable_automatic_update_check is set to true', async () => {
        settings.set(['ota', 'disable_automatic_update_check'], true);
        const data = {imageType: 12382};
        isUpdateAvailableSpy.mockResolvedValueOnce({available: true, currentFileVersion: 10, otaFileVersion: 13});
        const payload = {
            data,
            cluster: 'genOta',
            device: devices.bulb,
            endpoint: devices.bulb.getEndpoint(1)!,
            type: 'commandQueryNextImageRequest',
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 10},
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(0);
    });

    it('Should respond with NO_IMAGE_AVAILABLE when not supporting OTA', async () => {
        const device = devices.HGZB04D;
        const data = {imageType: 12382};
        const payload = {
            data,
            cluster: 'genOta',
            device,
            endpoint: device.getEndpoint(1)!,
            type: 'commandQueryNextImageRequest',
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 10},
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(device.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(device.endpoints[0].commandResponse).toHaveBeenCalledWith('genOta', 'queryNextImageResponse', {status: 152}, undefined, 10);
    });

    it('Should respond with NO_IMAGE_AVAILABLE when not supporting OTA and device has no OTA endpoint to standard endpoint', async () => {
        const device = devices.SV01;
        const data = {imageType: 12382};
        const payload = {
            data,
            cluster: 'genOta',
            device,
            endpoint: device.getEndpoint(1)!,
            type: 'commandQueryNextImageRequest',
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 10},
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(device.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(device.endpoints[0].commandResponse).toHaveBeenCalledWith('genOta', 'queryNextImageResponse', {status: 152}, undefined, 10);
    });

    it('Sets given configuration', async () => {
        const setConfiguration = vi.spyOn(zhc.ota, 'setConfiguration');
        settings.set(['ota', 'zigbee_ota_override_index_location'], 'local.index.json');
        settings.set(['ota', 'image_block_response_delay'], 10000);
        settings.set(['ota', 'default_maximum_data_size'], 10);
        await resetExtension();
        expect(setConfiguration).toHaveBeenCalledWith({
            ...DEFAULT_CONFIG,
            overrideIndexLocation: path.join(data.mockDir, 'local.index.json'),
            imageBlockResponseDelay: 10000,
            defaultMaximumDataSize: 10,
        });
        setConfiguration.mockClear();

        settings.set(['ota', 'zigbee_ota_override_index_location'], 'http://my.site/index.json');
        settings.set(['ota', 'image_block_response_delay'], 50);
        settings.set(['ota', 'default_maximum_data_size'], 100);
        await resetExtension();
        expect(setConfiguration).toHaveBeenCalledWith({
            ...DEFAULT_CONFIG,
            overrideIndexLocation: 'http://my.site/index.json',
            imageBlockResponseDelay: 50,
            defaultMaximumDataSize: 100,
        });
        setConfiguration.mockClear();
    });

    it('Clear update state on startup', async () => {
        // @ts-expect-error private
        const device = controller.zigbee.resolveEntity(devices.bulb_color.ieeeAddr);
        // @ts-expect-error private
        controller.state.set(device, {update: {progress: 100, remaining: 10, state: 'updating'}});
        await resetExtension();
        // @ts-expect-error private
        expect(controller.state.get(device)).toStrictEqual({update: {state: 'available'}});
    });
});
