const data = require('./stub/data');
const logger = require('./stub/logger');
const stringify = require('json-stable-stringify-without-jsonify');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b3');
zigbeeHerdsman.returnDevices.push('0x00124b00120144ae');
zigbeeHerdsman.returnDevices.push('0x0017880104e45517');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = require('./lib/flushPromises');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mocks = [MQTT.publish, logger.warn, logger.debug];

const Minutes1 = 1000 * 60;
const msToHour = Minutes1 * 60;
const Hours25 = 25 * msToHour;
const Minutes10 = 10 * Minutes1;

describe('onlythis Availability', () => {
    let controller;
    let extension;
    let devices = {
        remote: zigbeeHerdsman.devices.remote,
        bulb_color: zigbeeHerdsman.devices.bulb_color
    };

    let resetExtension = async () => {
        await controller.enableDisableExtension(false, 'Availability');
        await controller.enableDisableExtension(true, 'Availability');
        extension = controller.extensions.find((e) => e.constructor.name === 'Availability');
    }

    // @ts-ignore
    const mockDateReturnValue = (value): void => Date.now.mockReturnValue(3000);

    beforeAll(async () => {
        jest.useFakeTimers();
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        Date.now = jest.fn()
        mockDateReturnValue(3000);
    });

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings.reRead();
        settings.set(['availability'], true);
        mocks.forEach((m) => m.mockClear());
        Object.values(devices).forEach((d) => d.ping.mockClear());
        await resetExtension();
    });

    afterEach(() => {
        // @ts-ignore
        Object.values(zigbeeHerdsman.devices).forEach(d => d.lastSeen = 1000);
    })

    afterAll(async () => {
        jest.useRealTimers();
    })

    it('Should publish availabilty on startup', async () => {
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_color/availability',
            'online', {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/remote/availability',
            'online', {retain: true, qos: 0}, expect.any(Function));
    });

    it('Should publish offline for active device when not seen for 10 minutes', async () => {
        MQTT.publish.mockClear();
        mockDateReturnValue(Minutes1 * 5);
        jest.advanceTimersByTime(Minutes1 * 5);
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);

        mockDateReturnValue(Minutes1 * 12);
        jest.advanceTimersByTime(Minutes1 * 6);
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_color/availability',
            'offline', {retain: true, qos: 0}, expect.any(Function));
    });

    it('Should publish offline for passive device when not seen for 25 hours', async () => {
        MQTT.publish.mockClear();
        mockDateReturnValue(Hours25 + Minutes10);
        jest.advanceTimersByTime(Hours25 + Minutes10);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/remote/availability',
            'offline', {retain: true, qos: 0}, expect.any(Function));
    });
});
