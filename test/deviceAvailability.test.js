const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b3')
zigbeeHerdsman.returnDevices.push('0x00124b00120144ae')
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

const mocksClear = [MQTT.publish, logger.warn, logger.debug];

describe('Device availability', () => {
    let controller;

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings._reRead();
        data.writeEmptyState();
        jest.useFakeTimers();
        settings.set(['advanced', 'availability_timeout'], 10)
        controller = new Controller();
        mocksClear.forEach((m) => m.mockClear());
        await controller.start();
        await flushPromises();
    });

    afterEach(async () => {
        await controller.stop();
        await flushPromises();
    })

    it('Should publish availabilty on startup', async () => {
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color/availability',
          'online',
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('onlythis Should publish availabilty offline when ping fails', async () => {
        MQTT.publish.mockClear();
        logger.error.mockClear();
        logger.debug.mockClear();
        const device = zigbeeHerdsman.devices.bulb_color;
        device.ping.mockImplementationOnce(() => {throw new Error('failed')});
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenNthCalledWith(1,
            'zigbee2mqtt/bulb_color/availability',
          'offline',
          { retain: true, qos: 0 },
          expect.any(Function)
        );
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith("Failed to ping '0x000b57fffec6a5b3'");
        device.ping.mockImplementationOnce(() => {throw new Error('failed')});
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        expect(logger.debug).toHaveBeenCalledTimes(1);
        expect(logger.debug).toHaveBeenCalledWith("Failed to ping '0x000b57fffec6a5b3'");
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish).toHaveBeenNthCalledWith(2,
            'zigbee2mqtt/bulb_color/availability',
          'offline',
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish availabilty online and query state on reconnect', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        device.ping.mockImplementationOnce(() => {throw new Error('failed')});
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        MQTT.publish.mockClear();
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color/availability',
          'online',
          { retain: true, qos: 0 },
          expect.any(Function)
        );

        expect(endpoint.read).toHaveBeenCalledTimes(3);
        expect(endpoint.read).toHaveBeenCalledWith('genLevelCtrl', ['currentLevel']);
        expect(endpoint.read).toHaveBeenCalledWith('genOnOff', ['onOff']);
        expect(endpoint.read).toHaveBeenCalledWith('lightingColorCtrl', ['currentX', 'currentY', 'colorTemperature']);
    });

    it('Shouldnt ping again when still pinging', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        device.ping.mockClear();
        device.ping.mockImplementationOnce(async () => {await wait(100000000)});
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        expect(device.ping).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        expect(device.ping).toHaveBeenCalledTimes(1);
    });
});
