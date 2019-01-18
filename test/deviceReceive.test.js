const chai = require('chai');
const sinon = require('sinon');
const DeviceReceive = require('../lib/extension/deviceReceive');
const settings = require('../lib/util/settings');
const devices = require('zigbee-shepherd-converters').devices;
const utils = require('./utils');
const sandbox = sinon.createSandbox();

// Devices
const WXKG11LM = devices.find((d) => d.model === 'WXKG11LM');
const WXKG02LM = devices.find((d) => d.model === 'WXKG02LM');
const WSDCGQ11LM = devices.find((d) => d.model === 'WSDCGQ11LM');
const RTCGQ11LM = devices.find((d) => d.model === 'RTCGQ11LM');

const mqtt = {
    log: () => {},
};

describe('DeviceReceive', () => {
    let deviceReceive;
    let publishDeviceState;

    beforeEach(() => {
        utils.stubLogger(sandbox);
        sandbox.stub(settings, 'addDevice').callsFake(() => {});
        publishDeviceState = sinon.spy();
        deviceReceive = new DeviceReceive(null, mqtt, null, publishDeviceState);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('Handling zigbee messages', () => {
        it('Should handle a zigbee message', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG11LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            chai.assert.deepEqual(publishDeviceState.getCall(0).args[1], {click: 'single'});
        });

        it('Should handle a zigbee message which uses ep (left)', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            chai.assert.deepEqual(publishDeviceState.getCall(0).args[1], {click: 'left'});
        });

        it('Should handle a zigbee message which uses ep (right)', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 2);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            chai.assert.deepEqual(publishDeviceState.getCall(0).args[1], {click: 'right'});
        });

        it('Should handle a zigbee message with default precision', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: -85}, 1
            );
            deviceReceive.onZigbeeMessage(message, device, WSDCGQ11LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            chai.assert.deepEqual(publishDeviceState.getCall(0).args[1], {temperature: -0.85});
        });

        it('Should handle a zigbee message with 1 precision', () => {
            const device = {ieeeAddr: '0x12345678'};
            sandbox.stub(settings, 'getDevice').callsFake(() => {
                return {temperature_precision: 1};
            });
            const message = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: -85}, 1
            );
            deviceReceive.onZigbeeMessage(message, device, WSDCGQ11LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            chai.assert.deepEqual(publishDeviceState.getCall(0).args[1], {temperature: -0.8});
        });

        it('Should handle a zigbee message with 0 precision', () => {
            const device = {ieeeAddr: '0x12345678'};
            sandbox.stub(settings, 'getDevice').callsFake(() => {
                return {temperature_precision: 0};
            });
            const message = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: -85}, 1
            );
            deviceReceive.onZigbeeMessage(message, device, WSDCGQ11LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            chai.assert.deepEqual(publishDeviceState.getCall(0).args[1], {temperature: -1});
        });

        it('Should handle a zigbee message with 1 precision when set via device_options', () => {
            const device = {ieeeAddr: '0x12345678'};
            sandbox.stub(settings, 'get').callsFake(() => {
                return {
                    device_options: {
                        temperature_precision: 1,
                    },
                    advanced: {
                        last_seen: 'disable',
                    },
                };
            });
            sandbox.stub(settings, 'getDevice').callsFake(() => {
                return {};
            });
            const message = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: -85}, 1
            );
            deviceReceive.onZigbeeMessage(message, device, WSDCGQ11LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            chai.assert.deepEqual(publishDeviceState.getCall(0).args[1], {temperature: -0.8});
        });

        it('Should handle a zigbee message with 2 precision when overrides device_options', () => {
            const device = {ieeeAddr: '0x12345678'};
            sandbox.stub(settings, 'get').callsFake(() => {
                return {
                    device_options: {
                        temperature_precision: 1,
                    },
                    advanced: {
                        last_seen: 'disable',
                    },
                };
            });
            sandbox.stub(settings, 'getDevice').callsFake(() => {
                return {
                    temperature_precision: 2,
                };
            });
            const message = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: -85}, 1
            );
            deviceReceive.onZigbeeMessage(message, device, WSDCGQ11LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            chai.assert.deepEqual(publishDeviceState.getCall(0).args[1], {temperature: -0.85});
        });

        it('Should handle a zigbee message with voltage 3010', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', {'65281': {'1': 3010}}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            const expected = {battery: 100, voltage: 3010};
            chai.assert.deepEqual(publishDeviceState.getCall(0).args[1], expected);
        });

        it('Should handle a zigbee message with voltage 2850', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', {'65281': {'1': 2850}}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            const expected = {battery: 35, voltage: 2850};
            chai.assert.deepEqual(publishDeviceState.getCall(0).args[1], expected);
        });

        it('Should handle a zigbee message with voltage 2650', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', {'65281': {'1': 2650}}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            const expected = {battery: 14, voltage: 2650};
            chai.assert.deepEqual(publishDeviceState.getCall(0).args[1], expected);
        });

        it('Should handle a zigbee message with voltage 2000', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', {'65281': {'1': 2000}}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            const expected = {battery: 0, voltage: 2000};
            chai.assert.deepEqual(publishDeviceState.getCall(0).args[1], expected);
        });

        it('Should publish 1 message when converted twice', () => {
            const device = {ieeeAddr: '0x12345678'};
            const payload = {
                '65281': {'1': 3045, '3': 19, '4': 17320, '5': 35, '6': [0, 3], '10': 51107, '11': 381, '100': 0},
            };
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', payload, 1);
            deviceReceive.onZigbeeMessage(message, device, RTCGQ11LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            const expected = {'battery': 100, 'illuminance': 381, 'voltage': 3045};
            chai.assert.deepEqual(publishDeviceState.getCall(0).args[1], expected);
        });

        it('Should publish no message when converted without result', () => {
            const device = {ieeeAddr: '0x12345678'};
            const payload = {'9999': {'1': 3045}};
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', payload, 1);
            deviceReceive.onZigbeeMessage(message, device, RTCGQ11LM);
            chai.assert.isTrue(publishDeviceState.notCalled);
        });

        it('Should publish last_seen epoch', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 1);
            sandbox.stub(settings, 'get').callsFake(() => {
                return {
                    advanced: {
                        last_seen: 'epoch',
                    },
                };
            });
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            chai.assert.equal(typeof publishDeviceState.getCall(0).args[1].last_seen, 'number');
        });

        it('Should publish last_seen ISO_8601', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 1);
            sandbox.stub(settings, 'get').callsFake(() => {
                return {
                    advanced: {
                        last_seen: 'ISO_8601',
                    },
                };
            });
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            chai.assert.equal(typeof publishDeviceState.getCall(0).args[1].last_seen, 'string');
        });
    });
});
