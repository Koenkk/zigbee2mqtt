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

    beforeAll(async () => {
        controller = new Controller();
    });

    beforeEach(() => {
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

    it('Add non standard endpoint to group', async () => {
        const QBKG03LM = zigbeeHerdsman.devices.QBKG03LM;
        settings.set(['groups'], {'1': {friendly_name: 'group_1', devices: ['0x0017880104e45542/right']}});
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsman.groups.group_1.members).toStrictEqual([QBKG03LM.getEndpoint(3)]);
    });

    it('Shouldnt crash on non-existing devices', async () => {
        logger.error.mockClear();
        settings.set(['groups'], {'1': {friendly_name: 'group_1', devices: ['not_existing_bla']}});
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsman.groups.group_1.members).toStrictEqual([]);
        expect(logger.error).toHaveBeenCalledWith("Cannot find 'not_existing_bla' of group 'group_1'");
    });




    // it('Apply group updates add with postfix', async () => {
    //     zigbee.publish.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral2'});
    //     zigbee.getEndpoint = (entityID, ep) => ({epId: ep});
    //     const from = {};
    //     const to = {'1': ['0x12345689/right']};
    //     groupExtension.apply(from, to);
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenCalledWith(
    //         '0x12345689', 'device', 'genGroups', 'add', 'functional',
    //         {groupid: '1', groupname: ''}, null, 3, expect.any(Function)
    //     );
    // });

    // it('Apply group updates add and remove with postfix', async () => {
    //     zigbee.publish.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral2'});
    //     zigbee.getEndpoint = (entityID, ep) => ({epId: ep});
    //     const from = {'1': ['0x12345689/right']};
    //     const to = {'1': ['0x12345689'], '2': ['0x12345689/left']};
    //     groupExtension.apply(from, to);
    //     expect(zigbee.publish).toHaveBeenCalledTimes(3);
    //     expect(zigbee.publish).toHaveBeenCalledWith(
    //         '0x12345689', 'device', 'genGroups', 'add', 'functional',
    //         {groupid: '2', groupname: ''}, null, 2, expect.any(Function)
    //     );
    //     expect(zigbee.publish).toHaveBeenCalledWith(
    //         '0x12345689', 'device', 'genGroups', 'remove', 'functional',
    //         {groupid: '1'}, null, 3, expect.any(Function)
    //     );
    //     expect(zigbee.publish).toHaveBeenCalledWith(
    //         '0x12345689', 'device', 'genGroups', 'add', 'functional',
    //         {groupid: '1', groupname: ''}, null, null, expect.any(Function)
    //     );
    // });

    // it('Add to group via MQTT', async () => {
    //     zigbee.publish.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral2'});
    //     zigbee.getEndpoint = (entityID, ep) => ({epId: ep});
    //     jest.spyOn(settings, 'getGroupIDByFriendlyName').mockReturnValue(1);
    //     jest.spyOn(settings, 'getIeeeAddrByFriendlyName').mockReturnValue('0x12345689');
    //     groupExtension.onMQTTMessage('zigbee2mqtt/bridge/group/my_group/add', 'my_switch');
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenCalledWith(
    //         '0x12345689', 'device', 'genGroups', 'add', 'functional',
    //         {groupid: '1', groupname: ''}, null, null, expect.any(Function)
    //     );
    // });

    // it('Add to group via MQTT with postfix', async () => {
    //     zigbee.publish.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral2'});
    //     zigbee.getEndpoint = (entityID, ep) => ({epId: ep});
    //     jest.spyOn(settings, 'getGroupIDByFriendlyName').mockReturnValue(1);
    //     jest.spyOn(settings, 'getIeeeAddrByFriendlyName').mockReturnValue('0x12345689');
    //     groupExtension.onMQTTMessage('zigbee2mqtt/bridge/group/my_group/add', 'my_switch/right');
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenCalledWith(
    //         '0x12345689', 'device', 'genGroups', 'add', 'functional',
    //         {groupid: '1', groupname: ''}, null, 3, expect.any(Function)
    //     );
    // });

    // it('Remove from group via MQTT with postfix', async () => {
    //     zigbee.publish.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral2'});
    //     zigbee.getEndpoint = (entityID, ep) => ({epId: ep});
    //     jest.spyOn(settings, 'getGroupIDByFriendlyName').mockReturnValue(1);
    //     jest.spyOn(settings, 'getIeeeAddrByFriendlyName').mockReturnValue('0x12345689');
    //     groupExtension.onMQTTMessage('zigbee2mqtt/bridge/group/my_group/remove', 'my_switch/left');
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenCalledWith(
    //         '0x12345689', 'device', 'genGroups', 'remove', 'functional',
    //         {groupid: '1'}, null, 2, expect.any(Function)
    //     );
    // });

    // it('Remove all group via MQTT', async () => {
    //     zigbee.publish.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral2'});
    //     zigbee.getEndpoint = (entityID, ep) => ({epId: ep});
    //     jest.spyOn(settings, 'getIeeeAddrByFriendlyName').mockReturnValue('0x12345689');
    //     groupExtension.onMQTTMessage('zigbee2mqtt/bridge/group/remove_all', 'my_switch');
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenCalledWith(
    //         '0x12345689', 'device', 'genGroups', 'removeAll', 'functional',
    //         {}, null, null, expect.any(Function)
    //     );
    // });

    // it('Remove all group via MQTT deprecated', async () => {
    //     zigbee.publish.mockClear();
    //     zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral2'});
    //     zigbee.getEndpoint = (entityID, ep) => ({epId: ep});
    //     jest.spyOn(settings, 'getGroupIDByFriendlyName').mockReturnValue(1);
    //     jest.spyOn(settings, 'getIeeeAddrByFriendlyName').mockReturnValue('0x12345689');
    //     groupExtension.onMQTTMessage('zigbee2mqtt/bridge/group/my_group/remove_all', 'my_switch');
    //     expect(zigbee.publish).toHaveBeenCalledTimes(1);
    //     expect(zigbee.publish).toHaveBeenCalledWith(
    //         '0x12345689', 'device', 'genGroups', 'removeAll', 'functional',
    //         {}, null, null, expect.any(Function)
    //     );
    // });
});
