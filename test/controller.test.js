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

            const device = {ieeeAddr: '0x12345678', modelId: 'TRADFRI bulb E27 CWS opal 600lm'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'devChange', {onOff: 1}, 1);
            controller.onZigbeeMessage(message);
            expect(mqttPublish).toHaveBeenCalledTimes(1);
            expect(mqttPublish.mock.calls[0][1]).toBe(
                `{"state":"ON","device":{"ieeeAddr":"0x12345678","friendlyName":"test",` +
                `"manufName":"IKEA","modelId":"TRADFRI bulb E27 CWS opal 600lm"}}`
            );
        }
        );

        it('Should output to json by default', () => {
            const payload = {temperature: 1, humidity: 2};
            controller.publishEntityState('0x12345678', payload);
            expect(mqttPublish).toHaveBeenCalledTimes(1);
            expect(JSON.parse(mqttPublish.mock.calls[0][1])).toEqual(payload);
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

            const payload = {temperature: 1, humidity: 2};
            controller.publishEntityState('0x12345678', payload);
            expect(mqttPublish).toHaveBeenCalledTimes(2);
            expect(mqttPublish.mock.calls[0][0]).toEqual('test/temperature');
            expect(mqttPublish.mock.calls[0][1]).toEqual('1');
            expect(mqttPublish.mock.calls[1][0]).toEqual('test/humidity');
            expect(mqttPublish.mock.calls[1][1]).toEqual('2');
        });
    });
});
