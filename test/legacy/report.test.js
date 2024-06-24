const data = require('../stub/data');
const logger = require('../stub/logger');
const zigbeeHerdsman = require('../stub/zigbeeHerdsman');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b3');
zigbeeHerdsman.returnDevices.push('0x00124b00120144ae');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b2');
zigbeeHerdsman.returnDevices.push('0x0017880104e45553');
zigbeeHerdsman.returnDevices.push('0x0017880104e45559');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b4');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b7');
zigbeeHerdsman.returnDevices.push('0x0017880104e45524');
zigbeeHerdsman.returnDevices.push('0x90fd9ffffe4b64ax');
const MQTT = require('../stub/mqtt');
const settings = require('../../lib/util/settings');
const Controller = require('../../lib/controller');
const flushPromises = require('../lib/flushPromises');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mocksClear = [MQTT.publish, logger.warning, logger.debug];

describe('Report', () => {
    let controller;
    let extension;

    function expectOnOffBrightnessColorReport(endpoint, colorXY) {
        const coordinatorEndpoint = zigbeeHerdsman.devices.coordinator.getEndpoint(1);
        const device = endpoint.getDevice();
        expect(device.meta.reporting).toBe(1);
        expect(endpoint.unbind).toHaveBeenCalledTimes(0);
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', coordinatorEndpoint);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', coordinatorEndpoint);
        expect(endpoint.bind).toHaveBeenCalledWith('lightingColorCtrl', coordinatorEndpoint);
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(3);
        expect(endpoint.configureReporting).toHaveBeenCalledWith('genOnOff', [
            {attribute: 'onOff', maximumReportInterval: 300, minimumReportInterval: 0, reportableChange: 0},
        ]);
        expect(endpoint.configureReporting).toHaveBeenCalledWith('genLevelCtrl', [
            {attribute: 'currentLevel', maximumReportInterval: 300, minimumReportInterval: 3, reportableChange: 1},
        ]);
        if (colorXY) {
            expect(endpoint.configureReporting).toHaveBeenCalledWith('lightingColorCtrl', [
                {attribute: 'colorTemperature', maximumReportInterval: 300, minimumReportInterval: 3, reportableChange: 1},
                {attribute: 'currentX', maximumReportInterval: 300, minimumReportInterval: 3, reportableChange: 1},
                {attribute: 'currentY', maximumReportInterval: 300, minimumReportInterval: 3, reportableChange: 1},
            ]);
        } else {
            expect(endpoint.configureReporting).toHaveBeenCalledWith('lightingColorCtrl', [
                {attribute: 'colorTemperature', maximumReportInterval: 300, minimumReportInterval: 3, reportableChange: 1},
            ]);
        }
    }

    function expectOnOffBrightnessColorReportDisabled(endpoint, colorXY) {
        const coordinatorEndpoint = zigbeeHerdsman.devices.coordinator.getEndpoint(1);
        const device = endpoint.getDevice();
        expect(device.meta.reporting).toBe(undefined);
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledTimes(0);
        expect(endpoint.unbind).toHaveBeenCalledWith('genOnOff', coordinatorEndpoint);
        expect(endpoint.unbind).toHaveBeenCalledWith('genLevelCtrl', coordinatorEndpoint);
        expect(endpoint.unbind).toHaveBeenCalledWith('lightingColorCtrl', coordinatorEndpoint);
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(3);
        expect(endpoint.configureReporting).toHaveBeenCalledWith('genOnOff', [
            {attribute: 'onOff', maximumReportInterval: 0xffff, minimumReportInterval: 0, reportableChange: 0},
        ]);
        expect(endpoint.configureReporting).toHaveBeenCalledWith('genLevelCtrl', [
            {attribute: 'currentLevel', maximumReportInterval: 0xffff, minimumReportInterval: 3, reportableChange: 1},
        ]);
        if (colorXY) {
            expect(endpoint.configureReporting).toHaveBeenCalledWith('lightingColorCtrl', [
                {attribute: 'colorTemperature', maximumReportInterval: 0xffff, minimumReportInterval: 3, reportableChange: 1},
                {attribute: 'currentX', maximumReportInterval: 0xffff, minimumReportInterval: 3, reportableChange: 1},
                {attribute: 'currentY', maximumReportInterval: 0xffff, minimumReportInterval: 3, reportableChange: 1},
            ]);
        } else {
            expect(endpoint.configureReporting).toHaveBeenCalledWith('lightingColorCtrl', [
                {attribute: 'colorTemperature', maximumReportInterval: 0xffff, minimumReportInterval: 3, reportableChange: 1},
            ]);
        }
    }

    const mockClear = (device) => {
        for (const endpoint of device.endpoints) {
            endpoint.read.mockClear();
            endpoint.write.mockClear();
            endpoint.configureReporting.mockClear();
            endpoint.bind.mockClear();
            endpoint.unbind.mockClear();
        }
    };

    beforeAll(async () => {
        jest.useFakeTimers();
        settings.set(['advanced', 'report'], true);
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        extension = controller.extensions.find((e) => e.constructor.name === 'Report');
    });

    beforeEach(async () => {
        extension.enabled = true;
        data.writeDefaultConfiguration();
        settings.reRead();
        for (const device of Object.values(zigbeeHerdsman.devices)) {
            mockClear(device);
            delete device.meta.reporting;
        }
        mocksClear.forEach((m) => m.mockClear());
        extension.queue = new Set();
        extension.failed = new Set();
        await extension.start();
    });

    afterAll(async () => {
        jest.useRealTimers();
    });

    it('Should configure reporting on startup', async () => {
        await extension.start();
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        expectOnOffBrightnessColorReport(endpoint, true);
    });

    it('Should not configure reporting on startup when disabled', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        delete device.meta.report;
        extension.enabled = false;
        await extension.start();
        expect(device.meta.reporting).toBe(undefined);
        expect(endpoint.bind).toHaveBeenCalledTimes(0);
    });

    it('Should disable reporting on startup when enabled earlier', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        device.meta.reporting = 1;
        const endpoint = device.getEndpoint(1);
        extension.enabled = false;
        mockClear(device);
        await extension.start();
        expectOnOffBrightnessColorReportDisabled(endpoint, true);
    });

    it('Should configure reporting when receicing message from device which has not been setup yet', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        device.save.mockClear();
        mockClear(device);
        delete device.meta.reporting;
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expectOnOffBrightnessColorReport(endpoint, false);
        expect(device.save).toHaveBeenCalledTimes(1);
    });

    it('Should not configure reporting when still configuring', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        endpoint.bind.mockImplementationOnce(async () => await wait(1000));
        delete device.meta.reporting;
        mockClear(device);
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
    });

    it('Should not mark as configured when reporting setup fails', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        endpoint.bind.mockImplementationOnce(async () => {
            throw new Error('failed');
        });
        delete device.meta.reporting;
        mockClear(device);
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(device.meta.reporting).toBeUndefined();
    });

    it('Should not configure reporting when interviewing', async () => {
        const device = zigbeeHerdsman.devices.bulb_2;
        const endpoint = device.getEndpoint(1);
        device.interviewing = true;
        delete device.meta.reporting;
        mockClear(device);
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(0);
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(0);
        expect(device.meta.reporting).toBeUndefined();
    });

    it('Should not configure reporting when receicing message from device which has already been setup yet', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(0);
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(0);
    });

    it('Should not configure reporting for end devices', async () => {
        const device = zigbeeHerdsman.devices.E11_G13;
        const endpoint = device.getEndpoint(1);
        expect(endpoint.bind).toHaveBeenCalledTimes(0);
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(0);
    });

    it('Should configure reporting when deviceAnnounce message from IKEA device', async () => {
        const device = zigbeeHerdsman.devices.bulb_2;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        const payload = {device};
        await zigbeeHerdsman.events.deviceAnnounce(payload);
        await flushPromises();
        expectOnOffBrightnessColorReport(endpoint, false);
    });

    it('Should not configure reporting on device leave', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        delete device.meta.reporting;
        mockClear(device);
        await zigbeeHerdsman.events.deviceLeave({ieeeAddr: device.ieeeAddr});
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(0);
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(0);
    });

    it('Should not configure reporting for the CC2530 router', async () => {
        const device = zigbeeHerdsman.devices.CC2530_ROUTER;
        const endpoint = device.getEndpoint(1);
        delete device.meta.reporting;
        mockClear(device);
        await zigbeeHerdsman.events.deviceLeave({ieeeAddr: device.ieeeAddr});
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(0);
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(0);
    });

    it('Should not configure reporting again when it already failed once', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        endpoint.bind.mockImplementationOnce(async () => {
            throw new Error('failed');
        });
        delete device.meta.reporting;
        mockClear(device);
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
    });

    it('Should not configure reporting for the ZNLDP12LM closuresWindowCovering as it is ignored', async () => {
        const device = zigbeeHerdsman.devices.ZNLDP12LM;
        const coordinatorEndpoint = zigbeeHerdsman.devices.coordinator.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        delete device.meta.reporting;
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', coordinatorEndpoint);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', coordinatorEndpoint);
        expect(endpoint.bind).toHaveBeenCalledWith('lightingColorCtrl', coordinatorEndpoint);
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(3);
    });

    it('Should not setup colorTemperature reporting when bulb does not support it and should read colorCapabilities when its not there yet ', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const coordinatorEndpoint = zigbeeHerdsman.devices.coordinator.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        const configuredReportings = endpoint.configuredReportings;
        endpoint.configuredReportings = [];
        delete device.meta.reporting;
        mockClear(device);
        endpoint.getClusterAttributeValue = jest.fn();

        let count = 0;
        endpoint.getClusterAttributeValue.mockImplementation((d) => {
            count++;
            if (count === 1) return undefined;
            return 17;
        });

        const payload = {device};
        await zigbeeHerdsman.events.deviceAnnounce(payload);
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', coordinatorEndpoint);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', coordinatorEndpoint);
        expect(endpoint.bind).toHaveBeenCalledWith('lightingColorCtrl', coordinatorEndpoint);
        expect(endpoint.read).toHaveBeenCalledWith('lightingColorCtrl', ['colorCapabilities']);
        expect(endpoint.configureReporting).toHaveBeenCalledWith('lightingColorCtrl', [
            {attribute: 'colorTemperature', maximumReportInterval: 300, minimumReportInterval: 3, reportableChange: 1},
        ]);
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(3);
        endpoint.configuredReportings = configuredReportings;
    });
});
