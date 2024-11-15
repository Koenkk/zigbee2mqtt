import * as data from '../mocks/data';
import {mockLogger} from '../mocks/logger';
import {mockMQTT} from '../mocks/mqtt';
import {flushPromises} from '../mocks/utils';
import {devices, mockController as mockZHController} from '../mocks/zigbeeHerdsman';

import fs from 'fs';
import path from 'path';

import * as zhc from 'zigbee-herdsman-converters';

import {Controller} from '../../lib/controller';
import * as settings from '../../lib/util/settings';

jest.mock(
    'mock-external-converter-module',
    () => {
        return {
            mock: true,
        };
    },
    {
        virtual: true,
    },
);

jest.mock(
    'mock-multiple-external-converter-module',
    () => {
        return [
            {
                mock: 1,
            },
            {
                mock: 2,
            },
        ];
    },
    {
        virtual: true,
    },
);

const mockZHCAddDefinition = jest.fn();
// @ts-expect-error mock
zhc.addDefinition = mockZHCAddDefinition;

const mocksClear = [
    mockZHCAddDefinition,
    devices.bulb_color.removeFromNetwork,
    devices.bulb.removeFromNetwork,
    mockZHController.permitJoin,
    mockZHController.stop,
    mockMQTT.endAsync,
    mockMQTT.publishAsync,
    mockLogger.debug,
    mockLogger.error,
];

describe('Extension: ExternalConverters', () => {
    let controller: Controller;

    const resetExtension = async (): Promise<void> => {
        await controller.enableDisableExtension(false, 'ExternalConverters');
        await controller.enableDisableExtension(true, 'ExternalConverters');
    };

    beforeAll(async () => {
        jest.useFakeTimers();
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
    });

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings.reRead();
        mocksClear.forEach((m) => m.mockClear());
        await resetExtension();
    });

    afterAll(async () => {
        jest.useRealTimers();
    });

    it('Does not load external converters', async () => {
        settings.set(['external_converters'], []);
        await resetExtension();
        expect(mockZHCAddDefinition).toHaveBeenCalledTimes(0);
    });

    it('Loads external converters', async () => {
        fs.copyFileSync(path.join(__dirname, '..', 'assets', 'mock-external-converter.js'), path.join(data.mockDir, 'mock-external-converter.js'));
        settings.set(['external_converters'], ['mock-external-converter.js']);
        await resetExtension();
        expect(mockZHCAddDefinition).toHaveBeenCalledTimes(1);
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
    });

    it('Loads multiple external converters', async () => {
        fs.copyFileSync(
            path.join(__dirname, '..', 'assets', 'mock-external-converter-multiple.js'),
            path.join(data.mockDir, 'mock-external-converter-multiple.js'),
        );
        settings.set(['external_converters'], ['mock-external-converter-multiple.js']);
        await resetExtension();
        expect(mockZHCAddDefinition).toHaveBeenCalledTimes(2);
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
    });

    it('Loads external converters from package', async () => {
        settings.set(['external_converters'], ['mock-external-converter-module']);
        await resetExtension();
        expect(mockZHCAddDefinition).toHaveBeenCalledTimes(1);
        expect(mockZHCAddDefinition).toHaveBeenCalledWith({
            mock: true,
        });
    });

    it('Loads multiple external converters from package', async () => {
        settings.set(['external_converters'], ['mock-multiple-external-converter-module']);
        await resetExtension();
        expect(mockZHCAddDefinition).toHaveBeenCalledTimes(2);
        expect(mockZHCAddDefinition).toHaveBeenNthCalledWith(1, {
            mock: 1,
        });
        expect(mockZHCAddDefinition).toHaveBeenNthCalledWith(2, {
            mock: 2,
        });
    });

    it('Loads external converters with error', async () => {
        fs.copyFileSync(path.join(__dirname, '..', 'assets', 'mock-external-converter.js'), path.join(data.mockDir, 'mock-external-converter.js'));
        settings.set(['external_converters'], ['mock-external-converter.js']);
        mockZHCAddDefinition.mockImplementationOnce(() => {
            throw new Error('Invalid definition!');
        });
        await resetExtension();
        expect(mockLogger.error).toHaveBeenCalledWith(`Failed to load external converter file 'mock-external-converter.js' (Invalid definition!)`);
    });
});
