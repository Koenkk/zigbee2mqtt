const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);

const mocksClear = [MQTT.publish, logger.warn, logger.debug];

describe('Device receive', () => {
    let controller;

    beforeEach(async () => {
        jest.useRealTimers();
        data.writeDefaultConfiguration();
        settings._reRead();
        data.writeEmptyState();
        controller = new Controller();
        await controller.start();
        mocksClear.forEach((m) => m.mockClear());
    });

    it('Should handle a zigbee message', async () => {
        const device = zigbeeHerdsman.devices.WXKG11LM;
        const data = {onOff: 1}
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({click: 'single', linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });


    it('Should handle a zigbee message and counter it when Home Assistant integration is enabled', async () => {
        settings.set(['homeassistant'], true);
        const device = zigbeeHerdsman.devices.WXKG11LM;
        const data = {onOff: 1}
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({click: 'single', linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/button');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({click: '', linkquality: 10});
        expect(MQTT.publish.mock.calls[1][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should handle a zigbee message which uses ep (left)', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM;
        const data = {onOff: 1}
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button_double_key');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({click: 'left', linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should handle a zigbee message which uses ep (right)', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM;
        const data = {onOff: 1}
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(2), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button_double_key');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({click: 'right', linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should handle a zigbee message with default precision', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        const data = {measuredValue: -85}
        const payload = {data, cluster: 'msTemperatureMeasurement', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/weather_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: -0.85, linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 1, "retain": false});
    });

    it('Should debounce messages', async () => {
        jest.useFakeTimers();
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        settings.set(['devices', device.ieeeAddr, 'debounce'], 0.1);
        const data1 = {measuredValue: 8}
        const payload1 = {data: data1, cluster: 'msTemperatureMeasurement', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload1);
        const data2 = {measuredValue: 1}
        const payload2 = {data: data2, cluster: 'msRelativeHumidity', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload2);
        const data3 = {measuredValue: 2}
        const payload3 = {data: data3, cluster: 'msPressureMeasurement', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload3);
        await flushPromises();
        jest.advanceTimersByTime(50);
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
        jest.runAllTimers();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/weather_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: 0.08, humidity: 0.01, pressure: 2, linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 1, "retain": false});
    });

    it('Should debounce messages only with the same payload values for provided debounce_ignore keys', async () => {
        jest.useFakeTimers();
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        settings.set(['devices', device.ieeeAddr, 'debounce'], 0.1);
        settings.set(['devices', device.ieeeAddr, 'debounce_ignore'], ['temperature']);
        const tempMsg = {data: {measuredValue: 8}, cluster: 'msTemperatureMeasurement', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 13};
        await zigbeeHerdsman.events.message(tempMsg);
        const pressureMsg = {data: {measuredValue: 2}, cluster: 'msPressureMeasurement', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 13};
        await zigbeeHerdsman.events.message(pressureMsg);
        const tempMsg2 = {data: {measuredValue: 7}, cluster: 'msTemperatureMeasurement', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 13};
        await zigbeeHerdsman.events.message(tempMsg2);
        const humidityMsg = {data: {measuredValue: 3}, cluster: 'msRelativeHumidity', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 13};
        await zigbeeHerdsman.events.message(humidityMsg);
        await flushPromises();
        jest.advanceTimersByTime(50);
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: 0.08, pressure: 2, linkquality: 13});
        jest.runAllTimers();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({temperature: 0.07, pressure: 2, humidity: 0.03, linkquality: 13});
    });

    it('Should handle a zigbee message with 1 precision', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        settings.set(['devices', device.ieeeAddr, 'temperature_precision'], 1);
        const data = {measuredValue: -85}
        const payload = {data, cluster: 'msTemperatureMeasurement', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/weather_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: -0.8, linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 1, "retain": false});
    });

    it('Should handle a zigbee message with 0 precision', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        settings.set(['devices', device.ieeeAddr, 'temperature_precision'], 0);
        const data = {measuredValue: -85}
        const payload = {data, cluster: 'msTemperatureMeasurement', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/weather_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: -1, linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 1, "retain": false});
    });

    it('Should handle a zigbee message with 1 precision when set via device_options', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        settings.set(['device_options', 'temperature_precision'], 1);
        const data = {measuredValue: -85}
        const payload = {data, cluster: 'msTemperatureMeasurement', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/weather_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: -0.8, linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 1, "retain": false});
    });

    it('Should handle a zigbee message with 2 precision when overrides device_options', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        settings.set(['device_options', 'temperature_precision'], 1);
        settings.set(['devices', device.ieeeAddr, 'temperature_precision'], 0);
        const data = {measuredValue: -85}
        const payload = {data, cluster: 'msTemperatureMeasurement', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/weather_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: -1, linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 1, "retain": false});
    });

    it('Should handle a zigbee message with voltage 3010', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM;
        const data = {'65281': {'1': 3010}}
        const payload = {data, cluster: 'genBasic', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button_double_key');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({battery: 100, voltage: 3010, linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should handle a zigbee message with voltage 2850', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM;
        const data = {'65281': {'1': 2850}}
        const payload = {data, cluster: 'genBasic', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button_double_key');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({battery: 35, voltage: 2850, linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should handle a zigbee message with voltage 2650', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM;
        const data = {'65281': {'1': 2650}}
        const payload = {data, cluster: 'genBasic', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button_double_key');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({battery: 14, voltage: 2650, linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should handle a zigbee message with voltage 2000', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM;
        const data = {'65281': {'1': 2000}}
        const payload = {data, cluster: 'genBasic', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button_double_key');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({battery: 0, voltage: 2000, linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish 1 message when converted twice', async () => {
        const device = zigbeeHerdsman.devices.RTCGQ11LM;
        const data = {'65281': {'1': 3045, '3': 19, '4': 17320, '5': 35, '6': [0, 3], '10': 51107, '11': 381, '100': 0}}
        const payload = {data, cluster: 'genBasic', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/occupancy_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({'battery': 100, 'illuminance': 381, 'voltage': 3045, linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish 1 message when converted twice', async () => {
        const device = zigbeeHerdsman.devices.RTCGQ11LM;
        const data = {'9999': {'1': 3045}};
        const payload = {data, cluster: 'genBasic', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Should publish last_seen epoch', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM;
        settings.set(['advanced', 'last_seen'], 'epoch');
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button_double_key');
        expect(typeof JSON.parse(MQTT.publish.mock.calls[0][1]).last_seen).toBe('number')
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish last_seen ISO_8601', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM;
        settings.set(['advanced', 'last_seen'], 'ISO_8601');
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button_double_key');
        expect(typeof JSON.parse(MQTT.publish.mock.calls[0][1]).last_seen).toBe('string')
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish last_seen ISO_8601_local', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM;
        settings.set(['advanced', 'last_seen'], 'ISO_8601_local');
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button_double_key');
        expect(typeof JSON.parse(MQTT.publish.mock.calls[0][1]).last_seen).toBe('string')
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should not handle messages forwarded Xiaomi messages', async () => {
        const device = zigbeeHerdsman.devices.ZNCZ02LM;
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10, groupID: 599};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Should handle messages from Xiaomi router devices', async () => {
        const device = zigbeeHerdsman.devices.ZNCZ02LM;
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 20};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/power_plug');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({'state': 'ON', linkquality: 20});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should not handle messages from coordinator', async () => {
        const device = zigbeeHerdsman.devices.coordinator;
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Should not handle messages from unsupported devices', async () => {
        const device = zigbeeHerdsman.devices.unsupported;
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Should not handle messages from still interviewing devices with unknown modelID', async () => {
        const device = zigbeeHerdsman.devices.interviewing;
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
        expect(logger.debug).toHaveBeenCalledWith(`Skipping message, modelID is undefined and still interviewing`);
    });

    it('Should handle a command', async () => {
        const device = zigbeeHerdsman.devices.E1743;
        const data = {};
        const payload = {data, cluster: 'genLevelCtrl', device, endpoint: device.getEndpoint(1), type: 'commandStopWithOnOff', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/ikea_onoff');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({'click': 'brightness_stop', linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should add elapsed', async () => {
        settings.set(['advanced', 'elapsed'], true);
        const device = zigbeeHerdsman.devices.E1743;
        const payload = {data: {}, cluster: 'genLevelCtrl', device, endpoint: device.getEndpoint(1), type: 'commandStopWithOnOff'};
        const oldNow = Date.now;
        Date.now = jest.fn()
        Date.now.mockReturnValue(new Date(150));
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        Date.now.mockReturnValue(new Date(200));
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/ikea_onoff');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({'click': 'brightness_stop'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/ikea_onoff');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toMatchObject({'click': 'brightness_stop'});
        expect(JSON.parse(MQTT.publish.mock.calls[1][1]).elapsed).toBe(50);
        expect(MQTT.publish.mock.calls[1][2]).toStrictEqual({"qos": 0, "retain": false});
        Date.now = oldNow;
    });

    it('Should log when message is from supported device but has no converters', async () => {
        const device = zigbeeHerdsman.devices.ZNCZ02LM;
        const data = {inactiveText: 'hello'};
        const payload = {data, cluster: 'genBinaryOutput', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 20};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
        expect(logger.debug).toHaveBeenCalledWith('No converter available for \'ZNCZ02LM\' with cluster \'genBinaryOutput\' and type \'attributeReport\' and data \'{"inactiveText":"hello"}\'');
    });

    it('Should allow to calibrate temperature values', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        settings.set(['devices', device.ieeeAddr, 'temperature_calibration'], 2);
        const data = {measuredValue: -85}
        const payload = {data, cluster: 'msTemperatureMeasurement', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/weather_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: 1.15, linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 1, "retain": false});
    });
});
