import * as data from '../mocks/data';
import {mockLogger} from '../mocks/logger';
import {mockMQTTEndAsync, events as mockMQTTEvents, mockMQTTPublishAsync} from '../mocks/mqtt';
import {flushPromises} from '../mocks/utils';
import {devices, mockController as mockZHController, returnDevices} from '../mocks/zigbeeHerdsman';

import type Device from '../../lib/model/device';

import fs from 'node:fs';
import path from 'node:path';

import stringify from 'json-stable-stringify-without-jsonify';

import * as zhc from 'zigbee-herdsman-converters';

import {Controller} from '../../lib/controller';
import * as settings from '../../lib/util/settings';

const BASE_DIR = 'external_converters';

describe('Extension: ExternalConverters', () => {
    const mockBasePath = path.join(data.mockDir, BASE_DIR);
    let controller: Controller;

    const existsSyncSpy = vi.spyOn(fs, 'existsSync');
    const readdirSyncSpy = vi.spyOn(fs, 'readdirSync');
    const mkdirSyncSpy = vi.spyOn(fs, 'mkdirSync');
    const rmSyncSpy = vi.spyOn(fs, 'rmSync');
    const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync');

    const zhcAddDefinitionSpy = vi.spyOn(zhc, 'addDefinition');
    const zhcRemoveExternalDefinitionsSpy = vi.spyOn(zhc, 'removeExternalDefinitions');

    const mocksClear = [
        mockMQTTEndAsync,
        mockMQTTPublishAsync,
        mockLogger.debug,
        mockLogger.error,
        mockZHController.stop,
        devices.bulb.save,
        existsSyncSpy,
        readdirSyncSpy,
        mkdirSyncSpy,
        rmSyncSpy,
        writeFileSyncSpy,
        zhcAddDefinitionSpy,
        zhcRemoveExternalDefinitionsSpy,
    ];

    const useAssets = (): void => {
        fs.cpSync(path.join(__dirname, '..', 'assets', BASE_DIR), mockBasePath, {recursive: true});
    };

    const getFileCode = (fileName: string): string => {
        return fs.readFileSync(path.join(__dirname, '..', 'assets', BASE_DIR, fileName), 'utf8');
    };

    const getZ2MDevice = (zhDevice: unknown): Device => {
        // @ts-expect-error private
        return controller.zigbee.resolveEntity(zhDevice)! as Device;
    };

    const resetExtension = async (): Promise<void> => {
        await controller.enableDisableExtension(false, 'ExternalConverters');
        await controller.enableDisableExtension(true, 'ExternalConverters');
    };

    beforeAll(async () => {
        vi.useFakeTimers();

        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        await flushPromises();
    });

    afterAll(async () => {
        vi.useRealTimers();
    });

    beforeEach(async () => {
        zhc.removeExternalDefinitions(); // remove all external converters
        mocksClear.forEach((m) => m.mockClear());
        data.writeDefaultConfiguration();
        data.writeDefaultState();
        settings.reRead();
        returnDevices.push(devices.external_converter_device.ieeeAddr, devices.coordinator.ieeeAddr);
    });

    afterEach(async () => {
        fs.rmSync(mockBasePath, {recursive: true, force: true});

        await controller?.stop();
    });

    describe('from folder', () => {
        beforeEach(async () => {
            controller = new Controller(vi.fn(), vi.fn());
        });

        it('loads nothing', async () => {
            await controller.start();
            await flushPromises();

            expect(existsSyncSpy).toHaveBeenCalledWith(mockBasePath);
            expect(readdirSyncSpy).not.toHaveBeenCalledWith(mockBasePath);
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/converters', stringify([]), {retain: true, qos: 0});
        });

        it('loads converters', async () => {
            useAssets();

            await controller.start();
            await flushPromises();

            expect(getZ2MDevice(devices.external_converter_device).definition).toMatchObject({
                description: 'external',
                model: 'external_converter_device',
                vendor: 'external',
                zigbeeModel: ['external_converter_device'],
            });
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/converters',
                stringify([
                    {name: 'mock-external-converter-multiple.js', code: getFileCode('mock-external-converter-multiple.js')},
                    {name: 'mock-external-converter.js', code: getFileCode('mock-external-converter.js')},
                ]),
                {retain: true, qos: 0},
            );
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenCalledTimes(2);
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenNthCalledWith(1, 'mock-external-converter-multiple.js');
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenNthCalledWith(2, 'mock-external-converter.js');
            expect(zhcAddDefinitionSpy).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({
                    mock: 1,
                    model: 'external_converters_device_1',
                    zigbeeModel: ['external_converter_device_1'],
                    vendor: 'external_1',
                    description: 'external_1',
                }),
            );
            expect(zhcAddDefinitionSpy).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    mock: 2,
                    model: 'external_converters_device_2',
                    zigbeeModel: ['external_converter_device_2'],
                    vendor: 'external_2',
                    description: 'external_2',
                }),
            );
            expect(zhcAddDefinitionSpy).toHaveBeenNthCalledWith(
                3,
                expect.objectContaining({
                    mock: true,
                    zigbeeModel: ['external_converter_device'],
                    vendor: 'external',
                    model: 'external_converter_device',
                    description: 'external',
                }),
            );

            const bridgeDevices = mockMQTTPublishAsync.mock.calls.filter((c) => c[0] === 'zigbee2mqtt/bridge/devices');
            expect(bridgeDevices.length).toBe(1);
            expect(JSON.parse(bridgeDevices[0][1])).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        model_id: 'external_converter_device',
                        supported: true,
                        definition: expect.objectContaining({
                            description: 'external',
                            model: 'external_converter_device',
                        }),
                    }),
                ]),
            );
        });

        it('saves and removes from MQTT', async () => {
            const converterName = 'foo.js';
            const converterCode = getFileCode('mock-external-converter.js');
            const converterFilePath = path.join(mockBasePath, converterName);

            await controller.start();
            await flushPromises();
            mocksClear.forEach((m) => m.mockClear());

            expect(getZ2MDevice(devices.external_converter_device).definition).toMatchObject({
                description: 'Automatically generated definition',
                model: 'external_converter_device',
                vendor: '',
                zigbeeModel: ['external_converter_device'],
            });

            //-- SAVE
            mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/save', stringify({name: converterName, code: converterCode}));
            await flushPromises();

            expect(getZ2MDevice(devices.external_converter_device).definition).toMatchObject({
                description: 'external',
                model: 'external_converter_device',
                vendor: 'external',
                zigbeeModel: ['external_converter_device'],
            });
            expect(mkdirSyncSpy).toHaveBeenCalledWith(mockBasePath, {recursive: true});
            expect(writeFileSyncSpy).toHaveBeenCalledWith(converterFilePath, converterCode, 'utf8');
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenCalledTimes(1);
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenNthCalledWith(1, converterName);
            expect(zhcAddDefinitionSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    mock: true,
                    zigbeeModel: ['external_converter_device'],
                    vendor: 'external',
                    model: 'external_converter_device',
                    description: 'external',
                }),
            );
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/converters',
                stringify([{name: converterName, code: converterCode}]),
                {
                    retain: true,
                    qos: 0,
                },
            );

            //-- REMOVE
            mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/remove', stringify({name: converterName}));
            await flushPromises();

            expect(getZ2MDevice(devices.external_converter_device).definition).toMatchObject({
                description: 'Automatically generated definition',
                model: 'external_converter_device',
                vendor: '',
                zigbeeModel: ['external_converter_device'],
            });
            expect(rmSyncSpy).toHaveBeenCalledWith(converterFilePath, {force: true});
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenCalledTimes(2);
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenNthCalledWith(2, converterName);
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/converters', stringify([]), {retain: true, qos: 0});
        });
    });

    it('returns error on invalid code', async () => {
        const converterName = 'foo.js';
        const converterCode = 'definetly not a correct javascript code';
        const converterFilePath = path.join(mockBasePath, converterName);

        await resetExtension();
        mocksClear.forEach((m) => m.mockClear());

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/save', stringify({name: converterName, code: converterCode}));
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/converter/save',
            expect.stringContaining(`"error":"foo.js contains invalid code`),
            {retain: false, qos: 0},
        );
        expect(writeFileSyncSpy).not.toHaveBeenCalledWith(converterFilePath, converterCode, 'utf8');
    });

    it('returns error on invalid removal', async () => {
        const converterName = 'invalid.js';
        const converterFilePath = path.join(mockBasePath, converterName);

        await resetExtension();
        mocksClear.forEach((m) => m.mockClear());

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/remove', stringify({name: converterName}));
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/converter/remove',
            stringify({data: {}, status: 'error', error: `${converterName} (${converterFilePath}) doesn't exists`}),
            {retain: false, qos: 0},
        );
        expect(rmSyncSpy).not.toHaveBeenCalledWith(converterFilePath, {force: true});
    });

    it('returns error on invalid definition', async () => {
        const converterName = 'foo.js';
        const converterCode = getFileCode('mock-external-converter.js');
        const converterFilePath = path.join(mockBasePath, converterName);

        await resetExtension();
        mocksClear.forEach((m) => m.mockClear());

        const errorMsg = `Invalid definition`;

        zhcAddDefinitionSpy.mockImplementationOnce(() => {
            throw new Error(errorMsg);
        });

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/save', stringify({name: converterName, code: converterCode}));
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/response/converter/save', expect.stringContaining(errorMsg), {
            retain: false,
            qos: 0,
        });
        expect(writeFileSyncSpy).not.toHaveBeenCalledWith(converterFilePath, converterCode, 'utf8');
    });

    it('returns error on failed removal', async () => {
        const converterName = 'foo.js';
        const converterCode = getFileCode('mock-external-converter.js');
        const converterFilePath = path.join(mockBasePath, converterName);

        await resetExtension();
        mocksClear.forEach((m) => m.mockClear());

        //-- SAVE
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/save', stringify({name: converterName, code: converterCode}));
        await flushPromises();

        const errorMsg = `Failed to remove definition`;

        zhcRemoveExternalDefinitionsSpy.mockImplementationOnce(() => {
            throw new Error(errorMsg);
        });

        //-- REMOVE
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/remove', stringify({name: converterName}));
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/converter/remove',
            stringify({data: {}, status: 'error', error: errorMsg}),
            {retain: false, qos: 0},
        );
        expect(rmSyncSpy).not.toHaveBeenCalledWith(converterFilePath, {force: true});
    });

    it('handles invalid payloads', async () => {
        await resetExtension();
        mocksClear.forEach((m) => m.mockClear());

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/save', stringify({name: 'test.js', transaction: 1 /* code */}));
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/converter/save',
            stringify({data: {}, status: 'error', error: `Invalid payload`, transaction: 1}),
            {retain: false, qos: 0},
        );

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/remove', stringify({namex: 'test.js', transaction: 2}));
        await flushPromises();

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/converter/remove',
            stringify({data: {}, status: 'error', error: `Invalid payload`, transaction: 2}),
            {retain: false, qos: 0},
        );
    });
});
