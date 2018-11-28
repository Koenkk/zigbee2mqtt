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
    });
});
