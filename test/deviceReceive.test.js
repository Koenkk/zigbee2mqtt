const DeviceReceive = require('../lib/extension/deviceReceive');
const settings = require('../lib/util/settings');
const devices = require('zigbee-shepherd-converters').devices;
const utils = require('./utils');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Devices
const WXKG11LM = devices.find((d) => d.model === 'WXKG11LM');
const WXKG02LM = devices.find((d) => d.model === 'WXKG02LM');
const WSDCGQ11LM = devices.find((d) => d.model === 'WSDCGQ11LM');
const RTCGQ11LM = devices.find((d) => d.model === 'RTCGQ11LM');
const ZNCZ02LM = devices.find((d) => d.model === 'ZNCZ02LM');

const mqtt = {
    log: () => {},
};

describe('DeviceReceive', () => {
    let deviceReceive;
    let publishEntityState;

    beforeEach(() => {
        utils.stubLogger(jest);
        jest.spyOn(settings, 'addDevice').mockReturnValue(undefined);
        publishEntityState = jest.fn();
        deviceReceive = new DeviceReceive(null, mqtt, null, publishEntityState);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Handling zigbee messages', () => {
        it('Should handle a zigbee message', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG11LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState.mock.calls[0][1]).toStrictEqual({click: 'single'});
        });

        it('Should handle a zigbee message which uses ep (left)', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState.mock.calls[0][1]).toStrictEqual({click: 'left'});
        });

        it('Should handle a zigbee message which uses ep (right)', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 2);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState.mock.calls[0][1]).toStrictEqual({click: 'right'});
        });

        it('Should handle a zigbee message with default precision', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: -85}, 1
            );
            deviceReceive.onZigbeeMessage(message, device, WSDCGQ11LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState.mock.calls[0][1]).toStrictEqual({temperature: -0.85});
        });

        it('Should debounce messages', async () => {
            const device = {ieeeAddr: '0x12345678'};
            jest.spyOn(settings, 'getDevice').mockReturnValue({debounce: 0.1});
            const message1 = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: 8}, 1
            );
            const message2 = utils.zigbeeMessage(
                device, 'msRelativeHumidity', 'attReport', {measuredValue: 1}, 1
            );
            const message3 = utils.zigbeeMessage(
                device, 'msPressureMeasurement', 'attReport', {measuredValue: 2}, 1
            );
            deviceReceive.onZigbeeMessage(message1, device, WSDCGQ11LM);
            deviceReceive.onZigbeeMessage(message2, device, WSDCGQ11LM);
            deviceReceive.onZigbeeMessage(message3, device, WSDCGQ11LM);
            await wait(200);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState.mock.calls[0][1]).toStrictEqual({temperature: 0.08, humidity: 0.01, pressure: 2});

            deviceReceive.onZigbeeMessage(message1, device, WSDCGQ11LM);
            await wait(200);
            expect(publishEntityState).toHaveBeenCalledTimes(2);
            expect(publishEntityState.mock.calls[1][1]).toStrictEqual({temperature: 0.08});
        });

        it('Should handle a zigbee message with 1 precision', () => {
            const device = {ieeeAddr: '0x12345678'};
            jest.spyOn(settings, 'getDevice').mockReturnValue({temperature_precision: 1});
            const message = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: -85}, 1
            );
            deviceReceive.onZigbeeMessage(message, device, WSDCGQ11LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState.mock.calls[0][1]).toStrictEqual({temperature: -0.8});
        });

        it('Should handle a zigbee message with 0 precision', () => {
            const device = {ieeeAddr: '0x12345678'};
            jest.spyOn(settings, 'getDevice').mockReturnValue({temperature_precision: 0});
            const message = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: -85}, 1
            );
            deviceReceive.onZigbeeMessage(message, device, WSDCGQ11LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState.mock.calls[0][1]).toStrictEqual({temperature: -1});
        });

        it('Should handle a zigbee message with 1 precision when set via device_options', () => {
            const device = {ieeeAddr: '0x12345678'};
            jest.spyOn(settings, 'get').mockReturnValue({
                device_options: {
                    temperature_precision: 1,
                },
                advanced: {
                    last_seen: 'disable',
                },
            });
            jest.spyOn(settings, 'getDevice').mockReturnValue({});
            const message = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: -85}, 1
            );
            deviceReceive.onZigbeeMessage(message, device, WSDCGQ11LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState.mock.calls[0][1]).toStrictEqual({temperature: -0.8});
        }
        );

        it('Should handle a zigbee message with 2 precision when overrides device_options', () => {
            const device = {ieeeAddr: '0x12345678'};
            jest.spyOn(settings, 'get').mockReturnValue({
                device_options: {
                    temperature_precision: 1,
                },
                advanced: {
                    last_seen: 'disable',
                },
            });
            jest.spyOn(settings, 'getDevice').mockReturnValue({
                temperature_precision: 2,
            });
            const message = utils.zigbeeMessage(
                device, 'msTemperatureMeasurement', 'attReport', {measuredValue: -85}, 1
            );
            deviceReceive.onZigbeeMessage(message, device, WSDCGQ11LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState.mock.calls[0][1]).toStrictEqual({temperature: -0.85});
        }
        );

        it('Should handle a zigbee message with voltage 3010', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', {'65281': {'1': 3010}}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            const expected = {battery: 100, voltage: 3010};
            expect(publishEntityState.mock.calls[0][1]).toStrictEqual(expected);
        });

        it('Should handle a zigbee message with voltage 2850', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', {'65281': {'1': 2850}}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            const expected = {battery: 35, voltage: 2850};
            expect(publishEntityState.mock.calls[0][1]).toStrictEqual(expected);
        });

        it('Should handle a zigbee message with voltage 2650', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', {'65281': {'1': 2650}}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            const expected = {battery: 14, voltage: 2650};
            expect(publishEntityState.mock.calls[0][1]).toStrictEqual(expected);
        });

        it('Should handle a zigbee message with voltage 2000', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', {'65281': {'1': 2000}}, 1);
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            const expected = {battery: 0, voltage: 2000};
            expect(publishEntityState.mock.calls[0][1]).toStrictEqual(expected);
        });

        it('Should publish 1 message when converted twice', () => {
            const device = {ieeeAddr: '0x12345678'};
            const payload = {
                '65281': {'1': 3045, '3': 19, '4': 17320, '5': 35, '6': [0, 3], '10': 51107, '11': 381, '100': 0},
            };
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', payload, 1);
            deviceReceive.onZigbeeMessage(message, device, RTCGQ11LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            const expected = {'battery': 100, 'illuminance': 381, 'voltage': 3045};
            expect(publishEntityState.mock.calls[0][1]).toStrictEqual(expected);
        });

        it('Should publish no message when converted without result', () => {
            const device = {ieeeAddr: '0x12345678'};
            const payload = {'9999': {'1': 3045}};
            const message = utils.zigbeeMessage(device, 'genBasic', 'attReport', payload, 1);
            deviceReceive.onZigbeeMessage(message, device, RTCGQ11LM);
            expect(publishEntityState).toHaveBeenCalledTimes(0);
        });

        it('Should publish last_seen epoch', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 1);
            jest.spyOn(settings, 'get').mockReturnValue({
                advanced: {
                    last_seen: 'epoch',
                },
            });
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(typeof publishEntityState.mock.calls[0][1].last_seen).toBe('number');
        });

        it('Should publish last_seen ISO_8601', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 1);
            jest.spyOn(settings, 'get').mockReturnValue({
                advanced: {
                    last_seen: 'ISO_8601',
                },
            });
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(typeof publishEntityState.mock.calls[0][1].last_seen).toBe('string');
        });

        it('Should publish last_seen ISO_8601_local', () => {
            const device = {ieeeAddr: '0x12345678'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 1);
            jest.spyOn(settings, 'get').mockReturnValue({
                advanced: {
                    last_seen: 'ISO_8601_local',
                },
            });
            deviceReceive.onZigbeeMessage(message, device, WXKG02LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(typeof publishEntityState.mock.calls[0][1].last_seen).toBe('string');
        });

        it('Should not handle messages forwarded Xiaomi messages', () => {
            const device = {ieeeAddr: '0x12345678', manufId: 4151, type: 'Router'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1}, 1, 599);
            deviceReceive.onZigbeeMessage(message, device, ZNCZ02LM);
            expect(publishEntityState).toHaveBeenCalledTimes(0);
        });

        it('Should handle messages from Xiaomi router devices', () => {
            const device = {ieeeAddr: '0x12345678', manufId: 4151, type: 'Router'};
            const message = utils.zigbeeMessage(device, 'genOnOff', 'attReport', {onOff: 1});
            deviceReceive.onZigbeeMessage(message, device, ZNCZ02LM);
            expect(publishEntityState).toHaveBeenCalledTimes(1);
            expect(publishEntityState.mock.calls[0][1]).toStrictEqual({state: 'ON'});
        });
    });
});
