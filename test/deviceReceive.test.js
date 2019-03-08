const assert = require('chai').assert;
const sinon = require('sinon');
const DeviceReceive = require('../lib/extension/deviceReceive');
const settings = require('../lib/util/settings');
const devices = require('zigbee-shepherd-converters').devices;
const utils = require('./utils');

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
    let publishEntityState;

    beforeEach(() => {
        utils.stubLogger(sinon);
        sinon.stub(settings, 'addDevice').callsFake(() => {});
        publishEntityState = sinon.spy();
        deviceReceive = new DeviceReceive(null, mqtt, null, publishEntityState);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Handling zigbee messages', () => {
        it('Should handle a zigbee message', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG11LM);
            assert.isTrue(publishEntityState.calledOnce);
            assert.deepEqual(publishEntityState.getCall(0).args[1], {click: 'single'});
        });

        it('Should handle a zigbee message which uses ep (left)', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            assert.isTrue(publishEntityState.calledOnce);
            assert.deepEqual(publishEntityState.getCall(0).args[1], {click: 'left'});
        });

        it('Should handle a zigbee message which uses ep (right)', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 2);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            assert.isTrue(publishEntityState.calledOnce);
            assert.deepEqual(publishEntityState.getCall(0).args[1], {click: 'right'});
        });

        it('Should handle a zigbee message with default precision', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: -85}, 1
            );
            deviceReceive.onZigbeeMessage(message, device, WSDCGQ11LM);
            assert.isTrue(publishEntityState.calledOnce);
            assert.deepEqual(publishEntityState.getCall(0).args[1], {temperature: -0.85});
        });

        it('Should handle a zigbee message with 1 precision', () => {
            const device = {ieeeAddr: '0x12345678'};
            sinon.stub(settings, 'getDevice').callsFake(() => {
                return {temperature_precision: 1};
            });
            const message = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: -85}, 1
            );
            deviceReceive.onZigbeeMessage(message, device, WSDCGQ11LM);
            assert.isTrue(publishEntityState.calledOnce);
            assert.deepEqual(publishEntityState.getCall(0).args[1], {temperature: -0.8});
        });

        it('Should handle a zigbee message with 0 precision', () => {
            const device = {ieeeAddr: '0x12345678'};
            sinon.stub(settings, 'getDevice').callsFake(() => {
                return {temperature_precision: 0};
            });
            const message = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: -85}, 1
            );
            deviceReceive.onZigbeeMessage(message, device, WSDCGQ11LM);
            assert.isTrue(publishEntityState.calledOnce);
            assert.deepEqual(publishEntityState.getCall(0).args[1], {temperature: -1});
        });

        it('Should handle a zigbee message with 1 precision when set via device_options', () => {
            const device = {ieeeAddr: '0x12345678'};
            sinon.stub(settings, 'get').callsFake(() => {
                return {
                    device_options: {
                        temperature_precision: 1,
                    },
                    advanced: {
                        last_seen: 'disable',
                    },
                };
            });
            sinon.stub(settings, 'getDevice').callsFake(() => {
                return {};
            });
            const message = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: -85}, 1
            );
            deviceReceive.onZigbeeMessage(message, device, WSDCGQ11LM);
            assert.isTrue(publishEntityState.calledOnce);
            assert.deepEqual(publishEntityState.getCall(0).args[1], {temperature: -0.8});
        });

        it('Should handle a zigbee message with 2 precision when overrides device_options', () => {
            const device = {ieeeAddr: '0x12345678'};
            sinon.stub(settings, 'get').callsFake(() => {
                return {
                    device_options: {
                        temperature_precision: 1,
                    },
                    advanced: {
                        last_seen: 'disable',
                    },
                };
            });
            sinon.stub(settings, 'getDevice').callsFake(() => {
                return {
                    temperature_precision: 2,
                };
            });
            const message = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: -85}, 1
            );
            deviceReceive.onZigbeeMessage(message, device, WSDCGQ11LM);
            assert.isTrue(publishEntityState.calledOnce);
            assert.deepEqual(publishEntityState.getCall(0).args[1], {temperature: -0.85});
        });

        it('Should handle a zigbee message with voltage 3010', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', {'65281': {'1': 3010}}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            assert.isTrue(publishEntityState.calledOnce);
            const expected = {battery: 100, voltage: 3010};
            assert.deepEqual(publishEntityState.getCall(0).args[1], expected);
        });

        it('Should handle a zigbee message with voltage 2850', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', {'65281': {'1': 2850}}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            assert.isTrue(publishEntityState.calledOnce);
            const expected = {battery: 35, voltage: 2850};
            assert.deepEqual(publishEntityState.getCall(0).args[1], expected);
        });

        it('Should handle a zigbee message with voltage 2650', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', {'65281': {'1': 2650}}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            assert.isTrue(publishEntityState.calledOnce);
            const expected = {battery: 14, voltage: 2650};
            assert.deepEqual(publishEntityState.getCall(0).args[1], expected);
        });

        it('Should handle a zigbee message with voltage 2000', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', {'65281': {'1': 2000}}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            assert.isTrue(publishEntityState.calledOnce);
            const expected = {battery: 0, voltage: 2000};
            assert.deepEqual(publishEntityState.getCall(0).args[1], expected);
        });

        it('Should publish 1 message when converted twice', () => {
            const device = {ieeeAddr: '0x12345678'};
            const payload = {
                '65281': {'1': 3045, '3': 19, '4': 17320, '5': 35, '6': [0, 3], '10': 51107, '11': 381, '100': 0},
            };
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', payload, 1);
            deviceReceive.onZigbeeMessage(message, device, RTCGQ11LM);
            assert.isTrue(publishEntityState.calledOnce);
            const expected = {'battery': 100, 'illuminance': 381, 'voltage': 3045};
            assert.deepEqual(publishEntityState.getCall(0).args[1], expected);
        });

        it('Should publish no message when converted without result', () => {
            const device = {ieeeAddr: '0x12345678'};
            const payload = {'9999': {'1': 3045}};
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', payload, 1);
            deviceReceive.onZigbeeMessage(message, device, RTCGQ11LM);
            assert.isTrue(publishEntityState.notCalled);
        });

        it('Should publish last_seen epoch', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 1);
            sinon.stub(settings, 'get').callsFake(() => {
                return {
                    advanced: {
                        last_seen: 'epoch',
                    },
                };
            });
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            assert.isTrue(publishEntityState.calledOnce);
            assert.equal(typeof publishEntityState.getCall(0).args[1].last_seen, 'number');
        });

        it('Should publish last_seen ISO_8601', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 1);
            sinon.stub(settings, 'get').callsFake(() => {
                return {
                    advanced: {
                        last_seen: 'ISO_8601',
                    },
                };
            });
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            assert.isTrue(publishEntityState.calledOnce);
            assert.equal(typeof publishEntityState.getCall(0).args[1].last_seen, 'string');
        });

        it('Should publish last_seen ISO_8601_local', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 1);
            sinon.stub(settings, 'get').callsFake(() => {
                return {
                    advanced: {
                        last_seen: 'ISO_8601_local',
                    },
                };
            });
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            assert.isTrue(publishEntityState.calledOnce);
            assert.equal(typeof publishEntityState.getCall(0).args[1].last_seen, 'string');
        });
    });
});
