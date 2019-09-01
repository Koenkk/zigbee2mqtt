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

const mocksClear = [MQTT.publish, logger.warn, logger.debug];

describe('onlythis Device availability', () => {
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

    it('Should publish availabilty on startup', async () => {
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color/availability',
          'online',
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish availabilty offline when ping fails', async () => {
        MQTT.publish.mockClear();
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        endpoint.ping.mockImplementationOnce(() => {throw new Error('')});
        jest.advanceTimersByTime(11 * 1000);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color/availability',
          'offline',
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    // it('Should publish availabilty online on reconnect', async () => {
    //     const device = zigbeeHerdsman.devices.bulb_color;
    //     const endpoint = device.getEndpoint(1);
    //     endpoint.ping.mockImplementationOnce(() => {throw new Error('')});
    //     jest.advanceTimersByTime(11 * 1000);
    //     MQTT.publish.mockClear();
    //     endpoint.ping.mockImplementationOnce(() => {});
    //     jest.advanceTimersByTime(11 * 1000);
    //     await flushPromises();
    //     expect(MQTT.publish).toHaveBeenCalledWith(
    //         'zigbee2mqtt/bulb_color/availability',
    //       'online',
    //       { retain: true, qos: 0 },
    //       expect.any(Function)
    //     );
    // });
});
