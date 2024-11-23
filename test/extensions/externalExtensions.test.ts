import * as data from '../mocks/data';
import {mockLogger} from '../mocks/logger';
import {mockMQTT, events as mockMQTTEvents} from '../mocks/mqtt';
import {flushPromises} from '../mocks/utils';
import {devices, mockController as mockZHController, returnDevices} from '../mocks/zigbeeHerdsman';

import fs from 'fs';
import path from 'path';

import stringify from 'json-stable-stringify-without-jsonify';

import {Controller} from '../../lib/controller';
import * as settings from '../../lib/util/settings';

const BASE_DIR = 'external_extensions';

describe('Extension: ExternalExtensions', () => {
    let controller: Controller;
    const mockBasePath = path.join(data.mockDir, BASE_DIR);

    const existsSyncSpy = jest.spyOn(fs, 'existsSync');
    const readdirSyncSpy = jest.spyOn(fs, 'readdirSync');
    const mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync');
    const rmSyncSpy = jest.spyOn(fs, 'rmSync');
    const writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync');

    const mocksClear = [
        mockMQTT.endAsync,
        mockMQTT.publishAsync,
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

    const useAssets = (): void => {
        fs.cpSync(path.join(__dirname, '..', 'assets', BASE_DIR), mockBasePath, {recursive: true});
    };

    const getFileCode = (fileName: string): string => {
        return fs.readFileSync(path.join(__dirname, '..', 'assets', BASE_DIR, fileName), 'utf8');
    };

    beforeAll(async () => {
        jest.useFakeTimers();
    });

    afterAll(async () => {
        jest.useRealTimers();
    });

    beforeEach(async () => {
        mocksClear.forEach((m) => m.mockClear());
        data.writeDefaultConfiguration();
        data.writeDefaultState();
        settings.reRead();
        returnDevices.splice(0);

        controller = new Controller(jest.fn(), jest.fn());
    });

    afterEach(() => {
        fs.rmSync(mockBasePath, {recursive: true, force: true});
    });

    it('loads nothing from folder', async () => {
        await controller.start();
        await flushPromises();

        expect(existsSyncSpy).toHaveBeenCalledWith(mockBasePath);
        expect(readdirSyncSpy).not.toHaveBeenCalledWith(mockBasePath);
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/extensions', stringify([]), {retain: true, qos: 0});
    });

    it('loads from folder', async () => {
        useAssets();

        await controller.start();
        await flushPromises();

        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/example2/extension', 'call2 from constructor', {retain: false, qos: 0});
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/example2/extension', 'call2 from start', {retain: false, qos: 0});
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from constructor', {retain: false, qos: 0});
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from start', {retain: false, qos: 0});
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/extensions',
            stringify([
                {name: 'example2Extension.js', code: getFileCode('example2Extension.js')},
                {name: 'exampleExtension.js', code: getFileCode('exampleExtension.js')},
            ]),
            {retain: true, qos: 0},
        );
    });

    it('saves and removes from MQTT', async () => {
        const extensionName = 'foo.js';
        const extensionCode = getFileCode('exampleExtension.js');
        const extensionFilePath = path.join(mockBasePath, extensionName);

        await controller.start();
        await flushPromises();
        mocksClear.forEach((m) => m.mockClear());

        //-- SAVE
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/save', stringify({name: extensionName, code: extensionCode}));
        await flushPromises();

        expect(mkdirSyncSpy).toHaveBeenCalledWith(mockBasePath, {recursive: true});
        expect(writeFileSyncSpy).toHaveBeenCalledWith(extensionFilePath, extensionCode, 'utf8');
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from constructor', {retain: false, qos: 0});
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from start', {retain: false, qos: 0});
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/extensions', stringify([{name: extensionName, code: extensionCode}]), {
            retain: true,
            qos: 0,
        });

        //-- REMOVE
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/remove', stringify({name: extensionName}));
        await flushPromises();

        expect(rmSyncSpy).toHaveBeenCalledWith(extensionFilePath, {force: true});
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from stop', {retain: false, qos: 0});
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/extensions', stringify([]), {retain: true, qos: 0});
    });

    it('returns error on invalid code', async () => {
        const extensionName = 'foo.js';
        const extensionCode = 'definetly not a correct javascript code';
        const extensionFilePath = path.join(mockBasePath, extensionName);

        await controller.start();
        await flushPromises();
        mocksClear.forEach((m) => m.mockClear());

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/save', stringify({name: extensionName, code: extensionCode}));
        await flushPromises();

        expect(mockMQTT.publishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/extension/save',
            expect.stringContaining(`"error":"${extensionName} contains invalid code`),
            {retain: false, qos: 0},
        );
        expect(writeFileSyncSpy).not.toHaveBeenCalledWith(extensionFilePath, extensionCode, 'utf8');
    });

    it('returns error on invalid removal', async () => {
        const converterName = 'invalid.js';
        const converterFilePath = path.join(mockBasePath, converterName);

        await controller.start();
        await flushPromises();
        mocksClear.forEach((m) => m.mockClear());

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/remove', stringify({name: converterName}));
        await flushPromises();

        expect(mockMQTT.publishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/extension/remove',
            stringify({data: {}, status: 'error', error: `${converterName} (${converterFilePath}) doesn't exists`}),
            {retain: false, qos: 0},
        );
        expect(rmSyncSpy).not.toHaveBeenCalledWith(converterFilePath, {force: true});
    });
});
