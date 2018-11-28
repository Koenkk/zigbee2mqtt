const chai = require('chai');
const sinon = require('sinon');
const Controller = require('../lib/controller');
const settings = require('../lib/util/settings');
const mqtt = require('../lib/mqtt');
const utils = require('./utils');
const sandbox = sinon.createSandbox();

describe('Controller', () => {
    let controller;
    let mqttPublish;

    beforeEach(() => {
        utils.stubLogger(sandbox);
        sandbox.stub(settings, 'getDevice').callsFake((ieeeAddr) => {
            return {friendly_name: 'test'};
        });
        mqttPublish = sandbox.stub(mqtt.prototype, 'publish').callsFake(() => {});
        controller = new Controller();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('Handling zigbee messages', () => {
        it('Should handle a zigbee message', () => {
            const device = {ieeeAddr: '0x12345678', modelId: 'TRADFRI bulb E27 CWS opal 600lm'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'devChange', {onOff: 1}, 1);
            controller.onZigbeeMessage(message);
            chai.assert.isTrue(mqttPublish.calledOnce);
            chai.assert.strictEqual(mqttPublish.getCall(0).args[1], JSON.stringify({state: 'ON'}));
        });

        it('Should handle a zigbee message when include_device_information is set', () => {
            sandbox.stub(settings, 'get').callsFake(() => {
                return {
                    mqtt: {
                        include_device_information: true,
                    },
                    advanced: {
                        cache_state: false,
                    },
                };
            });

            const device = {ieeeAddr: '0x12345678', modelId: 'TRADFRI bulb E27 CWS opal 600lm'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'devChange', {onOff: 1}, 1);
            controller.onZigbeeMessage(message);
            chai.assert.isTrue(mqttPublish.calledOnce);
            chai.assert.strictEqual(
                mqttPublish.getCall(0).args[1],
                `{"state":"ON","device":{"ieeeAddr":"0x12345678","friendlyName":"test",` +
                `"modelId":"TRADFRI bulb E27 CWS opal 600lm"}}`
            );
        });
    });
});
