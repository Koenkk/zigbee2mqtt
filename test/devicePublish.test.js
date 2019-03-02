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
    publish: sandbox.stub().callsFake((entityID, entityType, cid, cmd, cmdType, zclData, cfg, ep, callback) => {
        callback(false, null);
    }),
};

const publishEntityState = sandbox.stub().callsFake((entityID, payload, cache) => {
});

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
        devicePublish = new DevicePublish(zigbee, mqtt, null, publishEntityState);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('Parse topic', () => {
        it('Should publish messages to zigbee devices', () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({brightness: '200'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genLevelCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'moveToLevelWithOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {level: 200, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[7], null);
            chai.assert.isTrue(publishEntityState.calledOnce);
            chai.assert.strictEqual(publishEntityState.getCall(0).args[0], '0x12345678');
            chai.assert.deepEqual(publishEntityState.getCall(0).args[1], {state: 'ON', brightness: 200});
            chai.assert.strictEqual(publishEntityState.getCall(0).args[2], true);
        });

        it('Should publish messages to zigbee devices when brightness is in %', () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({brightness_percent: '92'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genLevelCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'moveToLevelWithOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {level: 235, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[7], null);
            chai.assert.isTrue(publishEntityState.calledOnce);
            chai.assert.strictEqual(publishEntityState.getCall(0).args[0], '0x12345678');
            chai.assert.deepEqual(publishEntityState.getCall(0).args[1], {state: 'ON', brightness: 235});
            chai.assert.strictEqual(publishEntityState.getCall(0).args[2], true);
        });

        it('Should publish messages to zigbee devices when brightness is in number', () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({brightness: 230}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genLevelCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'moveToLevelWithOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {level: 230, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[7], null);
            chai.assert.isTrue(publishEntityState.calledOnce);
            chai.assert.strictEqual(publishEntityState.getCall(0).args[0], '0x12345678');
            chai.assert.deepEqual(publishEntityState.getCall(0).args[1], {state: 'ON', brightness: 230});
            chai.assert.strictEqual(publishEntityState.getCall(0).args[2], true);
        });

        it('Should publish messages to zigbee devices with color_temp', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 WS opal 980lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({color_temp: '222'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'lightingColorCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'moveToColorTemp');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {colortemp: '222', transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[7], null);
        });

        it('Should publish messages to zigbee devices with color_temp in %', () => {
            publishEntityState.resetHistory();
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 WS opal 980lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({color_temp_percent: '100'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'lightingColorCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'moveToColorTemp');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {colortemp: '500', transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[7], null);
            chai.assert.isTrue(publishEntityState.notCalled);
        });

        it('Should publish messages to zigbee devices with non-default ep', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'lumi.ctrl_neutral1'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({state: 'OFF'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'off');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[7], 2);
        });

        it('Should publish messages to zigbee devices with non-default ep and postfix', () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'lumi.ctrl_neutral2'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/right/set', JSON.stringify({state: 'OFF'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'off');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[7], 3);
            chai.assert.isTrue(publishEntityState.calledOnce);
            chai.assert.strictEqual(publishEntityState.getCall(0).args[0], '0x12345678');
            chai.assert.deepEqual(publishEntityState.getCall(0).args[1], {state_right: 'OFF'});
            chai.assert.strictEqual(publishEntityState.getCall(0).args[2], true);
        });

        it('Should publish messages to zigbee gledopto with [11,13]', () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'GLEDOPTO', epList: [11, 13]});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({state: 'OFF'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'off');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[7], 11);
            chai.assert.isTrue(publishEntityState.calledOnce);
            chai.assert.strictEqual(publishEntityState.getCall(0).args[0], '0x12345678');
            chai.assert.deepEqual(publishEntityState.getCall(0).args[1], {state: 'OFF'});
            chai.assert.strictEqual(publishEntityState.getCall(0).args[2], true);
        });

        it('Should publish messages to zigbee gledopto with [11,12,13]', () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'GLEDOPTO', epList: [11, 12, 13]});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({state: 'OFF', brightness: 50}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'off');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[7], 12);
            chai.assert.isTrue(publishEntityState.calledOnce);
            chai.assert.strictEqual(publishEntityState.getCall(0).args[0], '0x12345678');
            chai.assert.deepEqual(publishEntityState.getCall(0).args[1], {state: 'OFF'});
            chai.assert.strictEqual(publishEntityState.getCall(0).args[2], true);
        });

        it('Should publish messages to zigbee devices with color xy', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({color: {x: 100, y: 50}}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'lightingColorCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'moveToColor');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {colorx: 6553500, colory: 3276750, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[7], null);
        });

        it('Should publish messages to zigbee devices with color xy and state', () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            const payload = {color: {x: 100, y: 50}, state: 'ON'};
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify(payload));
            chai.assert.isTrue(zigbee.publish.calledTwice);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'on');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[7], null);
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[2], 'lightingColorCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[3], 'moveToColor');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(1).args[5], {colorx: 6553500, colory: 3276750, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(1).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(1).args[7], null);
            chai.assert.isTrue(publishEntityState.calledOnce);
            chai.assert.strictEqual(publishEntityState.getCall(0).args[0], '0x12345678');
            chai.assert.deepEqual(publishEntityState.getCall(0).args[1], {state: 'ON'});
            chai.assert.strictEqual(publishEntityState.getCall(0).args[2], true);
        });

        it('Should publish messages to zigbee devices with color xy and brightness', () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            const payload = {color: {x: 100, y: 50}, brightness: 20};
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify(payload));
            chai.assert.isTrue(zigbee.publish.calledTwice);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genLevelCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'moveToLevelWithOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {level: 20, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[7], null);
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[2], 'lightingColorCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[3], 'moveToColor');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(1).args[5], {colorx: 6553500, colory: 3276750, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(1).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(1).args[7], null);
            chai.assert.isTrue(publishEntityState.calledOnce);
            chai.assert.strictEqual(publishEntityState.getCall(0).args[0], '0x12345678');
            chai.assert.deepEqual(publishEntityState.getCall(0).args[1], {state: 'ON', brightness: 20});
            chai.assert.strictEqual(publishEntityState.getCall(0).args[2], true);
        });

        it('Should publish messages to zigbee devices with color xy, brightness and state on', () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            const payload = {color: {x: 100, y: 50}, brightness: 20, state: 'oN'};
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify(payload));
            chai.assert.isTrue(zigbee.publish.calledTwice);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genLevelCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'moveToLevelWithOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {level: 20, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[7], null);
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[2], 'lightingColorCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[3], 'moveToColor');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(1).args[5], {colorx: 6553500, colory: 3276750, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(1).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(1).args[7], null);
            chai.assert.isTrue(publishEntityState.calledOnce);
            chai.assert.strictEqual(publishEntityState.getCall(0).args[0], '0x12345678');
            chai.assert.deepEqual(publishEntityState.getCall(0).args[1], {state: 'ON', brightness: 20});
            chai.assert.strictEqual(publishEntityState.getCall(0).args[2], true);
        });

        it('Should publish messages to zigbee devices with color xy, brightness and state off', () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            const payload = {color: {x: 100, y: 50}, brightness: 20, state: 'oFF'};
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify(payload));
            chai.assert.isTrue(zigbee.publish.calledTwice);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'off');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[7], null);
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[2], 'lightingColorCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[3], 'moveToColor');
            chai.assert.strictEqual(zigbee.publish.getCall(1).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(1).args[5], {colorx: 6553500, colory: 3276750, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(1).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(1).args[7], null);
            chai.assert.isTrue(publishEntityState.calledOnce);
            chai.assert.strictEqual(publishEntityState.getCall(0).args[0], '0x12345678');
            chai.assert.deepEqual(publishEntityState.getCall(0).args[1], {state: 'OFF'});
            chai.assert.strictEqual(publishEntityState.getCall(0).args[2], true);
        });

        it('Should publish messages to zigbee devices with color rgb', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({color: {r: 100, g: 200, b: 10}}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'lightingColorCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'moveToColor');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {colorx: 17085, colory: 44000, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[7], null);
        });

        it('Should publish messages to zigbee devices with color rgb string', () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({color: {rgb: '100,200,10'}}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'lightingColorCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'moveToColor');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {colorx: 17085, colory: 44000, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[7], null);
        });

        it('Should publish 1 message when brightness with state is send', () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({state: 'ON', brightness: '50'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], '0x12345678');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'device');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genLevelCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'moveToLevelWithOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {level: 50, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[7], null);
            chai.assert.isTrue(publishEntityState.calledOnce);
            chai.assert.strictEqual(publishEntityState.getCall(0).args[0], '0x12345678');
            chai.assert.deepEqual(publishEntityState.getCall(0).args[1], {state: 'ON', brightness: 50});
            chai.assert.strictEqual(publishEntityState.getCall(0).args[2], true);
        });

        it('Should publish messages to groups', () => {
            sandbox.stub(settings, 'getGroupIDByFriendlyName').callsFake(() => '1');
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            devicePublish.onMQTTMessage('zigbee2mqtt/group/group_1/set', JSON.stringify({state: 'ON'}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], 1);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'group');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'on');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[7], null);
            chai.assert.isTrue(publishEntityState.calledOnce);
            chai.assert.strictEqual(publishEntityState.getCall(0).args[0], 1);
            chai.assert.deepEqual(publishEntityState.getCall(0).args[1], {state: 'ON'});
            chai.assert.strictEqual(publishEntityState.getCall(0).args[2], true);
        });

        it('Should publish messages to groups with brightness_percent', () => {
            sandbox.stub(settings, 'getGroupIDByFriendlyName').callsFake(() => '1');
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            devicePublish.onMQTTMessage('zigbee2mqtt/group/group_1/set', JSON.stringify({brightness_percent: 50}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], 1);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'group');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genLevelCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'moveToLevelWithOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {level: 127, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[7], null);
            chai.assert.isTrue(publishEntityState.calledOnce);
            chai.assert.strictEqual(publishEntityState.getCall(0).args[0], 1);
            chai.assert.deepEqual(publishEntityState.getCall(0).args[1], {state: 'ON', brightness: 127});
            chai.assert.strictEqual(publishEntityState.getCall(0).args[2], true);
        });

        it('Should publish messages to groups with on and brightness', () => {
            sandbox.stub(settings, 'getGroupIDByFriendlyName').callsFake(() => '1');
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            devicePublish.onMQTTMessage('zigbee2mqtt/group/group_1/set', JSON.stringify({state: 'ON', brightness: 50}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], 1);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'group');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genLevelCtrl');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'moveToLevelWithOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {level: 50, transtime: 0});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[7], null);
            chai.assert.isTrue(publishEntityState.calledOnce);
            chai.assert.strictEqual(publishEntityState.getCall(0).args[0], 1);
            chai.assert.deepEqual(publishEntityState.getCall(0).args[1], {state: 'ON', brightness: 50});
            chai.assert.strictEqual(publishEntityState.getCall(0).args[2], true);
        });

        it('Should publish messages to groups with off and brightness', () => {
            sandbox.stub(settings, 'getGroupIDByFriendlyName').callsFake(() => '1');
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            devicePublish.onMQTTMessage('zigbee2mqtt/group/group_1/set', JSON.stringify({state: 'OFF', brightness: 5}));
            chai.assert.isTrue(zigbee.publish.calledOnce);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[0], 1);
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[1], 'group');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[2], 'genOnOff');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[3], 'off');
            chai.assert.strictEqual(zigbee.publish.getCall(0).args[4], 'functional');
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[5], {});
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[6], cfg.default);
            chai.assert.deepEqual(zigbee.publish.getCall(0).args[7], null);
            chai.assert.isTrue(publishEntityState.calledOnce);
            chai.assert.strictEqual(publishEntityState.getCall(0).args[0], 1);
            chai.assert.deepEqual(publishEntityState.getCall(0).args[1], {state: 'OFF'});
            chai.assert.strictEqual(publishEntityState.getCall(0).args[2], true);
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
            chai.assert.strictEqual(parsed.ID, 'my_device_id');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse get topic', () => {
            const topic = 'zigbee2mqtt/my_device_id2/get';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'get');
            chai.assert.strictEqual(parsed.ID, 'my_device_id2');
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
            chai.assert.strictEqual(parsed.ID, 'my_device_id2');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse topic with when deviceID has multiple slashes', () => {
            const topic = 'zigbee2mqtt/floor0/basement/my_device_id2/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.ID, 'floor0/basement/my_device_id2');
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
            chai.assert.strictEqual(parsed.ID, 'floor0/basement/my_device_id2');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse set with ieeAddr topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.ID, '0x12345689');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse set with postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/left/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.ID, '0x12345689');
            chai.assert.strictEqual(parsed.postfix, 'left');
        });

        it('Should parse set with postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/right/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.ID, '0x12345689');
            chai.assert.strictEqual(parsed.postfix, 'right');
        });

        it('Should parse set with postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/bottom_left/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.ID, '0x12345689');
            chai.assert.strictEqual(parsed.postfix, 'bottom_left');
        });

        it('Shouldnt parse set with invalid postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/invalid/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.ID, '0x12345689/invalid');
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
            chai.assert.strictEqual(parsed.ID, 'my/device/in/basement/sensor');
            chai.assert.strictEqual(parsed.postfix, 'bottom_left');
        });
    });

    it('Should not publish messages to zigbee devices when payload is invalid', () => {
        zigbee.publish.resetHistory();
        zigbee.getDevice = sinon.fake.returns({modelId: 'lumi.ctrl_neutral1'});
        devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({state: true}));
        chai.assert.isTrue(zigbee.publish.notCalled);
        devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify({state: 1}));
        chai.assert.isTrue(zigbee.publish.notCalled);
    });

    it('Should set state before color', (done) => {
        zigbee.publish.resetHistory();
        zigbee.getDevice = sinon.fake.returns({modelId: 'LCT001'});
        const msg = {'state': 'ON', 'color': {'x': 0.701, 'y': 0.299}};
        devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify(msg));
        setTimeout(() => {
            chai.assert.equal(zigbee.publish.callCount, 3);
            chai.assert.equal(zigbee.publish.getCall(0).args[2], 'genOnOff');
            chai.assert.equal(zigbee.publish.getCall(0).args[3], 'on');
            chai.assert.equal(zigbee.publish.getCall(1).args[2], 'lightingColorCtrl');
            chai.assert.equal(zigbee.publish.getCall(1).args[3], 'moveToColor');
            chai.assert.equal(zigbee.publish.getCall(2).args[2], 'lightingColorCtrl');
            chai.assert.equal(zigbee.publish.getCall(2).args[3], 'read');
            done();
        }, 300);
    });

    it('Should set state with brightness before color', (done) => {
        zigbee.publish.resetHistory();
        zigbee.getDevice = sinon.fake.returns({modelId: 'LCT001'});
        const msg = {'state': 'ON', 'color': {'x': 0.701, 'y': 0.299}, 'transition': 3, 'brightness': 100};
        devicePublish.onMQTTMessage('zigbee2mqtt/0x12345678/set', JSON.stringify(msg));
        setTimeout(() => {
            chai.assert.isTrue(zigbee.publish.calledTwice);
            chai.assert.equal(zigbee.publish.getCall(0).args[2], 'genLevelCtrl');
            chai.assert.equal(zigbee.publish.getCall(1).args[2], 'lightingColorCtrl');
            done();
        }, 300);
    });
});
