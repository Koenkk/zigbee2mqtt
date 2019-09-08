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
    })

    it('Apply group updates add', async () => {
        settings.set(['groups'], {'1': {friendly_name: 'group_1', devices: ['bulb', 'bulb_color']}});
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
        settings.set(['groups'], {'1': {friendly_name: 'group_1'}});
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsman.groups.group_1.members).toStrictEqual([]);
    });

    it('Move to non existing group', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {'3': {friendly_name: 'group_3', devices: [device.ieeeAddr]}});
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsman.groups.group_1.members).toStrictEqual([]);
    });

    it('Add non standard endpoint to group with name', async () => {
        const QBKG03LM = zigbeeHerdsman.devices.QBKG03LM;
        settings.set(['groups'], {'1': {friendly_name: 'group_1', devices: ['0x0017880104e45542/right']}});
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsman.groups.group_1.members).toStrictEqual([QBKG03LM.getEndpoint(3)]);
    });

    it('Add non standard endpoint to group with number', async () => {
        const QBKG03LM = zigbeeHerdsman.devices.QBKG03LM;
        settings.set(['groups'], {'1': {friendly_name: 'group_1', devices: ['wall_switch_double/2']}});
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsman.groups.group_1.members).toStrictEqual([QBKG03LM.getEndpoint(2)]);
    });

    it('Shouldnt crash on non-existing devices', async () => {
        logger.error.mockClear();
        settings.set(['groups'], {'1': {friendly_name: 'group_1', devices: ['not_existing_bla']}});
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsman.groups.group_1.members).toStrictEqual([]);
        expect(logger.error).toHaveBeenCalledWith("Cannot find 'not_existing_bla' of group 'group_1'");
    });

    it('Add to group via MQTT', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        settings.set(['groups'], {'1': {friendly_name: 'group_1', devices: []}});
        expect(group.members.length).toBe(0);
        await controller.start();
        await flushPromises();
        MQTT.events.message('zigbee2mqtt/bridge/group/group_1/add', 'bulb_color');
        await flushPromises();
        expect(group.members).toStrictEqual([endpoint]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([`${device.ieeeAddr}/1`]);
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
        settings.set(['groups'], {'1': {friendly_name: 'group_1', devices: [device.ieeeAddr]}});
        await controller.start();
        await flushPromises();
        await MQTT.events.message('zigbee2mqtt/bridge/group/group_1/remove', 'bulb_color');
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([]);
    });

    it('Remove from group via MQTT when in zigbee but not in settings', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {'1': {friendly_name: 'group_1', devices: ['dummy']}});
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
        settings.set(['groups'], {'1': {friendly_name: 'group_1', devices: [`wall_switch_double/right`]}});
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
        settings.set(['groups'], {'1': {friendly_name: 'group_1', devices: [`0x0017880104e45542/right`]}});
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
        settings.set(['groups'], {'1': {friendly_name: 'group_1', devices: [`wall_switch_double/3`]}});
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
        settings.set(['groups'], {'1': {friendly_name: 'group_1', devices: [`wall_switch_double/3`]}});
        await controller.start();
        await flushPromises();
        await MQTT.events.message('zigbee2mqtt/bridge/group/remove_all', '0x0017880104e45542/right');
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([]);
    });

    it('Remove from group all deprecated', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = zigbeeHerdsman.groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {'1': {friendly_name: 'group_1', devices: [`wall_switch_double/3`]}});
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
});
