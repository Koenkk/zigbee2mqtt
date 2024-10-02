const data = require('./stub/data');
const sleep = require('./stub/sleep');
const logger = require('./stub/logger');
const stringify = require('json-stable-stringify-without-jsonify');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = require('./lib/flushPromises');

const mocksClear = [MQTT.publish, logger.warning, logger.debug];

describe('Receive', () => {
    let controller;

    beforeAll(async () => {
        jest.useFakeTimers();
        controller = new Controller(jest.fn(), jest.fn());
        sleep.mock();
        await controller.start();
        await jest.runOnlyPendingTimers();
        await flushPromises();
    });

    beforeEach(async () => {
        controller.state.state = {};
        data.writeDefaultConfiguration();
        settings.reRead();
        mocksClear.forEach((m) => m.mockClear());
        delete zigbeeHerdsman.devices.WXKG11LM.linkquality;
    });

    afterAll(async () => {
        jest.useRealTimers();
        sleep.restore();
    });

    it('Should handle a zigbee message', async () => {
        const device = zigbeeHerdsman.devices.WXKG11LM;
        device.linkquality = 10;
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/button',
            stringify({action: 'single', click: 'single', linkquality: 10}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should handle a zigbee message which uses ep (left)', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM_rev1;
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button_double_key');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({click: 'left', action: 'single_left'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it('Should handle a zigbee message which uses ep (right)', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM_rev1;
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(2), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button_double_key');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({click: 'right', action: 'single_right'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it('Should handle a zigbee message with default precision', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        const data = {measuredValue: -85};
        const payload = {
            data,
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/weather_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: -0.85});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 1, retain: false});
    });

    it('Should allow to invert cover', async () => {
        const device = zigbeeHerdsman.devices.J1;

        // Non-inverted (open = 100, close = 0)
        await zigbeeHerdsman.events.message({
            data: {currentPositionLiftPercentage: 90, currentPositionTiltPercentage: 80},
            cluster: 'closuresWindowCovering',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        });
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/J1_cover',
            stringify({position: 10, tilt: 20, state: 'OPEN'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        // Inverted
        MQTT.publish.mockClear();
        settings.set(['devices', device.ieeeAddr, 'invert_cover'], true);
        await zigbeeHerdsman.events.message({
            data: {currentPositionLiftPercentage: 90, currentPositionTiltPercentage: 80},
            cluster: 'closuresWindowCovering',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        });
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/J1_cover',
            stringify({position: 90, tilt: 80, state: 'OPEN'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should allow to disable the legacy integration', async () => {
        const device = zigbeeHerdsman.devices.WXKG11LM;
        settings.set(['devices', device.ieeeAddr, 'legacy'], false);
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/button', stringify({action: 'single'}), {retain: false, qos: 0}, expect.any(Function));
    });

    it('Should debounce messages', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        settings.set(['devices', device.ieeeAddr, 'debounce'], 0.1);
        const data1 = {measuredValue: 8};
        const payload1 = {
            data: data1,
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        await zigbeeHerdsman.events.message(payload1);
        const data2 = {measuredValue: 1};
        const payload2 = {
            data: data2,
            cluster: 'msRelativeHumidity',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        await zigbeeHerdsman.events.message(payload2);
        const data3 = {measuredValue: 2};
        const payload3 = {
            data: data3,
            cluster: 'msPressureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        await zigbeeHerdsman.events.message(payload3);
        await flushPromises();
        jest.advanceTimersByTime(50);
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
        jest.runOnlyPendingTimers();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/weather_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: 0.08, humidity: 0.01, pressure: 2});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 1, retain: false});
    });

    it('Should debounce and retain messages when set via device_options', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        settings.set(['device_options', 'debounce'], 0.1);
        settings.set(['device_options', 'retain'], true);
        delete settings.get().devices['0x0017880104e45522']['retain'];
        const data1 = {measuredValue: 8};
        const payload1 = {
            data: data1,
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        await zigbeeHerdsman.events.message(payload1);
        const data2 = {measuredValue: 1};
        const payload2 = {
            data: data2,
            cluster: 'msRelativeHumidity',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        await zigbeeHerdsman.events.message(payload2);
        const data3 = {measuredValue: 2};
        const payload3 = {
            data: data3,
            cluster: 'msPressureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        await zigbeeHerdsman.events.message(payload3);
        await flushPromises();
        jest.advanceTimersByTime(50);
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
        jest.runOnlyPendingTimers();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/weather_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: 0.08, humidity: 0.01, pressure: 2});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 1, retain: true});
    });

    it('Should debounce messages only with the same payload values for provided debounce_ignore keys', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        settings.set(['devices', device.ieeeAddr, 'debounce'], 0.1);
        settings.set(['devices', device.ieeeAddr, 'debounce_ignore'], ['temperature']);
        const tempMsg = {
            data: {measuredValue: 8},
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 13,
        };
        await zigbeeHerdsman.events.message(tempMsg);
        const pressureMsg = {
            data: {measuredValue: 2},
            cluster: 'msPressureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 13,
        };
        await zigbeeHerdsman.events.message(pressureMsg);
        const tempMsg2 = {
            data: {measuredValue: 7},
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 13,
        };
        await zigbeeHerdsman.events.message(tempMsg2);
        const humidityMsg = {
            data: {measuredValue: 3},
            cluster: 'msRelativeHumidity',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 13,
        };
        await zigbeeHerdsman.events.message(humidityMsg);
        await flushPromises();
        jest.advanceTimersByTime(50);
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: 0.08, pressure: 2});
        jest.runOnlyPendingTimers();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({temperature: 0.07, pressure: 2, humidity: 0.03});
    });

    it('Should NOT publish old messages from State cache during debouncing', async () => {
        // Summary:
        // First send multiple measurements to device that is debouncing. Make sure only one message is sent out to MQTT. This also ensures first message is cached to "State".
        // Then send another measurement to that same device and trigger asynchronous event to push data from Cache. Newest value should be sent out.

        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        settings.set(['devices', device.ieeeAddr, 'debounce'], 0.1);
        await zigbeeHerdsman.events.message({
            data: {measuredValue: 8},
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        });
        await zigbeeHerdsman.events.message({
            data: {measuredValue: 1},
            cluster: 'msRelativeHumidity',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        });
        await zigbeeHerdsman.events.message({
            data: {measuredValue: 2},
            cluster: 'msPressureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        });
        await flushPromises();
        jest.advanceTimersByTime(50);
        // Test that measurements are combined(=debounced)
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
        jest.runOnlyPendingTimers();
        await flushPromises();

        // Test that only one MQTT is sent out and test its values.
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/weather_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: 0.08, humidity: 0.01, pressure: 2});

        // Send another Zigbee message...
        await zigbeeHerdsman.events.message({
            data: {measuredValue: 9},
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        });
        const realDevice = controller.zigbee.resolveEntity(device);

        // Trigger asynchronous event while device is "debouncing" to trigger Message to be sent out from State cache.
        await controller.publishEntityState(realDevice, {});
        jest.runOnlyPendingTimers();
        await flushPromises();

        // Total of 3 messages should have triggered.
        expect(MQTT.publish).toHaveBeenCalledTimes(3);

        // Test that message pushed by asynchronous message contains NEW measurement and not old.
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({temperature: 0.09, humidity: 0.01, pressure: 2});
        // Test that messages after debouncing contains NEW measurement and not old.
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({temperature: 0.09, humidity: 0.01, pressure: 2});
    });

    it('Should throttle multiple messages from spamming devices', async () => {
        const device = zigbeeHerdsman.devices.SPAMMER;
        const throttle_for_testing = 1;
        settings.set(['device_options', 'throttle'], throttle_for_testing);
        settings.set(['device_options', 'retain'], true);
        settings.set(['devices', device.ieeeAddr, 'friendly_name'], 'spammer1');
        const data1 = {measuredValue: 1};
        const payload1 = {
            data: data1,
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        await zigbeeHerdsman.events.message(payload1);
        const data2 = {measuredValue: 2};
        const payload2 = {
            data: data2,
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        await zigbeeHerdsman.events.message(payload2);
        const data3 = {measuredValue: 3};
        const payload3 = {
            data: data3,
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        await zigbeeHerdsman.events.message(payload3);
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/spammer1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: 0.01});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 0, retain: true});

        // Now we try after elapsed time to see if it publishes next message
        const timeshift = throttle_for_testing * 2000;
        jest.advanceTimersByTime(timeshift);
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        await flushPromises();

        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/spammer1');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({temperature: 0.03});
        expect(MQTT.publish.mock.calls[1][2]).toStrictEqual({qos: 0, retain: true});

        const data4 = {measuredValue: 4};
        const payload4 = {
            data: data4,
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        await zigbeeHerdsman.events.message(payload4);
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledTimes(3);
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/spammer1');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({temperature: 0.04});
        expect(MQTT.publish.mock.calls[2][2]).toStrictEqual({qos: 0, retain: true});
    });

    it('Shouldnt republish old state', async () => {
        // https://github.com/Koenkk/zigbee2mqtt/issues/3572
        const device = zigbeeHerdsman.devices.bulb;
        settings.set(['devices', device.ieeeAddr, 'debounce'], 0.1);
        await zigbeeHerdsman.events.message({
            data: {onOff: 0},
            cluster: 'genOnOff',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        });
        await MQTT.events.message('zigbee2mqtt/bulb/set', stringify({state: 'ON'}));
        await flushPromises();
        jest.runOnlyPendingTimers();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON'});
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({state: 'ON'});
    });

    it('Should handle a zigbee message with 1 precision', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        settings.set(['devices', device.ieeeAddr, 'temperature_precision'], 1);
        const data = {measuredValue: -85};
        const payload = {
            data,
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/weather_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: -0.8});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 1, retain: false});
    });

    it('Should handle a zigbee message with 0 precision', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        settings.set(['devices', device.ieeeAddr, 'temperature_precision'], 0);
        const data = {measuredValue: -85};
        const payload = {
            data,
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/weather_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: -1});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 1, retain: false});
    });

    it('Should handle a zigbee message with 1 precision when set via device_options', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        settings.set(['device_options', 'temperature_precision'], 1);
        const data = {measuredValue: -85};
        const payload = {
            data,
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/weather_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: -0.8});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 1, retain: false});
    });

    it('Should handle a zigbee message with 2 precision when overrides device_options', async () => {
        const device = zigbeeHerdsman.devices.WSDCGQ11LM;
        settings.set(['device_options', 'temperature_precision'], 1);
        settings.set(['devices', device.ieeeAddr, 'temperature_precision'], 0);
        const data = {measuredValue: -85};
        const payload = {
            data,
            cluster: 'msTemperatureMeasurement',
            device,
            endpoint: device.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        };
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/weather_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({temperature: -1});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 1, retain: false});
    });

    it('Should handle a zigbee message with voltage 2990', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM_rev1;
        const data = {65281: {1: 2990}};
        const payload = {data, cluster: 'genBasic', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button_double_key');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({battery: 93, voltage: 2990});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it('Should publish 1 message when converted twice', async () => {
        const device = zigbeeHerdsman.devices.RTCGQ11LM;
        const data = {65281: {1: 3045, 3: 19, 5: 35, 6: [0, 3], 11: 381, 100: 0}};
        const payload = {data, cluster: 'genBasic', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/occupancy_sensor');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({
            battery: 100,
            illuminance: 381,
            illuminance_lux: 381,
            voltage: 3045,
            device_temperature: 19,
            power_outage_count: 34,
        });
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it('Should publish 1 message when converted twice', async () => {
        const device = zigbeeHerdsman.devices.RTCGQ11LM;
        const data = {9999: {1: 3045}};
        const payload = {data, cluster: 'genBasic', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Should publish last_seen epoch', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM_rev1;
        settings.set(['advanced', 'last_seen'], 'epoch');
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button_double_key');
        expect(typeof JSON.parse(MQTT.publish.mock.calls[0][1]).last_seen).toBe('number');
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it('Should publish last_seen ISO_8601', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM_rev1;
        settings.set(['advanced', 'last_seen'], 'ISO_8601');
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button_double_key');
        expect(typeof JSON.parse(MQTT.publish.mock.calls[0][1]).last_seen).toBe('string');
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it('Should publish last_seen ISO_8601_local', async () => {
        const device = zigbeeHerdsman.devices.WXKG02LM_rev1;
        settings.set(['advanced', 'last_seen'], 'ISO_8601_local');
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button_double_key');
        expect(typeof JSON.parse(MQTT.publish.mock.calls[0][1]).last_seen).toBe('string');
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it('Should handle messages from Xiaomi router devices', async () => {
        const device = zigbeeHerdsman.devices.ZNCZ02LM;
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 20};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/power_plug', stringify({state: 'ON'}), {retain: false, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/switch_group',
            stringify({state: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should not handle messages from coordinator', async () => {
        const device = zigbeeHerdsman.devices.coordinator;
        const data = {onOff: 1};
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Should not handle messages from still interviewing devices with unknown definition', async () => {
        const device = zigbeeHerdsman.devices.interviewing;
        const data = {onOff: 1};
        logger.debug.mockClear();
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
        expect(logger.debug).toHaveBeenCalledWith(`Skipping message, still interviewing`);
    });

    it('Should handle a command', async () => {
        const device = zigbeeHerdsman.devices.E1743;
        const data = {};
        const payload = {
            data,
            cluster: 'genLevelCtrl',
            device,
            endpoint: device.getEndpoint(1),
            type: 'commandStopWithOnOff',
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 1},
        };
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/ikea_onoff');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({click: 'brightness_stop', action: 'brightness_stop'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
    });

    it('Should add elapsed', async () => {
        settings.set(['advanced', 'elapsed'], true);
        const device = zigbeeHerdsman.devices.E1743;
        const payload = {data: {}, cluster: 'genLevelCtrl', device, endpoint: device.getEndpoint(1), type: 'commandStopWithOnOff'};
        const oldNow = Date.now;
        Date.now = jest.fn();
        Date.now.mockReturnValue(new Date(150));
        await zigbeeHerdsman.events.message({...payload, meta: {zclTransactionSequenceNumber: 2}});
        await flushPromises();
        Date.now.mockReturnValue(new Date(200));
        await zigbeeHerdsman.events.message({...payload, meta: {zclTransactionSequenceNumber: 3}});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/ikea_onoff');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({click: 'brightness_stop', action: 'brightness_stop'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({qos: 0, retain: false});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/ikea_onoff');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toMatchObject({click: 'brightness_stop', action: 'brightness_stop'});
        expect(JSON.parse(MQTT.publish.mock.calls[1][1]).elapsed).toBe(50);
        expect(MQTT.publish.mock.calls[1][2]).toStrictEqual({qos: 0, retain: false});
        Date.now = oldNow;
    });

    it('Should log when message is from supported device but has no converters', async () => {
        const device = zigbeeHerdsman.devices.ZNCZ02LM;
        const data = {inactiveText: 'hello'};
        const payload = {data, cluster: 'genBinaryOutput', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 20};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
        expect(logger.debug).toHaveBeenCalledWith(
            "No converter available for 'ZNCZ02LM' with cluster 'genBinaryOutput' and type 'attributeReport' and data '{\"inactiveText\":\"hello\"}'",
        );
    });

    it('Should report correct energy and power values for different versions of SP600', async () => {
        // https://github.com/Koenkk/zigbee-herdsman-converters/issues/915, OLD and NEW use different date code
        // divisor of OLD is not correct and therefore underreports by factor 10.
        const data = {instantaneousDemand: 496, currentSummDelivered: 6648};

        const SP600_NEW = zigbeeHerdsman.devices.SP600_NEW;
        await zigbeeHerdsman.events.message({
            data,
            cluster: 'seMetering',
            device: SP600_NEW,
            endpoint: SP600_NEW.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 1},
        });
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/SP600_NEW');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({energy: 0.66, power: 49.6});

        MQTT.publish.mockClear();
        const SP600_OLD = zigbeeHerdsman.devices.SP600_OLD;
        await zigbeeHerdsman.events.message({
            data,
            cluster: 'seMetering',
            device: SP600_OLD,
            endpoint: SP600_OLD.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
            meta: {zclTransactionSequenceNumber: 2},
        });
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/SP600_OLD');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({energy: 6.65, power: 496});
    });

    it('Should emit DevicesChanged event when a converter announces changed exposes', async () => {
        const device = zigbeeHerdsman.devices['BMCT-SLZ'];
        const data = {deviceMode: 0};
        const payload = {data, cluster: 'boschSpecific', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/devices');
    });
});
