const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
zigbeeHerdsman.returnDevices.push('0x00124b00120144ae');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b3');
zigbeeHerdsman.returnDevices.push('0x000b57fffec6a5b2');
zigbeeHerdsman.returnDevices.push('0x0017880104e45542');
const MQTT = require('./stub/mqtt');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);
const settings = require('../lib/util/settings');

describe('Groups', () => {
    let controller;

    beforeEach(() => {
        controller = new Controller();
        Object.values(zigbeeHerdsman.groups).forEach((g) => g.members = []);
        data.writeDefaultConfiguration();
        settings._reRead();
        MQTT.publish.mockClear();
    })

    it('Apply group updates add', async () => {
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false, devices: ['bulb', 'bulb_color']}});
        zigbeeHerdsman.groups.group_1.members.push(zigbeeHerdsman.devices.bulb.getEndpoint(1))
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsman.groups.group_1.members).toStrictEqual([
            zigbeeHerdsman.devices.bulb.getEndpoint(1),
            zigbeeHerdsman.devices.bulb_color.getEndpoint(1)
        ]);
    });

    it('Apply group updates remove', async () => {
        const endpoint = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false,}});
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsman.groups.group_1.members).toStrictEqual([]);
    });

    it('Move to non existing group', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {'3': {friendly_name: 'group_3', retain: false, devices: [device.ieeeAddr]}});
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsman.groups.group_1.members).toStrictEqual([]);
    });

    it('Add non standard endpoint to group with name', async () => {
        const QBKG03LM = zigbeeHerdsman.devices.QBKG03LM;
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false, devices: ['0x0017880104e45542/right']}});
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsman.groups.group_1.members).toStrictEqual([QBKG03LM.getEndpoint(3)]);
    });

    it('Add non standard endpoint to group with number', async () => {
        const QBKG03LM = zigbeeHerdsman.devices.QBKG03LM;
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false, devices: ['wall_switch_double/2']}});
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsman.groups.group_1.members).toStrictEqual([QBKG03LM.getEndpoint(2)]);
    });

    it('Shouldnt crash on non-existing devices', async () => {
        logger.error.mockClear();
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false, devices: ['not_existing_bla']}});
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsman.groups.group_1.members).toStrictEqual([]);
        expect(logger.error).toHaveBeenCalledWith("Cannot find 'not_existing_bla' of group 'group_1'");
    });

    it('Add to group via MQTT', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false, devices: []}});
        expect(group.members.length).toBe(0);
        await controller.start();
        await flushPromises();
        MQTT.events.message('zigbee2mqtt/bridge/group/group_1/add', 'bulb_color');
        await flushPromises();
        expect(group.members).toStrictEqual([endpoint]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([`${device.ieeeAddr}/1`]);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bridge/log", '{"type":"device_group_add","message":{"friendly_name":"bulb_color","group":"group_1"}}', {"retain": false, qos: 0}, expect.any(Function));
    });

    it('Add to group with slashes via MQTT', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups["group/with/slashes"];
        settings.set(['groups'], {'99': {friendly_name: 'group/with/slashes', retain: false, devices: []}});
        expect(group.members.length).toBe(0);
        await controller.start();
        await flushPromises();
        MQTT.events.message('zigbee2mqtt/bridge/group/group/with/slashes/add', 'bulb_color');
        await flushPromises();
        expect(group.members).toStrictEqual([endpoint]);
        expect(settings.getGroup('group/with/slashes').devices).toStrictEqual([`${device.ieeeAddr}/1`]);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bridge/log", '{"type":"device_group_add","message":{"friendly_name":"bulb_color","group":"group/with/slashes"}}', {"retain": false, qos: 0}, expect.any(Function));

        // Test if subscribed to topics with slashes
        expect(MQTT.subscribe).toHaveBeenCalledWith('zigbee2mqtt/bridge/group/+/remove');
        expect(MQTT.subscribe).toHaveBeenCalledWith('zigbee2mqtt/bridge/group/+/+/remove');
        expect(MQTT.subscribe).toHaveBeenCalledWith('zigbee2mqtt/bridge/group/+/+/+/+/+/remove');
        expect(MQTT.subscribe).toHaveBeenCalledWith('zigbee2mqtt/bridge/group/+/+/+/+/+/add');
    });

    it('Add to group via MQTT with postfix', async () => {
        const device = zigbeeHerdsman.devices.QBKG03LM;
        const endpoint = device.getEndpoint(3);
        const group = zigbeeHerdsman.groups.group_1;
        expect(group.members.length).toBe(0);
        await controller.start();
        await flushPromises();
        await MQTT.events.message('zigbee2mqtt/bridge/group/group_1/add', 'wall_switch_double/right');
        await flushPromises();
        expect(group.members).toStrictEqual([endpoint]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([`${device.ieeeAddr}/${endpoint.ID}`]);
    });

    it('Add to group via MQTT with postfix shouldnt add it twice', async () => {
        const device = zigbeeHerdsman.devices.QBKG03LM;
        const endpoint = device.getEndpoint(3);
        const group = zigbeeHerdsman.groups.group_1;
        expect(group.members.length).toBe(0);
        await controller.start();
        await flushPromises();
        await MQTT.events.message('zigbee2mqtt/bridge/group/group_1/add', 'wall_switch_double/right');
        await flushPromises();
        await MQTT.events.message('zigbee2mqtt/bridge/group/group_1/add', '0x0017880104e45542/3');
        await flushPromises();
        expect(group.members).toStrictEqual([endpoint]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([`${device.ieeeAddr}/${endpoint.ID}`]);
    });

    it('Remove from group via MQTT', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false, devices: [device.ieeeAddr]}});
        await controller.start();
        await flushPromises();
        await MQTT.events.message('zigbee2mqtt/bridge/group/group_1/remove', 'bulb_color');
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([]);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bridge/log", '{"type":"device_group_remove","message":{"friendly_name":"bulb_color","group":"group_1"}}', {"retain": false, qos: 0}, expect.any(Function));
    });

    it('Remove from group via MQTT when in zigbee but not in settings', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false, devices: ['dummy']}});
        await controller.start();
        await flushPromises();
        await MQTT.events.message('zigbee2mqtt/bridge/group/group_1/remove', 'bulb_color');
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual(['dummy']);
    });

    it('Remove from group via MQTT with postfix variant 1', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false, devices: [`wall_switch_double/right`]}});
        await controller.start();
        await flushPromises();
        await MQTT.events.message('zigbee2mqtt/bridge/group/group_1/remove', '0x0017880104e45542/3');
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([]);
    });

    it('Remove from group via MQTT with postfix variant 2', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false, devices: [`0x0017880104e45542/right`]}});
        await controller.start();
        await flushPromises();
        await MQTT.events.message('zigbee2mqtt/bridge/group/group_1/remove', 'wall_switch_double/3');
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([]);
    });

    it('Remove from group via MQTT with postfix variant 3', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false, devices: [`wall_switch_double/3`]}});
        await controller.start();
        await flushPromises();
        await MQTT.events.message('zigbee2mqtt/bridge/group/group_1/remove', '0x0017880104e45542/right');
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([]);
    });

    it('Remove from group all', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false, devices: [`wall_switch_double/3`]}});
        await controller.start();
        await flushPromises();
        await MQTT.events.message('zigbee2mqtt/bridge/group/remove_all', '0x0017880104e45542/right');
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([]);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bridge/log", '{"type":"device_group_remove_all","message":{"friendly_name":"wall_switch_double"}}', {"retain": false, qos: 0}, expect.any(Function));
    });

    it('Remove from group all deprecated', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false, devices: [`wall_switch_double/3`]}});
        await controller.start();
        await flushPromises();
        await MQTT.events.message('zigbee2mqtt/bridge/group/group_1/remove_all', '0x0017880104e45542/right');
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([]);
    });

    it('Log when adding to non-existing group', async () => {
        await controller.start();
        await flushPromises();
        logger.error.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/group/group_1_not_existing/add', 'bulb_color');
        await flushPromises();
        expect(logger.error).toHaveBeenCalledWith("Group 'group_1_not_existing' does not exist");
    });

    it('Log when adding to non-existing device', async () => {
        await controller.start();
        await flushPromises();
        logger.error.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/group/group_1/add', 'bulb_color_not_existing');
        await flushPromises();
        expect(logger.error).toHaveBeenCalledWith("Device 'bulb_color_not_existing' does not exist");
    });

    it('Should publish group state change when a device in it changes state', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false, devices: [device.ieeeAddr]}});
        await controller.start();
        await flushPromises();

        MQTT.publish.mockClear();
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint, type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb_color", '{"state":"ON","linkquality":10}', {"retain": false, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/group_1", '{"state":"ON"}', {"retain": false, qos: 0}, expect.any(Function));
    });

    it('Should publish state change of all members when a group changes its state', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false, devices: [device.ieeeAddr]}});
        await controller.start();
        await flushPromises();

        MQTT.publish.mockClear();
        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb_color", '{"state":"ON"}', {"retain": false, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/group_1", '{"state":"ON"}', {"retain": false, qos: 0}, expect.any(Function));
    });

    it('Shouldnt publish group state change when a group is not optimistic', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {'1': {friendly_name: 'group_1', devices: [device.ieeeAddr], optimistic: false, retain: false}});
        await controller.start();
        await flushPromises();

        MQTT.publish.mockClear();
        controller.state.state = {};
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint, type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb_color", '{"state":"ON","linkquality":10}', {"retain": false, qos: 0}, expect.any(Function));
    });

    it('Should publish state change of another group with shared device when a group changes its state', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {
            '1': {friendly_name: 'group_1', retain: false, devices: [device.ieeeAddr]},
            '2': {friendly_name: 'group_2', retain: false, devices: [device.ieeeAddr]},
            '3': {friendly_name: 'group_3', retain: false, devices: []}
        });
        await controller.start();
        await flushPromises();

        MQTT.publish.mockClear();
        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(3);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb_color", '{"state":"ON"}', {"retain": false, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/group_1", '{"state":"ON"}', {"retain": false, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/group_2", '{"state":"ON"}', {"retain": false, qos: 0}, expect.any(Function));
    });

    it('Should not publish state change off if any lights within are still on when changed via device', async () => {
        const device_1 = zigbeeHerdsman.devices.bulb_color;
        const device_2 = zigbeeHerdsman.devices.bulb;
        const endpoint_1 = device_1.getEndpoint(1);
        const endpoint_2 = device_2.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint_1);
        group.members.push(endpoint_2);
        settings.set(['groups'], {
            '1': {friendly_name: 'group_1', devices: [device_1.ieeeAddr, device_2.ieeeAddr], retain: false}
        });
        await controller.start();
        await flushPromises();

        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        MQTT.publish.mockClear();

        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({state: 'OFF'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb_color", '{"state":"OFF"}', {"retain": false, qos: 0}, expect.any(Function));
    });

    it('Should not publish state change off if any lights within are still on when changed via shared group', async () => {
        const device_1 = zigbeeHerdsman.devices.bulb_color;
        const device_2 = zigbeeHerdsman.devices.bulb;
        const endpoint_1 = device_1.getEndpoint(1);
        const endpoint_2 = device_2.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint_1);
        group.members.push(endpoint_2);
        settings.set(['groups'], {
            '1': {friendly_name: 'group_1', devices: [device_1.ieeeAddr, device_2.ieeeAddr], retain: false},
            '2': {friendly_name: 'group_2', retain: false, devices: [device_1.ieeeAddr]},
        });
        await controller.start();
        await flushPromises();

        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        MQTT.publish.mockClear();

        await MQTT.events.message('zigbee2mqtt/group_2/set', JSON.stringify({state: 'OFF'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/group_2", '{"state":"OFF"}', {"retain": false, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb_color", '{"state":"OFF"}', {"retain": false, qos: 0}, expect.any(Function));
    });

    it('Should publish state change off if all lights within turn off', async () => {
        const device_1 = zigbeeHerdsman.devices.bulb_color;
        const device_2 = zigbeeHerdsman.devices.bulb;
        const endpoint_1 = device_1.getEndpoint(1);
        const endpoint_2 = device_2.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint_1);
        group.members.push(endpoint_2);
        settings.set(['groups'], {
            '1': {friendly_name: 'group_1', devices: [device_1.ieeeAddr, device_2.ieeeAddr], retain: false}
        });
        await controller.start();
        await flushPromises();

        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        MQTT.publish.mockClear();

        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({state: 'OFF'}));
        await MQTT.events.message('zigbee2mqtt/bulb/set', JSON.stringify({state: 'OFF'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(3);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb_color", '{"state":"OFF"}', {"retain": false, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb", '{"state":"OFF","brightness":50,"color_temp":370,"linkquality":99}', {"retain": true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/group_1", '{"state":"OFF","brightness":50,"color_temp":370}', {"retain": false, qos: 0}, expect.any(Function));
    });

    it('Should publish state change off even when missing current state', async () => {
        const device_1 = zigbeeHerdsman.devices.bulb_color;
        const device_2 = zigbeeHerdsman.devices.bulb;
        const endpoint_1 = device_1.getEndpoint(1);
        const endpoint_2 = device_2.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint_1);
        group.members.push(endpoint_2);
        settings.set(['groups'], {
            '1': {friendly_name: 'group_1', devices: [device_1.ieeeAddr, device_2.ieeeAddr], retain: false}
        });
        await controller.start();
        await flushPromises();

        await MQTT.events.message('zigbee2mqtt/group_1/set', JSON.stringify({state: 'ON'}));
        await flushPromises();
        MQTT.publish.mockClear();
        controller.state.state = {};

        await MQTT.events.message('zigbee2mqtt/bulb_color/set', JSON.stringify({state: 'OFF'}));
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb_color", '{"state":"OFF"}', {"retain": false, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/group_1", '{"state":"OFF"}', {"retain": false, qos: 0}, expect.any(Function));
    });
});
