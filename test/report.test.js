const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b3');
zigbeeHerdsman.returnDevices.push('0x00124b00120144ae');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b2');
zigbeeHerdsman.returnDevices.push('0x0017880104e45553');
zigbeeHerdsman.returnDevices.push('0x0017880104e45559');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b4');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b7');
zigbeeHerdsman.returnDevices.push('0x90fd9ffffe4b64ax');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
jest.mock('debounce', () => jest.fn(fn => fn));
const debounce = require('debounce');

const mocksClear = [MQTT.publish, logger.warn, logger.debug, debounce];

describe('Report', () => {
    let controller;

    function expectOnOffBrightnessColorReport(endpoint, colorXY) {
        const coordinatorEndpoint = zigbeeHerdsman.devices.coordinator.getEndpoint(1);
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', coordinatorEndpoint);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', coordinatorEndpoint);
        expect(endpoint.bind).toHaveBeenCalledWith('lightingColorCtrl', coordinatorEndpoint);
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(3);
        expect(endpoint.configureReporting).toHaveBeenCalledWith('genOnOff', [{"attribute": "onOff", "maximumReportInterval": 300, "minimumReportInterval": 0, "reportableChange": 0}]);
        expect(endpoint.configureReporting).toHaveBeenCalledWith('genLevelCtrl', [{"attribute": "currentLevel", "maximumReportInterval": 300, "minimumReportInterval": 3, "reportableChange": 1}]);
        if (colorXY) {
            expect(endpoint.configureReporting).toHaveBeenCalledWith('lightingColorCtrl', [{"attribute": "colorTemperature", "maximumReportInterval": 300, "minimumReportInterval": 3, "reportableChange": 1}, {"attribute": "currentX", "maximumReportInterval": 300, "minimumReportInterval": 3, "reportableChange": 1}, {"attribute": "currentY", "maximumReportInterval": 300, "minimumReportInterval": 3, "reportableChange": 1}]);
        } else {
            expect(endpoint.configureReporting).toHaveBeenCalledWith('lightingColorCtrl', [{"attribute": "colorTemperature", "maximumReportInterval": 300, "minimumReportInterval": 3, "reportableChange": 1}]);
        }
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
        expectOnOffBrightnessColorReport(endpoint, true);
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
        expectOnOffBrightnessColorReport(endpoint, false);
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

    it('Should poll bounded Hue bulb when receiving message from Hue dimmer', async () => {
        const remote = zigbeeHerdsman.devices.remote;
        const data = {"button":3,"unknown1":3145728,"type":2,"unknown2":0,"time":1};
        const payload = {data, cluster: 'manuSpecificPhilips', device: remote, endpoint: remote.getEndpoint(2), type: 'commandHueNotification', linkquality: 10, groupID: 0};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(debounce).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.devices.bulb_color.getEndpoint(1).read).toHaveBeenCalledWith("genLevelCtrl", ["currentLevel"]);
    });

    it('Should poll grouped Hue bulb when receiving message from TRADFRI remote and should', async () => {
        const remote = zigbeeHerdsman.devices.tradfri_remote;
        const data = {"stepmode":0,"stepsize":43,"transtime":5};
        const payload = {data, cluster: 'genLevelCtrl', device: remote, endpoint: remote.getEndpoint(1), type: 'commandStepWithOnOff', linkquality: 10, groupID: 15071};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(debounce).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.devices.bulb_color_2.getEndpoint(1).read).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.devices.bulb_color_2.getEndpoint(1).read).toHaveBeenCalledWith("genLevelCtrl", ["currentLevel"]);

        // Should also only debounce once
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(debounce).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.devices.bulb_color_2.getEndpoint(1).read).toHaveBeenCalledTimes(2);

        // Should only call Hue bulb, not e.g. tradfri
        expect(zigbeeHerdsman.devices.bulb.getEndpoint(1).read).toHaveBeenCalledTimes(0);
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
        expect(endpoint.read).toHaveBeenCalledWith('lightingColorCtrl', ['colorCapabilities'])
        expect(endpoint.configureReporting).toHaveBeenCalledWith('lightingColorCtrl', [{"attribute": "colorTemperature", "maximumReportInterval": 300, "minimumReportInterval": 3, "reportableChange": 1}]);
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(3);
    });
});
