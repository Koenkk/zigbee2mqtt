const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mocksClear = [MQTT.publish, logger.warn, logger.debug];

describe('Configure', () => {
    let controller;

    expectRemoteConfigured = () => {
        const device = zigbeeHerdsman.devices.remote;
        const endpoint1 = device.getEndpoint(1);
        expect(endpoint1.bind).toHaveBeenCalledTimes(2);
        expect(endpoint1.bind).toHaveBeenCalledWith('genOnOff', this.coordinatorEndoint);
        expect(endpoint1.bind).toHaveBeenCalledWith('genLevelCtrl', this.coordinatorEndoint);

        const endpoint2 = device.getEndpoint(2);
        expect(endpoint2.write).toHaveBeenCalledTimes(1);
        expect(endpoint2.write).toHaveBeenCalledWith("genBasic", {"49": {"type": 25, "value": 11}}, {"disableDefaultResponse": true, "manufacturerCode": 4107});
        expect(device.meta.configured).toBe(1);
    }

    expectRemoteNotConfigured = () => {
        const device = zigbeeHerdsman.devices.remote;
        const endpoint1 = device.getEndpoint(1);
        expect(endpoint1.bind).toHaveBeenCalledTimes(0);
    }

    mockClear = (device) => {
        for (const endpoint of device.endpoints) {
            endpoint.read.mockClear();
            endpoint.write.mockClear();
            endpoint.configureReporting.mockClear();
            endpoint.bind.mockClear();
        }
    }

    beforeEach(async () => {
        jest.useRealTimers();
        data.writeDefaultConfiguration();
        settings._reRead();
        data.writeEmptyState();
        controller = new Controller();
        await controller.start();
        mocksClear.forEach((m) => m.mockClear());
        await flushPromises();
        this.coordinatorEndoint = zigbeeHerdsman.devices.coordinator.getEndpoint(1);
    });

    it('Should configure on startup', async () => {
        expectRemoteConfigured();
    });

    it('Should re-configure when device rejoins', async () => {
        expectRemoteConfigured();
        const device = zigbeeHerdsman.devices.remote;
        const endpoint = device.getEndpoint(1);
        await flushPromises();
        mockClear(device);
        const payload = {device};
        zigbeeHerdsman.events.deviceJoined(payload);
        await flushPromises();
        expectRemoteConfigured();
    });

    it('Should not configure twice', async () => {
        expectRemoteConfigured();
        const device = zigbeeHerdsman.devices.remote;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        const payload = {data: {zclVersion: 1}, cluster: 'genBasic', device, endpoint, type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(0);
    });

    it('Should configure on zigbee message when not configured yet', async () => {
        const device = zigbeeHerdsman.devices.remote;
        delete device.meta.configured;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        const payload = {data: {zclVersion: 1}, cluster: 'genBasic', device, endpoint, type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expectRemoteConfigured();
    });

    it('Should allow to reconfigure manually', async () => {
        expectRemoteConfigured();
        mockClear(zigbeeHerdsman.devices.remote);
        expectRemoteNotConfigured();
        await MQTT.events.message('zigbee2mqtt/bridge/configure', 'remote');
        await flushPromises();
        expectRemoteConfigured();
    });

    it('Shouldnt manually reconfigure when device does not exist', async () => {
        await MQTT.events.message('zigbee2mqtt/bridge/configure', 'remote_random_non_existing');
        await flushPromises();
        expect(logger.error).toHaveBeenCalledWith(`Device 'remote_random_non_existing' does not exist`);
    });

    it('Should skip reconfigure when device does not require this', async () => {
        await MQTT.events.message('zigbee2mqtt/bridge/configure', 'bulb');
        await flushPromises();
        expect(logger.warn).toHaveBeenCalledWith(`Skipping configure of 'bulb', device does not require this.`)
    });

    it('Should not configure when interviewing', async () => {
        const device = zigbeeHerdsman.devices.remote;
        delete device.meta.configured;
        device.interviewing = true;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        const payload = {data: {zclVersion: 1}, cluster: 'genBasic', device, endpoint, type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expectRemoteNotConfigured();
        device.interviewing = false;
    });

    it('Should configure when not interviewCompleted', async () => {
        const device = zigbeeHerdsman.devices.remote;
        delete device.meta.configured;
        device.interviewCompleted = false;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        const payload = {data: {zclVersion: 1}, cluster: 'genBasic', device, endpoint, type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expectRemoteConfigured();
        device.interviewCompleted = true;
    });

    it('Should not configure when already configuring', async () => {
        const device = zigbeeHerdsman.devices.remote;
        delete device.meta.configured;
        const endpoint = device.getEndpoint(1);
        endpoint.bind.mockImplementationOnce(async () => await wait(500));
        mockClear(device);
        const payload = {data: {zclVersion: 1}, cluster: 'genBasic', device, endpoint, type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
    });

    it('Should configure max 3 times when fails', async () => {
        controller.extensions.find((e) => e.constructor.name === 'Configure').attempts = {};
        const device = zigbeeHerdsman.devices.remote;
        delete device.meta.configured;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        endpoint.bind.mockImplementationOnce(async () => {throw new Error('BLA')});
        const payload = {data: {zclVersion: 1}, cluster: 'genBasic', device, endpoint, type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        endpoint.bind.mockImplementationOnce(async () => {throw new Error('BLA')});
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        endpoint.bind.mockImplementationOnce(async () => {throw new Error('BLA')});
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        endpoint.bind.mockImplementationOnce(async () => {throw new Error('BLA')});
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        endpoint.bind.mockImplementationOnce(async () => {throw new Error('BLA')});
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
    });
});
