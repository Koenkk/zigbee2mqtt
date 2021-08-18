const data = require('./stub/data');
const logger = require('./stub/logger');
const stringify = require('json-stable-stringify-without-jsonify');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b3');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b4');
zigbeeHerdsman.returnDevices.push('0x00124b00120144ae');
zigbeeHerdsman.returnDevices.push('0x0017880104e45517');
const MQTT = require('./stub/mqtt');
const utils = require('../lib/util/utils');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = require('./lib/flushPromises');
const mocks = [MQTT.publish, logger.warn, logger.debug];

const hours = (hours) => 1000 * 60 * 60 * hours;
const minutes = (minutes) => 1000 * 60 * minutes;

describe('Availability', () => {
    let controller;
    let extension;
    let devices = zigbeeHerdsman.devices;

    let resetExtension = async () => {
        await controller.enableDisableExtension(false, 'AvailabilityNew');
        await controller.enableDisableExtension(true, 'AvailabilityNew');
        extension = controller.extensions.find((e) => e.constructor.name === 'AvailabilityNew');
    }

    const advancedTime = async (value) => {
        jest.setSystemTime(Date.now() + value);
        jest.advanceTimersByTime(value);
        await flushPromises();
    }

    beforeAll(async () => {
        jest.spyOn(utils, 'sleep').mockImplementation(() => {});
        jest.useFakeTimers('modern');
        settings.reRead();
        settings.set(['availability'], true);
        settings.set(['experimental', 'availability_new'], true);
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
    });

    beforeEach(async () => {
        jest.useFakeTimers('modern').setSystemTime(minutes(1));
        data.writeDefaultConfiguration();
        // @ts-ignore
        Object.values(zigbeeHerdsman.devices).forEach(d => d.lastSeen = minutes(1));
        mocks.forEach((m) => m.mockClear());
        await resetExtension();
        // @ts-ignore
        Object.values(devices).forEach((d) => d.ping.mockClear());
    });

    afterEach(async () => {
        // @ts-ignore
        Object.values(zigbeeHerdsman.devices).forEach(d => d.lastSeen = minutes(1));
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

        await advancedTime(minutes(5));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);

        await advancedTime(minutes(7));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(1);
        expect(devices.bulb_color.ping).toHaveBeenNthCalledWith(1, true);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_color/availability',
            'offline', {retain: true, qos: 0}, expect.any(Function));
    });

    it('Should publish offline for passive device when not seen for 25 hours', async () => {
        MQTT.publish.mockClear();
        await advancedTime(hours(26));
        expect(devices.remote.ping).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/remote/availability',
            'offline', {retain: true, qos: 0}, expect.any(Function));
    });

    it('Should reset ping timer when device last seen changes for active device', async () => {
        MQTT.publish.mockClear();

        await advancedTime(minutes(5));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);

        await zigbeeHerdsman.events.lastSeenChanged({device: devices.bulb_color});

        await advancedTime(minutes(7));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);

        await advancedTime(minutes(10));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(1);
        expect(devices.bulb_color.ping).toHaveBeenNthCalledWith(1, true);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_color/availability',
            'offline', {retain: true, qos: 0}, expect.any(Function));
    });

    it('Should ping again when first ping fails', async () => {
        MQTT.publish.mockClear();

        await advancedTime(minutes(5));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);

        await zigbeeHerdsman.events.lastSeenChanged({device: devices.bulb_color});

        await advancedTime(minutes(7));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);

        devices.bulb_color.ping.mockImplementationOnce(() => {throw new Error('failed')});
        devices.bulb_color.lastSeen = Date.now() + minutes(10);
        await advancedTime(minutes(10));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(2);
        expect(devices.bulb_color.ping).toHaveBeenNthCalledWith(1, true);
        expect(devices.bulb_color.ping).toHaveBeenNthCalledWith(2, false);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_color/availability',
            'offline', {retain: true, qos: 0}, expect.any(Function));
    });

    it('Should reset ping timer when device last seen changes for passive device', async () => {
        MQTT.publish.mockClear();

        await advancedTime(hours(24));
        expect(devices.remote.ping).toHaveBeenCalledTimes(0);

        await zigbeeHerdsman.events.lastSeenChanged({device: devices.remote});

        await advancedTime(hours(25));
        expect(devices.remote.ping).toHaveBeenCalledTimes(0);

        devices.remote.ping.mockImplementationOnce(() => {throw new Error('failed')});
        await advancedTime(hours(3));
        expect(devices.remote.ping).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/remote/availability',
            'offline', {retain: true, qos: 0}, expect.any(Function));
    });

    it('Should immediately mark device as online when it lastSeen changes', async () => {
        MQTT.publish.mockClear();

        await advancedTime(minutes(15));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_color/availability',
            'offline', {retain: true, qos: 0}, expect.any(Function));

        devices.bulb_color.lastSeen = Date.now();
        await zigbeeHerdsman.events.lastSeenChanged({device: devices.bulb_color});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_color/availability',
            'online', {retain: true, qos: 0}, expect.any(Function));
    });
});
