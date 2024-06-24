const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
zigbeeHerdsman.returnDevices.push('0x00124b00120144ae');
zigbeeHerdsman.returnDevices.push('0x0017880104e45560');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = require('./lib/flushPromises');

const mocksClear = [MQTT.publish, logger.warning, logger.debug];

const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const mockOnEvent = jest.fn();
const mappedLivolo = zigbeeHerdsmanConverters.findByModel('TI0001');
mappedLivolo.onEvent = mockOnEvent;
zigbeeHerdsmanConverters.onEvent = jest.fn();

describe('On event', () => {
    let controller;
    const device = zigbeeHerdsman.devices.LIVOLO;

    beforeEach(async () => {
        jest.useFakeTimers();
        data.writeDefaultConfiguration();
        settings.reRead();
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
    });

    beforeEach(async () => {
        controller.state.state = {};
        data.writeDefaultConfiguration();
        settings.reRead();
        mocksClear.forEach((m) => m.mockClear());
        zigbeeHerdsmanConverters.onEvent.mockClear();
    });

    afterAll(async () => {
        jest.useRealTimers();
    });

    it('Should call with start event', async () => {
        expect(mockOnEvent).toHaveBeenCalledTimes(1);
        const call = mockOnEvent.mock.calls[0];
        expect(call[0]).toBe('start');
        expect(call[1]).toStrictEqual({});
        expect(call[2]).toBe(device);
        expect(call[3]).toStrictEqual(settings.getDevice(device.ieeeAddr));
        expect(call[4]).toStrictEqual({});
    });

    it('Should call with stop event', async () => {
        mockOnEvent.mockClear();
        await controller.stop();
        await flushPromises();
        expect(mockOnEvent).toHaveBeenCalledTimes(1);
        const call = mockOnEvent.mock.calls[0];
        expect(call[0]).toBe('stop');
        expect(call[1]).toStrictEqual({});
        expect(call[2]).toBe(device);
    });

    it('Should call with zigbee event', async () => {
        mockOnEvent.mockClear();
        await zigbeeHerdsman.events.deviceAnnounce({device});
        await flushPromises();
        expect(mockOnEvent).toHaveBeenCalledTimes(1);
        expect(mockOnEvent).toHaveBeenCalledWith('deviceAnnounce', {device}, device, settings.getDevice(device.ieeeAddr), {});
    });

    it('Should call index onEvent with zigbee event', async () => {
        zigbeeHerdsmanConverters.onEvent.mockClear();
        await zigbeeHerdsman.events.deviceAnnounce({device});
        await flushPromises();
        expect(zigbeeHerdsmanConverters.onEvent).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsmanConverters.onEvent).toHaveBeenCalledWith('deviceAnnounce', {device}, device);
    });
});
