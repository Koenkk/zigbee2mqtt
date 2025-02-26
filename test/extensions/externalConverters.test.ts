import * as data from '../mocks/data';
import {mockLogger} from '../mocks/logger';
import {mockMQTTEndAsync, mockMQTTPublishAsync} from '../mocks/mqtt';
import {flushPromises} from '../mocks/utils';
import {devices, mockController as mockZHController, returnDevices} from '../mocks/zigbeeHerdsman';

import type ExternalConverters from '../../lib/extension/externalConverters';
import type Device from '../../lib/model/device';

import fs from 'node:fs';
import path from 'node:path';

import stringify from 'json-stable-stringify-without-jsonify';

import * as zhc from 'zigbee-herdsman-converters';

import {Controller} from '../../lib/controller';
import ExternalConverters from '../../lib/extension/externalConverters';
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

    const zhcAddExternalDefinitionSpy = vi.spyOn(zhc, 'addExternalDefinition');
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
        zhcAddExternalDefinitionSpy,
        zhcRemoveExternalDefinitionsSpy,
    ];

    const getExtension = (): ExternalConverters => {
        // @ts-expect-error private
        return controller.extensions.find((e) => e.constructor.name === 'ExternalConverters');
    };

    const useAssets = (mtype: 'cjs' | 'mjs'): void => {
        fs.cpSync(path.join(__dirname, '..', 'assets', BASE_DIR, mtype), mockBasePath, {recursive: true});
    };

    const getFileCode = (mtype: 'cjs' | 'mjs', fileName: string): string => {
        return fs.readFileSync(path.join(__dirname, '..', 'assets', BASE_DIR, mtype, fileName), 'utf8');
    };

    const getZ2MDevice = (zhDevice: unknown): Device => {
        // @ts-expect-error private
        return controller.zigbee.resolveEntity(zhDevice)! as Device;
    };

    const resetExtension = async (): Promise<void> => {
        await controller.removeExtension(controller.getExtension('ExternalConverters')!);
        await controller.addExtension(new ExternalConverters(...controller.extensionArgs));
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
        // @ts-expect-error private - clear cached
        await controller.zigbee.resolveDevicesDefinitions(true);
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

        it('CJS: loads converters', async () => {
            useAssets('cjs');

            await controller.start();
            await flushPromises();

            expect(getZ2MDevice(devices.external_converter_device).definition).toMatchObject({
                description: 'external/converter',
                model: 'external_converter_device',
                vendor: 'external',
                zigbeeModel: ['external_converter_device'],
            });
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/converters',
                stringify([
                    {name: 'mock-external-converter-multiple.js', code: getFileCode('cjs', 'mock-external-converter-multiple.js')},
                    {name: 'mock-external-converter.js', code: getFileCode('cjs', 'mock-external-converter.js')},
                ]),
                {retain: true, qos: 0},
            );
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenCalledTimes(2);
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenNthCalledWith(1, 'mock-external-converter-multiple.js');
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenNthCalledWith(2, 'mock-external-converter.js');
            expect(zhcAddExternalDefinitionSpy).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({
                    mock: 1,
                    model: 'external_converters_device_1',
                    zigbeeModel: ['external_converter_device_1'],
                    vendor: 'external_1',
                    description: 'external_1',
                }),
            );
            expect(zhcAddExternalDefinitionSpy).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    mock: 2,
                    model: 'external_converters_device_2',
                    zigbeeModel: ['external_converter_device_2'],
                    vendor: 'external_2',
                    description: 'external_2',
                }),
            );
            expect(zhcAddExternalDefinitionSpy).toHaveBeenNthCalledWith(
                3,
                expect.objectContaining({
                    mock: true,
                    zigbeeModel: ['external_converter_device'],
                    vendor: 'external',
                    model: 'external_converter_device',
                    description: 'external/converter',
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
                            description: 'external/converter',
                            model: 'external_converter_device',
                        }),
                    }),
                ]),
            );
        });

        it('MJS: loads converters', async () => {
            useAssets('mjs');

            await controller.start();
            await flushPromises();

            expect(getZ2MDevice(devices.external_converter_device).definition).toMatchObject({
                description: 'external/converter',
                model: 'external_converter_device',
                vendor: 'external',
                zigbeeModel: ['external_converter_device'],
            });
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/converters',
                stringify([
                    {name: 'mock-external-converter-multiple.mjs', code: getFileCode('mjs', 'mock-external-converter-multiple.mjs')},
                    {name: 'mock-external-converter.mjs', code: getFileCode('mjs', 'mock-external-converter.mjs')},
                ]),
                {retain: true, qos: 0},
            );
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenCalledTimes(2);
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenNthCalledWith(1, 'mock-external-converter-multiple.mjs');
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenNthCalledWith(2, 'mock-external-converter.mjs');
            expect(zhcAddExternalDefinitionSpy).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({
                    mock: 1,
                    model: 'external_converters_device_1',
                    zigbeeModel: ['external_converter_device_1'],
                    vendor: 'external_1',
                    description: 'external_1',
                }),
            );
            expect(zhcAddExternalDefinitionSpy).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    mock: 2,
                    model: 'external_converters_device_2',
                    zigbeeModel: ['external_converter_device_2'],
                    vendor: 'external_2',
                    description: 'external_2',
                }),
            );
            expect(zhcAddExternalDefinitionSpy).toHaveBeenNthCalledWith(
                3,
                expect.objectContaining({
                    mock: true,
                    zigbeeModel: ['external_converter_device'],
                    vendor: 'external',
                    model: 'external_converter_device',
                    description: 'external/converter',
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
                            description: 'external/converter',
                            model: 'external_converter_device',
                        }),
                    }),
                ]),
            );
        });

        it('updates after edit from MQTT', async () => {
            const converterName = 'mock-external-converter.js';
            let converterCode = getFileCode('cjs', 'mock-external-converter.js');

            useAssets('cjs');
            await controller.start();
            await flushPromises();

            expect(getZ2MDevice(devices.external_converter_device).definition).toMatchObject({
                description: 'external/converter',
                model: 'external_converter_device',
                vendor: 'external',
                zigbeeModel: ['external_converter_device'],
            });
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/converters',
                stringify([
                    {name: 'mock-external-converter-multiple.js', code: getFileCode('cjs', 'mock-external-converter-multiple.js')},
                    {name: converterName, code: getFileCode('cjs', converterName)},
                ]),
                {retain: true, qos: 0},
            );

            converterCode = converterCode.replace("posix.join('external', 'converter')", "posix.join('external', 'converter', 'edited')");

            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/converter/save',
                message: {name: converterName, code: converterCode},
            });

            expect(getZ2MDevice(devices.external_converter_device).definition).toMatchObject({
                description: 'external/converter/edited',
                model: 'external_converter_device',
                vendor: 'external',
                zigbeeModel: ['external_converter_device'],
            });
            expect(zhcAddExternalDefinitionSpy).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    mock: true,
                    zigbeeModel: ['external_converter_device'],
                    vendor: 'external',
                    model: 'external_converter_device',
                    description: 'external/converter/edited',
                    externalConverterName: 'mock-external-converter.1.js',
                }),
            );

            converterCode = converterCode.replace("posix.join('external', 'converter', 'edited')", "posix.join('external', 'converter')");

            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/converter/save',
                message: {name: 'mock-external-converter.1.js', code: converterCode},
            });

            expect(getZ2MDevice(devices.external_converter_device).definition).toMatchObject({
                description: 'external/converter',
                model: 'external_converter_device',
                vendor: 'external',
                zigbeeModel: ['external_converter_device'],
            });
            expect(zhcAddExternalDefinitionSpy).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    mock: true,
                    zigbeeModel: ['external_converter_device'],
                    vendor: 'external',
                    model: 'external_converter_device',
                    description: 'external/converter',
                    externalConverterName: 'mock-external-converter.2.js',
                }),
            );
        });
    });

    describe('from MQTT', () => {
        it('CJS: saves and removes', async () => {
            const converterName = 'foo.js';
            const converterCode = getFileCode('cjs', 'mock-external-converter.js');
            const converterFilePath = path.join(mockBasePath, converterName);

            await resetExtension();
            mocksClear.forEach((m) => m.mockClear());

            expect(getZ2MDevice(devices.external_converter_device).definition).toMatchObject({
                description: 'Automatically generated definition',
                model: 'external_converter_device',
                vendor: '',
                zigbeeModel: ['external_converter_device'],
            });

            //-- SAVE
            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/save', stringify({name: converterName, code: converterCode}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/converter/save',
                message: {name: converterName, code: converterCode},
            });

            expect(getZ2MDevice(devices.external_converter_device).definition).toMatchObject({
                description: 'external/converter',
                model: 'external_converter_device',
                vendor: 'external',
                zigbeeModel: ['external_converter_device'],
            });
            expect(mkdirSyncSpy).toHaveBeenCalledWith(mockBasePath, {recursive: true});
            expect(writeFileSyncSpy).toHaveBeenCalledWith(converterFilePath, converterCode, 'utf8');
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenCalledTimes(1);
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenNthCalledWith(1, converterName);
            expect(zhcAddExternalDefinitionSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    mock: true,
                    zigbeeModel: ['external_converter_device'],
                    vendor: 'external',
                    model: 'external_converter_device',
                    description: 'external/converter',
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
            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/remove', stringify({name: converterName}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/converter/remove',
                message: {name: converterName},
            });

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

        it('MJS: saves and removes', async () => {
            const converterName = 'foo.mjs';
            const converterCode = getFileCode('mjs', 'mock-external-converter.mjs');
            const converterFilePath = path.join(mockBasePath, converterName);

            await resetExtension();
            mocksClear.forEach((m) => m.mockClear());

            expect(getZ2MDevice(devices.external_converter_device).definition).toMatchObject({
                description: 'Automatically generated definition',
                model: 'external_converter_device',
                vendor: '',
                zigbeeModel: ['external_converter_device'],
            });

            //-- SAVE
            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/save', stringify({name: converterName, code: converterCode}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/converter/save',
                message: {name: converterName, code: converterCode},
            });

            expect(getZ2MDevice(devices.external_converter_device).definition).toMatchObject({
                description: 'external/converter',
                model: 'external_converter_device',
                vendor: 'external',
                zigbeeModel: ['external_converter_device'],
            });
            expect(mkdirSyncSpy).toHaveBeenCalledWith(mockBasePath, {recursive: true});
            expect(writeFileSyncSpy).toHaveBeenCalledWith(converterFilePath, converterCode, 'utf8');
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenCalledTimes(1);
            expect(zhcRemoveExternalDefinitionsSpy).toHaveBeenNthCalledWith(1, converterName);
            expect(zhcAddExternalDefinitionSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    mock: true,
                    zigbeeModel: ['external_converter_device'],
                    vendor: 'external',
                    model: 'external_converter_device',
                    description: 'external/converter',
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
            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/remove', stringify({name: converterName}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/converter/remove',
                message: {name: converterName},
            });

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

        it('returns error on invalid code', async () => {
            const converterName = 'foo1.js';
            const converterCode = 'definetly not a correct javascript code';
            const converterFilePath = path.join(mockBasePath, converterName);

            await resetExtension();
            mocksClear.forEach((m) => m.mockClear());

            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/save', stringify({name: converterName, code: converterCode}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/converter/save',
                message: {name: converterName, code: converterCode},
            });

            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/response/converter/save',
                expect.stringContaining(`"error":"${converterName} contains invalid code`),
                {retain: false, qos: 0},
            );
            expect(writeFileSyncSpy).toHaveBeenCalledWith(converterFilePath, converterCode, 'utf8');
            expect(rmSyncSpy).toHaveBeenCalledWith(converterFilePath, {force: true});
        });

        it('returns error on invalid removal', async () => {
            const converterName = 'foo2.js';
            const converterFilePath = path.join(mockBasePath, converterName);

            await resetExtension();
            mocksClear.forEach((m) => m.mockClear());

            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/remove', stringify({name: converterName}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/converter/remove',
                message: {name: converterName},
            });

            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/response/converter/remove',
                stringify({data: {}, status: 'error', error: `${converterName} (${converterFilePath}) doesn't exists`}),
                {retain: false, qos: 0},
            );
            expect(rmSyncSpy).not.toHaveBeenCalledWith(converterFilePath, {force: true});
        });

        it('returns error on invalid definition', async () => {
            const converterName = 'foo3.js';
            const converterCode = getFileCode('cjs', 'mock-external-converter.js');
            const converterFilePath = path.join(mockBasePath, converterName);

            await resetExtension();
            mocksClear.forEach((m) => m.mockClear());

            const errorMsg = `Invalid definition`;

            zhcAddExternalDefinitionSpy.mockImplementationOnce(() => {
                throw new Error(errorMsg);
            });

            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/save', stringify({name: converterName, code: converterCode}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/converter/save',
                message: {name: converterName, code: converterCode},
            });

            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/response/converter/save', expect.stringContaining(errorMsg), {
                retain: false,
                qos: 0,
            });
            expect(writeFileSyncSpy).toHaveBeenCalledWith(converterFilePath, converterCode, 'utf8');
            expect(rmSyncSpy).toHaveBeenCalledWith(converterFilePath, {force: true});
        });

        it('returns error on failed removal', async () => {
            const converterName = 'foo4.js';
            const converterCode = getFileCode('cjs', 'mock-external-converter.js');
            const converterFilePath = path.join(mockBasePath, converterName);

            await resetExtension();
            mocksClear.forEach((m) => m.mockClear());

            //-- SAVE
            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/save', stringify({name: converterName, code: converterCode}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/converter/save',
                message: {name: converterName, code: converterCode},
            });

            const errorMsg = `Failed to remove definition`;

            zhcRemoveExternalDefinitionsSpy.mockImplementationOnce(() => {
                throw new Error(errorMsg);
            });

            //-- REMOVE
            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/remove', stringify({name: converterName}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/converter/remove',
                message: {name: converterName},
            });

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

            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/save', stringify({name: 'foo5.js', transaction: 1 /* code */}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/converter/save',
                message: {name: 'foo5.js', transaction: 1 /* code */},
            });

            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/response/converter/save',
                stringify({data: {}, status: 'error', error: `Invalid payload`, transaction: 1}),
                {retain: false, qos: 0},
            );

            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/remove', stringify({namex: 'foo5.js', transaction: 2}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/converter/remove',
                message: {namex: 'foo5.js', transaction: 2},
            });

            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/response/converter/remove',
                stringify({data: {}, status: 'error', error: `Invalid payload`, transaction: 2}),
                {retain: false, qos: 0},
            );
        });
    });
});
