import * as data from '../mocks/data';
import {mockLogger} from '../mocks/logger';
import {mockMQTTEndAsync, mockMQTTPublishAsync} from '../mocks/mqtt';
import {flushPromises} from '../mocks/utils';
import {devices, mockController as mockZHController, returnDevices} from '../mocks/zigbeeHerdsman';

import fs from 'node:fs';
import path from 'node:path';

import stringify from 'json-stable-stringify-without-jsonify';

import {Controller} from '../../lib/controller';
import ExternalExtensions from '../../lib/extension/externalExtensions';
import * as settings from '../../lib/util/settings';

const BASE_DIR = 'external_extensions';

describe('Extension: ExternalExtensions', () => {
    let controller: Controller;
    const mockBasePath = path.join(data.mockDir, BASE_DIR);

    const existsSyncSpy = vi.spyOn(fs, 'existsSync');
    const readdirSyncSpy = vi.spyOn(fs, 'readdirSync');
    const mkdirSyncSpy = vi.spyOn(fs, 'mkdirSync');
    const rmSyncSpy = vi.spyOn(fs, 'rmSync');
    const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync');

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
    ];

    const getExtension = (): ExternalExtensions => {
        // @ts-expect-error private
        return controller.extensions.find((e) => e.constructor.name === 'ExternalExtensions');
    };

    const useAssets = (mtype: 'cjs' | 'mjs'): void => {
        fs.cpSync(path.join(__dirname, '..', 'assets', BASE_DIR, mtype), mockBasePath, {recursive: true});
    };

    const getFileCode = (mtype: 'cjs' | 'mjs', fileName: string): string => {
        return fs.readFileSync(path.join(__dirname, '..', 'assets', BASE_DIR, mtype, fileName), 'utf8');
    };

    const resetExtension = async (): Promise<void> => {
        await controller.removeExtension(controller.getExtension('ExternalExtensions')!);
        await controller.addExtension(new ExternalExtensions(...controller.extensionArgs));
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
        mocksClear.forEach((m) => m.mockClear());
        data.writeDefaultConfiguration();
        data.writeDefaultState();
        settings.reRead();
        returnDevices.splice(0);
    });

    afterEach(() => {
        fs.rmSync(mockBasePath, {recursive: true, force: true});
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
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/extensions', stringify([]), {retain: true, qos: 0});
        });

        it('CJS: loads extensions', async () => {
            useAssets('cjs');

            await controller.start();
            await flushPromises();

            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example2/extension', 'call2 from constructor', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example2/extension', 'call2 from start', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from constructor', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from start', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/extensions',
                stringify([
                    {name: 'example2Extension.js', code: getFileCode('cjs', 'example2Extension.js')},
                    {name: 'exampleExtension.js', code: getFileCode('cjs', 'exampleExtension.js')},
                ]),
                {retain: true, qos: 0},
            );
        });

        it('MJS: loads extensions', async () => {
            useAssets('mjs');

            await controller.start();
            await flushPromises();

            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example2/extension', 'call2 from constructor', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example2/extension', 'call2 from start', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from constructor', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from start', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/extensions',
                stringify([
                    {name: 'example2Extension.mjs', code: getFileCode('mjs', 'example2Extension.mjs')},
                    {name: 'exampleExtension.mjs', code: getFileCode('mjs', 'exampleExtension.mjs')},
                ]),
                {retain: true, qos: 0},
            );
        });

        it('updates after edit from MQTT', async () => {
            const extensionName = 'exampleExtension.js';
            let extensionCode = getFileCode('cjs', extensionName);

            useAssets('cjs');
            await controller.start();
            await flushPromises();

            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example2/extension', 'call2 from constructor', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example2/extension', 'call2 from start', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from constructor', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from start', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/extensions',
                stringify([
                    {name: 'example2Extension.js', code: getFileCode('cjs', 'example2Extension.js')},
                    {name: extensionName, code: extensionCode},
                ]),
                {retain: true, qos: 0},
            );

            extensionCode = extensionCode.replace("'call from start'", "'call from start - edited'");

            mockMQTTPublishAsync.mockClear();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/extension/save',
                message: {name: extensionName, code: extensionCode},
            });

            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from start - edited', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/extensions',
                stringify([
                    {name: 'example2Extension.js', code: getFileCode('cjs', 'example2Extension.js')},
                    {name: 'exampleExtension.1.js', code: extensionCode},
                ]),
                {retain: true, qos: 0},
            );

            extensionCode = extensionCode.replace("'call from start - edited'", "'call from start'");

            mockMQTTPublishAsync.mockClear();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/extension/save',
                message: {name: 'exampleExtension.1.js', code: extensionCode},
            });

            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from start', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/extensions',
                stringify([
                    {name: 'example2Extension.js', code: getFileCode('cjs', 'example2Extension.js')},
                    {name: 'exampleExtension.2.js', code: extensionCode},
                ]),
                {retain: true, qos: 0},
            );
        });
    });

    describe('from MQTT', () => {
        it('CJS: saves and removes', async () => {
            const extensionName = 'foo.js';
            const extensionCode = getFileCode('cjs', 'exampleExtension.js');
            const extensionFilePath = path.join(mockBasePath, extensionName);

            await resetExtension();
            mocksClear.forEach((m) => m.mockClear());

            //-- SAVE
            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/save', stringify({name: extensionName, code: extensionCode}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/extension/save',
                message: {name: extensionName, code: extensionCode},
            });

            expect(mkdirSyncSpy).toHaveBeenCalledWith(mockBasePath, {recursive: true});
            expect(writeFileSyncSpy).toHaveBeenCalledWith(extensionFilePath, extensionCode, 'utf8');
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from constructor', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from start', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/extensions',
                stringify([{name: extensionName, code: extensionCode}]),
                {
                    retain: true,
                    qos: 0,
                },
            );

            //-- REMOVE
            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/remove', stringify({name: extensionName}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/extension/remove',
                message: {name: extensionName},
            });

            expect(rmSyncSpy).toHaveBeenCalledWith(extensionFilePath, {force: true});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from stop', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/extensions', stringify([]), {retain: true, qos: 0});
        });

        it('MJS: saves and removes', async () => {
            const extensionName = 'foo.mjs';
            const extensionCode = getFileCode('mjs', 'exampleExtension.mjs');
            const extensionFilePath = path.join(mockBasePath, extensionName);

            await resetExtension();
            mocksClear.forEach((m) => m.mockClear());

            //-- SAVE
            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/save', stringify({name: extensionName, code: extensionCode}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/extension/save',
                message: {name: extensionName, code: extensionCode},
            });

            expect(mkdirSyncSpy).toHaveBeenCalledWith(mockBasePath, {recursive: true});
            expect(writeFileSyncSpy).toHaveBeenCalledWith(extensionFilePath, extensionCode, 'utf8');
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from constructor', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from start', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/extensions',
                stringify([{name: extensionName, code: extensionCode}]),
                {
                    retain: true,
                    qos: 0,
                },
            );

            //-- REMOVE
            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/remove', stringify({name: extensionName}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/extension/remove',
                message: {name: extensionName},
            });

            expect(rmSyncSpy).toHaveBeenCalledWith(extensionFilePath, {force: true});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from stop', {retain: false, qos: 0});
            expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/extensions', stringify([]), {retain: true, qos: 0});
        });

        it('returns error on invalid code', async () => {
            const extensionName = 'foo1.js';
            const extensionCode = 'definetly not a correct javascript code';
            const extensionFilePath = path.join(mockBasePath, extensionName);

            await resetExtension();
            mocksClear.forEach((m) => m.mockClear());

            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/save', stringify({name: extensionName, code: extensionCode}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/extension/save',
                message: {name: extensionName, code: extensionCode},
            });

            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/response/extension/save',
                expect.stringContaining(`"error":"${extensionName} contains invalid code`),
                {retain: false, qos: 0},
            );
            expect(writeFileSyncSpy).toHaveBeenCalledWith(extensionFilePath, extensionCode, 'utf8');
            expect(rmSyncSpy).toHaveBeenCalledWith(extensionFilePath, {force: true});
        });

        it('returns error on invalid removal', async () => {
            const extensionName = 'foo2.js';
            const extensionFilePath = path.join(mockBasePath, extensionName);

            await resetExtension();
            mocksClear.forEach((m) => m.mockClear());

            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/remove', stringify({name: converterName}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/extension/remove',
                message: {name: extensionName},
            });

            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/response/extension/remove',
                stringify({data: {}, status: 'error', error: `${extensionName} (${extensionFilePath}) doesn't exists`}),
                {retain: false, qos: 0},
            );
            expect(rmSyncSpy).not.toHaveBeenCalledWith(extensionFilePath, {force: true});
        });

        it('handles invalid payloads', async () => {
            await resetExtension();
            mocksClear.forEach((m) => m.mockClear());

            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/save', stringify({name: 'foo3.js', transaction: 1 /* code */}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/extension/save',
                message: {name: 'foo3.js', transaction: 1 /* code */},
            });

            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/response/extension/save',
                stringify({data: {}, status: 'error', error: `Invalid payload`, transaction: 1}),
                {retain: false, qos: 0},
            );

            // await mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/remove', stringify({namex: 'foo3.js', transaction: 2}));
            // await flushPromises();
            await getExtension().onMQTTMessage({
                topic: 'zigbee2mqtt/bridge/request/extension/remove',
                message: {namex: 'foo3.js', transaction: 2},
            });

            expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
                'zigbee2mqtt/bridge/response/extension/remove',
                stringify({data: {}, status: 'error', error: `Invalid payload`, transaction: 2}),
                {retain: false, qos: 0},
            );
        });
    });
});
