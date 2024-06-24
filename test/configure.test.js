const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = require('./lib/flushPromises');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stringify = require('json-stable-stringify-without-jsonify');

const mocksClear = [MQTT.publish, logger.warning, logger.debug];

describe('Configure', () => {
    let controller;
    let coordinatorEndpoint;

    const expectRemoteConfigured = () => {
        const device = zigbeeHerdsman.devices.remote;
        const endpoint1 = device.getEndpoint(1);
        expect(endpoint1.bind).toHaveBeenCalledTimes(2);
        expect(endpoint1.bind).toHaveBeenCalledWith('genOnOff', coordinatorEndpoint);
        expect(endpoint1.bind).toHaveBeenCalledWith('genLevelCtrl', coordinatorEndpoint);

        const endpoint2 = device.getEndpoint(2);
        expect(endpoint2.write).toHaveBeenCalledTimes(1);
        expect(endpoint2.write).toHaveBeenCalledWith('genBasic', {49: {type: 25, value: 11}}, {disableDefaultResponse: true, manufacturerCode: 4107});
        expect(device.meta.configured).toBe(332242049);
    };

    const expectBulbConfigured = () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint1 = device.getEndpoint(1);
        expect(endpoint1.read).toHaveBeenCalledTimes(2);
        expect(endpoint1.read).toHaveBeenCalledWith('lightingColorCtrl', ['colorCapabilities']);
        expect(endpoint1.read).toHaveBeenCalledWith('lightingColorCtrl', ['colorTempPhysicalMin', 'colorTempPhysicalMax']);
    };

    const expectBulbNotConfigured = () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint1 = device.getEndpoint(1);
        expect(endpoint1.read).toHaveBeenCalledTimes(0);
    };

    const expectRemoteNotConfigured = () => {
        const device = zigbeeHerdsman.devices.remote;
        const endpoint1 = device.getEndpoint(1);
        expect(endpoint1.bind).toHaveBeenCalledTimes(0);
    };

    const mockClear = (device) => {
        for (const endpoint of device.endpoints) {
            endpoint.read.mockClear();
            endpoint.write.mockClear();
            endpoint.configureReporting.mockClear();
            endpoint.bind.mockClear();
        }
    };

    let resetExtension = async () => {
        await controller.enableDisableExtension(false, 'Configure');
        await controller.enableDisableExtension(true, 'Configure');
    };

    beforeAll(async () => {
        jest.useFakeTimers();
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await jest.runOnlyPendingTimers();
        await flushPromises();
    });

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings.reRead();
        mocksClear.forEach((m) => m.mockClear());
        coordinatorEndpoint = zigbeeHerdsman.devices.coordinator.getEndpoint(1);
        await resetExtension();
        await jest.runOnlyPendingTimers();
    });

    afterAll(async () => {
        jest.useRealTimers();
    });

    it('Should configure Router on startup', async () => {
        expectBulbConfigured();
    });

    it('Should not configure EndDevice on startup', async () => {
        expectRemoteNotConfigured();
    });

    it('Should re-configure when device rejoins', async () => {
        expectBulbConfigured();
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        await flushPromises();
        mockClear(device);
        const payload = {device};
        zigbeeHerdsman.events.deviceJoined(payload);
        await flushPromises();
        expectBulbConfigured();
    });

    it('Should not re-configure disabled devices', async () => {
        expectBulbConfigured();
        const device = zigbeeHerdsman.devices.bulb;
        await flushPromises();
        mockClear(device);
        settings.set(['devices', device.ieeeAddr, 'disabled'], true);
        zigbeeHerdsman.events.deviceJoined({device});
        await flushPromises();
        expectBulbNotConfigured();
    });

    it('Should reconfigure reporting on reconfigure event', async () => {
        expectBulbConfigured();
        const device = controller.zigbee.resolveEntity(zigbeeHerdsman.devices.bulb);
        mockClear(device.zh);
        expectBulbNotConfigured();
        controller.eventBus.emitReconfigure({device});
        await flushPromises();
        expectBulbConfigured();
    });

    it('Should not configure twice', async () => {
        expectBulbConfigured();
        const device = zigbeeHerdsman.devices.bulb;
        mockClear(device);
        await zigbeeHerdsman.events.deviceInterview({device});
        await flushPromises();
        expectBulbNotConfigured();
    });

    it('Should configure on zigbee message when not configured yet', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        delete device.meta.configured;
        mockClear(device);
        await zigbeeHerdsman.events.lastSeenChanged({device});
        await flushPromises();
        expectBulbConfigured();
    });

    it('Should allow to configure via MQTT', async () => {
        mockClear(zigbeeHerdsman.devices.remote);
        expectRemoteNotConfigured();
        await MQTT.events.message('zigbee2mqtt/bridge/request/device/configure', 'remote');
        await flushPromises();
        expectRemoteConfigured();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure',
            stringify({data: {id: 'remote'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Fail to configure via MQTT when device does not exist', async () => {
        await MQTT.events.message('zigbee2mqtt/bridge/request/device/configure', stringify({id: 'not_existing_device'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure',
            stringify({data: {id: 'not_existing_device'}, status: 'error', error: "Device 'not_existing_device' does not exist"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Fail to configure via MQTT when configure fails', async () => {
        zigbeeHerdsman.devices.remote.getEndpoint(1).bind.mockImplementationOnce(async () => {
            throw new Error('Bind timeout after 10s');
        });
        await MQTT.events.message('zigbee2mqtt/bridge/request/device/configure', stringify({id: 'remote'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure',
            stringify({data: {id: 'remote'}, status: 'error', error: 'Failed to configure (Bind timeout after 10s)'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Fail to configure via MQTT when device has no configure', async () => {
        await MQTT.events.message('zigbee2mqtt/bridge/request/device/configure', stringify({id: '0x0017882104a44559', transaction: 20}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure',
            stringify({data: {id: '0x0017882104a44559'}, status: 'error', error: "Device 'TS0601_thermostat' cannot be configured", transaction: 20}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Legacy api: Should allow to reconfigure manually', async () => {
        mockClear(zigbeeHerdsman.devices.remote);
        expectRemoteNotConfigured();
        await MQTT.events.message('zigbee2mqtt/bridge/configure', 'remote');
        await flushPromises();
        expectRemoteConfigured();
    });

    it('Legacy api: Shouldnt manually reconfigure when device does not exist', async () => {
        await MQTT.events.message('zigbee2mqtt/bridge/configure', 'remote_random_non_existing');
        await flushPromises();
        expect(logger.error).toHaveBeenCalledWith(`Device 'remote_random_non_existing' does not exist`);
    });

    it('Legacy api: Should skip reconfigure when device does not require this', async () => {
        await MQTT.events.message('zigbee2mqtt/bridge/configure', '0x0017882104a44559');
        await flushPromises();
        expect(logger.warning).toHaveBeenCalledWith(`Skipping configure of 'TS0601_thermostat', device does not require this.`);
    });

    it('Should not configure when interview not completed', async () => {
        const device = zigbeeHerdsman.devices.remote;
        delete device.meta.configured;
        device.interviewCompleted = false;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        await zigbeeHerdsman.events.lastSeenChanged({device});
        await flushPromises();
        expectRemoteNotConfigured();
        device.interviewCompleted = true;
    });

    it('Should not configure when already configuring', async () => {
        const device = zigbeeHerdsman.devices.remote;
        delete device.meta.configured;
        const endpoint = device.getEndpoint(1);
        endpoint.bind.mockImplementationOnce(async () => await wait(500));
        mockClear(device);
        await zigbeeHerdsman.events.lastSeenChanged({device});
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        await zigbeeHerdsman.events.lastSeenChanged({device});
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
    });

    it('Should configure max 3 times when fails', async () => {
        controller.extensions.find((e) => e.constructor.name === 'Configure').attempts = {};
        const device = zigbeeHerdsman.devices.remote;
        delete device.meta.configured;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        endpoint.bind.mockImplementationOnce(async () => {
            throw new Error('BLA');
        });
        await zigbeeHerdsman.events.lastSeenChanged({device});
        await flushPromises();
        endpoint.bind.mockImplementationOnce(async () => {
            throw new Error('BLA');
        });
        await zigbeeHerdsman.events.lastSeenChanged({device});
        await flushPromises();
        endpoint.bind.mockImplementationOnce(async () => {
            throw new Error('BLA');
        });
        await zigbeeHerdsman.events.lastSeenChanged({device});
        await flushPromises();
        endpoint.bind.mockImplementationOnce(async () => {
            throw new Error('BLA');
        });
        await zigbeeHerdsman.events.lastSeenChanged({device});
        await flushPromises();
        endpoint.bind.mockImplementationOnce(async () => {
            throw new Error('BLA');
        });
        await zigbeeHerdsman.events.lastSeenChanged({device});
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
    });
});
