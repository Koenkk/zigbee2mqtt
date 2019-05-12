const DevicePublish = require('../lib/extension/devicePublish');
const settings = require('../lib/util/settings');
const utils = require('./utils');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mqtt = {
    subscribe: (topic) => {},
};

const zigbee = {
    getDevice: null,
    publish: jest.fn((entityID, entityType, cid, cmd, cmdType, zclData, cfg, ep, callback) => {
        callback(false, null);
    }),
};

const state = {
    get: jest.fn(),
};

const publishEntityState = jest.fn();

const cfg = {
    default: {
        manufSpec: 0,
        disDefaultRsp: 0,
    },
};

describe('DevicePublish', () => {
    let devicePublish;

    beforeEach(() => {
        utils.stubLogger(jest);
        devicePublish = new DevicePublish(zigbee, mqtt, state, publishEntityState);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    /* eslint-disable jest/no-identical-title */ // TODO: FIXME
    describe('Parse topic', () => {
        it('Should publish messages to zigbee devices', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({brightness: '200'}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000001',
                'device',
                'genLevelCtrl',
                'moveToLevelWithOnOff',
                'functional',
                {level: 200, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000001',
                {state: 'ON', brightness: 200});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        });

        it('Should publish messages to zigbee devices', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            jest.spyOn(settings, 'getIeeeAddrByFriendlyName').mockReturnValue('0x00000002');
            zigbee.getDevice = () => ({modelId: 'LCT003'});
            devicePublish.onMQTTMessage('zigbee2mqtt/wohnzimmer.light.wall.right/set', JSON.stringify({state: 'ON'}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000002',
                'device',
                'genOnOff',
                'on',
                'functional',
                {},
                cfg.default,
                null,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000002',
                {state: 'ON'});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        });

        it('Should publish messages to zigbee devices when brightness is in %', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000003/set', JSON.stringify({brightness_percent: '92'}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000003',
                'device',
                'genLevelCtrl',
                'moveToLevelWithOnOff',
                'functional',
                {level: 235, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000003',
                {state: 'ON', brightness: 235});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        }
        );

        it('Should publish messages to zigbee devices when brightness is in number', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000004/set', JSON.stringify({brightness: 230}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000004',
                'device',
                'genLevelCtrl',
                'moveToLevelWithOnOff',
                'functional',
                {level: 230, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000004',
                {state: 'ON', brightness: 230});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        }
        );

        it('Should publish messages to zigbee devices with color_temp', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 WS opal 980lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000005/set', JSON.stringify({color_temp: '222'}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000005',
                'device',
                'lightingColorCtrl',
                'moveToColorTemp',
                'functional',
                {colortemp: 222, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000005',
                {color_temp: 222});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        });

        it('Should publish messages to zigbee devices with color_temp in %', async () => {
            publishEntityState.mockClear();
            zigbee.publish.mockClear();
            zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 WS opal 980lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000006/set', JSON.stringify({color_temp_percent: '100'}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000006',
                'device',
                'lightingColorCtrl',
                'moveToColorTemp',
                'functional',
                {colortemp: 500, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000006',
                {color_temp: 500});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        }
        );

        it('Should publish messages to zigbee devices with non-default ep', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral1'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000007/set', JSON.stringify({state: 'OFF'}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000007',
                'device',
                'genOnOff',
                'off',
                'functional',
                {},
                cfg.default,
                2,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000007',
                {state: 'OFF'});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        }
        );

        it('Should publish messages to zigbee devices with non-default ep and postfix', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral2'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000008/right/set', JSON.stringify({state: 'OFF'}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000008',
                'device',
                'genOnOff',
                'off',
                'functional',
                {},
                cfg.default,
                3,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000008',
                {state_right: 'OFF'});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        }
        );

        it('Should publish messages to zigbee gledopto with [11,13]', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'GLEDOPTO', epList: [11, 13]});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000009/set', JSON.stringify({state: 'OFF'}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000009',
                'device',
                'genOnOff',
                'off',
                'functional',
                {},
                cfg.default,
                11,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000009',
                {state: 'OFF'});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        });

        it('Should publish messages to zigbee gledopto with [11,12,13]', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'GLEDOPTO', epList: [11, 12, 13]});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000010/set', JSON.stringify({state: 'OFF', brightness: 50}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000010',
                'device',
                'genOnOff',
                'off',
                'functional',
                {},
                cfg.default,
                12,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000010',
                {state: 'OFF'});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        }
        );

        it('Should publish messages to zigbee devices with color xy', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000011/set', JSON.stringify({color: {x: 100, y: 50}}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000011',
                'device',
                'lightingColorCtrl',
                'moveToColor',
                'functional',
                {colorx: 6553500, colory: 3276750, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000011',
                {color: {x: 100, y: 50}});
        });

        it('Should publish messages to zigbee devices with color xy and state', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            const payload = {color: {x: 100, y: 50}, state: 'ON'};
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000012/set', JSON.stringify(payload));
            expect(zigbee.publish).toHaveBeenCalledTimes(2);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000012',
                'device',
                'genOnOff',
                'on',
                'functional',
                {},
                cfg.default,
                null,
                expect.any(Function));
            expect(zigbee.publish).toHaveBeenNthCalledWith(2,
                '0x00000012',
                'device',
                'lightingColorCtrl',
                'moveToColor',
                'functional',
                {colorx: 6553500, colory: 3276750, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(2);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000012',
                {state: 'ON'});
            expect(publishEntityState).toHaveBeenNthCalledWith(2,
                '0x00000012',
                {color: {x: 100, y: 50}});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(2);
        }
        );

        it('Should publish messages to zigbee devices with color xy and brightness', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            const payload = {color: {x: 100, y: 50}, brightness: 20};
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000013/set', JSON.stringify(payload));
            expect(zigbee.publish).toHaveBeenCalledTimes(2);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000013',
                'device',
                'genLevelCtrl',
                'moveToLevelWithOnOff',
                'functional',
                {level: 20, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            expect(zigbee.publish).toHaveBeenNthCalledWith(2,
                '0x00000013',
                'device',
                'lightingColorCtrl',
                'moveToColor',
                'functional',
                {colorx: 6553500, colory: 3276750, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(2);
            expect(publishEntityState).toHaveBeenCalledTimes(2);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000013',
                {state: 'ON', brightness: 20});
            expect(publishEntityState).toHaveBeenNthCalledWith(2,
                '0x00000013',
                {color: {x: 100, y: 50}});
        }
        );

        it('Should publish messages to zigbee devices with color xy, brightness and state on', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            const payload = {color: {x: 100, y: 50}, brightness: 20, state: 'oN'};
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000014/set', JSON.stringify(payload));
            expect(zigbee.publish).toHaveBeenCalledTimes(2);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000014',
                'device',
                'genLevelCtrl',
                'moveToLevelWithOnOff',
                'functional',
                {level: 20, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            expect(zigbee.publish).toHaveBeenNthCalledWith(2,
                '0x00000014',
                'device',
                'lightingColorCtrl',
                'moveToColor',
                'functional',
                {colorx: 6553500, colory: 3276750, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(2);
            expect(publishEntityState).toHaveBeenCalledTimes(2);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000014',
                {state: 'ON', brightness: 20});
            expect(publishEntityState).toHaveBeenNthCalledWith(2,
                '0x00000014',
                {color: {x: 100, y: 50}});
        }
        );

        it('Should publish messages to zigbee devices with color xy, brightness and state off', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            const payload = {color: {x: 100, y: 50}, brightness: 20, state: 'oFF'};
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000015/set', JSON.stringify(payload));
            expect(zigbee.publish).toHaveBeenCalledTimes(2);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000015',
                'device',
                'genOnOff',
                'off',
                'functional',
                {},
                cfg.default,
                null,
                expect.any(Function));
            expect(zigbee.publish).toHaveBeenNthCalledWith(2,
                '0x00000015',
                'device',
                'lightingColorCtrl',
                'moveToColor',
                'functional',
                {colorx: 6553500, colory: 3276750, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(2);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000015',
                {state: 'OFF'});
            expect(publishEntityState).toHaveBeenNthCalledWith(2,
                '0x00000015',
                {color: {x: 100, y: 50}});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(2);
        }
        );

        it('Should publish messages to zigbee devices with color rgb', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000016/set', JSON.stringify({color: {r: 100, g: 200, b: 10}}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000016',
                'device',
                'lightingColorCtrl',
                'moveToColor',
                'functional',
                {colorx: 17085, colory: 44000, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000016',
                {color: {x: 0.2607, y: 0.6714}});
        });

        it('Should publish messages to zigbee devices with color rgb string', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000017/set', JSON.stringify({color: {rgb: '100,200,10'}}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000017',
                'device',
                'lightingColorCtrl',
                'moveToColor',
                'functional',
                {colorx: 17085, colory: 44000, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000017',
                {color: {x: 0.2607, y: 0.6714}});
        }
        );

        it('Should publish 1 message when brightness with state is send', async () => {
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
            devicePublish.onMQTTMessage('zigbee2mqtt/0x00000018/set', JSON.stringify({state: 'ON', brightness: '50'}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                '0x00000018',
                'device',
                'genLevelCtrl',
                'moveToLevelWithOnOff',
                'functional',
                {level: 50, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                '0x00000018',
                {state: 'ON', brightness: 50});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        }
        );

        it('Should publish messages to groups', async () => {
            jest.spyOn(settings, 'getGroupIDByFriendlyName').mockReturnValue('1');
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            devicePublish.onMQTTMessage('zigbee2mqtt/group/group_1/set', JSON.stringify({state: 'ON'}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                1,
                'group',
                'genOnOff',
                'on',
                'functional',
                {},
                cfg.default,
                null,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                1,
                {state: 'ON'});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        });

        it('Should publish messages to groups with brightness_percent', async () => {
            jest.spyOn(settings, 'getGroupIDByFriendlyName').mockReturnValue('1');
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            devicePublish.onMQTTMessage('zigbee2mqtt/group/group_1/set', JSON.stringify({brightness_percent: 50}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                1,
                'group',
                'genLevelCtrl',
                'moveToLevelWithOnOff',
                'functional',
                {level: 127, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                1,
                {state: 'ON', brightness: 127});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        });

        it('Should publish messages to groups with on and brightness', async () => {
            jest.spyOn(settings, 'getGroupIDByFriendlyName').mockReturnValue('1');
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            devicePublish.onMQTTMessage('zigbee2mqtt/group/group_1/set', JSON.stringify({state: 'ON', brightness: 50}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                1,
                'group',
                'genLevelCtrl',
                'moveToLevelWithOnOff',
                'functional',
                {level: 50, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                1,
                {state: 'ON', brightness: 50});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        });

        it('Should publish messages to groups with off and brightness', async () => {
            jest.spyOn(settings, 'getGroupIDByFriendlyName').mockReturnValue('1');
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            devicePublish.onMQTTMessage('zigbee2mqtt/group/group_1/set', JSON.stringify({state: 'OFF', brightness: 5}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                1,
                'group',
                'genOnOff',
                'off',
                'functional',
                {},
                cfg.default,
                null,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                1,
                {state: 'OFF'});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        });

        it('Should publish messages to groups color', async () => {
            jest.spyOn(settings, 'getGroupIDByFriendlyName').mockReturnValue('1');
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            devicePublish.onMQTTMessage('zigbee2mqtt/group/group_1/set', JSON.stringify({color: {x: 0.37, y: 0.28}}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                1,
                'group',
                'lightingColorCtrl',
                'moveToColor',
                'functional',
                {colorx: 24248, colory: 18350, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                1,
                {color: {x: 0.37, y: 0.28}});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
        });

        it('Should publish messages to groups color temperature', async () => {
            jest.spyOn(settings, 'getGroupIDByFriendlyName').mockReturnValue('1');
            zigbee.publish.mockClear();
            publishEntityState.mockClear();
            devicePublish.onMQTTMessage('zigbee2mqtt/group/group_1/set', JSON.stringify({color_temp: 100}));
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
            expect(zigbee.publish).toHaveBeenNthCalledWith(1,
                1,
                'group',
                'lightingColorCtrl',
                'moveToColorTemp',
                'functional',
                {colortemp: 100, transtime: 0},
                cfg.default,
                null,
                expect.any(Function));
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState).toHaveBeenNthCalledWith(1,
                1,
                {color_temp: 100});
            await wait(10);
            expect(zigbee.publish).toHaveBeenCalledTimes(1);
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
            expect(parsed.attribute).toBeUndefined();
        });

        it('Should parse get topic', () => {
            const topic = 'zigbee2mqtt/my_device_id2/get';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('get');
            expect(parsed.ID).toBe('my_device_id2');
            expect(parsed.postfix).toBe('');
            expect(parsed.attribute).toBeUndefined();
        });


        it('Should not respond to bridge/config/devices/get', () => {
            const topic = 'zigbee2mqtt/bridge/config/devices/get';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed).toBeNull();
        });

        it('Should not respond to bridge/config/devices/set', () => {
            const topic = 'zigbee2mqtt/bridge/config/devices/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed).toBeNull();
        });


        it('Should not respond to bridge/config/devices', () => {
            const topic = 'zigbee2mqtt/bridge/config/devices';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed).toBeNull();
        });


        it('Should parse topic with when base topic has multiple slashes', () => {
            jest.spyOn(settings, 'get').mockReturnValue({
                mqtt: {
                    base_topic: 'zigbee2mqtt/at/my/home',
                },
            });

            const topic = 'zigbee2mqtt/at/my/home/my_device_id2/get';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('get');
            expect(parsed.ID).toBe('my_device_id2');
            expect(parsed.postfix).toBe('');
            expect(parsed.attribute).toBeUndefined();
        });

        it('Should parse topic with when deviceID has multiple slashes', () => {
            const topic = 'zigbee2mqtt/floor0/basement/my_device_id2/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('floor0/basement/my_device_id2');
            expect(parsed.postfix).toBe('');
            expect(parsed.attribute).toBeUndefined();
        });

        it('Should parse topic with when base and deviceID have multiple slashes', () => {
            jest.spyOn(settings, 'get').mockReturnValue({
                mqtt: {
                    base_topic: 'zigbee2mqtt/at/my/basement',
                },
            });

            const topic = 'zigbee2mqtt/at/my/basement/floor0/basement/my_device_id2/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('floor0/basement/my_device_id2');
            expect(parsed.postfix).toBe('');
            expect(parsed.attribute).toBeUndefined();
        }
        );

        it('Should parse set with attribute topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/set/foobar';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('0x12345689');
            expect(parsed.postfix).toBe('');
            expect(parsed.attribute).toBe('foobar');
        });

        it('Should parse set with ieeeAddr topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('0x12345689');
            expect(parsed.postfix).toBe('');
            expect(parsed.attribute).toBeUndefined();
        });

        it('Should parse set with postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/left/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('0x12345689');
            expect(parsed.postfix).toBe('left');
            expect(parsed.attribute).toBeUndefined();
        });

        it('Should parse set with almost postfix topic', () => {
            const topic = 'zigbee2mqtt/wohnzimmer.light.wall.right/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('wohnzimmer.light.wall.right');
            expect(parsed.postfix).toBe('');
            expect(parsed.attribute).toBeUndefined();
        });

        it('Should parse set with postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/right/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('0x12345689');
            expect(parsed.postfix).toBe('right');
            expect(parsed.attribute).toBeUndefined();
        });

        it('Should parse set with postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/bottom_left/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('0x12345689');
            expect(parsed.postfix).toBe('bottom_left');
            expect(parsed.attribute).toBeUndefined();
        });

        it('Shouldnt parse set with invalid postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/invalid/set';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('0x12345689/invalid');
            expect(parsed.postfix).toBe('');
            expect(parsed.attribute).toBeUndefined();
        });

        it('Should parse set with postfix topic and attribute', () => {
            const topic = 'zigbee2mqtt/0x12345689/bottom_left/set/foobar';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('set');
            expect(parsed.ID).toBe('0x12345689');
            expect(parsed.postfix).toBe('bottom_left');
            expect(parsed.attribute).toBe('foobar');
        });

        it('Should parse set with and slashes in base and deviceID postfix topic', () => {
            jest.spyOn(settings, 'get').mockReturnValue({
                mqtt: {
                    base_topic: 'zigbee2mqtt/at/my/home',
                },
            });

            const topic = 'zigbee2mqtt/at/my/home/my/device/in/basement/sensor/bottom_left/get';
            const parsed = devicePublish.parseTopic(topic);
            expect(parsed.type).toBe('get');
            expect(parsed.ID).toBe('my/device/in/basement/sensor');
            expect(parsed.postfix).toBe('bottom_left');
            expect(parsed.attribute).toBeUndefined();
        }
        );
    });

    it('Should not publish messages to zigbee devices when payload is invalid', async () => {
        zigbee.publish.mockClear();
        zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral1'});
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000019/set', JSON.stringify({state: true}));
        await wait(10);
        expect(zigbee.publish).toHaveBeenCalledTimes(0);
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000019/set', JSON.stringify({state: 1}));
        await wait(10);
        expect(zigbee.publish).toHaveBeenCalledTimes(0);
    }
    );

    it('Should set state before color', async () => {
        zigbee.publish.mockClear();
        zigbee.getDevice = () => ({modelId: 'LCT001'});
        const msg = {'state': 'ON', 'color': {'x': 0.701, 'y': 0.299}};
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000020/set', JSON.stringify(msg));
        expect(zigbee.publish).toHaveBeenCalledTimes(2);
        expect(zigbee.publish.mock.calls[0][2]).toBe('genOnOff');
        expect(zigbee.publish.mock.calls[0][3]).toBe('on');
        expect(zigbee.publish.mock.calls[1][2]).toBe('lightingColorCtrl');
        expect(zigbee.publish.mock.calls[1][3]).toBe('moveToColor');
        await wait(10);
        expect(zigbee.publish).toHaveBeenCalledTimes(2);
    });

    it('Should read after write when enabled', async () => {
        zigbee.publish.mockClear();
        publishEntityState.mockClear();
        zigbee.getDevice = () => ({modelId: 'LCT001'});
        jest.spyOn(settings, 'getDevice').mockReturnValue({retrieve_state: true});
        const msg = {'state': 'ON', 'color': {'x': 0.701, 'y': 0.299}};
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000020/set', JSON.stringify(msg));
        expect(zigbee.publish).toHaveBeenCalledTimes(2);
        expect(zigbee.publish.mock.calls[0][2]).toBe('genOnOff');
        expect(zigbee.publish.mock.calls[0][3]).toBe('on');
        expect(zigbee.publish.mock.calls[1][2]).toBe('lightingColorCtrl');
        expect(zigbee.publish.mock.calls[1][3]).toBe('moveToColor');
        await wait(10);
        expect(zigbee.publish).toHaveBeenCalledTimes(5);
        expect(zigbee.publish.mock.calls[2][2]).toBe('genOnOff');
        expect(zigbee.publish.mock.calls[2][3]).toBe('read');
        expect(zigbee.publish.mock.calls[3][2]).toBe('genLevelCtrl');
        expect(zigbee.publish.mock.calls[3][3]).toBe('read');
        expect(zigbee.publish.mock.calls[4][2]).toBe('lightingColorCtrl');
        expect(zigbee.publish.mock.calls[4][3]).toBe('read');
        expect(publishEntityState).toHaveBeenCalledTimes(2);
        expect(publishEntityState).toHaveBeenNthCalledWith(1,
            '0x00000020',
            {state: 'ON'});
        expect(publishEntityState).toHaveBeenNthCalledWith(2,
            '0x00000020',
            {color: {x: 0.701, y: 0.299}});
    });

    it('Should set state with brightness before color', async () => {
        zigbee.publish.mockClear();
        publishEntityState.mockClear();
        zigbee.getDevice = () => ({modelId: 'LCT001'});
        const msg = {'state': 'ON', 'color': {'x': 0.701, 'y': 0.299}, 'transition': 3, 'brightness': 100};
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000021/set', JSON.stringify(msg));
        expect(zigbee.publish).toHaveBeenCalledTimes(2);
        expect(zigbee.publish.mock.calls[0][2]).toBe('genLevelCtrl');
        expect(zigbee.publish.mock.calls[1][2]).toBe('lightingColorCtrl');
        await wait(10);
        expect(zigbee.publish).toHaveBeenCalledTimes(2);
        expect(publishEntityState).toHaveBeenCalledTimes(2);
        expect(publishEntityState).toHaveBeenNthCalledWith(1,
            '0x00000021',
            {state: 'ON', brightness: 100});
        expect(publishEntityState).toHaveBeenNthCalledWith(2,
            '0x00000021',
            {color: {x: 0.701, y: 0.299}});
    });

    it('Should turn device off when brightness 0 is send', async () => {
        zigbee.publish.mockClear();
        publishEntityState.mockClear();
        zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({brightness: 0}));
        expect(zigbee.publish).toHaveBeenCalledTimes(1);
        expect(zigbee.publish).toHaveBeenNthCalledWith(1,
            '0x00000001',
            'device',
            'genOnOff',
            'off',
            'functional',
            {},
            cfg.default,
            null,
            expect.any(Function));
        expect(publishEntityState).toHaveBeenCalledTimes(1);
        expect(publishEntityState).toHaveBeenNthCalledWith(1,
            '0x00000001',
            {state: 'OFF', brightness: 0});
    });

    it('Should turn device off when brightness 0 is send with light_brightness converter', async () => {
        zigbee.publish.mockClear();
        publishEntityState.mockClear();
        zigbee.getDevice = () => ({modelId: 'FB56+ZSC05HG1.0'});
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({brightness: 0}));
        expect(zigbee.publish).toHaveBeenCalledTimes(1);
        expect(zigbee.publish).toHaveBeenNthCalledWith(1,
            '0x00000001',
            'device',
            'genOnOff',
            'off',
            'functional',
            {},
            cfg.default,
            null,
            expect.any(Function));
        expect(publishEntityState).toHaveBeenCalledTimes(1);
        expect(publishEntityState).toHaveBeenNthCalledWith(1,
            '0x00000001',
            {state: 'OFF', brightness: 0});
    });

    it('Specifc ZNCLDJ11LM test', async () => {
        zigbee.publish.mockClear();
        zigbee.getDevice = () => ({modelId: 'lumi.curtain'});
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({state: 'OPEN'}));
        expect(zigbee.publish).toHaveBeenNthCalledWith(1,
            '0x00000001', 'device', 'genAnalogOutput', 'write',
            'foundation', [{attrId: 0x0055, dataType: 0x39, attrData: 100}], cfg.default, null, expect.any(Function)
        );

        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({position: 10}));
        expect(zigbee.publish).toHaveBeenNthCalledWith(2,
            '0x00000001', 'device', 'genAnalogOutput', 'write',
            'foundation', [{attrId: 0x0055, dataType: 0x39, attrData: 10}], cfg.default, null, expect.any(Function)
        );

        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({state: 'CLOSE'}));
        expect(zigbee.publish).toHaveBeenNthCalledWith(3,
            '0x00000001', 'device', 'genAnalogOutput', 'write',
            'foundation', [{attrId: 0x0055, dataType: 0x39, attrData: 0}], cfg.default, null, expect.any(Function)
        );

        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({state: 'STOP'}));
        expect(zigbee.publish).toHaveBeenNthCalledWith(4,
            '0x00000001', 'device', 'closuresWindowCovering', 'stop',
            'functional', {}, cfg.default, null, expect.any(Function)
        );
    });

    it('Should turn device off when brightness 0 is send with light_brightness converter', async () => {
        zigbee.publish.mockClear();
        publishEntityState.mockClear();
        zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({state: 'ON', transition: 1}));
        expect(zigbee.publish).toHaveBeenCalledTimes(1);
        expect(zigbee.publish).toHaveBeenNthCalledWith(1,
            '0x00000001',
            'device',
            'genLevelCtrl',
            'moveToLevelWithOnOff',
            'functional',
            {level: 255, transtime: 10},
            cfg.default,
            null,
            expect.any(Function));
        expect(publishEntityState).toHaveBeenCalledTimes(1);
        expect(publishEntityState).toHaveBeenNthCalledWith(1,
            '0x00000001',
            {state: 'ON', brightness: 255});
    });

    it('Should turn device off when brightness 0 is send with light_brightness converter', async () => {
        zigbee.publish.mockClear();
        publishEntityState.mockClear();
        zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({state: 'OFF', transition: 2}));
        expect(zigbee.publish).toHaveBeenCalledTimes(1);
        expect(zigbee.publish).toHaveBeenNthCalledWith(1,
            '0x00000001',
            'device',
            'genLevelCtrl',
            'moveToLevelWithOnOff',
            'functional',
            {level: 0, transtime: 20},
            cfg.default,
            null,
            expect.any(Function));
        expect(publishEntityState).toHaveBeenCalledTimes(1);
        expect(publishEntityState).toHaveBeenNthCalledWith(1,
            '0x00000001',
            {state: 'OFF', brightness: 0});
    });

    it('Home Assistant: should set state', async () => {
        zigbee.publish.mockClear();
        publishEntityState.mockClear();
        jest.spyOn(settings, 'get').mockReturnValue({homeassistant: true, mqtt: {base_topic: 'zigbee2mqtt'}});
        zigbee.getDevice = () => ({modelId: 'RB 185 C'});
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({state: 'ON'}));
        expect(zigbee.publish).toHaveBeenCalledTimes(1);
        expect(zigbee.publish).toHaveBeenNthCalledWith(1,
            '0x00000001',
            'device',
            'genOnOff',
            'on',
            'functional',
            {},
            cfg.default,
            null,
            expect.any(Function));
        expect(publishEntityState).toHaveBeenCalledTimes(1);
        expect(publishEntityState).toHaveBeenNthCalledWith(1,
            '0x00000001',
            {state: 'ON'});
    });

    it('Home Assistant: should not set state when color temperature is also set', async () => {
        zigbee.publish.mockClear();
        publishEntityState.mockClear();
        jest.spyOn(state, 'get').mockReturnValue({state: 'ON'});
        jest.spyOn(settings, 'get').mockReturnValue({homeassistant: true, mqtt: {base_topic: 'zigbee2mqtt'}});
        zigbee.getDevice = () => ({modelId: 'RB 185 C'});
        devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({state: 'ON', color_temp: 100}));
        expect(zigbee.publish).toHaveBeenCalledTimes(1);
        expect(zigbee.publish).toHaveBeenNthCalledWith(1,
            '0x00000001',
            'device',
            'lightingColorCtrl',
            'moveToColorTemp',
            'functional',
            {colortemp: 100, transtime: 0},
            cfg.default,
            null,
            expect.any(Function));

        expect(publishEntityState).toHaveBeenCalledTimes(1);
        expect(publishEntityState).toHaveBeenNthCalledWith(1,
            '0x00000001',
            {color_temp: 100});
    });

    it('Home Assistant: should not set state when color is also set', async () => {
        zigbee.publish.mockClear();
        publishEntityState.mockClear();
        jest.spyOn(state, 'get').mockReturnValue({state: 'ON'});
        jest.spyOn(settings, 'get').mockReturnValue({homeassistant: true, mqtt: {base_topic: 'zigbee2mqtt'}});
        zigbee.getDevice = () => ({modelId: 'RB 185 C'});
        devicePublish.onMQTTMessage(
            'zigbee2mqtt/0x00000001/set',
            JSON.stringify({state: 'ON', color: {x: 0.41, y: 0.25}})
        );
        expect(zigbee.publish).toHaveBeenCalledTimes(1);
        expect(zigbee.publish).toHaveBeenNthCalledWith(1,
            '0x00000001',
            'device',
            'lightingColorCtrl',
            'moveToColor',
            'functional',
            {colorx: 26869, colory: 16384, transtime: 0},
            cfg.default,
            null,
            expect.any(Function));

        expect(publishEntityState).toHaveBeenCalledTimes(1);
        expect(publishEntityState).toHaveBeenNthCalledWith(1,
            '0x00000001',
            {color: {x: 0.41, y: 0.25}});
    });

    it('Home Assistant: should set state when color is also set and bulb is off', async () => {
        zigbee.publish.mockClear();
        publishEntityState.mockClear();
        jest.spyOn(state, 'get').mockReturnValue({state: 'OFF'});
        jest.spyOn(settings, 'get').mockReturnValue({homeassistant: true, mqtt: {base_topic: 'zigbee2mqtt'}});
        zigbee.getDevice = () => ({modelId: 'RB 185 C'});
        devicePublish.onMQTTMessage(
            'zigbee2mqtt/0x00000001/set',
            JSON.stringify({state: 'ON', color: {x: 0.41, y: 0.25}})
        );
        expect(zigbee.publish).toHaveBeenCalledTimes(2);
        expect(zigbee.publish).toHaveBeenNthCalledWith(1,
            '0x00000001',
            'device',
            'genOnOff',
            'on',
            'functional',
            {},
            cfg.default,
            null,
            expect.any(Function));
        expect(zigbee.publish).toHaveBeenNthCalledWith(2,
            '0x00000001',
            'device',
            'lightingColorCtrl',
            'moveToColor',
            'functional',
            {colorx: 26869, colory: 16384, transtime: 0},
            cfg.default,
            null,
            expect.any(Function));

        expect(publishEntityState).toHaveBeenCalledTimes(2);
        expect(publishEntityState).toHaveBeenNthCalledWith(1,
            '0x00000001',
            {state: 'ON'});
        expect(publishEntityState).toHaveBeenNthCalledWith(2,
            '0x00000001',
            {color: {x: 0.41, y: 0.25}});
    });
});
