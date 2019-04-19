const Groups = require('../lib/extension/groups');

let groupExtension = null;
let zigbee = null;

describe('Groups', () => {
    beforeEach(() => {
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
        groupExtension.applyGroups(from, to);
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
        groupExtension.applyGroups(from, to);
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
        groupExtension.applyGroups(from, to);
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
        groupExtension.applyGroups(from, to);
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
        groupExtension.applyGroups(from, to);
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
        groupExtension.applyGroups(from, to);
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
        groupExtension.applyGroups(from, to);
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
        groupExtension.applyGroups(from, to);
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
        groupExtension.applyGroups(from, to);
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
});
