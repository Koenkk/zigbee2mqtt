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
                color: {r: 100, g: 101, b: 102},
            };
            controller.publishEntityState('0x12345678', payload);
            expect(mqttPublish).toHaveBeenCalledTimes(7);
            expect(mqttPublish.mock.calls[0][0]).toBe('test/temperature');
            expect(mqttPublish.mock.calls[0][1]).toBe('1');
            expect(mqttPublish.mock.calls[1][0]).toBe('test/humidity');
            expect(mqttPublish.mock.calls[1][1]).toBe('2');
            expect(mqttPublish.mock.calls[2][0]).toBe('test/state');
            expect(mqttPublish.mock.calls[2][1]).toBe('ON');
            expect(mqttPublish.mock.calls[3][0]).toBe('test/allowedStates');
            expect(mqttPublish.mock.calls[3][1]).toBe('["ON","OFF"]');
            expect(mqttPublish.mock.calls[4][0]).toBe('test/color-r');
            expect(mqttPublish.mock.calls[4][1]).toBe('100');
            expect(mqttPublish.mock.calls[5][0]).toBe('test/color-g');
            expect(mqttPublish.mock.calls[5][1]).toBe('101');
            expect(mqttPublish.mock.calls[6][0]).toBe('test/color-b');
            expect(mqttPublish.mock.calls[6][1]).toBe('102');
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
    });
});
