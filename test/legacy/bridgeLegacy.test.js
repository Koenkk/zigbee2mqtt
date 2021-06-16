const data = require('../stub/data');
const logger = require('../stub/logger');
const zigbeeHerdsman = require('../stub/zigbeeHerdsman');
const MQTT = require('../stub/mqtt');
const stringify = require('json-stable-stringify-without-jsonify');
const path = require('path');
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
const settings = require('../../lib/util/settings');
const Controller = require('../../lib/controller');
const flushPromises = () => new Promise(setImmediate);


describe('Bridge legacy', () => {
    let controller;

    beforeAll(async () => {
        this.version = await require('../../lib/util/utils').getZigbee2mqttVersion();
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
    })

    beforeEach(() => {
        data.writeDefaultConfiguration();
        settings.reRead();
        data.writeDefaultState();
        logger.info.mockClear();
        logger.warn.mockClear();
    });

    it('Should publish bridge configuration on startup', async () => {
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/config',
          stringify({"version":this.version.version,"commit":this.version.commitHash,"coordinator":{"type":"z-Stack","meta":{"version":1, "revision": 20190425}},"network":{"panID":5674,"extendedPanID":[0,11,22],"channel":15},"log_level":'info',"permit_join":false}),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should allow to set elapsed', async () => {
        MQTT.events.message('zigbee2mqtt/bridge/config/elapsed', 'true');
        await flushPromises();
        expect(settings.get().advanced.elapsed).toBe(true);
        MQTT.events.message('zigbee2mqtt/bridge/config/elapsed', 'false');
        await flushPromises();
        expect(settings.get().advanced.elapsed).toBe(false);
        MQTT.events.message('zigbee2mqtt/bridge/config/elapsed', 'wrong');
        await flushPromises();
        expect(settings.get().advanced.elapsed).toBe(false);
    });

    it('Should allow whitelist', async () => {
        const bulb_color = zigbeeHerdsman.devices.bulb_color;
        const bulb = zigbeeHerdsman.devices.bulb;
        expect(settings.get().whitelist).toStrictEqual([]);
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/whitelist', 'bulb_color');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/log',
          stringify({type: "device_whitelisted", "message": {friendly_name: "bulb_color"}}),
          { retain: false, qos: 0 },
          expect.any(Function)
        );

        MQTT.publish.mockClear()
        expect(settings.get().whitelist).toStrictEqual([bulb_color.ieeeAddr]);
        MQTT.events.message('zigbee2mqtt/bridge/config/whitelist', 'bulb');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/log',
          stringify({type: "device_whitelisted", "message": {friendly_name: "bulb"}}),
          { retain: false, qos: 0 },
          expect.any(Function)
        );

        MQTT.publish.mockClear()
        expect(settings.get().whitelist).toStrictEqual([bulb_color.ieeeAddr, bulb.ieeeAddr]);
        MQTT.events.message('zigbee2mqtt/bridge/config/whitelist', 'bulb');
        await flushPromises();
        expect(settings.get().whitelist).toStrictEqual([bulb_color.ieeeAddr, bulb.ieeeAddr]);
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Should allow changing device options', async () => {
        const bulb_color = zigbeeHerdsman.devices.bulb_color;
        expect(settings.getDevice('bulb_color')).toStrictEqual(
            {"ID": "0x000b57fffec6a5b3", "friendlyName": "bulb_color", "friendly_name": "bulb_color", "retain": false}
        );
        MQTT.events.message('zigbee2mqtt/bridge/config/device_options', stringify({friendly_name: 'bulb_color', options: {retain: true}}));
        await flushPromises();
        expect(settings.getDevice('bulb_color')).toStrictEqual(
            {"ID": "0x000b57fffec6a5b3", "friendlyName": "bulb_color", "friendly_name": "bulb_color", "retain": true}
        );
        MQTT.events.message('zigbee2mqtt/bridge/config/device_options', stringify({friendly_name: 'bulb_color', optionswrong: {retain: true}}));
        await flushPromises();
        expect(settings.getDevice('bulb_color')).toStrictEqual(
            {"ID": "0x000b57fffec6a5b3", "friendlyName": "bulb_color", "friendly_name": "bulb_color", "retain": true}
        );
        MQTT.events.message('zigbee2mqtt/bridge/config/device_options', "{friendly_name: 'bulb_color'malformed: {retain: true}}");
        await flushPromises();
        expect(settings.getDevice('bulb_color')).toStrictEqual(
            {"ID": "0x000b57fffec6a5b3", "friendlyName": "bulb_color", "friendly_name": "bulb_color", "retain": true}
        );
        MQTT.events.message('zigbee2mqtt/bridge/config/device_options', stringify({friendly_name: 'bulb_color', options: {random_setting: true}}));
        await flushPromises();
        expect(settings.getDevice('bulb_color')).toStrictEqual(
            {"ID": "0x000b57fffec6a5b3", "friendlyName": "bulb_color", "friendly_name": "bulb_color", "random_setting": true, "retain": true}
        );
        MQTT.events.message('zigbee2mqtt/bridge/config/device_options', stringify({friendly_name: 'bulb_color', options: {options: {random_1: true}}}));
        await flushPromises();
        expect(settings.getDevice('bulb_color')).toStrictEqual(
            {"ID": "0x000b57fffec6a5b3", "friendlyName": "bulb_color", "friendly_name": "bulb_color", "random_setting": true, "retain": true, options: {random_1: true}}
        );
        MQTT.events.message('zigbee2mqtt/bridge/config/device_options', stringify({friendly_name: 'bulb_color', options: {options: {random_2: false}}}));
        await flushPromises();
        expect(settings.getDevice('bulb_color')).toStrictEqual(
            {"ID": "0x000b57fffec6a5b3", "friendlyName": "bulb_color", "friendly_name": "bulb_color", "random_setting": true, "retain": true, options: {random_1: true, random_2: false}}
        );
    });

    it('Should allow permit join', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/permit_join', 'true');
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(true, undefined, undefined);
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/permit_join', 'false');
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(false, undefined, undefined);
    });

    it('Should allow to reset', async () => {
        zigbeeHerdsman.reset.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/reset', '');
        await flushPromises();
        expect(zigbeeHerdsman.reset).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.reset).toHaveBeenCalledWith('soft');
        zigbeeHerdsman.reset.mockImplementationOnce(() => {throw new Error('')});
        MQTT.events.message('zigbee2mqtt/bridge/config/reset', '');
        await flushPromises();
        expect(zigbeeHerdsman.reset).toHaveBeenCalledTimes(2);
        expect(zigbeeHerdsman.reset.mock.calls[1][0]).toBe('soft');
    });

    it('Should allow to set last_seen', async () => {
        MQTT.events.message('zigbee2mqtt/bridge/config/last_seen', 'ISO_8601');
        await flushPromises();
        expect(settings.get().advanced.last_seen).toBe('ISO_8601');
        MQTT.events.message('zigbee2mqtt/bridge/config/last_seen', 'disable');
        await flushPromises();
        expect(settings.get().advanced.last_seen).toBe('disable');
        MQTT.events.message('zigbee2mqtt/bridge/config/last_seen', 'notvalid');
        await flushPromises();
        expect(settings.get().advanced.last_seen).toBe('disable');
    });

    it('Should allow to set log_level', async () => {
        MQTT.events.message('zigbee2mqtt/bridge/config/log_level', 'debug');
        await flushPromises();
        expect(logger.getLevel()).toBe('debug');
        MQTT.events.message('zigbee2mqtt/bridge/config/log_level', 'error');
        await flushPromises();
        expect(logger.getLevel()).toBe('error');
        MQTT.events.message('zigbee2mqtt/bridge/config/log_level', 'notvalid');
        await flushPromises();
        expect(logger.getLevel()).toBe('error');
    });

    it('Should allow to get devices', async () => {
        const now = Date.now;
        Date.now = () => 100;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/devices/get', '');
        await flushPromises();
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/config/devices');
        const payload = JSON.parse(MQTT.publish.mock.calls[0][1]);
        expect(payload.length).toStrictEqual(Object.values(zigbeeHerdsman.devices).length);
        expect(payload[1]).toStrictEqual({"ieeeAddr": "0x00124b00120144ae", "type": "Coordinator", "dateCode": "20190425", "friendly_name": "Coordinator", networkAddress: 0, softwareBuildID: "z-Stack", lastSeen: 100});
        expect(payload[2]).toStrictEqual({"dateCode": null, "friendly_name": "bulb", "ieeeAddr": "0x000b57fffec6a5b2", "lastSeen": 1000, "manufacturerID": 4476, "model": "LED1545G12", "modelID": "TRADFRI bulb E27 WS opal 980lm", "networkAddress": 40369, "powerSource": "Mains (single phase)", "softwareBuildID": null, "type": "Router", "description": "TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white", "vendor": "IKEA"});
        Date.now = now;
    });

    it('Should allow to get groups', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/groups', '');
        await flushPromises();
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        const payload = JSON.parse(MQTT.publish.mock.calls[0][1]);
        expect(payload).toStrictEqual({"message":[{"ID":1,"devices":[],"friendly_name":"group_1","retain":false},{"ID":2,"devices":[],"friendly_name":"group_2","retain":false},{"ID":9,"devices":["bulb_color_2","bulb_2","wall_switch_double/right"],"friendly_name":"ha_discovery_group"},{"ID":11,"devices":["bulb_2"],"friendly_name":"group_with_tradfri","retain":false},{"ID":12,"devices":["TS0601_thermostat"],"friendly_name":"thermostat_group","retain":false},{"ID":14,"devices":["power_plug"],"friendly_name":"switch_group","retain":false},{"ID":21,"devices":["GLEDOPTO_2ID/cct"],"friendly_name":"gledopto_group"},{"ID":15071,"devices":["bulb_color_2","bulb_2"],"friendly_name":"group_tradfri_remote","retain":false}],"type":"groups"});
    });

    it('Should allow rename devices', async () => {
        const bulb_color2 = {"ID": "0x000b57fffec6a5b3", "friendlyName": "bulb_color2", "friendly_name": "bulb_color2", "retain": false};
        MQTT.publish.mockClear();
        expect(settings.getDevice('bulb_color')).toStrictEqual({"ID": "0x000b57fffec6a5b3", "friendlyName": "bulb_color", "friendly_name": "bulb_color", "retain": false});
        MQTT.events.message('zigbee2mqtt/bridge/config/rename', stringify({old: 'bulb_color', new: 'bulb_color2'}));
        await flushPromises();
        expect(settings.getDevice('bulb_color')).toStrictEqual(null);
        expect(settings.getDevice('bulb_color2')).toStrictEqual(bulb_color2);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/log',
            stringify({type: 'device_renamed', message: {from: 'bulb_color', to: 'bulb_color2'}}),
            {qos: 0, retain: false},
            expect.any(Function)
        );

        MQTT.events.message('zigbee2mqtt/bridge/config/rename', stringify({old: 'bulb_color2', newmalformed: 'bulb_color3'}));
        await flushPromises();
        expect(settings.getDevice('bulb_color2')).toStrictEqual(bulb_color2);

        MQTT.events.message('zigbee2mqtt/bridge/config/rename', "{old: 'bulb_color2'newmalformed: 'bulb_color3'}");
        await flushPromises();
        expect(settings.getDevice('bulb_color2')).toStrictEqual(bulb_color2);

        MQTT.events.message('zigbee2mqtt/bridge/config/rename', stringify({old: 'bulb_color', new: 'bulb_color3'}));
        await flushPromises();
        expect(settings.getDevice('bulb_color2')).toStrictEqual(bulb_color2);
    });

    it('Should allow rename groups', async () => {
        MQTT.publish.mockClear();
        expect(settings.getGroup(1)).toStrictEqual({"ID": 1, devices: [], friendlyName: "group_1", "friendly_name": "group_1", retain: false});
        MQTT.events.message('zigbee2mqtt/bridge/config/rename', stringify({old: 'group_1', new: 'group_1_renamed'}));
        await flushPromises();
        expect(settings.getGroup(1)).toStrictEqual({"ID": 1, devices: [], friendlyName: "group_1_renamed", "friendly_name": "group_1_renamed", retain: false});
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/log',
            stringify({type: 'group_renamed', message: {from: 'group_1', to: 'group_1_renamed'}}),
            {qos: 0, retain: false},
            expect.any(Function)
        );
    });

    it('Should allow to rename last joined device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const payload = {device};
        await zigbeeHerdsman.events.deviceJoined(payload);
        await flushPromises();
        expect(settings.getDevice('0x000b57fffec6a5b2').friendlyName).toStrictEqual('bulb');
        MQTT.events.message('zigbee2mqtt/bridge/config/rename_last', 'bulb_new_name');
        await flushPromises();
        expect(settings.getDevice('0x000b57fffec6a5b2').friendlyName).toStrictEqual('bulb_new_name');
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/log',
            stringify({type: 'device_renamed', message: {from: 'bulb', to: 'bulb_new_name'}}),
            {qos: 0, retain: false},
            expect.any(Function)
        );
    });

    it('Shouldnt rename when no device has been joined', async () => {
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        expect(settings.getDevice('0x000b57fffec6a5b2').friendlyName).toStrictEqual('bulb');
        MQTT.events.message('zigbee2mqtt/bridge/config/rename_last', 'bulb_new_name');
        await flushPromises();
        expect(settings.getDevice('0x000b57fffec6a5b2').friendlyName).toStrictEqual('bulb');
    });

    it('Should allow to add groups', async () => {
        zigbeeHerdsman.createGroup.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/add_group', 'new_group');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/log',
            stringify({type: 'group_added', message: 'new_group'}),
            {qos: 0, retain: false},
            expect.any(Function)
        );
        expect(settings.getGroup('new_group')).toStrictEqual({"ID": 3, "friendlyName": "new_group", "friendly_name": "new_group", devices: []});
        expect(zigbeeHerdsman.createGroup).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.createGroup).toHaveBeenCalledWith(3);
    });

    it('Should allow to add groups with json', async () => {
        zigbeeHerdsman.createGroup.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/add_group', '{"friendly_name": "new_group"}');
        await flushPromises();
        expect(settings.getGroup('new_group')).toStrictEqual({"ID": 3, "friendlyName": "new_group", "friendly_name": "new_group", devices: []});
        expect(zigbeeHerdsman.createGroup).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.createGroup).toHaveBeenCalledWith(3);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/log',
            stringify({type: 'group_added', message: 'new_group'}),
            {qos: 0, retain: false},
            expect.any(Function)
        );
    });

    it('Should allow to add groups with json specifying id', async () => {
        zigbeeHerdsman.createGroup.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/add_group', '{"friendly_name": "new_group", "id": 42}');
        await flushPromises();
        expect(settings.getGroup('new_group')).toStrictEqual({"ID": 42, "friendlyName": "new_group", "friendly_name": "new_group", devices: []});
        expect(zigbeeHerdsman.createGroup).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.createGroup).toHaveBeenCalledWith(42);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/log',
            stringify({type: 'group_added', message: 'new_group'}),
            {qos: 0, retain: false},
            expect.any(Function)
        );
    });

    it('Should allow to add groups with json specifying only id', async () => {
        zigbeeHerdsman.createGroup.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/add_group', '{"id": 42}');
        await flushPromises();
        expect(settings.getGroup('group_42')).toStrictEqual({"ID": 42, "friendlyName": "group_42", "friendly_name": "group_42", devices: []});
        expect(zigbeeHerdsman.createGroup).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.createGroup).toHaveBeenCalledWith(42)
    });

    it('Should allow to remove groups', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        MQTT.events.message('zigbee2mqtt/bridge/config/remove_group', 'group_1');
        await flushPromises();
        expect(settings.getGroup('to_be_removed')).toStrictEqual(null);
        expect(group.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/log',
            stringify({type: 'group_removed', message: 'group_1'}),
            {qos: 0, retain: false},
            expect.any(Function)
        );
    });

    it('Should allow to force remove groups', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        MQTT.events.message('zigbee2mqtt/bridge/config/force_remove_group', 'group_1');
        await flushPromises();
        expect(settings.getGroup('to_be_removed')).toStrictEqual(null);
        expect(group.removeFromDatabase).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/log',
            stringify({type: 'group_removed', message: 'group_1'}),
            {qos: 0, retain: false},
            expect.any(Function)
        );
    });

    it('Shouldnt allow add groups without id or friendly_name in json', async () => {
        zigbeeHerdsman.createGroup.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/add_group', '{}');
        await flushPromises();
        expect(logger.error).toHaveBeenCalledWith('Failed to add group, missing friendly_name!');
    });

    it('Shouldnt do anything on unsupported topic', async () => {
        await flushPromises();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/not_supported', 'to_be_removed');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Should allow to remove device', async () => {
        controller.state.state = {'0x000b57fffec6a5b3': {brightness: 100}};
        const device = zigbeeHerdsman.devices.bulb_color;
        device.removeFromNetwork.mockClear();
        expect(settings.get().ban.length).toBe(0);
        await flushPromises();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/remove', 'bulb_color');
        await flushPromises();
        expect(device.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(controller.state[device.ieeeAddr]).toBeUndefined();
        expect(settings.getDevice('bulb_color')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/log',
            stringify({type: 'device_removed', message: 'bulb_color'}),
            {qos: 0, retain: false},
            expect.any(Function)
        );
        expect(controller.state.state).toStrictEqual({});
        expect(settings.get().ban.length).toBe(0);
    });

    it('Should allow to force remove device', async () => {
        controller.state.state = {'0x000b57fffec6a5b3': {brightness: 100}};
        const device = zigbeeHerdsman.devices.bulb_color;
        device.removeFromDatabase.mockClear();
        expect(settings.get().ban.length).toBe(0);
        await flushPromises();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/force_remove', 'bulb_color');
        await flushPromises();
        expect(device.removeFromDatabase).toHaveBeenCalledTimes(1);
        expect(controller.state[device.ieeeAddr]).toBeUndefined();
        expect(settings.getDevice('bulb_color')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/log',
            stringify({type: 'device_force_removed', message: 'bulb_color'}),
            {qos: 0, retain: false},
            expect.any(Function)
        );
        expect(controller.state.state).toStrictEqual({});
        expect(settings.get().ban.length).toBe(0);
    });

    it('Should allow to ban device', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        device.removeFromNetwork.mockClear();
        expect(settings.get().ban.length).toBe(0);
        await flushPromises();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/ban', 'bulb_color');
        await flushPromises();
        expect(device.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(controller.state[device.ieeeAddr]).toBeUndefined();
        expect(settings.getDevice('bulb_color')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/log',
            stringify({type: 'device_banned', message: 'bulb_color'}),
            {qos: 0, retain: false},
            expect.any(Function)
        );
        expect(settings.get().ban).toStrictEqual(['0x000b57fffec6a5b3']);
    });

    it('Shouldnt crash when removing non-existing device', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/remove', 'not_existing_123');
        await flushPromises();
        expect(logger.error).toHaveBeenCalledWith(`Cannot remove, device 'not_existing_123' does not exist`);
    });

    it('Should handle when remove fails', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        device.removeFromNetwork.mockClear();
        device.removeFromNetwork.mockImplementationOnce(() => {throw new Error('')})
        await flushPromises();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/remove', 'bulb_color');
        await flushPromises();
        expect(device.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(settings.getDevice('bulb_color')).toStrictEqual({"ID": "0x000b57fffec6a5b3", "friendlyName": "bulb_color", "friendly_name": "bulb_color", "retain": false})
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
    });

    it('Should handle when ban fails', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        device.removeFromNetwork.mockClear();
        device.removeFromNetwork.mockImplementationOnce(() => {throw new Error('')})
        await flushPromises();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/config/ban', 'bulb_color');
        await flushPromises();
        expect(device.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(settings.getDevice('bulb_color')).toStrictEqual({"ID": "0x000b57fffec6a5b3", "friendlyName": "bulb_color", "friendly_name": "bulb_color", "retain": false})
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
    });

    it('Should allow to touchlink factory reset (OK)', async () => {
        zigbeeHerdsman.touchlinkFactoryResetFirst.mockClear();

        zigbeeHerdsman.touchlinkFactoryResetFirst.mockReturnValueOnce(true);
        MQTT.events.message('zigbee2mqtt/bridge/config/touchlink/factory_reset', '');
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkFactoryResetFirst).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith('Successfully factory reset device through Touchlink');
    });

    it('Should allow to touchlink factory reset (FAILS)', async () => {
        zigbeeHerdsman.touchlinkFactoryResetFirst.mockClear();

        zigbeeHerdsman.touchlinkFactoryResetFirst.mockReturnValueOnce(false);
        MQTT.events.message('zigbee2mqtt/bridge/config/touchlink/factory_reset', '');
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkFactoryResetFirst).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith('Failed to factory reset device through Touchlink');
    });
});
