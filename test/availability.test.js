const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = require('./lib/flushPromises');
const Availability = require('../lib/extension/availability').default;
const stringify = require('json-stable-stringify-without-jsonify');
const utils = require('../lib/util/utils').default;

const mocks = [MQTT.publish, logger.warning, logger.info];
const devices = zigbeeHerdsman.devices;
zigbeeHerdsman.returnDevices.push(
    ...[
        devices.bulb_color.ieeeAddr,
        devices.bulb_color_2.ieeeAddr,
        devices.coordinator.ieeeAddr,
        devices.remote.ieeeAddr,
        devices.TS0601_thermostat.ieeeAddr,
        devices.bulb_2.ieeeAddr,
        devices.ZNCZ02LM.ieeeAddr,
        devices.GLEDOPTO_2ID.ieeeAddr,
        devices.QBKG03LM.ieeeAddr,
    ],
);

describe('Availability', () => {
    let controller;

    let resetExtension = async () => {
        await controller.enableDisableExtension(false, 'Availability');
        await controller.enableDisableExtension(true, 'Availability');
    };

    const setTimeAndAdvanceTimers = async (value) => {
        jest.setSystemTime(Date.now() + value);
        await jest.advanceTimersByTimeAsync(value);
    };

    beforeAll(async () => {
        jest.spyOn(utils, 'sleep').mockImplementation(async (seconds) => {});
        jest.useFakeTimers();
        settings.reRead();
        settings.set(['availability'], true);
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
    });

    beforeEach(async () => {
        jest.setSystemTime(utils.minutes(1));
        data.writeDefaultConfiguration();
        settings.reRead();
        settings.set(['availability'], true);
        settings.set(['devices', devices.bulb_color_2.ieeeAddr, 'availability'], false);
        Object.values(devices).forEach((d) => (d.lastSeen = utils.minutes(1)));
        mocks.forEach((m) => m.mockClear());
        await resetExtension();
        Object.values(devices).forEach((d) => d.ping.mockClear());
    });

    afterEach(async () => {});

    afterAll(async () => {
        await controller.stop();
        jest.useRealTimers();
    });

    it('Should publish availability on startup for device where it is enabled for', async () => {
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_color/availability', 'online', {retain: true, qos: 1}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/remote/availability', 'online', {retain: true, qos: 1}, expect.any(Function));
        expect(MQTT.publish).not.toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color_2/availability',
            'online',
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should ping on startup for enabled and unavailable devices', async () => {
        settings.set(['devices', devices.bulb_color_2.ieeeAddr, 'availability'], true);
        devices.bulb_color.lastSeen = Date.now() - utils.minutes(20);
        devices.bulb_color_2.lastSeen = Date.now();
        await resetExtension();

        await setTimeAndAdvanceTimers(utils.minutes(1));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(1); // enabled/unavailable
        expect(devices.bulb_color_2.ping).toHaveBeenCalledTimes(0); // enabled/available
    });

    it('Should not ping on startup for available or disabled devices', async () => {
        settings.set(['devices', devices.bulb_color_2.ieeeAddr, 'availability'], true);
        settings.set(['devices', devices.bulb_color_2.ieeeAddr, 'disabled'], true);
        devices.bulb_color.lastSeen = Date.now();
        devices.bulb_color_2.lastSeen = Date.now() - utils.minutes(20);
        await resetExtension();

        await setTimeAndAdvanceTimers(utils.minutes(1));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0); // enabled/available
        expect(devices.bulb_color_2.ping).toHaveBeenCalledTimes(0); // disabled/unavailable
    });

    it('Should publish offline for active device when not seen for 10 minutes', async () => {
        MQTT.publish.mockClear();
        await setTimeAndAdvanceTimers(utils.minutes(5));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);

        await setTimeAndAdvanceTimers(utils.minutes(7));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(1);
        expect(devices.bulb_color.ping).toHaveBeenNthCalledWith(1, true);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_color/availability', 'offline', {retain: true, qos: 1}, expect.any(Function));
    });

    it('Shouldnt do anything for a device when availability: false is set for device', async () => {
        await zigbeeHerdsman.events.lastSeenChanged({device: devices.bulb_color_2}); // Coverage satisfaction

        await setTimeAndAdvanceTimers(utils.minutes(12));
        expect(devices.bulb_color_2.ping).toHaveBeenCalledTimes(0);
    });

    it('Should publish offline for passive device when not seen for 25 hours', async () => {
        MQTT.publish.mockClear();
        await setTimeAndAdvanceTimers(utils.hours(26));
        expect(devices.remote.ping).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/remote/availability', 'offline', {retain: true, qos: 1}, expect.any(Function));
    });

    it('Should reset ping timer when device last seen changes for active device', async () => {
        MQTT.publish.mockClear();

        await setTimeAndAdvanceTimers(utils.minutes(5));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);

        await zigbeeHerdsman.events.lastSeenChanged({device: devices.bulb_color});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_color/availability', 'offline', {retain: true, qos: 1}, expect.any(Function));

        await setTimeAndAdvanceTimers(utils.minutes(7));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);

        await setTimeAndAdvanceTimers(utils.minutes(10));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(1);
        expect(devices.bulb_color.ping).toHaveBeenNthCalledWith(1, true);
    });

    it('Should ping again when first ping fails', async () => {
        MQTT.publish.mockClear();

        await zigbeeHerdsman.events.lastSeenChanged({device: devices.bulb_color});

        devices.bulb_color.ping.mockImplementationOnce(() => {
            throw new Error('failed');
        });

        await setTimeAndAdvanceTimers(utils.minutes(15));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(2);
        expect(devices.bulb_color.ping).toHaveBeenNthCalledWith(1, true);
        expect(devices.bulb_color.ping).toHaveBeenNthCalledWith(2, false);
    });

    it('Should reset ping timer when device last seen changes for passive device', async () => {
        MQTT.publish.mockClear();

        await setTimeAndAdvanceTimers(utils.hours(24));
        expect(devices.remote.ping).toHaveBeenCalledTimes(0);

        await zigbeeHerdsman.events.lastSeenChanged({device: devices.remote});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/remote/availability', 'offline', {retain: true, qos: 1}, expect.any(Function));

        await setTimeAndAdvanceTimers(utils.hours(25));
        expect(devices.remote.ping).toHaveBeenCalledTimes(0);

        await setTimeAndAdvanceTimers(utils.hours(3));
        expect(devices.remote.ping).toHaveBeenCalledTimes(0);
    });

    it('Should immediately mark device as online when it lastSeen changes', async () => {
        MQTT.publish.mockClear();

        await setTimeAndAdvanceTimers(utils.minutes(15));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_color/availability', 'offline', {retain: true, qos: 1}, expect.any(Function));

        devices.bulb_color.lastSeen = Date.now();
        await zigbeeHerdsman.events.lastSeenChanged({device: devices.bulb_color});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_color/availability', 'online', {retain: true, qos: 1}, expect.any(Function));
    });

    it('Should allow to change availability timeout via device options', async () => {
        settings.set(['devices', '0x000b57fffec6a5b3', 'availability'], {timeout: 40});
        await resetExtension();
        devices.bulb_color.ping.mockClear();

        await setTimeAndAdvanceTimers(utils.minutes(25));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);

        await setTimeAndAdvanceTimers(utils.minutes(17));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(1);
    });

    it('Should not ping disabled devices', async () => {
        settings.set(['devices', devices.bulb_color.ieeeAddr, 'disabled'], true);
        await resetExtension();
        devices.bulb_color.ping.mockClear();

        await setTimeAndAdvanceTimers(utils.minutes(15));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);
    });

    it('Should allow to change availability timeout via avaiability options', async () => {
        settings.set(['availability'], {active: {timeout: 30}});
        await resetExtension();
        devices.bulb_color.ping.mockClear();

        await setTimeAndAdvanceTimers(utils.minutes(25));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);

        await setTimeAndAdvanceTimers(utils.minutes(7));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(1);
    });

    it('Should stop pinging device when it leaves', async () => {
        await setTimeAndAdvanceTimers(utils.minutes(9));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);

        await zigbeeHerdsman.events.deviceLeave({ieeeAddr: devices.bulb_color.ieeeAddr});
        await flushPromises();

        await setTimeAndAdvanceTimers(utils.minutes(3));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);
    });

    it('Should stop pinging device when it is removed', async () => {
        await setTimeAndAdvanceTimers(utils.minutes(9));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);

        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', stringify({id: 'bulb_color'}));
        await flushPromises();

        await setTimeAndAdvanceTimers(utils.minutes(3));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);
    });

    it('Should allow to be disabled', async () => {
        settings.set(['availability'], false);
        await resetExtension();
        devices.bulb_color.ping.mockClear();

        await setTimeAndAdvanceTimers(utils.minutes(12));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);
    });

    it('Should allow to enable availability for just one device', async () => {
        settings.set(['availability'], false);
        settings.set(['devices', devices.bulb_color.ieeeAddr, 'availability'], true);

        await resetExtension();
        devices.bulb_color.ping.mockClear();

        await setTimeAndAdvanceTimers(utils.minutes(11));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(1);
    });

    it('Should retrieve device state when it reconnects', async () => {
        //@ts-expect-error private
        const device = controller.zigbee.resolveEntity(devices.bulb_color.ieeeAddr);
        //@ts-expect-error private
        controller.state.set(device, {state: 'OFF'});

        const endpoint = devices.bulb_color.getEndpoint(1);
        endpoint.read.mockClear();

        await zigbeeHerdsman.events.deviceAnnounce({device: devices.bulb_color});
        await flushPromises();
        await setTimeAndAdvanceTimers(utils.seconds(1));
        await zigbeeHerdsman.events.deviceAnnounce({device: devices.bulb_color});
        await flushPromises();

        expect(endpoint.read).toHaveBeenCalledTimes(0);
        await setTimeAndAdvanceTimers(utils.seconds(2));

        expect(endpoint.read).toHaveBeenCalledTimes(1);
        expect(endpoint.read).toHaveBeenCalledWith('genOnOff', ['onOff']);

        endpoint.read.mockClear();
        await zigbeeHerdsman.events.deviceAnnounce({device: devices.bulb_color});
        await flushPromises();
        endpoint.read.mockImplementationOnce(() => {
            throw new Error('');
        });
        await setTimeAndAdvanceTimers(utils.seconds(3));
        expect(endpoint.read).toHaveBeenCalledTimes(1);
    });

    it('Should republish availability when device is renamed', async () => {
        MQTT.publish.mockClear();

        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({from: 'bulb_color', to: 'bulb_new_name'}));
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_color/availability', '', {retain: true, qos: 1}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_new_name/availability', 'online', {retain: true, qos: 1}, expect.any(Function));
        await setTimeAndAdvanceTimers(utils.hours(12));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_new_name/availability', 'offline', {retain: true, qos: 1}, expect.any(Function));
    });

    it('Should publish availability payload in JSON format', async () => {
        settings.set(['advanced', 'legacy_availability_payload'], false);
        await resetExtension();
        devices.remote.ping.mockClear();
        MQTT.publish.mockClear();
        await setTimeAndAdvanceTimers(utils.hours(26));
        expect(devices.remote.ping).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/remote/availability',
            stringify({state: 'offline'}),
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Deprecated - should allow to block via advanced.availability_blocklist', async () => {
        settings.set(['advanced', 'availability_blocklist'], [devices.bulb_color.ieeeAddr]);
        await resetExtension();
        devices.bulb_color.ping.mockClear();

        await setTimeAndAdvanceTimers(utils.minutes(12));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);
    });

    it('Deprecated - should allow to pass certain devices via availability_passlist', async () => {
        settings.set(['advanced', 'availability_passlist'], [devices.bulb_color_2.ieeeAddr]);
        settings.changeEntityOptions(devices.bulb_color_2.ieeeAddr, {availability: null});
        await resetExtension();
        devices.bulb_color.ping.mockClear();
        devices.bulb_color_2.ping.mockClear();

        await setTimeAndAdvanceTimers(utils.minutes(12));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(0);
        expect(devices.bulb_color_2.ping).toHaveBeenCalledTimes(1);
    });

    it('Deprecated - should allow to enable via availability_timeout', async () => {
        settings.set(['availability'], false);
        settings.set(['advanced', 'availability_timeout'], 60);
        await resetExtension();
        devices.bulb_color.ping.mockClear();

        await setTimeAndAdvanceTimers(utils.minutes(12));
        expect(devices.bulb_color.ping).toHaveBeenCalledTimes(1);
    });

    it('Should publish availability for groups', async () => {
        settings.set(['devices', devices.bulb_color_2.ieeeAddr, 'availability'], true);
        await resetExtension();
        devices.bulb_color_2.ping.mockClear();

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/group_tradfri_remote/availability',
            'online',
            {retain: true, qos: 1},
            expect.any(Function),
        );
        MQTT.publish.mockClear();
        await setTimeAndAdvanceTimers(utils.minutes(12));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/group_tradfri_remote/availability',
            'offline',
            {retain: true, qos: 1},
            expect.any(Function),
        );
        MQTT.publish.mockClear();
        devices.bulb_color_2.lastSeen = Date.now();
        await zigbeeHerdsman.events.lastSeenChanged({device: devices.bulb_color_2});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/group_tradfri_remote/availability',
            'online',
            {retain: true, qos: 1},
            expect.any(Function),
        );
    });

    it('Should clear the ping queue on stop', async () => {
        //@ts-expect-error private
        const availability = controller.extensions.find((extension) => extension instanceof Availability);
        const publishAvailabilitySpy = jest.spyOn(availability, 'publishAvailability');

        devices.bulb_color.ping.mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve, 1000)));
        availability.addToPingQueue(devices.bulb_color);
        availability.addToPingQueue(devices.bulb_color_2);

        await availability.stop();
        await setTimeAndAdvanceTimers(utils.minutes(1));

        expect(availability.pingQueue).toEqual([]);
        // Validate the stop-interrupt implicitly by checking that it prevents further function invocations
        expect(publishAvailabilitySpy).not.toHaveBeenCalled();
        devices.bulb_color.ping = jest.fn(); // ensure reset
    });

    it('Should prevent instance restart', async () => {
        //@ts-expect-error private
        const availability = controller.extensions.find((extension) => extension instanceof Availability);

        await availability.stop();

        await expect(() => availability.start()).rejects.toThrow();
    });
});
