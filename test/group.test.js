const Groups = require('../lib/extension/groups');
const settings = require('../lib/util/settings');
const utils = require('./utils');

let groupExtension = null;
let zigbee = null;

describe('Groups', () => {
    beforeEach(() => {
        utils.stubLogger(jest);

        zigbee = {
            publish: jest.fn(),
        };

        groupExtension = new Groups(zigbee, null, null, null);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('Apply group updates add', async () => {
        zigbee.publish.mockClear();
        const from = {};
        const to = {'1': ['1', '2']};
        groupExtension.apply(from, to);
        expect(zigbee.publish).toHaveBeenCalledTimes(2);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '1', 'device', 'genGroups', 'add', 'functional',
            {groupid: '1', groupname: ''}, null, null, expect.any(Function)
        );
        expect(zigbee.publish).toHaveBeenCalledWith(
            '2', 'device', 'genGroups', 'add', 'functional',
            {groupid: '1', groupname: ''}, null, null, expect.any(Function)
        );
    });

    it('Apply group updates remove', async () => {
        zigbee.publish.mockClear();
        const from = {'1': ['1', '2', '3']};
        const to = {'1': ['1']};
        groupExtension.apply(from, to);
        expect(zigbee.publish).toHaveBeenCalledTimes(2);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '3', 'device', 'genGroups', 'remove', 'functional',
            {groupid: '1'}, null, null, expect.any(Function)
        );
        expect(zigbee.publish).toHaveBeenCalledWith(
            '2', 'device', 'genGroups', 'remove', 'functional',
            {groupid: '1'}, null, null, expect.any(Function)
        );
    });

    it('Apply group updates add 1', async () => {
        zigbee.publish.mockClear();
        const from = {'1': ['1']};
        const to = {'1': ['1', '2', '3']};
        groupExtension.apply(from, to);
        expect(zigbee.publish).toHaveBeenCalledTimes(2);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '3', 'device', 'genGroups', 'add', 'functional',
            {groupid: '1', groupname: ''}, null, null, expect.any(Function)
        );
        expect(zigbee.publish).toHaveBeenCalledWith(
            '2', 'device', 'genGroups', 'add', 'functional',
            {groupid: '1', groupname: ''}, null, null, expect.any(Function)
        );
    });

    it('Apply group updates add and remove group', async () => {
        zigbee.publish.mockClear();
        const from = {'1': ['1', '2']};
        const to = {'2': ['1', '2']};
        groupExtension.apply(from, to);
        expect(zigbee.publish).toHaveBeenCalledTimes(4);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '1', 'device', 'genGroups', 'remove', 'functional',
            {groupid: '1'}, null, null, expect.any(Function)
        );
        expect(zigbee.publish).toHaveBeenCalledWith(
            '2', 'device', 'genGroups', 'remove', 'functional',
            {groupid: '1'}, null, null, expect.any(Function)
        );
        expect(zigbee.publish).toHaveBeenCalledWith(
            '1', 'device', 'genGroups', 'add', 'functional',
            {groupid: '2', groupname: ''}, null, null, expect.any(Function)
        );
        expect(zigbee.publish).toHaveBeenCalledWith(
            '2', 'device', 'genGroups', 'add', 'functional',
            {groupid: '2', groupname: ''}, null, null, expect.any(Function)
        );
    });

    it('Apply group updates change 1', async () => {
        zigbee.publish.mockClear();
        const from = {'1': ['1', '4', '2']};
        const to = {'1': ['1', '2', '3']};
        groupExtension.apply(from, to);
        expect(zigbee.publish).toHaveBeenCalledTimes(2);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '3', 'device', 'genGroups', 'add', 'functional',
            {groupid: '1', groupname: ''}, null, null, expect.any(Function)
        );
        expect(zigbee.publish).toHaveBeenCalledWith(
            '4', 'device', 'genGroups', 'remove', 'functional',
            {groupid: '1'}, null, null, expect.any(Function)
        );
    });

    it('Apply group updates change 2', async () => {
        zigbee.publish.mockClear();
        const from = {'1': ['1', '2', '3']};
        const to = {'1': ['3', '1', '2', '4']};
        groupExtension.apply(from, to);
        expect(zigbee.publish).toHaveBeenCalledTimes(1);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '4', 'device', 'genGroups', 'add', 'functional',
            {groupid: '1', groupname: ''}, null, null, expect.any(Function)
        );
    });

    it('Apply group updates change 3', async () => {
        zigbee.publish.mockClear();
        const from = {'1': ['1', '2']};
        const to = {'1': ['3', '1', '4', '2']};
        groupExtension.apply(from, to);
        expect(zigbee.publish).toHaveBeenCalledTimes(2);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '3', 'device', 'genGroups', 'add', 'functional',
            {groupid: '1', groupname: ''}, null, null, expect.any(Function)
        );
        expect(zigbee.publish).toHaveBeenCalledWith(
            '4', 'device', 'genGroups', 'add', 'functional',
            {groupid: '1', groupname: ''}, null, null, expect.any(Function)
        );
    });

    it('Apply group updates change 4', async () => {
        zigbee.publish.mockClear();
        const from = {'1': ['1']};
        const to = {'2': ['3', '1']};
        groupExtension.apply(from, to);
        expect(zigbee.publish).toHaveBeenCalledTimes(3);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '1', 'device', 'genGroups', 'remove', 'functional',
            {groupid: '1'}, null, null, expect.any(Function)
        );
        expect(zigbee.publish).toHaveBeenCalledWith(
            '1', 'device', 'genGroups', 'add', 'functional',
            {groupid: '2', groupname: ''}, null, null, expect.any(Function)
        );
        expect(zigbee.publish).toHaveBeenCalledWith(
            '3', 'device', 'genGroups', 'add', 'functional',
            {groupid: '2', groupname: ''}, null, null, expect.any(Function)
        );
    });

    it('Apply group updates change 5', async () => {
        zigbee.publish.mockClear();
        const from = {'1': ['1']};
        const to = {'1': ['3'], '2': ['3', '1']};
        groupExtension.apply(from, to);
        expect(zigbee.publish).toHaveBeenCalledTimes(4);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '1', 'device', 'genGroups', 'remove', 'functional',
            {groupid: '1'}, null, null, expect.any(Function)
        );
        expect(zigbee.publish).toHaveBeenCalledWith(
            '3', 'device', 'genGroups', 'add', 'functional',
            {groupid: '1', groupname: ''}, null, null, expect.any(Function)
        );
        expect(zigbee.publish).toHaveBeenCalledWith(
            '1', 'device', 'genGroups', 'add', 'functional',
            {groupid: '2', groupname: ''}, null, null, expect.any(Function)
        );
        expect(zigbee.publish).toHaveBeenCalledWith(
            '3', 'device', 'genGroups', 'add', 'functional',
            {groupid: '2', groupname: ''}, null, null, expect.any(Function)
        );
    });

    it('Apply group updates add with postfix', async () => {
        zigbee.publish.mockClear();
        zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral2'});
        zigbee.getEndpoint = (entityID, ep) => ({epId: ep});
        const from = {};
        const to = {'1': ['0x12345689/right']};
        groupExtension.apply(from, to);
        expect(zigbee.publish).toHaveBeenCalledTimes(1);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '0x12345689', 'device', 'genGroups', 'add', 'functional',
            {groupid: '1', groupname: ''}, null, 3, expect.any(Function)
        );
    });

    it('Apply group updates add and remove with postfix', async () => {
        zigbee.publish.mockClear();
        zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral2'});
        zigbee.getEndpoint = (entityID, ep) => ({epId: ep});
        const from = {'1': ['0x12345689/right']};
        const to = {'1': ['0x12345689'], '2': ['0x12345689/left']};
        groupExtension.apply(from, to);
        expect(zigbee.publish).toHaveBeenCalledTimes(3);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '0x12345689', 'device', 'genGroups', 'add', 'functional',
            {groupid: '2', groupname: ''}, null, 2, expect.any(Function)
        );
        expect(zigbee.publish).toHaveBeenCalledWith(
            '0x12345689', 'device', 'genGroups', 'remove', 'functional',
            {groupid: '1'}, null, 3, expect.any(Function)
        );
        expect(zigbee.publish).toHaveBeenCalledWith(
            '0x12345689', 'device', 'genGroups', 'add', 'functional',
            {groupid: '1', groupname: ''}, null, null, expect.any(Function)
        );
    });

    it('Add to group via MQTT', async () => {
        zigbee.publish.mockClear();
        zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral2'});
        zigbee.getEndpoint = (entityID, ep) => ({epId: ep});
        jest.spyOn(settings, 'getGroupIDByFriendlyName').mockReturnValue(1);
        jest.spyOn(settings, 'getIeeeAddrByFriendlyName').mockReturnValue('0x12345689');
        groupExtension.onMQTTMessage('zigbee2mqtt/bridge/group/my_group/add', 'my_switch');
        expect(zigbee.publish).toHaveBeenCalledTimes(1);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '0x12345689', 'device', 'genGroups', 'add', 'functional',
            {groupid: '1', groupname: ''}, null, null, expect.any(Function)
        );
    });

    it('Add to group via MQTT with postfix', async () => {
        zigbee.publish.mockClear();
        zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral2'});
        zigbee.getEndpoint = (entityID, ep) => ({epId: ep});
        jest.spyOn(settings, 'getGroupIDByFriendlyName').mockReturnValue(1);
        jest.spyOn(settings, 'getIeeeAddrByFriendlyName').mockReturnValue('0x12345689');
        groupExtension.onMQTTMessage('zigbee2mqtt/bridge/group/my_group/add', 'my_switch/right');
        expect(zigbee.publish).toHaveBeenCalledTimes(1);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '0x12345689', 'device', 'genGroups', 'add', 'functional',
            {groupid: '1', groupname: ''}, null, 3, expect.any(Function)
        );
    });

    it('Remove from group via MQTT with postfix', async () => {
        zigbee.publish.mockClear();
        zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral2'});
        zigbee.getEndpoint = (entityID, ep) => ({epId: ep});
        jest.spyOn(settings, 'getGroupIDByFriendlyName').mockReturnValue(1);
        jest.spyOn(settings, 'getIeeeAddrByFriendlyName').mockReturnValue('0x12345689');
        groupExtension.onMQTTMessage('zigbee2mqtt/bridge/group/my_group/remove', 'my_switch/left');
        expect(zigbee.publish).toHaveBeenCalledTimes(1);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '0x12345689', 'device', 'genGroups', 'remove', 'functional',
            {groupid: '1'}, null, 2, expect.any(Function)
        );
    });

    it('Remove all group via MQTT', async () => {
        zigbee.publish.mockClear();
        zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral2'});
        zigbee.getEndpoint = (entityID, ep) => ({epId: ep});
        jest.spyOn(settings, 'getIeeeAddrByFriendlyName').mockReturnValue('0x12345689');
        groupExtension.onMQTTMessage('zigbee2mqtt/bridge/group/remove_all', 'my_switch');
        expect(zigbee.publish).toHaveBeenCalledTimes(1);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '0x12345689', 'device', 'genGroups', 'removeAll', 'functional',
            {}, null, null, expect.any(Function)
        );
    });

    it('Remove all group via MQTT deprecated', async () => {
        zigbee.publish.mockClear();
        zigbee.getDevice = () => ({modelId: 'lumi.ctrl_neutral2'});
        zigbee.getEndpoint = (entityID, ep) => ({epId: ep});
        jest.spyOn(settings, 'getGroupIDByFriendlyName').mockReturnValue(1);
        jest.spyOn(settings, 'getIeeeAddrByFriendlyName').mockReturnValue('0x12345689');
        groupExtension.onMQTTMessage('zigbee2mqtt/bridge/group/my_group/remove_all', 'my_switch');
        expect(zigbee.publish).toHaveBeenCalledTimes(1);
        expect(zigbee.publish).toHaveBeenCalledWith(
            '0x12345689', 'device', 'genGroups', 'removeAll', 'functional',
            {}, null, null, expect.any(Function)
        );
    });
});
