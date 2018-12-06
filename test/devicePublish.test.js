const chai = require('chai');
const sinon = require('sinon');
const DevicePublish = require('../lib/extension/devicePublish');
const settings = require('../lib/util/settings');
const utils = require('./utils');
const sandbox = sinon.createSandbox();

const mqtt = {
    subscribe: (topic) => {},
};

const zigbee = {
    getDevice: null,
    publish: sandbox.stub().callsFake((ieeAddr, cid, cmd, cmdType, zclData, cfg, ep, callback) => {
        callback(false, null);
    }),
};

const cfg = {
    default: {
        manufSpec: 0,
        disDefaultRsp: 0,
    },
};

describe('DevicePublish', () => {
    let devicePublish;

    beforeEach(() => {
        utils.stubLogger(sandbox);
        devicePublish = new DevicePublish(zigbee, mqtt, null, () => {});
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('Parse topic', () => {
        it('Should publish messages to zigbee devices', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({brightness: '200'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'genLevelCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'moveToLevelWithOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[4], {level: '200', transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], null);
        });

        it('Should publish messages to zigbee devices when brightness is in %', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({brightness_percent: '92'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'genLevelCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'moveToLevelWithOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[4], {level: '235', transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], null);
        });

        it('Should publish messages to zigbee devices when brightness is in number', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({brightness: 230}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'genLevelCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'moveToLevelWithOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[4], {level: 230, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], null);
        });

        it('Should publish messages to zigbee devices with color_temp', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({color_temp: '222'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'lightingColorCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'moveToColorTemp');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[4], {colortemp: '222', transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], null);
        });

        it('Should publish messages to zigbee devices with color_temp in %', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({color_temp_percent: '100'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'lightingColorCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'moveToColorTemp');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[4], {colortemp: '500', transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], null);
        });

        it('Should publish messages to zigbee devices with non-default ep', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'lumi.ctrl_neutral1'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({state: 'OFF'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'genOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'off');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[4], {});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], cfg.default);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[6], 2);
        });

        it('Should publish messages to zigbee devices with non-default ep and postfix', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'lumi.ctrl_neutral2'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/right/set', JSON.stringify({state: 'OFF'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'genOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'off');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[4], {});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], cfg.default);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[6], 3);
        });

        it('Should publish messages to zigbee gledopto with [11,13]', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'GLEDOPTO', epList: [11, 13]});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({state: 'OFF'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'genOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'off');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[4], {});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], cfg.default);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[6], null);
        });

        it('Should publish messages to zigbee gledopto with [11,12,13]', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'GLEDOPTO', epList: [11, 12, 13]});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({state: 'OFF'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'genOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'off');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[4], {});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], cfg.default);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[6], 12);
        });

        it('Should publish messages to zigbee devices with color xy', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({color: {x: 100, y: 50}}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'lightingColorCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'moveToColor');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[4], {colorx: 6553500, colory: 3276750, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], null);
        });

        it('Should publish messages to zigbee devices with color rgb', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({color: {r: 100, g: 200, b: 10}}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'lightingColorCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'moveToColor');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[4], {colorx: 17085, colory: 44000, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], null);
        });

        it('Should publish messages to zigbee devices with color rgb string', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({color: {rgb: '100,200,10'}}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'lightingColorCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'moveToColor');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[4], {colorx: 17085, colory: 44000, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], null);
        });

        it('Should publish 1 message when brightness with state is send', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({state: 'ON', brightness: '50'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'genLevelCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'moveToLevelWithOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[4], {level: '50', transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], null);
        });
    });

    describe('Parse topic', () => {
        it('Should handle non-valid topics', () => {
            const topic = 'zigbee2mqtt1/my_device_id/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed, null);
        });

        it('Should handle non-valid topics', () => {
            const topic = 'zigbee2mqtt1/my_device_id/sett';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed, null);
        });

        it('Should handle non-valid topics', () => {
            const topic = 'zigbee2mqtt/my_device_id/write';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed, null);
        });

        it('Should handle non-valid topics', () => {
            const topic = 'zigbee2mqtt/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed, null);
        });

        it('Should handle non-valid topics', () => {
            const topic = 'set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed, null);
        });

        it('Should parse set topic', () => {
            const topic = 'zigbee2mqtt/my_device_id/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, 'my_device_id');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse get topic', () => {
            const topic = 'zigbee2mqtt/my_device_id2/get';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'get');
            chai.assert.strictEqual(parsed.deviceID, 'my_device_id2');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse topic with when base topic has multiple slashes', () => {
            sandbox.stub(settings, 'get').callsFake(() => {
                return {
                    mqtt: {
                        base_topic: 'zigbee2mqtt/at/my/home',
                    },
                };
            });

            const topic = 'zigbee2mqtt/at/my/home/my_device_id2/get';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'get');
            chai.assert.strictEqual(parsed.deviceID, 'my_device_id2');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse topic with when deviceID has multiple slashes', () => {
            const topic = 'zigbee2mqtt/floor0/basement/my_device_id2/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, 'floor0/basement/my_device_id2');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse topic with when base and deviceID have multiple slashes', () => {
            sandbox.stub(settings, 'get').callsFake(() => {
                return {
                    mqtt: {
                        base_topic: 'zigbee2mqtt/at/my/basement',
                    },
                };
            });

            const topic = 'zigbee2mqtt/at/my/basement/floor0/basement/my_device_id2/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, 'floor0/basement/my_device_id2');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse set with ieeAddr topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, '0x12345689');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse set with postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/left/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, '0x12345689');
            chai.assert.strictEqual(parsed.postfix, 'left');
        });

        it('Should parse set with postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/right/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, '0x12345689');
            chai.assert.strictEqual(parsed.postfix, 'right');
        });

        it('Should parse set with postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/bottom_left/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, '0x12345689');
            chai.assert.strictEqual(parsed.postfix, 'bottom_left');
        });

        it('Shouldnt parse set with invalid postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/invalid/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, '0x12345689/invalid');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse set with and slashes in base and deviceID postfix topic', () => {
            sandbox.stub(settings, 'get').callsFake(() => {
                return {
                    mqtt: {
                        base_topic: 'zigbee2mqtt/at/my/home',
                    },
                };
            });

            const topic = 'zigbee2mqtt/at/my/home/my/device/in/basement/sensor/bottom_left/get';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'get');
            chai.assert.strictEqual(parsed.deviceID, 'my/device/in/basement/sensor');
            chai.assert.strictEqual(parsed.postfix, 'bottom_left');
        });
    });
});
