const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);

const mocksClear = [MQTT.publish, logger.warn, logger.debug];

const expectNothingPublished = () => {
    Object.values(zigbeeHerdsman.devices).forEach((d) => {
        d.endpoints.forEach((e) => {
            expect(e.command).toHaveBeenCalledTimes(0);
            expect(e.read).toHaveBeenCalledTimes(0);
            expect(e.write).toHaveBeenCalledTimes(0);
        });
    })
    Object.values(zigbeeHerdsman.groups).forEach((g) => {
        expect(g.command).toHaveBeenCalledTimes(0);
    })
}

describe('Publish', () => {
    let controller;

    beforeAll(async () => {
        data.writeEmptyState();
        controller = new Controller();
        await controller.start();
        await flushPromises();
    });

    beforeEach(async () => {
        jest.useRealTimers();
        await flushPromises();
        data.writeDefaultConfiguration();
        controller.state.state = {};
        settings._reRead();
        mocksClear.forEach((m) => m.mockClear());
        Object.values(zigbeeHerdsman.devices).forEach((d) => {
            d.endpoints.forEach((e) => {
                e.command.mockClear();
                e.read.mockClear();
                e.write.mockClear();
            })
        })
        Object.values(zigbeeHerdsman.groups).forEach((g) => {
            g.command.mockClear();
        });
    });

    it('Should publish messages to zigbee devices', async () => {
        const endpoint = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({brightness: '200'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {"level": 200, "transtime": 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({brightness: 200, state: 'ON'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices when there is no converters', async () => {
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({brightness_no: '200'}));
        await flushPromises();
        expectNothingPublished();
    });

    it('Should publish messages to zigbee devices when there is a get converter but no set', async () => {
        await MQTT.events.message('zigbee2mqtt/thermostat/set', JSON.stringify({relay_status_log_rsp: '200'}));
        await flushPromises();
        expectNothingPublished();
    });

    it('Should publish messages to zigbee devices with complicated topic', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        settings.set(['devices', device.ieeeAddr, 'friendly_name'], 'wohnzimmer.light.wall.right')
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/wohnzimmer.light.wall.right/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
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
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 235, transtime: 0}, {});
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
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 230, transtime: 0}, {});
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
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColorTemp", {colortemp: 222, transtime: 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color_temp: 222, color: {x: 0.360786471097048, y: 0.363543544699483}});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with color_temp in %', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color_temp_percent: '100'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColorTemp", {colortemp: 500, transtime: 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color_temp: 500, color: {x: 0.526676280311873, y: 0.41329727450763}});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with non-default ep', async () => {
        const device = zigbeeHerdsman.devices.QBKG04LM;
        const endpoint = device.getEndpoint(2);
        await MQTT.events.message('zigbee2mqtt/wall_switch/set', JSON.stringify({state: 'OFF'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "off", {}, {});
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
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "off", {}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/wall_switch_double');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state_right: 'OFF'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices to non default-ep with state_[EP]', async () => {
        const device = zigbeeHerdsman.devices.QBKG03LM;
        const endpoint = device.getEndpoint(3);
        await MQTT.events.message('zigbee2mqtt/wall_switch_double/set', JSON.stringify({state_right: 'OFF'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "off", {}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/wall_switch_double');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state_right: 'OFF'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with color xy', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color: {x: 100, y: 50}}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 6553500, colory: 3276750, transtime: 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color_temp: 62, color: {x: 100, y: 50}});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with color xy and state', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color: {x: 100, y: 50}, state: 'ON'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 6553500, colory: 3276750, transtime: 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({color: {x: 100, y: 50}, color_temp: 62, state: 'ON'});
        expect(MQTT.publish.mock.calls[1][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with color xy and brightness', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color: {x: 100, y: 50}, brightness: 20}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 0}, {});
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 6553500, colory: 3276750, transtime: 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON', brightness: 20});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({color: {x: 100, y: 50}, state: 'ON', color_temp: 62, brightness: 20});
        expect(MQTT.publish.mock.calls[1][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with color xy, brightness and state on', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color: {x: 100, y: 50}, brightness: 20, state: 'ON'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 0}, {});
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 6553500, colory: 3276750, transtime: 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON', brightness: 20});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({color: {x: 100, y: 50}, state: 'ON', color_temp: 62, brightness: 20});
        expect(MQTT.publish.mock.calls[1][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with color xy, brightness and state off', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color: {x: 100, y: 50}, brightness: 20, state: 'OFF'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "off", {}, {});
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 6553500, colory: 3276750, transtime: 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'OFF'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({color: {x: 100, y: 50}, color_temp: 62, state: 'OFF'});
        expect(MQTT.publish.mock.calls[1][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices with color rgb', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color: {r: 100, g: 200, b: 10}}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 17806, colory: 43155, transtime: 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color_temp: 156, color: {x: 0.2717, y: 0.6585}});
    });

    it('Should publish messages to zigbee devices with color rgb', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({color: {rgb: '100,200,10'}}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 17806, colory: 43155, transtime: 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color_temp: 156, color: {x: 0.2717, y: 0.6585}});
    });

    it('Should publish messages to zigbee devices with color rgb', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({state: 'ON', brightness: '50'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 50, transtime: 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON', brightness: 50});
    });

    it('Should publish messages groups', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/group_1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON'});
    });

    it('Should publish messages to groups with brightness_percent', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({brightness_percent: 50}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 127, transtime: 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/group_1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON', brightness: 127});
    });

    it('Should publish messages to groups with on and brightness', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({state: 'ON', brightness: 50}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 50, transtime: 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/group_1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON', brightness: 50});
    });

    it('Should publish messages to groups with off and brightness', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({state: 'OFF', brightness: 50}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genOnOff", "off", {}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/group_1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'OFF'});
    });

    it('Should publish messages to groups color', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({color: {x: 0.37, y: 0.28}}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 24248, colory: 18350, transtime: 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/group_1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color: {x: 0.37, y: 0.28}});
    });

    it('Should publish messages to groups color temperature', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({color_temp: 100}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColorTemp", {colortemp: 100, transtime: 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/group_1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color_temp: 100});
    });

    it('Should create and publish to group which is in configuration.yaml but not in zigbee-herdsman', async () => {
        delete zigbeeHerdsman.groups.group_2;
        expect(Object.values(zigbeeHerdsman.groups).length).toBe(4);
        await MQTT.events.message('zigbee2mqtt/group_2/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expect(Object.values(zigbeeHerdsman.groups).length).toBe(5);
        expect(zigbeeHerdsman.groups.group_2.command).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.groups.group_2.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
    });

    it('Should handle non-valid topics', async () => {
        await MQTT.events.message('zigbee2mqtt1/bulb_color/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expectNothingPublished();
    });

    it('Should handle non-valid topics', async () => {
        await MQTT.events.message('zigbee2mqtt1/bulb_color/sett', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expectNothingPublished();
    });

    it('Should handle non-valid topics', async () => {
        await MQTT.events.message('zigbee2mqtt/bulb_color/write', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expectNothingPublished();
    });

    it('Should handle non-valid topics', async () => {
        await MQTT.events.message('zigbee2mqtt/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expectNothingPublished();
    });

    it('Should handle non-valid topics', async () => {
        await MQTT.events.message('set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expectNothingPublished();
    });

    it('Should handle get', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/get', JSON.stringify({state: ''}));
        await flushPromises();
        expect(endpoint.read).toHaveBeenCalledTimes(1);
        expect(endpoint.read).toHaveBeenCalledWith('genOnOff', ['onOff']);
    });

    it('Should not respond to bridge/config/devices/get', async () => {
        await MQTT.events.message('zigbee2mqtt/bridge/config/devices/get', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expectNothingPublished();
    });

    it('Should not respond to bridge/config/devices/set', async () => {
        await MQTT.events.message('zigbee2mqtt/bridge/config/devices/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expectNothingPublished();
    });

    it('Should not respond to bridge/config/devices', async () => {
        await MQTT.events.message('zigbee2mqtt/bridge/config/devices', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expectNothingPublished();
    });

    it('Should parse topic with when base topic has multiple slashes', async () => {
        settings.set(['mqtt', 'base_topic'], 'zigbee2mqtt/at/my/home');
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/at/my/home/bulb_color/get', JSON.stringify({state: ''}));
        await flushPromises();
        expect(endpoint.read).toHaveBeenCalledTimes(1);
        expect(endpoint.read).toHaveBeenCalledWith('genOnOff', ['onOff']);
    });

    it('Should parse topic with when deviceID has multiple slashes', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        settings.set(['devices', device.ieeeAddr, 'friendly_name'], 'floor0/basement/my_device_id2');
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/floor0/basement/my_device_id2/get', JSON.stringify({state: ''}));
        await flushPromises();
        expect(endpoint.read).toHaveBeenCalledTimes(1);
        expect(endpoint.read).toHaveBeenCalledWith('genOnOff', ['onOff']);
    });

    it('Should parse topic with when base and deviceID have multiple slashes', async () => {
        settings.set(['mqtt', 'base_topic'], 'zigbee2mqtt/at/my/basement');
        const device = zigbeeHerdsman.devices.bulb_color;
        settings.set(['devices', device.ieeeAddr, 'friendly_name'], 'floor0/basement/my_device_id2');
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/at/my/basement/floor0/basement/my_device_id2/get', JSON.stringify({state: ''}));
        await flushPromises();
        expect(endpoint.read).toHaveBeenCalledTimes(1);
        expect(endpoint.read).toHaveBeenCalledWith('genOnOff', ['onOff']);
    });

    it('Should parse set with attribute topic', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set/state', 'ON');
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
    });

    it('Should parse set with color attribute topic', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set/color', '#64C80A');
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("lightingColorCtrl", "moveToColor", {colorx: 17806, colory: 43155, transtime: 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color_temp: 156, color: {x: 0.2717, y: 0.6585}});
    });

    it('Should parse set with ieeeAddr topic', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/0x000b57fffec6a5b3/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
    });

    it('Should parse set with non-existing postfix', async () => {
        await MQTT.events.message('zigbee2mqtt/wall_switch_double/invalid/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expectNothingPublished();
    });

    it('Should parse set with postfix topic and attribute', async () => {
        const device = zigbeeHerdsman.devices.QBKG03LM;
        const endpoint = device.getEndpoint(2);
        await MQTT.events.message('zigbee2mqtt/wall_switch_double/left/set', 'ON');
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
    });

    it('Should parse set with and slashes in base and deviceID postfix topic', async () => {
        settings.set(['mqtt', 'base_topic'], 'zigbee2mqtt/at/my/home')
        const device = zigbeeHerdsman.devices.QBKG03LM;
        settings.set(['devices', device.ieeeAddr, 'friendly_name'], 'in/basement/wall_switch_double');
        const endpoint = device.getEndpoint(2);
        await MQTT.events.message('zigbee2mqtt/at/my/home/in/basement/wall_switch_double/left/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
    });

    it('Should parse set with number at the end of friendly_name and postfix', async () => {
        const device = zigbeeHerdsman.devices.QBKG03LM;
        settings.set(['devices', device.ieeeAddr, 'friendly_name'], 'ground_floor/kitchen/wall_switch/2');
        const endpoint = device.getEndpoint(2);
        await MQTT.events.message('zigbee2mqtt/ground_floor/kitchen/wall_switch/2/left/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "on", {}, {});
    });

    it('Should not publish messages to zigbee devices when payload is invalid', async () => {
        const device = zigbeeHerdsman.devices.QBKG03LM;
        const endpoint = device.getEndpoint(2);
        await MQTT.events.message('zigbee2mqtt/wall_switch_double/left/set', JSON.stringify({state: true}));
        await MQTT.events.message('zigbee2mqtt/wall_switch_double/left/set', JSON.stringify({state: 1}));
        await flushPromises();
        expectNothingPublished();
    });

    it('Should set state before color', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const payload = {'state': 'ON', 'color': {'x': 0.701, 'y': 0.299}};
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[0]).toEqual(["genOnOff", "on", {}, {}]);
        expect(endpoint.command.mock.calls[1]).toEqual(["lightingColorCtrl", "moveToColor", {"colorx": 45940, "colory": 19595, "transtime": 0}, {}]);
    });

    it('Should read after write when enabled', async () => {
        jest.useFakeTimers();
        const device = zigbeeHerdsman.devices.bulb_color;
        settings.set(['devices', device.ieeeAddr, 'retrieve_state'], true);
        const endpoint = device.getEndpoint(1);
        const payload = {'state': 'ON', 'color': {'x': 0.701, 'y': 0.299}};
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify(payload));
        await flushPromises();
        jest.runAllTimers();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[0]).toEqual(["genOnOff", "on", {}, {}]);
        expect(endpoint.command.mock.calls[1]).toEqual(["lightingColorCtrl", "moveToColor", {"colorx": 45940, "colory": 19595, "transtime": 0}, {}]);
        expect(endpoint.read).toHaveBeenCalledTimes(2);
        expect(endpoint.read.mock.calls[0]).toEqual(["genOnOff", ["onOff"]]);
        expect(endpoint.read.mock.calls[1]).toEqual(["lightingColorCtrl", ["currentX", "currentY", "colorTemperature"]]);
    });

    it('Should use transition when brightness with group', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        settings.set(['groups', '1', 'transition'], 20);
        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({brightness: 100}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevelWithOnOff", {level: 100, transtime: 200}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/group_1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON', brightness: 100});
    });

    it('Should use transition when brightness', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        settings.set(['devices', device.ieeeAddr, 'transition'], 20);
        const endpoint = device.getEndpoint(1);
        const payload = {brightness: 20};
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 200}, {}]);
    });

    it('Should use transition when color temp', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        settings.set(['devices', device.ieeeAddr, 'transition'], 20);
        const endpoint = device.getEndpoint(1);
        const payload = {color_temp: 200};
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["lightingColorCtrl", "moveToColorTemp", {colortemp: 200, transtime: 200}, {}]);
    });

    it('Should use transition only once when setting brightness and color temperature for TRADFRI', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        const payload = {state: 'ON', brightness: 20, color_temp: 200, transition: 20};
        await MQTT.events.message('zigbee2mqtt/bulb/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 0}, {}]);
        expect(endpoint.command.mock.calls[1]).toEqual(["lightingColorCtrl", "moveToColorTemp", {colortemp: 200, transtime: 200}, {}]);
    });

    it('Should use transition only once when setting brightness and color temperature for group which contains TRADFRI', async () => {
        const group = zigbeeHerdsman.groups.group_with_tradfri;
        await MQTT.events.message('zigbee2mqtt/group_with_tradfri/set', JSON.stringify({"state": "ON", "transition": 60, "brightness": 20, "color_temp": 400}));
        await flushPromises();
        expect(group.command).toHaveBeenCalledTimes(2);
        expect(group.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 20, transtime: 0}, {}]);
        expect(group.command.mock.calls[1]).toEqual(["lightingColorCtrl", "moveToColorTemp", {colortemp: 400, transtime: 600}, {}]);
    });

    it('Message transition should overrule options transition', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        settings.set(['devices', device.ieeeAddr, 'transition'], 20);
        const endpoint = device.getEndpoint(1);
        const payload = {brightness: 200, transition: 10};
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 200, transtime: 100}, {}]);
    });

    it('Should set state with brightness before color', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const payload = {'state': 'ON', 'color': {'x': 0.701, 'y': 0.299}, 'transition': 3, 'brightness': 100};
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 100, transtime: 30}, {}]);
        expect(endpoint.command.mock.calls[1]).toEqual(["lightingColorCtrl", "moveToColor", {"colorx": 45940, "colory": 19595, "transtime": 30}, {}]);
    });

    it('Should turn device off when brightness 0 is send', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const payload = {'brightness': 0};
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genOnOff", "off", {}, {}]);
    });

    it('Should turn device off when brightness 0 is send with light_brightness converter', async () => {
        const device = zigbeeHerdsman.devices.HGZB04D;
        const endpoint = device.getEndpoint(1);
        const payload = {'brightness': 0};
        await MQTT.events.message('zigbee2mqtt/dimmer_wall_switch/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genOnOff", "off", {}, {}]);
    });

    it('Should allow to set color via hue and saturation', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const payload = {"color":{"hue":250, "saturation":50}};
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["lightingColorCtrl", "enhancedMoveToHueAndSaturation", {"direction": 0, "enhancehue": 45510.416666666664, "saturation": 127, "transtime": 0,}, {}]);
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({"color":{"hue":250,"saturation":50}});
    });

    it('ZNCLDJ11LM open', async () => {
        const device = zigbeeHerdsman.devices.ZNCLDJ11LM;
        const endpoint = device.getEndpoint(1);
        const payload = {'state': 'OPEN'};
        await MQTT.events.message('zigbee2mqtt/curtain/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.write).toHaveBeenCalledTimes(1);
        expect(endpoint.write).toHaveBeenCalledWith("genAnalogOutput", {"85": {"type": 57, "value": 100}});
    });

    it('ZNCLDJ11LM position', async () => {
        const device = zigbeeHerdsman.devices.ZNCLDJ11LM;
        const endpoint = device.getEndpoint(1);
        const payload = {'position': 10};
        await MQTT.events.message('zigbee2mqtt/curtain/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.write).toHaveBeenCalledTimes(1);
        expect(endpoint.write).toHaveBeenCalledWith("genAnalogOutput", {"85": {"type": 57, "value": 10}});
    });

    it('ZNCLDJ11LM position', async () => {
        const device = zigbeeHerdsman.devices.ZNCLDJ11LM;
        const endpoint = device.getEndpoint(1);
        const payload = {'state': 'CLOSE'};
        await MQTT.events.message('zigbee2mqtt/curtain/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.write).toHaveBeenCalledTimes(1);
        expect(endpoint.write).toHaveBeenCalledWith("genAnalogOutput", {"85": {"type": 57, "value": 0}});
    });

    it('ZNCLDJ11LM position', async () => {
        const device = zigbeeHerdsman.devices.ZNCLDJ11LM;
        const endpoint = device.getEndpoint(1);
        const payload = {'state': 'STOP'};
        await MQTT.events.message('zigbee2mqtt/curtain/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("closuresWindowCovering", "stop", {}, {});
    });

    it('Should turn device on with on/off when transition is provided', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const payload = {state: 'ON', transition: 3};
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 255, transtime: 30}, {}]);
    });

    it('Should turn device on with on/off with transition when transition 0 is provided', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const payload = {state: 'ON', transition: 0};
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 255, transtime: 0}, {}]);
    });

    it('Should turn device off with onOff on off with transition', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const payload = {state: 'OFF', transition: 1};
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 0, transtime: 10}, {}]);
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'OFF'});
    });

    it('When device is turned off and on with transition with report enabled it should restore correct brightness', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        // Set initial brightness in state
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({brightness: 200}));
        await flushPromises();
        endpoint.command.mockClear();
        MQTT.publish.mockClear();

        // Turn off
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({state: 'OFF', transition: 3}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 0, transtime: 30}, {}]);
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0]).toEqual(["zigbee2mqtt/bulb_color", JSON.stringify({state: 'OFF', brightness: 200}), {"qos": 0, "retain": false}, expect.any(Function)]);

        // Bulb reports brightness while decreasing brightness
        await zigbeeHerdsman.events.message({data: {currentLevel: 1}, cluster: 'genLevelCtrl', device, endpoint, type: 'attributeReport', linkquality: 10});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish.mock.calls[1]).toEqual(["zigbee2mqtt/bulb_color", JSON.stringify({state: 'OFF', brightness: 1, linkquality: 10}), {"qos": 0, "retain": false}, expect.any(Function)]);

        // Turn on again
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({state: 'ON', transition: 3}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[1]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 200, transtime: 30}, {}]);
        expect(MQTT.publish).toHaveBeenCalledTimes(3);
        expect(MQTT.publish.mock.calls[2]).toEqual(["zigbee2mqtt/bulb_color", JSON.stringify({state: 'ON', brightness: 200, linkquality: 10}), {"qos": 0, "retain": false}, expect.any(Function)]);
    });

    it('When device is turned off with transition and turned on WITHOUT transition it should restore the brightness', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        // Set initial brightness in state
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({brightness: 200}));
        await flushPromises();
        endpoint.command.mockClear();
        MQTT.publish.mockClear();

        // Turn off
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({state: 'OFF', transition: 3}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 0, transtime: 30}, {}]);
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0]).toEqual(["zigbee2mqtt/bulb_color", JSON.stringify({state: 'OFF', brightness: 200}), {"qos": 0, "retain": false}, expect.any(Function)]);

        // Turn on again
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[1]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 200, transtime: 0}, {}]);
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish.mock.calls[1]).toEqual(["zigbee2mqtt/bulb_color", JSON.stringify({state: 'ON', brightness: 200}), {"qos": 0, "retain": false}, expect.any(Function)]);
    });

    it('Home Assistant: should set state', async () => {
        settings.set(['homeassistant'], true);
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const payload = {state: 'ON'};
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genOnOff", "on", {}, {}]);
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON'});
    });

    it('Home Assistant: should not set state when color temperature is also set and device is already on', async () => {
        settings.set(['homeassistant'], true);
        const device = zigbeeHerdsman.devices.bulb_color;
        controller.state.set(device.ieeeAddr, {state: 'ON'})
        const endpoint = device.getEndpoint(1);
        const payload = {state: 'ON', color_temp: 100};
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["lightingColorCtrl", "moveToColorTemp", {colortemp: 100, transtime: 0}, {}]);
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON', color: {x: 0.280632719756407, y: 0.288286029784579}, color_temp: 100});
    });

    it('Home Assistant: should set state when color temperature is also set and device is off', async () => {
        settings.set(['homeassistant'], true);
        const device = zigbeeHerdsman.devices.bulb_color;
        controller.state.set(device.ieeeAddr, {state: 'OFF'})
        const endpoint = device.getEndpoint(1);
        const payload = {state: 'ON', color_temp: 100};
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[0]).toEqual(["genOnOff", "on", {}, {}]);
        expect(endpoint.command.mock.calls[1]).toEqual(["lightingColorCtrl", "moveToColorTemp", {colortemp: 100, transtime: 0}, {}]);
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'ON'});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({state: 'ON', color: {x: 0.280632719756407, y: 0.288286029784579}, color_temp: 100});
    });

    it('Home Assistant: should not set state when color is also set', async () => {
        settings.set(['homeassistant'], true);
        const device = zigbeeHerdsman.devices.bulb_color;
        controller.state.set(device.ieeeAddr, {state: 'ON'})
        const endpoint = device.getEndpoint(1);
        const payload = {state: 'ON', color: {x: 0.41, y: 0.25}};
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["lightingColorCtrl", "moveToColor", {colorx: 26869, colory: 16384, transtime: 0}, {}]);
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({color: {x: 0.41, y: 0.25}, color_temp: 150, state: 'ON'});
    });

    it('Should publish correct state on toggle command to zigbee bulb', async () => {
        const endpoint = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({state: 'TOGGLE'}));
        await flushPromises();

        // At this point the bulb has no state yet, so we cannot determine the next state and therefore shouldn't publish it to MQTT.
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "toggle", {}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(0);

        // Turn bulb off so that the bulb gets a state.
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({state: 'OFF'}));
        await flushPromises();

        // Toggle again, now that we have state it should publish state ON
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({state: 'TOGGLE'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(3);
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({state: 'ON'});
        expect(MQTT.publish.mock.calls[1][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages with options disableDefaultResponse', async () => {
        const device = zigbeeHerdsman.devices.GLEDOPTO1112;
        const endpoint = device.getEndpoint(11);
        await MQTT.events.message('zigbee2mqtt/led_controller_1/set', JSON.stringify({state: 'OFF'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genOnOff", "off", {}, {disableDefaultResponse: true});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/led_controller_1');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state: 'OFF'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish messages to zigbee devices', async () => {
        settings.set(['advanced', 'last_seen'], 'ISO_8601')
        const endpoint = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({brightness: '200'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bulb_color');
        expect(typeof JSON.parse(MQTT.publish.mock.calls[0][1]).last_seen).toStrictEqual('string');
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish brightness_move up to zigbee devices', async () => {
        const endpoint = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({brightness_move: -40}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "move", {"movemode": 1, "rate": 40}, {});
    });

    it('Should publish brightness_move down to zigbee devices', async () => {
        const endpoint = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({brightness_move: 30}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "move", {"movemode": 0, "rate": 30}, {});
    });

    it('HS2WD-E burglar warning', async () => {
        const endpoint = zigbeeHerdsman.devices.HS2WD.getEndpoint(1);
        const payload = {warning: {duration: 100, mode: 'burglar', strobe: true, level: 'high'}};
        await MQTT.events.message('zigbee2mqtt/siren/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("ssIasWd", "startWarning", {"startwarninginfo": 22, "warningduration": 100}, {disableDefaultResponse: true});
    });

    it('HS2WD-E emergency warning', async () => {
        const endpoint = zigbeeHerdsman.devices.HS2WD.getEndpoint(1);
        const payload = {warning: {duration: 10, mode: 'emergency', strobe: false, level: 'very_high'}};
        await MQTT.events.message('zigbee2mqtt/siren/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("ssIasWd", "startWarning", {"startwarninginfo": 51, "warningduration": 10}, {disableDefaultResponse: true});
    });

    it('HS2WD-E emergency without level', async () => {
        const endpoint = zigbeeHerdsman.devices.HS2WD.getEndpoint(1);
        const payload = {warning: {duration: 10, mode: 'emergency', strobe: false}};
        await MQTT.events.message('zigbee2mqtt/siren/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("ssIasWd", "startWarning", {"startwarninginfo": 49, "warningduration": 10}, {disableDefaultResponse: true});
    });

    it('HS2WD-E wrong payload (should use defaults)', async () => {
        const endpoint = zigbeeHerdsman.devices.HS2WD.getEndpoint(1);
        const payload = {warning: 'wrong'};
        await MQTT.events.message('zigbee2mqtt/siren/set', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("ssIasWd", "startWarning", {"startwarninginfo": 53, "warningduration": 10}, {disableDefaultResponse: true});
    });

    it('Shouldnt do anythign when device is not supported', async () => {
        const payload = {state: 'ON'};
        await MQTT.events.message('zigbee2mqtt/unsupported2/set', JSON.stringify(payload));
        await flushPromises();
        expectNothingPublished();
    });

    it('Should publish state to roller shutter', async () => {
        const endpoint = zigbeeHerdsman.devices.roller_shutter.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/roller_shutter/set', JSON.stringify({state: 'OPEN'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("genLevelCtrl", "moveToLevel", {"level": "255", "transtime": 0}, {});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/roller_shutter');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({position: 100});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish to MKS-CM-W5', async () => {
        const device = zigbeeHerdsman.devices['MKS-CM-W5'];
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/MKS-CM-W5/l3/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command).toHaveBeenCalledWith("manuSpecificTuyaDimmer", "setData", {data: [1,1], dp: 259, fn: 0, status: 0, transid: 16}, {disableDefaultResponse: true});
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/MKS-CM-W5');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({state_l3: 'ON'});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

    it('Should publish separate genOnOff to GL-S-007ZS when setting state and brightness as bulb doesnt turn on with moveToLevelWithOnOff', async () => {
        // https://github.com/Koenkk/zigbee2mqtt/issues/2757
        jest.useFakeTimers();
        const device = zigbeeHerdsman.devices['GL-S-007ZS'];
        const endpoint = device.getEndpoint(1);
        await MQTT.events.message('zigbee2mqtt/GL-S-007ZS/set', JSON.stringify({state: 'ON', brightness: 20}));
        await flushPromises();
        jest.runAllTimers();
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[0]).toEqual([ 'genOnOff', 'on', {}, {} ]);
        expect(endpoint.command.mock.calls[1]).toEqual([ 'genLevelCtrl', 'moveToLevelWithOnOff', { level: 20, transtime: 0 }, {} ]);
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0]).toEqual([ 'zigbee2mqtt/GL-S-007ZS', '{"state":"ON","brightness":20}', { qos: 0, retain: false }, expect.any(Function)]);
        jest.useRealTimers();
    });

    it('Should log as error when setting property with no defined converter', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const payload = {'brightness_move': 20};
        logger.error.mockClear();
        await MQTT.events.message('zigbee2mqtt/bulb_color/get', JSON.stringify(payload));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(0);
        expect(logger.error).toHaveBeenCalledWith("No converter available for 'get' 'brightness_move' (20)");
    });

    it('Should restore brightness when its turned off without transition and is turned on with', async () => {
        // https://github.com/Koenkk/zigbee-herdsman-converters/issues/1097
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        endpoint.command.mockClear();

        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(1);
        expect(endpoint.command.mock.calls[0]).toEqual(["genOnOff", "on", {}, {}]);

        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({"state": "ON", "brightness": 123}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(2);
        expect(endpoint.command.mock.calls[1]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 123, transtime: 0}, {}]);

        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({"state": "OFF"}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(3);
        expect(endpoint.command.mock.calls[2]).toEqual(["genOnOff", "off", {}, {}]);

        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({"state": "ON", "transition": 1.0}));
        await flushPromises();
        expect(endpoint.command).toHaveBeenCalledTimes(4);
        expect(endpoint.command.mock.calls[3]).toEqual(["genLevelCtrl", "moveToLevelWithOnOff", {level: 123, transtime: 10}, {}]);
    });
});
