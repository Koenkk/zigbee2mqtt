const sinon = require('sinon');
const DevicePublish = require('../lib/extension/devicePublish');
const settings = require('../lib/util/settings');
const utils = require('./utils');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mqtt = {
    subscribe: (topic) => {},
};

const zigbee = {
    getDevice: null,
    publish: sinon.stub().callsFake((entityID, entityType, cid, cmd, cmdType, zclData, cfg, ep, callback) => {
        callback(false, null);
    }),
};

const publishEntityState = sinon.stub().callsFake((entityID, payload, cache) => {
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
        utils.stubLogger(sinon);
        devicePublish = new DevicePublish(zigbee, mqtt, null, publishEntityState);
    });

    afterEach(() => {
        sinon.restore();
    });

    /* eslint-disable jest/no-identical-title */ // TODO: FIXME
    describe('Parse topic', () => {
        it('Should publish messages to zigbee devices', async () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({brightness: '200'}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000001');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genLevelCtrl');
            expect(zigbee.publish.getCall(0).args[3]).toBe('moveToLevelWithOnOff');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({level: 200, transtime: 0});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe('0x00000001');
            expect(publishEntityState.getCall(0).args[1]).toEqual({state: 'ON', brightness: 200});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(2);
        });

        it('Should publish messages to zigbee devices', async () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            sinon.stub(settings, 'getIeeeAddrByFriendlyName').callsFake(() => '0x00000002');
            zigbee.getDevice = sinon.fake.returns({modelId: 'LCT003'});
            devicePublish.onMQTTMessage('zigbee2mqtt/wohnzimmer.light.wall.right/set', JSON.stringify({state: 'ON'}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000002');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genOnOff');
            expect(zigbee.publish.getCall(0).args[3]).toBe('on');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe('0x00000002');
            expect(publishEntityState.getCall(0).args[1]).toEqual({state: 'ON'});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(1);
        });

        it('Should publish messages to zigbee devices when brightness is in %', async () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000003/set', JSON.stringify({brightness_percent: '92'}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000003');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genLevelCtrl');
            expect(zigbee.publish.getCall(0).args[3]).toBe('moveToLevelWithOnOff');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({level: 235, transtime: 0});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe('0x00000003');
            expect(publishEntityState.getCall(0).args[1]).toEqual({state: 'ON', brightness: 235});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(2);
        }
        );

        it('Should publish messages to zigbee devices when brightness is in number', async () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000004/set', JSON.stringify({brightness: 230}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000004');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genLevelCtrl');
            expect(zigbee.publish.getCall(0).args[3]).toBe('moveToLevelWithOnOff');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({level: 230, transtime: 0});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe('0x00000004');
            expect(publishEntityState.getCall(0).args[1]).toEqual({state: 'ON', brightness: 230});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(2);
        }
        );

        it('Should publish messages to zigbee devices with color_temp', async () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 WS opal 980lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000005/set', JSON.stringify({color_temp: '222'}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000005');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('lightingColorCtrl');
            expect(zigbee.publish.getCall(0).args[3]).toBe('moveToColorTemp');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({colortemp: '222', transtime: 0});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            await wait(10);
            expect(zigbee.publish.callCount).toBe(2);
        });

        it('Should publish messages to zigbee devices with color_temp in %', async () => {
            publishEntityState.resetHistory();
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 WS opal 980lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000006/set', JSON.stringify({color_temp_percent: '100'}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000006');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('lightingColorCtrl');
            expect(zigbee.publish.getCall(0).args[3]).toBe('moveToColorTemp');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({colortemp: '500', transtime: 0});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            expect(publishEntityState.notCalled).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(2);
        }
        );

        it('Should publish messages to zigbee devices with non-default ep', async () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'lumi.ctrl_neutral1'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000007/set', JSON.stringify({state: 'OFF'}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000007');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genOnOff');
            expect(zigbee.publish.getCall(0).args[3]).toBe('off');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBe(2);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(1);
        }
        );

        it('Should publish messages to zigbee devices with non-default ep and postfix', async () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'lumi.ctrl_neutral2'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000008/right/set', JSON.stringify({state: 'OFF'}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000008');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genOnOff');
            expect(zigbee.publish.getCall(0).args[3]).toBe('off');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBe(3);
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe('0x00000008');
            expect(publishEntityState.getCall(0).args[1]).toEqual({state_right: 'OFF'});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(1);
        }
        );

        it('Should publish messages to zigbee gledopto with [11,13]', async () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'GLEDOPTO', epList: [11, 13]});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000009/set', JSON.stringify({state: 'OFF'}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000009');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genOnOff');
            expect(zigbee.publish.getCall(0).args[3]).toBe('off');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBe(11);
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe('0x00000009');
            expect(publishEntityState.getCall(0).args[1]).toEqual({state: 'OFF'});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(1);
        });

        it('Should publish messages to zigbee gledopto with [11,12,13]', async () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'GLEDOPTO', epList: [11, 12, 13]});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000010/set', JSON.stringify({state: 'OFF', brightness: 50}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000010');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genOnOff');
            expect(zigbee.publish.getCall(0).args[3]).toBe('off');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBe(12);
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe('0x00000010');
            expect(publishEntityState.getCall(0).args[1]).toEqual({state: 'OFF'});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(1);
        }
        );

        it('Should publish messages to zigbee devices with color xy', async () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000011/set', JSON.stringify({color: {x: 100, y: 50}}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000011');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('lightingColorCtrl');
            expect(zigbee.publish.getCall(0).args[3]).toBe('moveToColor');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({colorx: 6553500, colory: 3276750, transtime: 0});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            await wait(10);
            expect(zigbee.publish.callCount).toBe(2);
        });

        it('Should publish messages to zigbee devices with color xy and state', async () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            const payload = {color: {x: 100, y: 50}, state: 'ON'};
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000012/set', JSON.stringify(payload));
            expect(zigbee.publish.callCount).toBe(2);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000012');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genOnOff');
            expect(zigbee.publish.getCall(0).args[3]).toBe('on');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            expect(zigbee.publish.getCall(1).args[0]).toBe('0x00000012');
            expect(zigbee.publish.getCall(1).args[1]).toBe('device');
            expect(zigbee.publish.getCall(1).args[2]).toBe('lightingColorCtrl');
            expect(zigbee.publish.getCall(1).args[3]).toBe('moveToColor');
            expect(zigbee.publish.getCall(1).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(1).args[5]).toEqual({colorx: 6553500, colory: 3276750, transtime: 0});
            expect(zigbee.publish.getCall(1).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(1).args[7]).toBeNull();
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe('0x00000012');
            expect(publishEntityState.getCall(0).args[1]).toEqual({state: 'ON'});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(3);
        }
        );

        it('Should publish messages to zigbee devices with color xy and brightness', async () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            const payload = {color: {x: 100, y: 50}, brightness: 20};
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000013/set', JSON.stringify(payload));
            expect(zigbee.publish.callCount).toBe(2);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000013');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genLevelCtrl');
            expect(zigbee.publish.getCall(0).args[3]).toBe('moveToLevelWithOnOff');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({level: 20, transtime: 0});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            expect(zigbee.publish.getCall(1).args[0]).toBe('0x00000013');
            expect(zigbee.publish.getCall(1).args[1]).toBe('device');
            expect(zigbee.publish.getCall(1).args[2]).toBe('lightingColorCtrl');
            expect(zigbee.publish.getCall(1).args[3]).toBe('moveToColor');
            expect(zigbee.publish.getCall(1).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(1).args[5]).toEqual({colorx: 6553500, colory: 3276750, transtime: 0});
            expect(zigbee.publish.getCall(1).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(1).args[7]).toBeNull();
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe('0x00000013');
            expect(publishEntityState.getCall(0).args[1]).toEqual({state: 'ON', brightness: 20});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(4);
        }
        );

        it('Should publish messages to zigbee devices with color xy, brightness and state on', async () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            const payload = {color: {x: 100, y: 50}, brightness: 20, state: 'oN'};
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000014/set', JSON.stringify(payload));
            expect(zigbee.publish.callCount).toBe(2);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000014');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genLevelCtrl');
            expect(zigbee.publish.getCall(0).args[3]).toBe('moveToLevelWithOnOff');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({level: 20, transtime: 0});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            expect(zigbee.publish.getCall(1).args[0]).toBe('0x00000014');
            expect(zigbee.publish.getCall(1).args[1]).toBe('device');
            expect(zigbee.publish.getCall(1).args[2]).toBe('lightingColorCtrl');
            expect(zigbee.publish.getCall(1).args[3]).toBe('moveToColor');
            expect(zigbee.publish.getCall(1).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(1).args[5]).toEqual({colorx: 6553500, colory: 3276750, transtime: 0});
            expect(zigbee.publish.getCall(1).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(1).args[7]).toBeNull();
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe('0x00000014');
            expect(publishEntityState.getCall(0).args[1]).toEqual({state: 'ON', brightness: 20});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(4);
        }
        );

        it('Should publish messages to zigbee devices with color xy, brightness and state off', async () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            const payload = {color: {x: 100, y: 50}, brightness: 20, state: 'oFF'};
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000015/set', JSON.stringify(payload));
            expect(zigbee.publish.callCount).toBe(2);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000015');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genOnOff');
            expect(zigbee.publish.getCall(0).args[3]).toBe('off');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            expect(zigbee.publish.getCall(1).args[0]).toBe('0x00000015');
            expect(zigbee.publish.getCall(1).args[1]).toBe('device');
            expect(zigbee.publish.getCall(1).args[2]).toBe('lightingColorCtrl');
            expect(zigbee.publish.getCall(1).args[3]).toBe('moveToColor');
            expect(zigbee.publish.getCall(1).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(1).args[5]).toEqual({colorx: 6553500, colory: 3276750, transtime: 0});
            expect(zigbee.publish.getCall(1).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(1).args[7]).toBeNull();
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe('0x00000015');
            expect(publishEntityState.getCall(0).args[1]).toEqual({state: 'OFF'});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(3);
        }
        );

        it('Should publish messages to zigbee devices with color rgb', async () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000016/set', JSON.stringify({color: {r: 100, g: 200, b: 10}}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000016');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('lightingColorCtrl');
            expect(zigbee.publish.getCall(0).args[3]).toBe('moveToColor');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({colorx: 17085, colory: 44000, transtime: 0});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            await wait(10);
            expect(zigbee.publish.callCount).toBe(2);
        });

        it('Should publish messages to zigbee devices with color rgb string', async () => {
            zigbee.publish.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000017/set', JSON.stringify({color: {rgb: '100,200,10'}}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000017');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('lightingColorCtrl');
            expect(zigbee.publish.getCall(0).args[3]).toBe('moveToColor');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({colorx: 17085, colory: 44000, transtime: 0});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            await wait(10);
            expect(zigbee.publish.callCount).toBe(2);
        }
        );

        it('Should publish 1 message when brightness with state is send', async () => {
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            zigbee.getDevice = sinon.fake.returns({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000018/set', JSON.stringify({state: 'ON', brightness: '50'}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe('0x00000018');
            expect(zigbee.publish.getCall(0).args[1]).toBe('device');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genLevelCtrl');
            expect(zigbee.publish.getCall(0).args[3]).toBe('moveToLevelWithOnOff');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({level: 50, transtime: 0});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe('0x00000018');
            expect(publishEntityState.getCall(0).args[1]).toEqual({state: 'ON', brightness: 50});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(2);
        }
        );

        it('Should publish messages to groups', async () => {
            sinon.stub(settings, 'getGroupIDByFriendlyName').callsFake(() => '1');
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            devicePublish.onMQTTMessage('zigbee2mqtt/group/group_1/set', JSON.stringify({state: 'ON'}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe(1);
            expect(zigbee.publish.getCall(0).args[1]).toBe('group');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genOnOff');
            expect(zigbee.publish.getCall(0).args[3]).toBe('on');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe(1);
            expect(publishEntityState.getCall(0).args[1]).toEqual({state: 'ON'});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(1);
        });

        it('Should publish messages to groups with brightness_percent', async () => {
            sinon.stub(settings, 'getGroupIDByFriendlyName').callsFake(() => '1');
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            devicePublish.onMQTTMessage('zigbee2mqtt/group/group_1/set', JSON.stringify({brightness_percent: 50}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe(1);
            expect(zigbee.publish.getCall(0).args[1]).toBe('group');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genLevelCtrl');
            expect(zigbee.publish.getCall(0).args[3]).toBe('moveToLevelWithOnOff');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({level: 127, transtime: 0});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe(1);
            expect(publishEntityState.getCall(0).args[1]).toEqual({state: 'ON', brightness: 127});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(1);
        });

        it('Should publish messages to groups with on and brightness', async () => {
            sinon.stub(settings, 'getGroupIDByFriendlyName').callsFake(() => '1');
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            devicePublish.onMQTTMessage('zigbee2mqtt/group/group_1/set', JSON.stringify({state: 'ON', brightness: 50}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe(1);
            expect(zigbee.publish.getCall(0).args[1]).toBe('group');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genLevelCtrl');
            expect(zigbee.publish.getCall(0).args[3]).toBe('moveToLevelWithOnOff');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({level: 50, transtime: 0});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe(1);
            expect(publishEntityState.getCall(0).args[1]).toEqual({state: 'ON', brightness: 50});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(1);
        });

        it('Should publish messages to groups with off and brightness', async () => {
            sinon.stub(settings, 'getGroupIDByFriendlyName').callsFake(() => '1');
            zigbee.publish.resetHistory();
            publishEntityState.resetHistory();
            devicePublish.onMQTTMessage('zigbee2mqtt/group/group_1/set', JSON.stringify({state: 'OFF', brightness: 5}));
            expect(zigbee.publish.callCount).toBe(1);
            expect(zigbee.publish.getCall(0).args[0]).toBe(1);
            expect(zigbee.publish.getCall(0).args[1]).toBe('group');
            expect(zigbee.publish.getCall(0).args[2]).toBe('genOnOff');
            expect(zigbee.publish.getCall(0).args[3]).toBe('off');
            expect(zigbee.publish.getCall(0).args[4]).toBe('functional');
            expect(zigbee.publish.getCall(0).args[5]).toEqual({});
            expect(zigbee.publish.getCall(0).args[6]).toEqual(cfg.default);
            expect(zigbee.publish.getCall(0).args[7]).toBeNull();
            expect(publishEntityState.callCount).toBe(1);
            expect(publishEntityState.getCall(0).args[0]).toBe(1);
            expect(publishEntityState.getCall(0).args[1]).toEqual({state: 'OFF'});
            expect(publishEntityState.getCall(0).args[2]).toBe(true);
            await wait(10);
            expect(zigbee.publish.callCount).toBe(1);
        });
    });

    describe('Parse topic', () => {
        it('Should handle non-valid topics', () => {
            const topic = 'zigbee2mqtt1/my_device_id/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed).toBeNull();
        });

        it('Should handle non-valid topics', () => {
            const topic = 'zigbee2mqtt1/my_device_id/sett';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed).toBeNull();
        });

        it('Should handle non-valid topics', () => {
            const topic = 'zigbee2mqtt/my_device_id/write';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed).toBeNull();
        });

        it('Should handle non-valid topics', () => {
            const topic = 'zigbee2mqtt/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed).toBeNull();
        });

        it('Should handle non-valid topics', () => {
            const topic = 'set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed).toBeNull();
        });

        it('Should parse set topic', () => {
            const topic = 'zigbee2mqtt/my_device_id/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('my_device_id');
            expect(parsed.postfix).toBe('');
        });

        it('Should parse get topic', () => {
            const topic = 'zigbee2mqtt/my_device_id2/get';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('get');
            expect(parsed.ID).toBe('my_device_id2');
            expect(parsed.postfix).toBe('');
        });

        it('Should parse topic with when base topic has multiple slashes', () => {
            sinon.stub(settings, 'get').callsFake(() => {
                return {
                    mqtt: {
                        base_topic: 'zigbee2mqtt/at/my/home',
                    },
                };
            });

            const topic = 'zigbee2mqtt/at/my/home/my_device_id2/get';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('get');
            expect(parsed.ID).toBe('my_device_id2');
            expect(parsed.postfix).toBe('');
        });

        it('Should parse topic with when deviceID has multiple slashes', () => {
            const topic = 'zigbee2mqtt/floor0/basement/my_device_id2/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('floor0/basement/my_device_id2');
            expect(parsed.postfix).toBe('');
        });

        it('Should parse topic with when base and deviceID have multiple slashes', () => {
            sinon.stub(settings, 'get').callsFake(() => {
                return {
                    mqtt: {
                        base_topic: 'zigbee2mqtt/at/my/basement',
                    },
                };
            });

            const topic = 'zigbee2mqtt/at/my/basement/floor0/basement/my_device_id2/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('floor0/basement/my_device_id2');
            expect(parsed.postfix).toBe('');
        }
        );

        it('Should parse set with ieeAddr topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('0x12345689');
            expect(parsed.postfix).toBe('');
        });

        it('Should parse set with postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/left/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('0x12345689');
            expect(parsed.postfix).toBe('left');
        });

        it('Should parse set with almost postfix topic', () => {
            const topic = 'zigbee2mqtt/wohnzimmer.light.wall.right/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('wohnzimmer.light.wall.right');
            expect(parsed.postfix).toBe('');
        });

        it('Should parse set with postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/right/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('0x12345689');
            expect(parsed.postfix).toBe('right');
        });

        it('Should parse set with postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/bottom_left/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('0x12345689');
            expect(parsed.postfix).toBe('bottom_left');
        });

        it('Shouldnt parse set with invalid postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/invalid/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('0x12345689/invalid');
            expect(parsed.postfix).toBe('');
        });

        it('Should parse set with and slashes in base and deviceID postfix topic', () => {
            sinon.stub(settings, 'get').callsFake(() => {
                return {
                    mqtt: {
                        base_topic: 'zigbee2mqtt/at/my/home',
                    },
                };
            });

            const topic = 'zigbee2mqtt/at/my/home/my/device/in/basement/sensor/bottom_left/get';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('get');
            expect(parsed.ID).toBe('my/device/in/basement/sensor');
            expect(parsed.postfix).toBe('bottom_left');
        }
        );
    });

    it('Should not publish messages to zigbee devices when payload is invalid', async () => {
        zigbee.publish.resetHistory();
        zigbee.getDevice = sinon.fake.returns({modelId: 'lumi.ctrl_neutral1'});
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000019/set', JSON.stringify({state: true}));
        await wait(10);
        expect(zigbee.publish.notCalled).toBe(true);
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000019/set', JSON.stringify({state: 1}));
        await wait(10);
        expect(zigbee.publish.notCalled).toBe(true);
    }
    );

    it('Should set state before color', async () => {
        zigbee.publish.resetHistory();
        zigbee.getDevice = sinon.fake.returns({modelId: 'LCT001'});
        const msg = {'state': 'ON', 'color': {'x': 0.701, 'y': 0.299}};
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000020/set', JSON.stringify(msg));
        expect(zigbee.publish.callCount).toEqual(2);
        expect(zigbee.publish.getCall(0).args[2]).toEqual('genOnOff');
        expect(zigbee.publish.getCall(0).args[3]).toEqual('on');
        expect(zigbee.publish.getCall(1).args[2]).toEqual('lightingColorCtrl');
        expect(zigbee.publish.getCall(1).args[3]).toEqual('moveToColor');
        await wait(10);
        expect(zigbee.publish.callCount).toEqual(3);
        expect(zigbee.publish.getCall(2).args[2]).toEqual('lightingColorCtrl');
        expect(zigbee.publish.getCall(2).args[3]).toEqual('read');
    });

    it('Should set state with brightness before color', async () => {
        zigbee.publish.resetHistory();
        zigbee.getDevice = sinon.fake.returns({modelId: 'LCT001'});
        const msg = {'state': 'ON', 'color': {'x': 0.701, 'y': 0.299}, 'transition': 3, 'brightness': 100};
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000021/set', JSON.stringify(msg));
        expect(zigbee.publish.callCount).toBe(2);
        expect(zigbee.publish.getCall(0).args[2]).toEqual('genLevelCtrl');
        expect(zigbee.publish.getCall(1).args[2]).toEqual('lightingColorCtrl');
        await wait(10);
        expect(zigbee.publish.callCount).toBe(2);
    });
});
