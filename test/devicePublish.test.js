const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);

const mocksClear = [MQTT.publish, logger.warn, logger.debug];

describe('Device publish', () => {
    let controller;

    beforeEach(async () => {
        jest.useRealTimers();
        data.writeDefaultConfiguration();
        settings._reRead();
        data.writeEmptyState();
        controller = new Controller(false);
        await controller.start();
        mocksClear.forEach((m) => m.mockClear());
        Object.values(zigbeeHerdsman.devices).forEach((d) => {
            d.endpoints.forEach((e) => e.command.mockClear())
        })
        Object.values(zigbeeHerdsman.groups).forEach((g) => {
            g.command.mockClear();
        })
    });

    it('Should publish messages to zigbee devices', async () => {
        const endpoint = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({brightness: '200'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {"level": 200, "transtime": 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({brightness: 200, state: 'ON'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with complicated topic', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        settings.set(['devices', device.ieeeAddr, 'friendly_name'], 'wohnzimmer.light.wall.right')
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/wohnzimmer.light.wall.right/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/wohnzimmer.light.wall.right');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices when brightness is in %', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({brightness_percent: '92'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 235, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON', brightness: 235});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices when brightness is in number', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({brightness: 230}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 230, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON', brightness: 230});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with color_temp', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color_temp: '222'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColorTemp", {colortemp: 222, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color_temp: 222});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with color_temp in %', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color_temp_percent: '100'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColorTemp", {colortemp: 500, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color_temp: 500});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with non-default ep', async () => {
        const device = zigbeeHerdsman.devices.QBKG04LM;
        const endpoint = device.getEndpoint(2);
        await MQTT.events.message('zigbee2mqtt/wall_switch/set', JSON.stringify({state: 'OFF'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "off", {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/wall_switch');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'OFF'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with non-default ep and postfix', async () => {
        const device = zigbeeHerdsman.devices.QBKG03LM;
        const endpoint = device.getEndpoint(3);
        await MQTT.events.message('zigbee2mqtt/wall_switch_double/right/set', JSON.stringify({state: 'OFF'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "off", {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/wall_switch_double');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state_right: 'OFF'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee gledopto with [11,13]', async () => {
        const device = zigbeeHerdsman.devices.GLEDOPTO1112;
        const endpoint = device.getEndpoint(11);
        await MQTT.events.message('zigbee2mqtt/led_controller_1/set', JSON.stringify({state: 'OFF'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "off", {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/led_controller_1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'OFF'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee gledopto with [11,12,13]', async () => {
        const device = zigbeeHerdsman.devices.GLEDOPTO111213;
        const endpoint = device.getEndpoint(12);
        await MQTT.events.message('zigbee2mqtt/led_controller_2/set', JSON.stringify({state: 'OFF'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "off", {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/led_controller_2');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'OFF'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with color xy', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color: {x: 100, y: 50}}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 6553500, colory: 3276750, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color: {x: 100, y: 50}});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with color xy and sate', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color: {x: 100, y: 50}, state: 'ON'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {});
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 6553500, colory: 3276750, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({color: {x: 100, y: 50}, state: 'ON'});
        expect(MQTT.publish.mock.calls[1][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with color xy and brightness', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color: {x: 100, y: 50}, brightness: 20}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 0});
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 6553500, colory: 3276750, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON', brightness: 20});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({color: {x: 100, y: 50}, state: 'ON', brightness: 20});
        expect(MQTT.publish.mock.calls[1][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with color xy, brightness and state on', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color: {x: 100, y: 50}, brightness: 20, state: 'ON'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 0});
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 6553500, colory: 3276750, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON', brightness: 20});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({color: {x: 100, y: 50}, state: 'ON', brightness: 20});
        expect(MQTT.publish.mock.calls[1][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with color xy, brightness and state off', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color: {x: 100, y: 50}, brightness: 20, state: 'OFF'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "off", {});
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 6553500, colory: 3276750, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'OFF'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({color: {x: 100, y: 50}, state: 'OFF'});
        expect(MQTT.publish.mock.calls[1][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with color rgb', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color: {r: 100, g: 200, b: 10}}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 17806, colory: 43155, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color: {x: 0.2717, y: 0.6585}});
    });

    it('Should publish messages to zigbee devices with color rgb', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color: {rgb: '100,200,10'}}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 17806, colory: 43155, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color: {x: 0.2717, y: 0.6585}});
    });

    it('Should publish messages to zigbee devices with color rgb', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({state: 'ON', brightness: '50'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 50, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON', brightness: 50});
    });

    it('Should publish messages groups', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genOnOff", "on", {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/group_1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON'});
    });

    it('Should publish messages to groups with brightness_percent', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({brightness_percent: 50}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 127, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/group_1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON', brightness: 127});
    });

    it('Should publish messages to groups with on and brightness', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({state: 'ON', brightness: 50}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 50, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/group_1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON', brightness: 50});
    });

    it('Should publish messages to groups with off and brightness', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({state: 'OFF', brightness: 50}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genOnOff", "off", {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/group_1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'OFF'});
    });

    it('Should publish messages to groups color', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({color: {x: 0.37, y: 0.28}}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 24248, colory: 18350, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/group_1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color: {x: 0.37, y: 0.28}});
    });

    it('Should publish messages to groups color temperature', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({color_temp: 100}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColorTemp", {colortemp: 100, transtime: 0});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/group_1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color_temp: 100});
    });


    // describe('Parse topic', () => {
    //     it('Should handle non-valid topics', () => {
    //         const topic = 'zigbee2mqtt1/my_device_id/set';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed).toBeNull();
    //     });

    //     it('Should handle non-valid topics', () => {
    //         const topic = 'zigbee2mqtt1/my_device_id/sett';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed).toBeNull();
    //     });

    //     it('Should handle non-valid topics', () => {
    //         const topic = 'zigbee2mqtt/my_device_id/write';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed).toBeNull();
    //     });

    //     it('Should handle non-valid topics', () => {
    //         const topic = 'zigbee2mqtt/set';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed).toBeNull();
    //     });

    //     it('Should handle non-valid topics', () => {
    //         const topic = 'set';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed).toBeNull();
    //     });

    //     it('Should parse set topic', () => {
    //         const topic = 'zigbee2mqtt/my_device_id/set';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed.type).toBe('set');
    //         expect(parsed.ID).toBe('my_device_id');
    //         expect(parsed.postfix).toBe('');
    //         expect(parsed.attribute).toBeUndefined();
    //     });

    //     it('Should parse get topic', () => {
    //         const topic = 'zigbee2mqtt/my_device_id2/get';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed.type).toBe('get');
    //         expect(parsed.ID).toBe('my_device_id2');
    //         expect(parsed.postfix).toBe('');
    //         expect(parsed.attribute).toBeUndefined();
    //     });


    //     it('Should not respond to bridge/config/devices/get', () => {
    //         const topic = 'zigbee2mqtt/bridge/config/devices/get';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed).toBeNull();
    //     });

    //     it('Should not respond to bridge/config/devices/set', () => {
    //         const topic = 'zigbee2mqtt/bridge/config/devices/set';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed).toBeNull();
    //     });


    //     it('Should not respond to bridge/config/devices', () => {
    //         const topic = 'zigbee2mqtt/bridge/config/devices';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed).toBeNull();
    //     });


    //     it('Should parse topic with when base topic has multiple slashes', () => {
    //         jest.spyOn(settings, 'get').mockReturnValue({
    //             mqtt: {
    //                 base_topic: 'zigbee2mqtt/at/my/home',
    //             },
    //         });

    //         const topic = 'zigbee2mqtt/at/my/home/my_device_id2/get';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed.type).toBe('get');
    //         expect(parsed.ID).toBe('my_device_id2');
    //         expect(parsed.postfix).toBe('');
    //         expect(parsed.attribute).toBeUndefined();
    //     });

    //     it('Should parse topic with when deviceID has multiple slashes', () => {
    //         const topic = 'zigbee2mqtt/floor0/basement/my_device_id2/set';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed.type).toBe('set');
    //         expect(parsed.ID).toBe('floor0/basement/my_device_id2');
    //         expect(parsed.postfix).toBe('');
    //         expect(parsed.attribute).toBeUndefined();
    //     });

    //     it('Should parse topic with when base and deviceID have multiple slashes', () => {
    //         jest.spyOn(settings, 'get').mockReturnValue({
    //             mqtt: {
    //                 base_topic: 'zigbee2mqtt/at/my/basement',
    //             },
    //         });

    //         const topic = 'zigbee2mqtt/at/my/basement/floor0/basement/my_device_id2/set';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed.type).toBe('set');
    //         expect(parsed.ID).toBe('floor0/basement/my_device_id2');
    //         expect(parsed.postfix).toBe('');
    //         expect(parsed.attribute).toBeUndefined();
    //     }
    //     );

    //     it('Should parse set with attribute topic', () => {
    //         const topic = 'zigbee2mqtt/0x12345689/set/foobar';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed.type).toBe('set');
    //         expect(parsed.ID).toBe('0x12345689');
    //         expect(parsed.postfix).toBe('');
    //         expect(parsed.attribute).toBe('foobar');
    //     });

    //     it('Should parse set with ieeeAddr topic', () => {
    //         const topic = 'zigbee2mqtt/0x12345689/set';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed.type).toBe('set');
    //         expect(parsed.ID).toBe('0x12345689');
    //         expect(parsed.postfix).toBe('');
    //         expect(parsed.attribute).toBeUndefined();
    //     });

    //     it('Should parse set with postfix topic', () => {
    //         const topic = 'zigbee2mqtt/0x12345689/left/set';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed.type).toBe('set');
    //         expect(parsed.ID).toBe('0x12345689');
    //         expect(parsed.postfix).toBe('left');
    //         expect(parsed.attribute).toBeUndefined();
    //     });

    //     it('Should parse set with almost postfix topic', () => {
    //         const topic = 'zigbee2mqtt/wohnzimmer.light.wall.right/set';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed.type).toBe('set');
    //         expect(parsed.ID).toBe('wohnzimmer.light.wall.right');
    //         expect(parsed.postfix).toBe('');
    //         expect(parsed.attribute).toBeUndefined();
    //     });

    //     it('Should parse set with postfix topic', () => {
    //         const topic = 'zigbee2mqtt/0x12345689/right/set';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed.type).toBe('set');
    //         expect(parsed.ID).toBe('0x12345689');
    //         expect(parsed.postfix).toBe('right');
    //         expect(parsed.attribute).toBeUndefined();
    //     });

    //     it('Should parse set with postfix topic', () => {
    //         const topic = 'zigbee2mqtt/0x12345689/bottom_left/set';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed.type).toBe('set');
    //         expect(parsed.ID).toBe('0x12345689');
    //         expect(parsed.postfix).toBe('bottom_left');
    //         expect(parsed.attribute).toBeUndefined();
    //     });

    //     it('Shouldnt parse set with invalid postfix topic', () => {
    //         const topic = 'zigbee2mqtt/0x12345689/invalid/set';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed.type).toBe('set');
    //         expect(parsed.ID).toBe('0x12345689/invalid');
    //         expect(parsed.postfix).toBe('');
    //         expect(parsed.attribute).toBeUndefined();
    //     });

    //     it('Should parse set with postfix topic and attribute', () => {
    //         const topic = 'zigbee2mqtt/0x12345689/bottom_left/set/foobar';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed.type).toBe('set');
    //         expect(parsed.ID).toBe('0x12345689');
    //         expect(parsed.postfix).toBe('bottom_left');
    //         expect(parsed.attribute).toBe('foobar');
    //     });

    //     it('Should parse set with and slashes in base and deviceID postfix topic', () => {
    //         jest.spyOn(settings, 'get').mockReturnValue({
    //             mqtt: {
    //                 base_topic: 'zigbee2mqtt/at/my/home',
    //             },
    //         });

    //         const topic = 'zigbee2mqtt/at/my/home/my/device/in/basement/sensor/bottom_left/get';
    //         const parsed = devicePublish.parseTopic(topic);
    //         expect(parsed.type).toBe('get');
    //         expect(parsed.ID).toBe('my/device/in/basement/sensor');
    //         expect(parsed.postfix).toBe('bottom_left');
    //         expect(parsed.attribute).toBeUndefined();
    //     }
    //     );
    // });

    // it('Should not publish messages to zigbee devices when payload is invalid', async () => {
    //     zigbee.publish.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral1'});
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000019/set', JSON.stringify({state: true}));
    //     await wait(10);
    //     expect(zigbee.publish).toHaveBeenCalledTimes(0);
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000019/set', JSON.stringify({state: 1}));
    //     await wait(10);
    //     expect(zigbee.publish).toHaveBeenCalledTimes(0);
    // }
    // );

    // it('Should set state before color', async () => {
    //     zigbee.publish.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'LCT001'});
    //     const msg = {'state': 'ON', 'color': {'x': 0.701, 'y': 0.299}};
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000020/set', JSON.stringify(msg));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(2);
    //     expect(zigbee.publish.mock.calls[0][2]).toBe('genOnOff');
    //     expect(zigbee.publish.mock.calls[0][3]).toBe('on');
    //     expect(zigbee.publish.mock.calls[1][2]).toBe('lightingColorCtrl');
    //     expect(zigbee.publish.mock.calls[1][3]).toBe('moveToColor');
    //     await wait(10);
    //     expect(zigbee.publish).toHaveBeenCalledTimes(2);
    // });

    // it('Should read after write when enabled', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'LCT001'});
    //     jest.spyOn(settings, 'getDevice').mockReturnValue({retrieve_state: true});
    //     const msg = {'state': 'ON', 'color': {'x': 0.701, 'y': 0.299}};
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000020/set', JSON.stringify(msg));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(2);
    //     expect(zigbee.publish.mock.calls[0][2]).toBe('genOnOff');
    //     expect(zigbee.publish.mock.calls[0][3]).toBe('on');
    //     expect(zigbee.publish.mock.calls[1][2]).toBe('lightingColorCtrl');
    //     expect(zigbee.publish.mock.calls[1][3]).toBe('moveToColor');
    //     await wait(10);
    //     expect(zigbee.publish).toHaveBeenCalledTimes(5);
    //     expect(zigbee.publish.mock.calls[2][2]).toBe('genOnOff');
    //     expect(zigbee.publish.mock.calls[2][3]).toBe('read');
    //     expect(zigbee.publish.mock.calls[3][2]).toBe('genLevelCtrl');
    //     expect(zigbee.publish.mock.calls[3][3]).toBe('read');
    //     expect(zigbee.publish.mock.calls[4][2]).toBe('lightingColorCtrl');
    //     expect(zigbee.publish.mock.calls[4][3]).toBe('read');
    //     expect(publishEntityState).toHaveBeenCalledTimes(2);
    //     expect(publishEntityState).toHaveBeenNthCalledWith(1,
    //         '0x00000020',
    //         {state: 'ON'});
    //     expect(publishEntityState).toHaveBeenNthCalledWith(2,
    //         '0x00000020',
    //         {color: {x: 0.701, y: 0.299}});
    // });

    // it('Should use transition when enabled', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'LCT001'});
    //     jest.spyOn(settings, 'getDevice').mockReturnValue({transition: 20});
    //     const msg = {'brightness': 200};
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000020/set', JSON.stringify(msg));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish.mock.calls[0][2]).toBe('genLevelCtrl');
    //     expect(zigbee.publish.mock.calls[0][3]).toBe('moveToLevelWithOnOff');
    //     expect(zigbee.publish.mock.calls[0][5]).toStrictEqual({level: 200, transtime: 200});
    // });

    // it('Should use transition when color temp', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'LCT001'});
    //     jest.spyOn(settings, 'getDevice').mockReturnValue({transition: 20});
    //     const msg = {'color_temp': 200};
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000020/set', JSON.stringify(msg));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish.mock.calls[0][2]).toBe('lightingColorCtrl');
    //     expect(zigbee.publish.mock.calls[0][3]).toBe('moveToColorTemp');
    //     expect(zigbee.publish.mock.calls[0][5]).toStrictEqual({colortemp: 200, transtime: 200});
    // });

    // it('Message transition should overrule options transition', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'LCT001'});
    //     jest.spyOn(settings, 'getDevice').mockReturnValue({transition: 20});
    //     const msg = {'brightness': 200, 'transition': 10};
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000020/set', JSON.stringify(msg));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish.mock.calls[0][2]).toBe('genLevelCtrl');
    //     expect(zigbee.publish.mock.calls[0][3]).toBe('moveToLevelWithOnOff');
    //     expect(zigbee.publish.mock.calls[0][5]).toStrictEqual({level: 200, transtime: 100});
    // });

    // it('Should set state with brightness before color', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'LCT001'});
    //     const msg = {'state': 'ON', 'color': {'x': 0.701, 'y': 0.299}, 'transition': 3, 'brightness': 100};
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000021/set', JSON.stringify(msg));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(2);
    //     expect(zigbee.publish.mock.calls[0][2]).toBe('genLevelCtrl');
    //     expect(zigbee.publish.mock.calls[1][2]).toBe('lightingColorCtrl');
    //     await wait(10);
    //     expect(zigbee.publish).toHaveBeenCalledTimes(2);
    //     expect(publishEntityState).toHaveBeenCalledTimes(2);
    //     expect(publishEntityState).toHaveBeenNthCalledWith(1,
    //         '0x00000021',
    //         {state: 'ON', brightness: 100});
    //     expect(publishEntityState).toHaveBeenNthCalledWith(2,
    //         '0x00000021',
    //         {color: {x: 0.701, y: 0.299}});
    // });

    // it('Should turn device off when brightness 0 is send', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({brightness: 0}));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         'device',
    //         'genOnOff',
    //         'off',
    //         'functional',
    //         {},
    //         cfg.default,
    //         null,
    //         expect.any(Function));
    //     expect(publishEntityState).toHaveBeenCalledTimes(1);
    //     expect(publishEntityState).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         {state: 'OFF', brightness: 0});
    // });

    // it('Should turn device off when brightness 0 is send with light_brightness converter', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'FB56+ZSC05HG1.0'});
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({brightness: 0}));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         'device',
    //         'genOnOff',
    //         'off',
    //         'functional',
    //         {},
    //         cfg.default,
    //         null,
    //         expect.any(Function));
    //     expect(publishEntityState).toHaveBeenCalledTimes(1);
    //     expect(publishEntityState).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         {state: 'OFF', brightness: 0});
    // });

    // it('Specifc ZNCLDJ11LM test', async () => {
    //     zigbee.publish.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'lumi.curtain'});
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({state: 'OPEN'}));
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(1,
    //         '0x00000001', 'device', 'genAnalogOutput', 'write',
    //         'foundation', [{attrId: 0x0055, dataType: 0x39, attrData: 100}], cfg.default, null, expect.any(Function)
    //     );

    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({position: 10}));
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(2,
    //         '0x00000001', 'device', 'genAnalogOutput', 'write',
    //         'foundation', [{attrId: 0x0055, dataType: 0x39, attrData: 10}], cfg.default, null, expect.any(Function)
    //     );

    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({state: 'CLOSE'}));
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(3,
    //         '0x00000001', 'device', 'genAnalogOutput', 'write',
    //         'foundation', [{attrId: 0x0055, dataType: 0x39, attrData: 0}], cfg.default, null, expect.any(Function)
    //     );

    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({state: 'STOP'}));
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(4,
    //         '0x00000001', 'device', 'closuresWindowCovering', 'stop',
    //         'functional', {}, cfg.default, null, expect.any(Function)
    //     );
    // });

    // it('Should turn device off when brightness 0 is send with light_brightness converter', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({state: 'ON', transition: 1}));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         'device',
    //         'genLevelCtrl',
    //         'moveToLevelWithOnOff',
    //         'functional',
    //         {level: 255, transtime: 10},
    //         cfg.default,
    //         null,
    //         expect.any(Function));
    //     expect(publishEntityState).toHaveBeenCalledTimes(1);
    //     expect(publishEntityState).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         {state: 'ON', brightness: 255});
    // });

    // it('Should turn device off when brightness 0 is send with light_brightness converter', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({state: 'OFF', transition: 2}));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         'device',
    //         'genLevelCtrl',
    //         'moveToLevelWithOnOff',
    //         'functional',
    //         {level: 0, transtime: 20},
    //         cfg.default,
    //         null,
    //         expect.any(Function));
    //     expect(publishEntityState).toHaveBeenCalledTimes(1);
    //     expect(publishEntityState).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         {state: 'OFF', brightness: 0});
    // });

    // it('Home Assistant: should set state', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     jest.spyOn(settings, 'get').mockReturnValue({
    //         homeassistant: true,
    //         mqtt: {base_topic: 'zigbee2mqtt'},
    //         advanced: {last_seen: 'disable'},
    //     });
    //     zigbee.getDevice = () => ({modelId: 'RB 185 C'});
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({state: 'ON'}));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         'device',
    //         'genOnOff',
    //         'on',
    //         'functional',
    //         {},
    //         cfg.default,
    //         null,
    //         expect.any(Function));
    //     expect(publishEntityState).toHaveBeenCalledTimes(1);
    //     expect(publishEntityState).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         {state: 'ON'});
    // });

    // it('Home Assistant: should not set state when color temperature is also set', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     jest.spyOn(state, 'get').mockReturnValue({state: 'ON'});
    //     jest.spyOn(settings, 'get').mockReturnValue({
    //         homeassistant: true,
    //         mqtt: {base_topic: 'zigbee2mqtt'},
    //         advanced: {last_seen: 'disable'},
    //     });
    //     zigbee.getDevice = () => ({modelId: 'RB 185 C'});
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({state: 'ON', color_temp: 100}));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         'device',
    //         'lightingColorCtrl',
    //         'moveToColorTemp',
    //         'functional',
    //         {colortemp: 100, transtime: 0},
    //         cfg.default,
    //         null,
    //         expect.any(Function));

    //     expect(publishEntityState).toHaveBeenCalledTimes(1);
    //     expect(publishEntityState).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         {color_temp: 100});
    // });

    // it('Home Assistant: should not set state when color is also set', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     jest.spyOn(state, 'get').mockReturnValue({state: 'ON'});
    //     jest.spyOn(settings, 'get').mockReturnValue({
    //         homeassistant: true,
    //         mqtt: {base_topic: 'zigbee2mqtt'},
    //         advanced: {last_seen: 'disable'},
    //     });
    //     zigbee.getDevice = () => ({modelId: 'RB 185 C'});
    //     devicePublish.onMQTTMessage(
    //         'zigbee2mqtt/0x00000001/set',
    //         JSON.stringify({state: 'ON', color: {x: 0.41, y: 0.25}})
    //     );
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         'device',
    //         'lightingColorCtrl',
    //         'moveToColor',
    //         'functional',
    //         {colorx: 26869, colory: 16384, transtime: 0},
    //         cfg.default,
    //         null,
    //         expect.any(Function));

    //     expect(publishEntityState).toHaveBeenCalledTimes(1);
    //     expect(publishEntityState).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         {color: {x: 0.41, y: 0.25}});
    // });

    // it('Home Assistant: should set state when color is also set and bulb is off', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     jest.spyOn(state, 'get').mockReturnValue({state: 'OFF'});
    //     jest.spyOn(settings, 'get').mockReturnValue({
    //         homeassistant: true,
    //         mqtt: {base_topic: 'zigbee2mqtt'},
    //         advanced: {last_seen: 'disable'},
    //     });
    //     zigbee.getDevice = () => ({modelId: 'RB 185 C'});
    //     devicePublish.onMQTTMessage(
    //         'zigbee2mqtt/0x00000001/set',
    //         JSON.stringify({state: 'ON', color: {x: 0.41, y: 0.25}})
    //     );
    //     expect(zigbee.publish).toHaveBeenCalledTimes(2);
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         'device',
    //         'genOnOff',
    //         'on',
    //         'functional',
    //         {},
    //         cfg.default,
    //         null,
    //         expect.any(Function));
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(2,
    //         '0x00000001',
    //         'device',
    //         'lightingColorCtrl',
    //         'moveToColor',
    //         'functional',
    //         {colorx: 26869, colory: 16384, transtime: 0},
    //         cfg.default,
    //         null,
    //         expect.any(Function));

    //     expect(publishEntityState).toHaveBeenCalledTimes(2);
    //     expect(publishEntityState).toHaveBeenNthCalledWith(1,
    //         '0x00000001',
    //         {state: 'ON'});
    //     expect(publishEntityState).toHaveBeenNthCalledWith(2,
    //         '0x00000001',
    //         {color: {x: 0.41, y: 0.25}});
    // });

    // it('Should publish message with disFeedbackRsp when set', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'HDC52EastwindFan'});
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000003/set', JSON.stringify({brightness: '92'}));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(1,
    //         '0x00000003',
    //         'device',
    //         'genLevelCtrl',
    //         'moveToLevelWithOnOff',
    //         'functional',
    //         {level: 92, transtime: 0},
    //         cfg.disFeedbackRsp,
    //         null,
    //         expect.any(Function));

    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000003/set', JSON.stringify({state: 'OFF'}));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(2);
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(2,
    //         '0x00000003',
    //         'device',
    //         'genOnOff',
    //         'off',
    //         'functional',
    //         {},
    //         cfg.disFeedbackRsp,
    //         null,
    //         expect.any(Function));
    // });

    // it('Should publish messages to zigbee devices', async () => {
    //     jest.spyOn(settings, 'get').mockReturnValue({
    //         mqtt: {base_topic: 'zigbee2mqtt'},
    //         advanced: {last_seen: 'ISO_8601'},
    //     });
    //     publishEntityState.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'TRADFRI bulb E27 CWS opal 600lm'});
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000001/set', JSON.stringify({brightness: '200'}));
    //     expect(publishEntityState).toHaveBeenCalledTimes(1);
    //     expect(typeof publishEntityState.mock.calls[0][1].last_seen).toBe('string');
    // });

    // it('HS2WD-E burglar warning', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'WarningDevice'});
    //     const payload = {warning: {duration: 100, mode: 'burglar', strobe: true, level: 'high'}};
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000003/set', JSON.stringify(payload));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(1,
    //         '0x00000003',
    //         'device',
    //         'ssIasWd',
    //         'startWarning',
    //         'functional',
    //         {startwarninginfo: 22, warningduration: 100},
    //         cfg.default,
    //         null,
    //         expect.any(Function));
    // });

    // it('HS2WD-E emergency warning', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'WarningDevice'});
    //     const payload = {warning: {duration: 10, mode: 'emergency', strobe: false, level: 'very_high'}};
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000003/set', JSON.stringify(payload));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(1,
    //         '0x00000003',
    //         'device',
    //         'ssIasWd',
    //         'startWarning',
    //         'functional',
    //         {startwarninginfo: 51, warningduration: 10},
    //         cfg.default,
    //         null,
    //         expect.any(Function));
    // });

    // it('HS2WD-E emergency without level', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'WarningDevice'});
    //     const payload = {warning: {duration: 10, mode: 'emergency', strobe: false}};
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000003/set', JSON.stringify(payload));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(1,
    //         '0x00000003',
    //         'device',
    //         'ssIasWd',
    //         'startWarning',
    //         'functional',
    //         {startwarninginfo: 49, warningduration: 10},
    //         cfg.default,
    //         null,
    //         expect.any(Function));
    // });

    // it('HS2WD-E wrong payload (should use defaults)', async () => {
    //     zigbee.publish.mockClear();
    //     publishEntityState.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'WarningDevice'});
    //     const payload = {warning: 'wrong'};
    //     devicePublish.onMQTTMessage('zigbee2mqtt/0x00000003/set', JSON.stringify(payload));
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenNthCalledWith(1,
    //         '0x00000003',
    //         'device',
    //         'ssIasWd',
    //         'startWarning',
    //         'functional',
    //         {startwarninginfo: 53, warningduration: 10},
    //         cfg.default,
    //         null,
    //         expect.any(Function));
    // });
});
