import * as data from '../mocks/data';
import {mockLogger} from '../mocks/logger';
import {mockMQTT, events as mockMQTTEvents} from '../mocks/mqtt';
import {flushPromises} from '../mocks/utils';
import {devices, mockController as mockZHController, returnDevices} from '../mocks/zigbeeHerdsman';

import fs from 'fs';
import path from 'path';

import stringify from 'json-stable-stringify-without-jsonify';

import * as zhc from 'zigbee-herdsman-converters';

import {Controller} from '../../lib/controller';
import * as settings from '../../lib/util/settings';

const BASE_DIR = 'external_converters';

const mockZHCAddDefinition = jest.fn();
const mockZHCRemoveDefinition = jest.fn();
// @ts-expect-error mock
zhc.addDefinition = mockZHCAddDefinition;
// @ts-expect-error mock
zhc.removeDefinition = mockZHCRemoveDefinition;

describe('Extension: ExternalConverters', () => {
    const mockBasePath = path.join(data.mockDir, BASE_DIR);
    let controller: Controller;

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
        mockZHCAddDefinition,
        mockZHCRemoveDefinition,
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
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/converters', stringify([]), {retain: true, qos: 0}, expect.any(Function));
    });

    it('loads from folder', async () => {
        useAssets();

        await controller.start();
        await flushPromises();

        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/converters',
            stringify([
                {name: 'mock-external-converter-multiple.js', code: getFileCode('mock-external-converter-multiple.js')},
                {name: 'mock-external-converter.js', code: getFileCode('mock-external-converter.js')},
            ]),
            {retain: true, qos: 0},
            expect.any(Function),
        );
        expect(mockZHCRemoveDefinition).toHaveBeenCalledTimes(3);
        expect(mockZHCAddDefinition).toHaveBeenNthCalledWith(1, {
            mock: 1,
            model: 'external_converters_device_1',
            zigbeeModel: ['external_converter_device_1'],
            vendor: 'external_1',
            description: 'external_1',
            fromZigbee: [],
            toZigbee: [],
            exposes: [],
        });
        expect(mockZHCAddDefinition).toHaveBeenNthCalledWith(2, {
            mock: 2,
            model: 'external_converters_device_2',
            zigbeeModel: ['external_converter_device_2'],
            vendor: 'external_2',
            description: 'external_2',
            fromZigbee: [],
            toZigbee: [],
            exposes: [],
        });
        expect(mockZHCAddDefinition).toHaveBeenNthCalledWith(3, {
            mock: true,
            zigbeeModel: ['external_converter_device'],
            vendor: 'external',
            model: 'external_converter_device',
            description: 'external',
            fromZigbee: [],
            toZigbee: [],
            exposes: [],
        });
    });

    it('saves and removes from MQTT', async () => {
        const converterName = 'foo.js';
        const converterCode = getFileCode('mock-external-converter.js');
        const converterFilePath = path.join(mockBasePath, converterName);

        await controller.start();
        await flushPromises();
        mocksClear.forEach((m) => m.mockClear());

        //-- SAVE
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/save', stringify({name: converterName, code: converterCode}));
        await flushPromises();

        expect(mkdirSyncSpy).toHaveBeenCalledWith(mockBasePath, {recursive: true});
        expect(writeFileSyncSpy).toHaveBeenCalledWith(converterFilePath, converterCode, 'utf8');
        expect(mockZHCRemoveDefinition).toHaveBeenCalledTimes(1);
        expect(mockZHCAddDefinition).toHaveBeenCalledWith({
            mock: true,
            zigbeeModel: ['external_converter_device'],
            vendor: 'external',
            model: 'external_converter_device',
            description: 'external',
            fromZigbee: [],
            toZigbee: [],
            exposes: [],
        });
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/converters',
            stringify([{name: converterName, code: converterCode}]),
            {retain: true, qos: 0},
            expect.any(Function),
        );

        //-- REMOVE
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/remove', stringify({name: converterName}));
        await flushPromises();

        expect(rmSyncSpy).toHaveBeenCalledWith(converterFilePath, {force: true});
        expect(mockZHCRemoveDefinition).toHaveBeenCalledWith({
            mock: true,
            zigbeeModel: ['external_converter_device'],
            vendor: 'external',
            model: 'external_converter_device',
            description: 'external',
            fromZigbee: [],
            toZigbee: [],
            exposes: [],
        });
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/converters', stringify([]), {retain: true, qos: 0}, expect.any(Function));
    });

    it('returns error on invalid code', async () => {
        const converterName = 'foo.js';
        const converterCode = 'definetly not a correct javascript code';
        const converterFilePath = path.join(mockBasePath, converterName);

        await controller.start();
        await flushPromises();
        mocksClear.forEach((m) => m.mockClear());

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/save', stringify({name: converterName, code: converterCode}));
        await flushPromises();

        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/converter/save',
            expect.stringContaining(`"error":"foo.js contains invalid code`),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(writeFileSyncSpy).not.toHaveBeenCalledWith(converterFilePath, converterCode, 'utf8');
    });

    it('returns error on invalid removal', async () => {
        const converterName = 'invalid.js';
        const converterFilePath = path.join(mockBasePath, converterName);

        await controller.start();
        await flushPromises();
        mocksClear.forEach((m) => m.mockClear());

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/remove', stringify({name: converterName}));
        await flushPromises();

        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/converter/remove',
            stringify({data: {}, status: 'error', error: `${converterName} (${converterFilePath}) doesn't exists`}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(rmSyncSpy).not.toHaveBeenCalledWith(converterFilePath, {force: true});
    });

    it('returns error on invalid definition', async () => {
        const converterName = 'foo.js';
        const converterCode = getFileCode('mock-external-converter.js');
        const converterFilePath = path.join(mockBasePath, converterName);

        await controller.start();
        await flushPromises();
        mocksClear.forEach((m) => m.mockClear());

        const errorMsg = `Invalid definition`;

        mockZHCAddDefinition.mockImplementationOnce(() => {
            throw new Error(errorMsg);
        });

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/converter/save', stringify({name: converterName, code: converterCode}));
        await flushPromises();

        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/converter/save',
            expect.stringContaining(errorMsg),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(writeFileSyncSpy).not.toHaveBeenCalledWith(converterFilePath, converterCode, 'utf8');
    });
});
