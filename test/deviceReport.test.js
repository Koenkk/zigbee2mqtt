const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b3');
zigbeeHerdsman.returnDevices.push('0x00124b00120144ae');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b2');
zigbeeHerdsman.returnDevices.push('0x0017880104e45553');
zigbeeHerdsman.returnDevices.push('0x0017880104e45559');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mocksClear = [MQTT.publish, logger.warn, logger.debug];

describe('Device report', () => {
    let controller;

    function expectOnOffBrightnessColorReport(endpoint) {
        const coordinatorEndpoint = zigbeeHerdsman.devices.coordinator.getEndpoint(1);
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', coordinatorEndpoint);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', coordinatorEndpoint);
        expect(endpoint.bind).toHaveBeenCalledWith('lightingColorCtrl', coordinatorEndpoint);
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(3);
        expect(endpoint.configureReporting).toHaveBeenCalledWith('genOnOff', [{"attribute": "onOff", "maximumReportInterval": 300, "minimumReportInterval": 0, "reportableChange": 0}]);
        expect(endpoint.configureReporting).toHaveBeenCalledWith('genLevelCtrl', [{"attribute": "currentLevel", "maximumReportInterval": 300, "minimumReportInterval": 3, "reportableChange": 0}]);
        expect(endpoint.configureReporting).toHaveBeenCalledWith('lightingColorCtrl', [{"attribute": "colorTemperature", "maximumReportInterval": 300, "minimumReportInterval": 3, "reportableChange": 0}, {"attribute": "currentX", "maximumReportInterval": 300, "minimumReportInterval": 3, "reportableChange": 0}, {"attribute": "currentY", "maximumReportInterval": 300, "minimumReportInterval": 3, "reportableChange": 0}]);
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
        data.writeDefaultConfiguration();
        settings._reRead();
        data.writeEmptyState();
        settings.set(['advanced', 'report'], true);
        controller = new Controller();
        await controller.start();
        mocksClear.forEach((m) => m.mockClear());
        await flushPromises();
    });

    it('Should configure reporting on startup', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        expectOnOffBrightnessColorReport(endpoint);
    });

    it('Should configure reporting when receicing message from device which has not been setup yet', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        device.save.mockClear();
        mockClear(device);
        delete device.meta.reporting;
        const data = {onOff: 1}
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expectOnOffBrightnessColorReport(endpoint);
        expect(device.save).toHaveBeenCalledTimes(1);
    });

    it('Should not configure reporting when still configuring', async () => {
        jest.useFakeTimers();
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
        jest.runAllTimers();
        jest.useRealTimers();
    });

    it('Should not mark as configured when reporting setup fails', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        endpoint.bind.mockImplementationOnce(async () => {throw new Error('failed')});
        delete device.meta.reporting;
        mockClear(device);
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(device.meta.reporting).toBeUndefined();
    });

    it('Should not configure reporting when receicing message from device which has already been setup yet', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        const data = {onOff: 1}
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
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        const payload = {device};
        await zigbeeHerdsman.events.deviceAnnounce(payload);
        await flushPromises();
        expectOnOffBrightnessColorReport(endpoint);
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
        endpoint.bind.mockImplementationOnce(async () => {throw new Error('failed')});
        delete device.meta.reporting;
        mockClear(device);
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
    });
});
