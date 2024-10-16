import * as data from '../mocks/data';
import {mockLogger} from '../mocks/logger';
import {mockMQTT, events as mockMQTTEvents} from '../mocks/mqtt';
import {flushPromises} from '../mocks/utils';
import {devices, groups, events as mockZHEvents, returnDevices} from '../mocks/zigbeeHerdsman';

import stringify from 'json-stable-stringify-without-jsonify';

import {toZigbee as zhcToZigbee} from 'zigbee-herdsman-converters';

import {Controller} from '../../lib/controller';
import * as settings from '../../lib/util/settings';

returnDevices.push(
    devices.coordinator.ieeeAddr,
    devices.bulb_color.ieeeAddr,
    devices.bulb.ieeeAddr,
    devices.QBKG03LM.ieeeAddr,
    devices.bulb_color_2.ieeeAddr,
    devices.bulb_2.ieeeAddr,
    devices.GLEDOPTO_2ID.ieeeAddr,
);

describe('Extension: Groups', () => {
    let controller: Controller;

    const resetExtension = async (): Promise<void> => {
        await controller.enableDisableExtension(false, 'Groups');
        await controller.enableDisableExtension(true, 'Groups');
    };

    beforeAll(async () => {
        jest.useFakeTimers();
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
    });

    afterAll(async () => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        Object.values(groups).forEach((g) => (g.members = []));
        data.writeDefaultConfiguration();
        settings.reRead();
        mockMQTT.publish.mockClear();
        groups.gledopto_group.command.mockClear();
        zhcToZigbee.__clearStore__();
        // @ts-expect-error private
        controller.state.state = {};
    });

    it('Apply group updates add', async () => {
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: ['bulb', 'bulb_color']}});
        groups.group_1.members.push(devices.bulb.getEndpoint(1)!);
        await resetExtension();
        expect(groups.group_1.members).toStrictEqual([devices.bulb.getEndpoint(1), devices.bulb_color.getEndpoint(1)]);
    });

    it('Apply group updates remove', async () => {
        const endpoint = devices.bulb_color.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false}});
        await resetExtension();
        expect(groups.group_1.members).toStrictEqual([]);
    });

    it('Apply group updates remove handle fail', async () => {
        const endpoint = devices.bulb_color.getEndpoint(1)!;
        endpoint.removeFromGroup.mockImplementationOnce(() => {
            throw new Error('failed!');
        });
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false}});
        mockLogger.error.mockClear();
        await resetExtension();
        expect(mockLogger.error).toHaveBeenCalledWith(`Failed to remove 'bulb_color' from 'group_1'`);
        expect(groups.group_1.members).toStrictEqual([endpoint]);
    });

    it('Move to non existing group', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {3: {friendly_name: 'group_3', retain: false, devices: [device.ieeeAddr]}});
        await resetExtension();
        expect(groups.group_1.members).toStrictEqual([]);
    });

    it('Add non standard endpoint to group with name', async () => {
        const QBKG03LM = devices.QBKG03LM;
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: ['0x0017880104e45542/right']}});
        await resetExtension();
        expect(groups.group_1.members).toStrictEqual([QBKG03LM.getEndpoint(3)]);
    });

    it('Add non standard endpoint to group with number', async () => {
        const QBKG03LM = devices.QBKG03LM;
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: ['wall_switch_double/2']}});
        await resetExtension();
        expect(groups.group_1.members).toStrictEqual([QBKG03LM.getEndpoint(2)]);
    });

    it('Shouldnt crash on non-existing devices', async () => {
        mockLogger.error.mockClear();
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: ['not_existing_bla']}});
        await resetExtension();
        expect(groups.group_1.members).toStrictEqual([]);
        expect(mockLogger.error).toHaveBeenCalledWith("Cannot find 'not_existing_bla' of group 'group_1'");
    });

    it('Should resolve device friendly names', async () => {
        settings.set(['devices', devices.bulb.ieeeAddr, 'friendly_name'], 'bulb_friendly_name');
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: ['bulb_friendly_name', 'bulb_color']}});
        await resetExtension();
        expect(groups.group_1.members).toStrictEqual([devices.bulb.getEndpoint(1), devices.bulb_color.getEndpoint(1)]);
    });

    it('Should publish group state change when a device in it changes state', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: [device.ieeeAddr]}});
        await resetExtension();

        mockMQTT.publish.mockClear();
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint, type: 'attributeReport', linkquality: 10};
        await mockZHEvents.message(payload);
        await flushPromises();

        expect(mockMQTT.publish).toHaveBeenCalledTimes(2);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({state: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/group_1', stringify({state: 'ON'}), {retain: false, qos: 0}, expect.any(Function));
    });

    it('Should not republish identical optimistic group states', async () => {
        const device1 = devices.bulb_2;
        const device2 = devices.bulb_color_2;
        await resetExtension();

        mockMQTT.publish.mockClear();
        await mockZHEvents.message({
            data: {onOff: 1},
            cluster: 'genOnOff',
            device: device1,
            endpoint: device1.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        });
        await mockZHEvents.message({
            data: {onOff: 1},
            cluster: 'genOnOff',
            device: device2,
            endpoint: device2.getEndpoint(1),
            type: 'attributeReport',
            linkquality: 10,
        });
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(6);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/group_tradfri_remote',
            stringify({state: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_2', stringify({state: 'ON'}), {retain: false, qos: 0}, expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color_2',
            stringify({state: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/group_with_tradfri',
            stringify({state: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/ha_discovery_group',
            stringify({state: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/switch_group',
            stringify({state: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should publish state change of all members when a group changes its state', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: [device.ieeeAddr]}});
        await resetExtension();

        mockMQTT.publish.mockClear();
        await mockMQTTEvents.message('zigbee2mqtt/group_1/set', stringify({state: 'ON'}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(2);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({state: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/group_1', stringify({state: 'ON'}), {retain: false, qos: 0}, expect.any(Function));
    });

    it('Should not publish state change when group changes state and device is disabled', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['devices', device.ieeeAddr, 'disabled'], true);
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: [device.ieeeAddr]}});
        await resetExtension();

        mockMQTT.publish.mockClear();
        await mockMQTTEvents.message('zigbee2mqtt/group_1/set', stringify({state: 'ON'}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(1);
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/group_1', stringify({state: 'ON'}), {retain: false, qos: 0}, expect.any(Function));
    });

    it('Should publish state change for group when members state change', async () => {
        // Created for https://github.com/Koenkk/zigbee2mqtt/issues/5725
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: [device.ieeeAddr]}});
        await resetExtension();

        mockMQTT.publish.mockClear();
        await mockMQTTEvents.message('zigbee2mqtt/bulb_color/set', stringify({state: 'ON'}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(2);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({state: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/group_1', stringify({state: 'ON'}), {retain: false, qos: 0}, expect.any(Function));

        mockMQTT.publish.mockClear();
        await mockMQTTEvents.message('zigbee2mqtt/group_1/set', stringify({state: 'OFF'}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(2);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({state: 'OFF'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/group_1',
            stringify({state: 'OFF'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        mockMQTT.publish.mockClear();
        await mockMQTTEvents.message('zigbee2mqtt/bulb_color/set', stringify({state: 'ON'}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(2);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({state: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/group_1', stringify({state: 'ON'}), {retain: false, qos: 0}, expect.any(Function));
    });

    it('Should publish state of device with endpoint name', async () => {
        const group = groups.gledopto_group;
        await resetExtension();

        mockMQTT.publish.mockClear();
        await mockMQTTEvents.message('zigbee2mqtt/gledopto_group/set', stringify({state: 'ON'}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(2);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/GLEDOPTO_2ID',
            stringify({state_cct: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/gledopto_group',
            stringify({state: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(group.command).toHaveBeenCalledTimes(1);
        expect(group.command).toHaveBeenCalledWith('genOnOff', 'on', {}, {});
    });

    it('Should publish state of group when specific state of specific endpoint is changed', async () => {
        const group = groups.gledopto_group;
        await resetExtension();

        mockMQTT.publish.mockClear();
        await mockMQTTEvents.message('zigbee2mqtt/GLEDOPTO_2ID/set', stringify({state_cct: 'ON'}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(2);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/GLEDOPTO_2ID',
            stringify({state_cct: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/gledopto_group',
            stringify({state: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(group.command).toHaveBeenCalledTimes(0);
    });

    it('Should publish state change of all members when a group changes its state, filtered', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, filtered_attributes: ['brightness'], devices: [device.ieeeAddr]}});
        await resetExtension();

        mockMQTT.publish.mockClear();
        await mockMQTTEvents.message('zigbee2mqtt/group_1/set', stringify({state: 'ON', brightness: 100}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(2);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({state: 'ON', brightness: 100}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/group_1', stringify({state: 'ON'}), {retain: false, qos: 0}, expect.any(Function));
    });

    it('Shouldnt publish group state change when a group is not optimistic', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {1: {friendly_name: 'group_1', devices: [device.ieeeAddr], optimistic: false, retain: false}});
        await resetExtension();

        mockMQTT.publish.mockClear();
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint, type: 'attributeReport', linkquality: 10};
        await mockZHEvents.message(payload);
        await flushPromises();

        expect(mockMQTT.publish).toHaveBeenCalledTimes(1);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({state: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should publish state change of another group with shared device when a group changes its state', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {
            1: {friendly_name: 'group_1', retain: false, devices: [device.ieeeAddr]},
            2: {friendly_name: 'group_2', retain: false, devices: [device.ieeeAddr]},
            3: {friendly_name: 'group_3', retain: false, devices: []},
        });
        await resetExtension();

        mockMQTT.publish.mockClear();
        await mockMQTTEvents.message('zigbee2mqtt/group_1/set', stringify({state: 'ON'}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(3);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({state: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/group_1', stringify({state: 'ON'}), {retain: false, qos: 0}, expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/group_2', stringify({state: 'ON'}), {retain: false, qos: 0}, expect.any(Function));
    });

    it('Should not publish state change off if any lights within are still on when changed via device', async () => {
        const device_1 = devices.bulb_color;
        const device_2 = devices.bulb;
        const endpoint_1 = device_1.getEndpoint(1)!;
        const endpoint_2 = device_2.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint_1);
        group.members.push(endpoint_2);
        settings.set(['groups'], {
            1: {friendly_name: 'group_1', devices: [device_1.ieeeAddr, device_2.ieeeAddr], retain: false},
        });
        await resetExtension();

        await mockMQTTEvents.message('zigbee2mqtt/group_1/set', stringify({state: 'ON'}));
        await flushPromises();
        mockMQTT.publish.mockClear();

        await mockMQTTEvents.message('zigbee2mqtt/bulb_color/set', stringify({state: 'OFF'}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(1);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({state: 'OFF'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should publish state change off if any lights within are still on when changed via device when off_state: last_member_state is used', async () => {
        const device_1 = devices.bulb_color;
        const device_2 = devices.bulb;
        const endpoint_1 = device_1.getEndpoint(1)!;
        const endpoint_2 = device_2.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint_1);
        group.members.push(endpoint_2);
        settings.set(['groups'], {
            1: {friendly_name: 'group_1', devices: [device_1.ieeeAddr, device_2.ieeeAddr], retain: false, off_state: 'last_member_state'},
        });
        await resetExtension();

        await mockMQTTEvents.message('zigbee2mqtt/group_1/set', stringify({state: 'ON'}));
        await flushPromises();
        mockMQTT.publish.mockClear();

        await mockMQTTEvents.message('zigbee2mqtt/bulb_color/set', stringify({state: 'OFF'}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(2);
        expect(mockMQTT.publish).toHaveBeenNthCalledWith(
            1,
            'zigbee2mqtt/group_1',
            stringify({state: 'OFF'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenNthCalledWith(
            2,
            'zigbee2mqtt/bulb_color',
            stringify({state: 'OFF'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should not publish state change off if any lights within are still on when changed via shared group', async () => {
        const device_1 = devices.bulb_color;
        const device_2 = devices.bulb;
        const endpoint_1 = device_1.getEndpoint(1)!;
        const endpoint_2 = device_2.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint_1);
        group.members.push(endpoint_2);
        settings.set(['groups'], {
            1: {friendly_name: 'group_1', devices: [device_1.ieeeAddr, device_2.ieeeAddr], retain: false},
            2: {friendly_name: 'group_2', retain: false, devices: [device_1.ieeeAddr]},
        });
        await resetExtension();

        await mockMQTTEvents.message('zigbee2mqtt/group_1/set', stringify({state: 'ON'}));
        await flushPromises();
        mockMQTT.publish.mockClear();

        await mockMQTTEvents.message('zigbee2mqtt/group_2/set', stringify({state: 'OFF'}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(2);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/group_2',
            stringify({state: 'OFF'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({state: 'OFF'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should publish state change off if all lights within turn off', async () => {
        const device_1 = devices.bulb_color;
        const device_2 = devices.bulb;
        const endpoint_1 = device_1.getEndpoint(1)!;
        const endpoint_2 = device_2.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint_1);
        group.members.push(endpoint_2);
        settings.set(['groups'], {
            1: {friendly_name: 'group_1', devices: [device_1.ieeeAddr, device_2.ieeeAddr], retain: false},
        });
        await resetExtension();

        await mockMQTTEvents.message('zigbee2mqtt/group_1/set', stringify({state: 'ON'}));
        await flushPromises();
        mockMQTT.publish.mockClear();

        await mockMQTTEvents.message('zigbee2mqtt/bulb_color/set', stringify({state: 'OFF'}));
        await mockMQTTEvents.message('zigbee2mqtt/bulb/set', stringify({state: 'OFF'}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(3);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({state: 'OFF'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb', stringify({state: 'OFF'}), {retain: true, qos: 0}, expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/group_1',
            stringify({state: 'OFF'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should only update group state with changed properties', async () => {
        const device_1 = devices.bulb_color;
        const device_2 = devices.bulb;
        const endpoint_1 = device_1.getEndpoint(1)!;
        const endpoint_2 = device_2.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint_1);
        group.members.push(endpoint_2);
        settings.set(['groups'], {
            1: {friendly_name: 'group_1', devices: [device_1.ieeeAddr, device_2.ieeeAddr], retain: false},
        });
        await resetExtension();
        mockMQTT.publish.mockClear();

        await mockMQTTEvents.message('zigbee2mqtt/bulb_color/set', stringify({state: 'OFF', color_temp: 200}));
        await mockMQTTEvents.message('zigbee2mqtt/bulb/set', stringify({state: 'ON', color_temp: 250}));
        await flushPromises();
        mockMQTT.publish.mockClear();

        await mockMQTTEvents.message('zigbee2mqtt/group_1/set', stringify({color_temp: 300}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(3);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({color_mode: 'color_temp', color_temp: 300, state: 'OFF'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({color_mode: 'color_temp', color_temp: 300, state: 'ON'}),
            {retain: true, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/group_1',
            stringify({color_mode: 'color_temp', color_temp: 300, state: 'ON'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should publish state change off even when missing current state', async () => {
        const device_1 = devices.bulb_color;
        const device_2 = devices.bulb;
        const endpoint_1 = device_1.getEndpoint(1)!;
        const endpoint_2 = device_2.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint_1);
        group.members.push(endpoint_2);
        settings.set(['groups'], {
            1: {friendly_name: 'group_1', devices: [device_1.ieeeAddr, device_2.ieeeAddr], retain: false},
        });
        await resetExtension();

        await mockMQTTEvents.message('zigbee2mqtt/group_1/set', stringify({state: 'ON'}));
        await flushPromises();
        mockMQTT.publish.mockClear();
        // @ts-expect-error private
        controller.state.state = {};

        await mockMQTTEvents.message('zigbee2mqtt/bulb_color/set', stringify({state: 'OFF'}));
        await flushPromises();

        expect(mockMQTT.publish).toHaveBeenCalledTimes(2);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({state: 'OFF'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/group_1',
            stringify({state: 'OFF'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Add to group via MQTT', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = groups.group_1;
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: []}});
        expect(group.members.length).toBe(0);
        await resetExtension();
        mockMQTT.publish.mockClear();
        mockMQTTEvents.message(
            'zigbee2mqtt/bridge/request/group/members/add',
            stringify({transaction: '123', group: 'group_1', device: 'bulb_color'}),
        );
        await flushPromises();
        expect(group.members).toStrictEqual([endpoint]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([`${device.ieeeAddr}/1`]);
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/members/add',
            stringify({data: {device: 'bulb_color', group: 'group_1'}, transaction: '123', status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Add to group via MQTT fails', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: []}});
        expect(group.members.length).toBe(0);
        await resetExtension();
        endpoint.addToGroup.mockImplementationOnce(() => {
            throw new Error('timeout');
        });
        await flushPromises();
        mockMQTT.publish.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/group/members/add', stringify({group: 'group_1', device: 'bulb_color'}));
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([]);
        expect(mockMQTT.publish).not.toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/members/add',
            stringify({data: {device: 'bulb_color', group: 'group_1'}, status: 'error', error: 'Failed to add from group (timeout)'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Add to group with slashes via MQTT', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        const group = groups['group/with/slashes'];
        settings.set(['groups'], {99: {friendly_name: 'group/with/slashes', retain: false, devices: []}});
        expect(group.members.length).toBe(0);
        await resetExtension();
        mockMQTT.publish.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/group/members/add', stringify({group: 'group/with/slashes', device: 'bulb_color'}));
        await flushPromises();
        expect(group.members).toStrictEqual([endpoint]);
        expect(settings.getGroup('group/with/slashes').devices).toStrictEqual([`${device.ieeeAddr}/1`]);
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/members/add',
            stringify({data: {device: 'bulb_color', group: 'group/with/slashes'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Add to group via MQTT with postfix', async () => {
        const device = devices.QBKG03LM;
        const endpoint = device.getEndpoint(3)!;
        const group = groups.group_1;
        expect(group.members.length).toBe(0);
        await resetExtension();
        mockMQTT.publish.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/group/members/add', stringify({group: 'group_1', device: 'wall_switch_double/right'}));
        await flushPromises();
        expect(group.members).toStrictEqual([endpoint]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([`${device.ieeeAddr}/${endpoint.ID}`]);
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/members/add',
            stringify({data: {device: 'wall_switch_double/right', group: 'group_1'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Add to group via MQTT with postfix shouldnt add it twice', async () => {
        const device = devices.QBKG03LM;
        const endpoint = device.getEndpoint(3)!;
        const group = groups.group_1;
        expect(group.members.length).toBe(0);
        await resetExtension();
        mockMQTT.publish.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/group/members/add', stringify({group: 'group_1', device: 'wall_switch_double/right'}));
        await flushPromises();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/group/members/add', stringify({group: 'group_1', device: '0x0017880104e45542/3'}));
        await flushPromises();
        expect(group.members).toStrictEqual([endpoint]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([`${device.ieeeAddr}/${endpoint.ID}`]);
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/members/add',
            stringify({data: {device: 'wall_switch_double/right', group: 'group_1'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Remove from group via MQTT', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: [device.ieeeAddr]}});
        await resetExtension();
        mockMQTT.publish.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/group/members/remove', stringify({group: 'group_1', device: 'bulb_color'}));
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([]);
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/members/remove',
            stringify({data: {device: 'bulb_color', group: 'group_1'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Remove from group via MQTT keeping device reporting', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: [device.ieeeAddr]}});
        await resetExtension();
        mockMQTT.publish.mockClear();
        mockMQTTEvents.message(
            'zigbee2mqtt/bridge/request/group/members/remove',
            stringify({group: 'group_1', device: 'bulb_color', skip_disable_reporting: true}),
        );
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([]);
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/members/remove',
            stringify({data: {device: 'bulb_color', group: 'group_1'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Remove from group via MQTT when in zigbee but not in settings', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: ['dummy']}});
        await resetExtension();
        mockMQTT.publish.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/group/members/remove', stringify({group: 'group_1', device: 'bulb_color'}));
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual(['dummy']);
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/members/remove',
            stringify({data: {device: 'bulb_color', group: 'group_1'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Remove from group via MQTT with postfix variant 1', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: [`wall_switch_double/right`]}});
        await resetExtension();
        mockMQTT.publish.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/group/members/remove', stringify({group: 'group_1', device: '0x0017880104e45542/3'}));
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([]);
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/members/remove',
            stringify({data: {device: '0x0017880104e45542/3', group: 'group_1'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Remove from group via MQTT with postfix variant 2', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: [`0x0017880104e45542/right`]}});
        await resetExtension();
        mockMQTT.publish.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/group/members/remove', stringify({group: 'group_1', device: 'wall_switch_double/3'}));
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([]);
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/members/remove',
            stringify({data: {device: 'wall_switch_double/3', group: 'group_1'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Remove from group via MQTT with postfix variant 3', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: [`wall_switch_double/3`]}});
        await resetExtension();
        mockMQTT.publish.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/group/members/remove', stringify({group: 'group_1', device: '0x0017880104e45542/right'}));
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([]);
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/members/remove',
            stringify({data: {device: '0x0017880104e45542/right', group: 'group_1'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Remove from group all', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: [`wall_switch_double/3`]}});
        await resetExtension();
        mockMQTT.publish.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/group/members/remove_all', stringify({device: '0x0017880104e45542/right'}));
        await flushPromises();
        expect(group.members).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual([]);
        expect(mockMQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/members/remove_all',
            stringify({data: {device: '0x0017880104e45542/right'}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Error when adding to non-existing group', async () => {
        await resetExtension();
        mockLogger.error.mockClear();
        mockMQTT.publish.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/group/members/remove', stringify({group: 'group_1_not_existing', device: 'bulb_color'}));
        await flushPromises();
        expect(mockMQTT.publish).not.toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/members/remove',
            stringify({
                data: {device: 'bulb_color', group: 'group_1_not_existing'},
                status: 'error',
                error: "Group 'group_1_not_existing' does not exist",
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Error when adding a non-existing device', async () => {
        await resetExtension();
        mockLogger.error.mockClear();
        mockMQTT.publish.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/group/members/add', stringify({group: 'group_1', device: 'bulb_color_not_existing'}));
        await flushPromises();
        expect(mockMQTT.publish).not.toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/members/add',
            stringify({
                data: {device: 'bulb_color_not_existing', group: 'group_1'},
                status: 'error',
                error: "Device 'bulb_color_not_existing' does not exist",
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Error when adding a non-existing endpoint', async () => {
        await resetExtension();
        mockLogger.error.mockClear();
        mockMQTT.publish.mockClear();
        mockMQTTEvents.message(
            'zigbee2mqtt/bridge/request/group/members/add',
            stringify({group: 'group_1', device: 'bulb_color/not_existing_endpoint'}),
        );
        await flushPromises();
        expect(mockMQTT.publish).not.toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/members/add',
            stringify({
                data: {device: 'bulb_color/not_existing_endpoint', group: 'group_1'},
                status: 'error',
                error: "Device 'bulb_color' does not have endpoint 'not_existing_endpoint'",
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should only include relevant properties when publishing member states', async () => {
        const bulbColor = devices.bulb_color;
        const bulbColorTemp = devices.bulb;
        const group = groups.group_1;
        group.members.push(bulbColor.getEndpoint(1)!);
        group.members.push(bulbColorTemp.getEndpoint(1)!);
        settings.set(['groups'], {1: {friendly_name: 'group_1', retain: false, devices: [bulbColor.ieeeAddr, bulbColorTemp.ieeeAddr]}});
        await resetExtension();

        mockMQTT.publish.mockClear();
        await mockMQTTEvents.message('zigbee2mqtt/group_1/set', stringify({color_temp: 50}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(3);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({color_mode: 'color_temp', color_temp: 50}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/group_1',
            stringify({color_mode: 'color_temp', color_temp: 50}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({color_mode: 'color_temp', color_temp: 50}),
            {retain: true, qos: 0},
            expect.any(Function),
        );

        mockMQTT.publish.mockClear();
        await mockMQTTEvents.message('zigbee2mqtt/group_1/set', stringify({color: {x: 0.5, y: 0.3}}));
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(3);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({color: {x: 0.5, y: 0.3}, color_mode: 'xy', color_temp: 548}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/group_1',
            stringify({color: {x: 0.5, y: 0.3}, color_mode: 'xy', color_temp: 548}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb',
            stringify({color_mode: 'color_temp', color_temp: 548}),
            {retain: true, qos: 0},
            expect.any(Function),
        );
    });
});
