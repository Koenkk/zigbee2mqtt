const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);
const path = require('path');
const fs = require('fs');

zigbeeHerdsmanConverters.addDeviceDefinition = jest.fn();

const mocksClear = [zigbeeHerdsmanConverters.addDeviceDefinition, zigbeeHerdsman.permitJoin,
    mockExit, MQTT.end, zigbeeHerdsman.stop, logger.debug,
    MQTT.publish, MQTT.connect, zigbeeHerdsman.devices.bulb_color.removeFromNetwork,
    zigbeeHerdsman.devices.bulb.removeFromNetwork, logger.error,
];

jest.mock(
    'mock-external-converter-module', () => {
        return {
            mock: true
        };
    }, {
        virtual: true
    });

jest.mock(
    'mock-multiple-external-converter-module', () => {
        return [{
            mock: 1
        }, {
            mock: 2
        }];
    }, {
        virtual: true
    });

describe('Loads external converters', () => {
    let controller;

    beforeEach(async () => {
        jest.useRealTimers();
        await flushPromises();
        mocksClear.forEach((m) => m.mockClear());
        data.writeDefaultConfiguration();
        data.writeEmptyState();
        settings._reRead();
    });

    it('Does not load external converters', async () => {
        settings.set(['external_converters'], []);
        controller = new Controller();
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsmanConverters.addDeviceDefinition).toHaveBeenCalledTimes(0);
    });

    it('Loads external converters', async () => {
        fs.copyFileSync(path.join(__dirname, 'assets', 'mock-external-converter.js'), path.join(data.mockDir, 'mock-external-converter.js'));
        const devicesCount = zigbeeHerdsman.devices.lenght;
        settings.set(['external_converters'], ['mock-external-converter.js']);
        controller = new Controller();
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsmanConverters.addDeviceDefinition).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsmanConverters.addDeviceDefinition).toHaveBeenCalledWith({
            mock: true,
            zigbeeModel: ['external_converter_device'],
            vendor: 'external',
            model: ['external_converter_device'],
            definition: {
                foo: 'bar'
            }
        });
    });

    it('Loads multiple external converters', async () => {
        fs.copyFileSync(path.join(__dirname, 'assets', 'mock-external-converter-multiple.js'), path.join(data.mockDir, 'mock-external-converter-multiple.js'));
        const devicesCount = zigbeeHerdsman.devices.lenght;
        settings.set(['external_converters'], ['mock-external-converter-multiple.js']);
        controller = new Controller();
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsmanConverters.addDeviceDefinition).toHaveBeenCalledTimes(2);
        expect(zigbeeHerdsmanConverters.addDeviceDefinition).toHaveBeenNthCalledWith(1, {
            mock: 1,
            model: 'external_converters_device',
        });
        expect(zigbeeHerdsmanConverters.addDeviceDefinition).toHaveBeenNthCalledWith(2, {
            mock: 2
        });
    });

    it('Loads external converters from package', async () => {
        settings.set(['external_converters'], ['mock-external-converter-module']);
        controller = new Controller();
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsmanConverters.addDeviceDefinition).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsmanConverters.addDeviceDefinition).toHaveBeenCalledWith({
            mock: true
        });
    });

    it('Loads multiple external converters from package', async () => {
        settings.set(['external_converters'], ['mock-multiple-external-converter-module']);
        controller = new Controller();
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsmanConverters.addDeviceDefinition).toHaveBeenCalledTimes(2);
        expect(zigbeeHerdsmanConverters.addDeviceDefinition).toHaveBeenNthCalledWith(1, {
            mock: 1
        });
        expect(zigbeeHerdsmanConverters.addDeviceDefinition).toHaveBeenNthCalledWith(2, {
            mock: 2
        });
    });
});