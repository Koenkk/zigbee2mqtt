const chai = require('chai');
const sinon = require('sinon');
const DeviceReceive = require('../lib/extension/deviceReceive');
const settings = require('../lib/util/settings');
const logger = require('../lib/util/logger');
const devices = require('zigbee-shepherd-converters').devices;

// Devices
const WXKG11LM = devices.find((d) => d.model === 'WXKG11LM');

const mqtt = {
    log: () => {},
};

const msg = (device, cid, type, data) => {
    return {data: {cid: cid, data: data}, type: type, endpoints: [device]};
};

describe('DeviceReceive', () => {
    let deviceReceive;
    let publishDeviceState;

    beforeEach(() => {
        publishDeviceState = sinon.spy();
        deviceReceive = new DeviceReceive(null, mqtt, null, publishDeviceState);
        sinon.stub(settings, 'addDevice').callsFake(() => {});
        sinon.stub(logger, 'info').callsFake(() => {});
        sinon.stub(logger, 'warn').callsFake(() => {});
    });

    describe('Handling zigbee messages', () => {
        it('Should handle a zigbee message', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = msg(device, 'genOnOff', 'attReport', {onOff: 1});
            deviceReceive.onZigbeeMessage(message, device, WXKG11LM);
            chai.assert.isTrue(publishDeviceState.calledOnce);
            chai.assert.deepEqual(publishDeviceState.getCall(0).args[1], {click: 'single'});
        });
    });
});
