import * as data from '../mocks/data';
import {mockLogger} from '../mocks/logger';
import {mockMQTT, events as mockMQTTEvents} from '../mocks/mqtt';
import {flushPromises} from '../mocks/utils';
import {devices, mockController as mockZHController, returnDevices} from '../mocks/zigbeeHerdsman';

import fs from 'fs';
import path from 'path';

import stringify from 'json-stable-stringify-without-jsonify';
import {rimrafSync} from 'rimraf';

import {Controller} from '../../lib/controller';
import * as settings from '../../lib/util/settings';

const mocksClear = [
    mockZHController.permitJoin,
    mockZHController.stop,
    devices.bulb_color.removeFromNetwork,
    devices.bulb.removeFromNetwork,
    mockMQTT.endAsync,
    mockMQTT.publishAsync,
    mockLogger.debug,
    mockLogger.error,
];

describe('Extension: ExternalExtension', () => {
    let controller: Controller;
    let mkdirSyncSpy: jest.SpyInstance;
    let unlinkSyncSpy: jest.SpyInstance;

    beforeAll(async () => {
        jest.useFakeTimers();
        mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync');
        unlinkSyncSpy = jest.spyOn(fs, 'unlinkSync');
    });

    afterAll(async () => {
        jest.useRealTimers();
    });

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings.reRead();
        mocksClear.forEach((m) => m.mockClear());
        returnDevices.splice(0);
        mocksClear.forEach((m) => m.mockClear());
        data.writeDefaultConfiguration();
        settings.reRead();
        data.writeDefaultState();
    });

    afterEach(() => {
        const extensionPath = path.join(data.mockDir, 'extension');
        rimrafSync(extensionPath);
    });

    it('Load user extension', async () => {
        const extensionPath = path.join(data.mockDir, 'extension');
        const extensionCode = fs.readFileSync(path.join(__dirname, '..', 'assets', 'exampleExtension.js'), 'utf-8');
        fs.mkdirSync(extensionPath);
        fs.copyFileSync(path.join(__dirname, '..', 'assets', 'exampleExtension.js'), path.join(extensionPath, 'exampleExtension.js'));
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'test', {retain: false, qos: 0});
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/extensions',
            stringify([{name: 'exampleExtension.js', code: extensionCode}]),
            {retain: true, qos: 0},
        );
    });

    it('Load user extension from api call', async () => {
        const extensionPath = path.join(data.mockDir, 'extension');
        const extensionCode = fs.readFileSync(path.join(__dirname, '..', 'assets', 'exampleExtension.js'), 'utf-8');
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        mockMQTT.publishAsync.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/save', stringify({name: 'foo.js', code: extensionCode}));
        await flushPromises();
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/extensions', stringify([{name: 'foo.js', code: extensionCode}]), {
            retain: true,
            qos: 0,
        });
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from constructor', {retain: false, qos: 0});
        expect(mkdirSyncSpy).toHaveBeenCalledWith(extensionPath);
    });

    it('Do not load corrupted extensions', async () => {
        const extensionCode = 'definetly not a correct javascript code';
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        mockMQTT.publishAsync.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/save', stringify({name: 'foo.js', code: extensionCode}));
        await flushPromises();

        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/response/extension/save', expect.any(String), {retain: false, qos: 0});
        const payload = JSON.parse(mockMQTT.publishAsync.mock.calls[0][1]);
        expect(payload).toEqual(expect.objectContaining({data: {}, status: 'error'}));
        expect(payload.error).toMatch('Unexpected identifier');
    });

    it('Removes user extension', async () => {
        const extensionPath = path.join(data.mockDir, 'extension');
        const extensionCode = fs.readFileSync(path.join(__dirname, '..', 'assets', 'exampleExtension.js'), 'utf-8');
        fs.mkdirSync(extensionPath);
        const extensionFilePath = path.join(extensionPath, 'exampleExtension.js');
        fs.copyFileSync(path.join(__dirname, '..', 'assets', 'exampleExtension.js'), extensionFilePath);
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'test', {retain: false, qos: 0});
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/extensions',
            stringify([{name: 'exampleExtension.js', code: extensionCode}]),
            {retain: true, qos: 0},
        );

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/remove', stringify({name: 'exampleExtension.js'}));
        await flushPromises();
        expect(unlinkSyncSpy).toHaveBeenCalledWith(extensionFilePath);
        mockMQTT.publishAsync.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/extension/remove', stringify({name: 'non existing.js'}));
        await flushPromises();
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/extension/remove',
            stringify({data: {}, status: 'error', error: "Extension non existing.js doesn't exists"}),
            {retain: false, qos: 0},
        );
    });
});
