import * as data from '../mocks/data';
import {mockLogger} from '../mocks/logger';
import {mockMQTT, events as mockMQTTEvents} from '../mocks/mqtt';
import * as mockSleep from '../mocks/sleep';
import {flushPromises} from '../mocks/utils';
import {devices, events as mockZHEvents} from '../mocks/zigbeeHerdsman';

import path from 'path';

import stringify from 'json-stable-stringify-without-jsonify';
import OTAUpdate from 'lib/extension/otaUpdate';

import * as zhc from 'zigbee-herdsman-converters';
import {zigbeeOTA} from 'zigbee-herdsman-converters/lib/ota';

import {Controller} from '../../lib/controller';
import * as settings from '../../lib/util/settings';

const mocksClear = [mockMQTT.publish, devices.bulb.save, mockLogger.info];

describe('Extension: OTAUpdate', () => {
    let controller: Controller;
    let mapped: zhc.Definition;
    let updateToLatestSpy: jest.SpyInstance;
    let isUpdateAvailableSpy: jest.SpyInstance;

    const resetExtension = async (): Promise<void> => {
        await controller.enableDisableExtension(false, 'OTAUpdate');
        await controller.enableDisableExtension(true, 'OTAUpdate');
    };

    beforeAll(async () => {
        jest.useFakeTimers();
        mockSleep.mock();
        data.writeDefaultConfiguration();
        settings.reRead();
        settings.set(['ota', 'ikea_ota_use_test_url'], true);
        settings.reRead();
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        // @ts-expect-error minimal mock
        mapped = await zhc.findByDevice(devices.bulb);
        updateToLatestSpy = jest.spyOn(mapped.ota!, 'updateToLatest');
        isUpdateAvailableSpy = jest.spyOn(mapped.ota!, 'isUpdateAvailable');
        await flushPromises();
    });

    afterAll(async () => {
        mockSleep.restore();
        jest.useRealTimers();
    });

    beforeEach(async () => {
        // @ts-expect-error private
        const extension: OTAUpdate = controller.extensions.find((e) => e.constructor.name === 'OTAUpdate');
        // @ts-expect-error private
        extension.lastChecked = {};
        // @ts-expect-error private
        extension.inProgress = new Set();
        mocksClear.forEach((m) => m.mockClear());
        devices.bulb.save.mockClear();
        devices.bulb.endpoints[0].commandResponse.mockClear();
        updateToLatestSpy.mockClear();
        isUpdateAvailableSpy.mockClear();
        // @ts-expect-error private
        controller.state.state = {};
    });

    afterEach(async () => {
        settings.set(['ota', 'disable_automatic_update_check'], false);
    });

    it('Should OTA update a device', async () => {
        let count = 0;
        devices.bulb.endpoints[0].read.mockImplementation(() => {
            count++;
            return {swBuildId: count, dateCode: '2019010' + count};
        });
        updateToLatestSpy.mockImplementationOnce((device, onProgress) => {
            onProgress(0, null);
            onProgress(10, 3600.2123);
            return 90;
        });

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/update', 'bulb');
        await flushPromises();
        expect(mockLogger.info).toHaveBeenCalledWith(`Updating 'bulb' to latest firmware`);
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(0);
        expect(updateToLatestSpy).toHaveBeenCalledTimes(1);
        expect(updateToLatestSpy).toHaveBeenCalledWith(devices.bulb, expect.any(Function));
        expect(mockLogger.info).toHaveBeenCalledWith(`Update of 'bulb' at 0.00%`);
        expect(mockLogger.info).toHaveBeenCalledWith(`Update of 'bulb' at 10.00%, ≈ 60 minutes remaining`);
        expect(mockLogger.info).toHaveBeenCalledWith(`Finished update of 'bulb'`);
        expect(mockLogger.info).toHaveBeenCalledWith(
            `Device 'bulb' was updated from '{"dateCode":"20190101","softwareBuildID":1}' to '{"dateCode":"20190102","softwareBuildID":2}'`,
        );
        expect(devices.bulb.save).toHaveBeenCalledTimes(1);
        expect(devices.bulb.endpoints[0].read).toHaveBeenCalledWith('genBasic', ['dateCode', 'swBuildId'], {sendPolicy: 'immediate'});
        expect(devices.bulb.endpoints[0].read).toHaveBeenCalledWith('genBasic', ['dateCode', 'swBuildId'], {sendPolicy: undefined});
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({update: {state: 'updating', progress: 0}}),
            {retain: true, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({update: {state: 'updating', progress: 10, remaining: 3600}}),
            {retain: true, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({update: {state: 'idle', installed_version: 90, latest_version: 90}}),
            {retain: true, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/update',
            stringify({
                data: {from: {date_code: '20190101', software_build_id: 1}, id: 'bulb', to: {date_code: '20190102', software_build_id: 2}},
                status: 'ok',
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0}, expect.any(Function));
    });

    it('Should handle when OTA update fails', async () => {
        devices.bulb.endpoints[0].read.mockImplementation(() => {
            return {swBuildId: 1, dateCode: '2019010'};
        });
        devices.bulb.save.mockClear();
        updateToLatestSpy.mockImplementationOnce(() => {
            throw new Error('Update failed');
        });

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/update', stringify({id: 'bulb'}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({update: {state: 'available'}}),
            {retain: true, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/update',
            stringify({data: {id: 'bulb'}, status: 'error', error: "Update of 'bulb' failed (Update failed)"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should be able to check if OTA update is available', async () => {
        isUpdateAvailableSpy.mockResolvedValueOnce({available: false, currentFileVersion: 10, otaFileVersion: 10});
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check', 'bulb');
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);
        expect(updateToLatestSpy).toHaveBeenCalledTimes(0);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/check',
            stringify({data: {id: 'bulb', update_available: false}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        mockMQTT.publish.mockClear();
        isUpdateAvailableSpy.mockResolvedValueOnce({available: true, currentFileVersion: 10, otaFileVersion: 12});
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check', 'bulb');
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(2);
        expect(updateToLatestSpy).toHaveBeenCalledTimes(0);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/check',
            stringify({data: {id: 'bulb', update_available: true}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should handle if OTA update check fails', async () => {
        isUpdateAvailableSpy.mockImplementationOnce(() => {
            throw new Error('RF signals disturbed because of dogs barking');
        });

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check', 'bulb');
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);
        expect(updateToLatestSpy).toHaveBeenCalledTimes(0);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/check',
            stringify({
                data: {id: 'bulb'},
                status: 'error',
                error: `Failed to check if update available for 'bulb' (RF signals disturbed because of dogs barking)`,
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should fail when device does not exist', async () => {
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check', 'not_existing_deviceooo');
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/check',
            stringify({data: {id: 'not_existing_deviceooo'}, status: 'error', error: `Device 'not_existing_deviceooo' does not exist`}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should not check for OTA when device does not support it', async () => {
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check', 'dimmer_wall_switch');
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/check',
            stringify({data: {id: 'dimmer_wall_switch'}, status: 'error', error: `Device 'dimmer_wall_switch' does not support OTA updates`}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should refuse to check/update when already in progress', async () => {
        isUpdateAvailableSpy.mockImplementationOnce(() => {
            return new Promise<void>((resolve) => {
                setTimeout(() => resolve(), 99999);
            });
        });
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check', 'bulb');
        await flushPromises();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/check', 'bulb');
        await flushPromises();
        expect(isUpdateAvailableSpy).toHaveBeenCalledTimes(1);
        jest.runOnlyPendingTimers();
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/check',
            stringify({data: {id: 'bulb'}, status: 'error', error: `Update or check for update already in progress for 'bulb'`}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Shouldnt crash when read modelID before/after OTA update fails', async () => {
        devices.bulb.endpoints[0].read.mockRejectedValueOnce('Failed from').mockRejectedValueOnce('Failed to');
        updateToLatestSpy.mockImplementation();

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/ota_update/update', 'bulb');
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/ota_update/update',
            stringify({data: {id: 'bulb', from: null, to: null}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
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
        expect(isUpdateAvailableSpy).toHaveBeenCalledWith(devices.bulb, {imageType: 12382});
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
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({update: {state: 'available', installed_version: 10, latest_version: 12}}),
            {retain: true, qos: 0},
            expect.any(Function),
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
        expect(isUpdateAvailableSpy).toHaveBeenCalledWith(devices.bulb, {imageType: 12382});
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledWith('genOta', 'queryNextImageResponse', {status: 0x98}, undefined, 10);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({update: {state: 'idle'}}),
            {retain: true, qos: 0},
            expect.any(Function),
        );
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
        expect(isUpdateAvailableSpy).toHaveBeenCalledWith(devices.bulb, {imageType: 12382});
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(devices.bulb.endpoints[0].commandResponse).toHaveBeenCalledWith('genOta', 'queryNextImageResponse', {status: 0x98}, undefined, 10);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({update: {state: 'idle', installed_version: 13, latest_version: 13}}),
            {retain: true, qos: 0},
            expect.any(Function),
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

    it('Set zigbee_ota_override_index_location', async () => {
        const spyUseIndexOverride = jest.spyOn(zigbeeOTA, 'useIndexOverride');
        settings.set(['ota', 'zigbee_ota_override_index_location'], 'local.index.json');
        await resetExtension();
        expect(spyUseIndexOverride).toHaveBeenCalledWith(path.join(data.mockDir, 'local.index.json'));
        spyUseIndexOverride.mockClear();

        settings.set(['ota', 'zigbee_ota_override_index_location'], 'http://my.site/index.json');
        await resetExtension();
        expect(spyUseIndexOverride).toHaveBeenCalledWith('http://my.site/index.json');
        spyUseIndexOverride.mockClear();
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
