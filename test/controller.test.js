const Controller = require('../lib/controller');
const settings = require('../lib/util/settings');
const mqtt = require('../lib/mqtt');
const utils = require('./utils');

describe('Controller', () => {
    let controller;
    let mqttPublish;

    beforeEach(() => {
        utils.stubLogger(jest);
        jest.spyOn(settings, 'getDevice').mockReturnValue({friendly_name: 'test'});
        mqttPublish = jest.spyOn(mqtt.prototype, 'publish').mockReturnValue(undefined);
        controller = new Controller();
        controller.zigbee = {
            getDevice: () => {
                return {
                    modelId: 'TRADFRI bulb E27 CWS opal 600lm',
                    manufName: 'IKEA',
                    hwVersion: '1.1',
                    swBuildId: '2.0',
                    dateCode: '2018-01-01',
                };
            },
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Handling zigbee messages', () => {
        it('Should handle a zigbee message', () => {
            const device = {ieeeAddr: '0x12345678', modelId: 'TRADFRI bulb E27 CWS opal 600lm'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'devChange', {onOff: 1}, 1);
            controller.onZigbeeMessage(message);
            expect(mqttPublish).toHaveBeenCalledTimes(1);
            expect(mqttPublish.mock.calls[0][1]).toBe(JSON.stringify({state: 'ON'}));
        });

        it('Should handle a zigbee message when include_device_information is set', () => {
            jest.spyOn(settings, 'get').mockReturnValue({
                mqtt: {
                    include_device_information: true,
                },
                advanced: {
                    cache_state: false,
                    last_seen: 'disable',
                },
                experimental: {
                    output: 'json',
                },
            });

            const payload = {
                'state': 'ON',
                'device': {
                    'ieeeAddr': '0x12345678',
                    'friendlyName': 'test',
                    'manufName': 'IKEA',
                    'modelId': 'TRADFRI bulb E27 CWS opal 600lm',
                    'hwVersion': '1.1',
                    'swBuildId': '2.0',
                    'dateCode': '2018-01-01',
                },
            };

            const device = {ieeeAddr: '0x12345678', modelId: 'TRADFRI bulb E27 CWS opal 600lm'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'devChange', {onOff: 1}, 1);
            controller.onZigbeeMessage(message);
            expect(mqttPublish).toHaveBeenCalledTimes(1);
            expect(JSON.parse(mqttPublish.mock.calls[0][1])).toStrictEqual(payload);
        });

        it('Should output to json by default', () => {
            const payload = {temperature: 1, humidity: 2};
            controller.publishEntityState('0x12345678', payload);
            expect(mqttPublish).toHaveBeenCalledTimes(1);
            expect(JSON.parse(mqttPublish.mock.calls[0][1])).toStrictEqual(payload);
        });

        it('Should output to attribute', () => {
            jest.spyOn(settings, 'get').mockReturnValue({
                mqtt: {
                    include_device_information: false,
                },
                advanced: {
                    cache_state: false,
                },
                experimental: {
                    output: 'attribute',
                },
            });

            const payload = {
                temperature: 1,
                humidity: 2,
                state: 'ON',
                allowedStates: ['ON', 'OFF'],
                color: {r: 100, g: 0, b: 102, a: 0},
                nested: {
                    state: 'OFF',
                    color: {r: 1, g: 0, b: 2},
                },
            };
            controller.publishEntityState('0x12345678', payload);
            expect(mqttPublish.mock.calls.map((x) => [x[0], x[1]])).toEqual([
                ['test/temperature', '1'],
                ['test/humidity', '2'],
                ['test/state', 'ON'],
                ['test/allowedStates', 'ON,OFF'],
                ['test/color', '100,0,102'],
                ['test/nested-state', 'OFF'],
                ['test/nested-color', '1,0,2'],
            ]);
        });

        it('Should cache state', () => {
            jest.spyOn(settings, 'get').mockReturnValue({
                mqtt: {
                    include_device_information: false,
                },
                advanced: {
                    cache_state: true,
                },
                experimental: {
                    output: 'json',
                },
            });

            controller.publishEntityState('0x12345678', {temperature: 1});
            controller.publishEntityState('0x12345678', {humidity: 2});
            controller.publishEntityState('0x12345678', {humidity: 5, temperature: 4});
            controller.publishEntityState('0x12345678', {temperature: 9});
            controller.publishEntityState('0x12345678', {temperature: 3});
            expect(mqttPublish).toHaveBeenCalledTimes(5);
            expect(JSON.parse(mqttPublish.mock.calls[0][1])).toStrictEqual({temperature: 1});
            expect(JSON.parse(mqttPublish.mock.calls[1][1])).toStrictEqual({temperature: 1, humidity: 2});
            expect(JSON.parse(mqttPublish.mock.calls[2][1])).toStrictEqual({temperature: 4, humidity: 5});
            expect(JSON.parse(mqttPublish.mock.calls[3][1])).toStrictEqual({temperature: 9, humidity: 5});
            expect(JSON.parse(mqttPublish.mock.calls[4][1])).toStrictEqual({temperature: 3, humidity: 5});
        });

        it('Shouldnt cache state', () => {
            jest.spyOn(settings, 'get').mockReturnValue({
                mqtt: {
                    include_device_information: false,
                },
                advanced: {
                    cache_state: false,
                },
                experimental: {
                    output: 'json',
                },
            });

            controller.publishEntityState('0x12345678', {temperature: 1});
            controller.publishEntityState('0x12345678', {humidity: 2});
            controller.publishEntityState('0x12345678', {temperature: 3});
            expect(mqttPublish).toHaveBeenCalledTimes(3);
            expect(JSON.parse(mqttPublish.mock.calls[0][1])).toStrictEqual({temperature: 1});
            expect(JSON.parse(mqttPublish.mock.calls[1][1])).toStrictEqual({humidity: 2});
            expect(JSON.parse(mqttPublish.mock.calls[2][1])).toStrictEqual({temperature: 3});
        });

        it('Should not send empty messages', () => {
            jest.spyOn(settings, 'get').mockReturnValue({
                mqtt: {
                    include_device_information: false,
                },
                advanced: {
                    cache_state: true,
                },
                experimental: {
                    output: 'json',
                },
            });

            controller.publishEntityState('0x12345678', {});
            expect(mqttPublish).toHaveBeenCalledTimes(0);
        });
    });
});
