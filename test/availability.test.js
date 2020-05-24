const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b3');
zigbeeHerdsman.returnDevices.push('0x00124b00120144ae');
zigbeeHerdsman.returnDevices.push('0x0017880104e45553');
zigbeeHerdsman.returnDevices.push('0x0017880104e45517');

const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

const mocksClear = [MQTT.publish, logger.warn, logger.debug];

describe('Availability', () => {
    let controller;

    function getExtension() {
        return controller.extensions.find((e) => e.constructor.name === 'Availability');
    }

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

    it('Should publish availabilty offline when ping fails', async () => {
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
        expect(logger.error).toHaveBeenCalledWith("Failed to ping 'bulb_color'");
        device.ping.mockImplementationOnce(() => {throw new Error('failed')});
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        expect(logger.debug).toHaveBeenCalledTimes(3);
        expect(logger.debug).toHaveBeenCalledWith("Failed to ping 'bulb_color'");
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenNthCalledWith(1,
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

    it('Should fail gracefully when quering state after reconnect fails', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        endpoint.read.mockClear();
        endpoint.read.mockImplementationOnce(() => {throw new Error('Device timedout')});
        device.ping.mockImplementationOnce(() => {throw new Error('failed')});
        logger.debug.mockClear();
        jest.advanceTimersByTime(11 * 2000);
        await flushPromises();

        expect(endpoint.read).toHaveBeenCalledTimes(1);
        expect(endpoint.read).toHaveBeenCalledWith('genOnOff', ['onOff']);
        expect(logger.error).toHaveBeenCalledWith(`Failed to read state of 'bulb_color' after reconnect`);
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

    it('Should mark device online when receiving message while offline', async () => {
        MQTT.publish.mockClear();
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        device.ping.mockImplementationOnce(() => {throw new Error('failed')});
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();

        MQTT.publish.mockClear();
        const data = {modelID: 'test'}
        const payload = {data, cluster: 'genOnOff', device, endpoint, type: 'readResponse', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenNthCalledWith(1,
            'zigbee2mqtt/bulb_color/availability',
          'online',
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should retrieve the state when device is turned on/off within availability timeout', async () => {
        MQTT.publish.mockClear();
        getExtension().state = {};
        const payload = {device: zigbeeHerdsman.devices.bulb_color};
        await zigbeeHerdsman.events.deviceJoined(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color/availability',
          'online',
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should retrieve the state when device is turned on/off within availability timeout on deviceAnnounce', async () => {
        MQTT.publish.mockClear();
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        endpoint.read.mockClear();
        await zigbeeHerdsman.events.deviceAnnounce({device});
        await flushPromises();
        expect(endpoint.read).toHaveBeenCalledTimes(3);
        expect(endpoint.read).toHaveBeenCalledWith('genLevelCtrl', ['currentLevel']);
        expect(endpoint.read).toHaveBeenCalledWith('genOnOff', ['onOff']);
        expect(endpoint.read).toHaveBeenCalledWith('lightingColorCtrl', ['currentX', 'currentY', 'colorTemperature']);
    });

    it('Should not retrieve the state when device is turned on/off within availability timeout on deviceJoined', async () => {
        MQTT.publish.mockClear();
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        endpoint.read.mockClear();
        await zigbeeHerdsman.events.deviceJoined({device});
        await flushPromises();
        expect(endpoint.read).toHaveBeenCalledTimes(0);
    });

    it('Should not do anything when message has no device', async () => {
        MQTT.publish.mockClear();
        const device = zigbeeHerdsman.devices.bulb_color;
        const payload = {ieeeAddr: device.ieeeAddr};
        await zigbeeHerdsman.events.deviceLeave(payload);
        await flushPromises();
        expect(MQTT.publish.mock.calls.find((c) => c[0].includes('availability'))).toBeUndefined();
    });

    it('Should not ping devices blacklisted by friendly name', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        settings.set(['advanced', 'availability_blacklist'], ['bulb_color'])
        await controller.stop();
        await flushPromises();
        controller = new Controller();
        await controller.start();
        await flushPromises();
        device.ping.mockClear();
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        expect(device.ping).toHaveBeenCalledTimes(0);
    });

    it('Should not ping devices blacklisted by IEEE address', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        settings.set(['advanced', 'availability_blacklist'], [device.ieeeAddr]);
        await controller.stop();
        await flushPromises();
        controller = new Controller();
        await controller.start();
        await flushPromises();
        device.ping.mockClear();
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        expect(device.ping).toHaveBeenCalledTimes(0);
    });

    it('Should ping forced pingable devices', async () => {
        const device = zigbeeHerdsman.devices.E11_G13;
        const endpoint = device.getEndpoint(1);
        const data = {modelID: 'test'}
        const payload = {data, cluster: 'genOnOff', device, endpoint, type: 'readResponse', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        device.ping.mockClear();
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        expect(device.ping).toHaveBeenCalledTimes(1);
    });

    it('Should ping devices whitelisted by friendly name if availability_whitelist is set', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        settings.set(['advanced', 'availability_whitelist'], ['bulb_color']);
        await controller.stop();
        await flushPromises();
        controller = new Controller();
        await controller.start();
        await flushPromises();
        device.ping.mockClear();
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        expect(device.ping).toHaveBeenCalledTimes(1);
    });

    it('Should ping devices whitelisted by IEEE address if availability_whitelist is set', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        settings.set(['advanced', 'availability_whitelist'], [device.ieeeAddr]);
        await controller.stop();
        await flushPromises();
        controller = new Controller();
        await controller.start();
        await flushPromises();
        device.ping.mockClear();
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        expect(device.ping).toHaveBeenCalledTimes(1);
    });

    it('Should not ping non-whitelisted devices if availability_whitelist is set', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        getExtension().state[device.ieeeAddr] = false;
        settings.set(['advanced', 'availability_whitelist'], ['0x000b57fffec6a5b3'])
        await controller.stop();
        await flushPromises();
        controller = new Controller();
        await controller.start();
        await flushPromises();
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        expect(device.ping).toHaveBeenCalledTimes(0);
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceAnnounce({device});
    });

    it('Should not read when device has no modelID and reconnects', async () => {
        const device = zigbeeHerdsman.devices.nomodel;
        getExtension().state[device.ieeeAddr] = true;
        const endpoint = device.getEndpoint(1);
        await zigbeeHerdsman.events.deviceAnnounce({device});
        await flushPromises();
        expect(endpoint.read).toHaveBeenCalledTimes(0);
    });

    it('Should not read when device has is unsupported', async () => {
        const device = zigbeeHerdsman.devices.unsupported_router;
        getExtension().state[device.ieeeAddr] = true;
        const endpoint = device.getEndpoint(1);
        await zigbeeHerdsman.events.deviceAnnounce({device});
        await flushPromises();
        expect(endpoint.read).toHaveBeenCalledTimes(0);
    });

    it('Should stop pinging device when removed', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        device.ping.mockClear();
        const endpoint = device.getEndpoint(1);
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        expect(device.ping).toHaveBeenCalledTimes(1);
        settings.removeDevice(device.ieeeAddr);
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        expect(device.ping).toHaveBeenCalledTimes(1);
    });

    it('Should publish availability when end device joins', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM;
        const payload = {device};
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceJoined(payload);
        await flushPromises();
        expect(device.ping).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button_double_key/availability',
          'online',
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should mark non-pingable device as non-available when offline for longer than 24 hours', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const defaultLastSeen = device.lastSeen;
        device.lastSeen = Date.now();
        MQTT.publish.mockClear();
        jest.advanceTimersByTime(1000 * 60 * 60 * 1); // 1 hours
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
        device.lastSeen = device.lastSeen - (1000 * 60 * 60 * 25);
        jest.advanceTimersByTime(1000 * 60 * 60 * 1); // 1 hours
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/remote/availability',
          'offline',
          { retain: true, qos: 0 },
          expect.any(Function)
        );

        // Shouldn't do anything more when device is removed
        settings.removeDevice(device.ieeeAddr);
        jest.advanceTimersByTime(1000 * 60 * 60 * 1); // 1 hours
        expect(MQTT.publish).toHaveBeenCalledTimes(1);

        device.lastSeen = defaultLastSeen;
    });
});
