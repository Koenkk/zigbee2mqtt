import * as data from '../mocks/data';
import {mockDebounce} from '../mocks/debounce';
import {mockLogger} from '../mocks/logger';
import {events as mockMQTTEvents, mockMQTTPublishAsync} from '../mocks/mqtt';
import {flushPromises} from '../mocks/utils';
import {Device, devices, groups, events as mockZHEvents} from '../mocks/zigbeeHerdsman';

import stringify from 'json-stable-stringify-without-jsonify';

import {Controller} from '../../lib/controller';
import * as settings from '../../lib/util/settings';

const mocksClear = [
    mockDebounce,
    mockMQTTPublishAsync,
    devices.bulb_color.getEndpoint(1)!.configureReporting,
    devices.bulb_color.getEndpoint(1)!.bind,
    devices.bulb_color_2.getEndpoint(1)!.read,
];

describe('Extension: Bind', () => {
    let controller: Controller;

    const resetExtension = async (): Promise<void> => {
        await controller.enableDisableExtension(false, 'Bind');
        await controller.enableDisableExtension(true, 'Bind');
    };

    const mockClear = (device: Device): void => {
        for (const endpoint of device.endpoints) {
            endpoint.read.mockClear();
            endpoint.write.mockClear();
            endpoint.configureReporting.mockClear();
            endpoint.bind = vi.fn();
            endpoint.bind.mockClear();
            endpoint.unbind.mockClear();
        }
    };

    beforeAll(async () => {
        vi.useFakeTimers();
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        await flushPromises();
    });

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings.reRead();
        groups.group_1.members = [];
        await resetExtension();
        mocksClear.forEach((m) => m.mockClear());
    });

    afterAll(async () => {
        vi.useRealTimers();
    });

    it('Should bind to device and configure reporting', async () => {
        const device = devices.remote;
        const target = devices.bulb_color.getEndpoint(1)!;
        const endpoint = device.getEndpoint(1)!;

        // Setup
        const originalDeviceOutputClusters = device.getEndpoint(1)!.outputClusters;
        device.getEndpoint(1)!.outputClusters = [...device.getEndpoint(1)!.outputClusters, 768];
        const originalTargetBinds = target.binds;
        target.binds = [{cluster: {name: 'genLevelCtrl'}, target: devices.coordinator.getEndpoint(1)!}];
        target.getClusterAttributeValue.mockReturnValueOnce(undefined);
        mockClear(device);
        target.configureReporting.mockImplementationOnce(() => {
            throw new Error('timeout');
        });

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/bind', stringify({transaction: '1234', from: 'remote', to: 'bulb_color'}));
        await flushPromises();
        expect(target.read).toHaveBeenCalledWith('lightingColorCtrl', ['colorCapabilities']);
        expect(endpoint.bind).toHaveBeenCalledTimes(4);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genScenes', target);
        expect(endpoint.bind).toHaveBeenCalledWith('lightingColorCtrl', target);
        expect(target.configureReporting).toHaveBeenCalledTimes(3);
        expect(target.configureReporting).toHaveBeenCalledWith('genOnOff', [
            {attribute: 'onOff', maximumReportInterval: 3600, minimumReportInterval: 0, reportableChange: 0},
        ]);
        expect(target.configureReporting).toHaveBeenCalledWith('genLevelCtrl', [
            {attribute: 'currentLevel', maximumReportInterval: 3600, minimumReportInterval: 5, reportableChange: 1},
        ]);
        expect(target.configureReporting).toHaveBeenCalledWith('lightingColorCtrl', [
            {attribute: 'colorTemperature', minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1},
            {attribute: 'currentX', minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1},
            {attribute: 'currentY', minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1},
        ]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                transaction: '1234',
                data: {
                    from: 'remote',
                    from_endpoint: 'default',
                    to: 'bulb_color',
                    clusters: ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl'],
                    failed: [],
                },
                status: 'ok',
            }),
            {retain: false, qos: 0},
        );

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0});

        // Teardown
        target.binds = originalTargetBinds;
        device.getEndpoint(1)!.outputClusters = originalDeviceOutputClusters;
    });

    it('Should throw error on invalid payload', async () => {
        mockMQTTPublishAsync.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/bind', stringify({fromz: 'remote', to: 'bulb_color'}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {}, status: 'error', error: 'Invalid payload'}),
            {retain: false, qos: 0},
        );
    });

    it('Filters out unsupported clusters for reporting setup', async () => {
        const device = devices.remote;
        const target = devices.bulb_color.getEndpoint(1)!;
        const endpoint = device.getEndpoint(1)!;

        // Setup
        const originalDeviceInputClusters = device.getEndpoint(1)!.inputClusters;
        device.getEndpoint(1)!.inputClusters = [...device.getEndpoint(1)!.inputClusters, 8];
        const originalDeviceOutputClusters = device.getEndpoint(1)!.outputClusters;
        device.getEndpoint(1)!.outputClusters = [...device.getEndpoint(1)!.outputClusters, 768];
        const originalTargetInputClusters = target.inputClusters;
        target.inputClusters = [...originalTargetInputClusters];
        target.inputClusters.splice(originalTargetInputClusters.indexOf(8), 1); // remove genLevelCtrl
        const originalTargetOutputClusters = target.outputClusters;
        target.outputClusters = [...target.outputClusters, 8];
        const originalTargetBinds = target.binds;
        target.binds = [{cluster: {name: 'genLevelCtrl'}, target: devices.coordinator.getEndpoint(1)!}];
        target.getClusterAttributeValue.mockReturnValueOnce(undefined);
        mockClear(device);
        target.configureReporting.mockImplementationOnce(() => {
            throw new Error('timeout');
        });

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/bind', stringify({transaction: '1234', from: 'remote', to: 'bulb_color'}));
        await flushPromises();

        expect(target.read).toHaveBeenCalledWith('lightingColorCtrl', ['colorCapabilities']);
        expect(endpoint.bind).toHaveBeenCalledTimes(4);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genScenes', target);
        expect(endpoint.bind).toHaveBeenCalledWith('lightingColorCtrl', target);
        expect(target.configureReporting).toHaveBeenCalledTimes(2);
        expect(target.configureReporting).toHaveBeenCalledWith('genOnOff', [
            {attribute: 'onOff', maximumReportInterval: 3600, minimumReportInterval: 0, reportableChange: 0},
        ]);
        // expect(target.configureReporting).toHaveBeenCalledWith("genLevelCtrl",[{"attribute": "currentLevel", "maximumReportInterval": 3600, "minimumReportInterval": 5, "reportableChange": 1}]);
        expect(target.configureReporting).toHaveBeenCalledWith('lightingColorCtrl', [
            {attribute: 'colorTemperature', minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1},
            {attribute: 'currentX', minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1},
            {attribute: 'currentY', minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1},
        ]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                transaction: '1234',
                data: {
                    from: 'remote',
                    from_endpoint: 'default',
                    to: 'bulb_color',
                    clusters: ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl'],
                    failed: [],
                },
                status: 'ok',
            }),
            {retain: false, qos: 0},
        );

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0});

        // Teardown
        target.binds = originalTargetBinds;
        target.inputClusters = originalTargetInputClusters;
        target.outputClusters = originalTargetOutputClusters;
        device.getEndpoint(1)!.inputClusters = originalDeviceInputClusters;
        device.getEndpoint(1)!.outputClusters = originalDeviceOutputClusters;
    });

    it('Filters out reporting setup based on bind status', async () => {
        const device = devices.remote;
        const target = devices.bulb_color.getEndpoint(1)!;
        const endpoint = device.getEndpoint(1)!;

        // Setup
        const originalDeviceOutputClusters = device.getEndpoint(1)!.outputClusters;
        device.getEndpoint(1)!.outputClusters = [...device.getEndpoint(1)!.outputClusters, 768];
        const originalTargetBinds = target.binds;
        target.binds = [{cluster: {name: 'genLevelCtrl'}, target: devices.coordinator.getEndpoint(1)!}];
        target.getClusterAttributeValue.mockReturnValueOnce(undefined);
        mockClear(device);
        target.configureReporting.mockImplementationOnce(() => {
            throw new Error('timeout');
        });
        const originalTargetCR = target.configuredReportings;
        target.configuredReportings = [
            {
                cluster: {name: 'genLevelCtrl'},
                attribute: {name: 'currentLevel', ID: 0},
                minimumReportInterval: 0,
                maximumReportInterval: 3600,
                reportableChange: 0,
            },
        ];

        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/bind', stringify({transaction: '1234', from: 'remote', to: 'bulb_color'}));
        await flushPromises();
        expect(target.read).toHaveBeenCalledWith('lightingColorCtrl', ['colorCapabilities']);
        expect(endpoint.bind).toHaveBeenCalledTimes(4);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genScenes', target);
        expect(endpoint.bind).toHaveBeenCalledWith('lightingColorCtrl', target);
        expect(target.configureReporting).toHaveBeenCalledTimes(2);
        expect(target.configureReporting).toHaveBeenCalledWith('genOnOff', [
            {attribute: 'onOff', maximumReportInterval: 3600, minimumReportInterval: 0, reportableChange: 0},
        ]);
        // expect(target.configureReporting).toHaveBeenCalledWith("genLevelCtrl",[{"attribute": "currentLevel", "maximumReportInterval": 3600, "minimumReportInterval": 5, "reportableChange": 1}]);
        expect(target.configureReporting).toHaveBeenCalledWith('lightingColorCtrl', [
            {attribute: 'colorTemperature', minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1},
            {attribute: 'currentX', minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1},
            {attribute: 'currentY', minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1},
        ]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                transaction: '1234',
                data: {
                    from: 'remote',
                    from_endpoint: 'default',
                    to: 'bulb_color',
                    clusters: ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl'],
                    failed: [],
                },
                status: 'ok',
            }),
            {retain: false, qos: 0},
        );

        expect(mockMQTTPublishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0});

        // Teardown
        target.configuredReportings = originalTargetCR;
        target.binds = originalTargetBinds;
        device.getEndpoint(1)!.outputClusters = originalDeviceOutputClusters;
    });

    it('Should bind only specified clusters', async () => {
        const device = devices.remote;
        const target = devices.bulb_color.getEndpoint(1)!;
        const endpoint = device.getEndpoint(1)!;
        mockClear(device);
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'bulb_color', clusters: ['genOnOff']}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {from: 'remote', from_endpoint: 'default', to: 'bulb_color', clusters: ['genOnOff'], failed: []}, status: 'ok'}),
            {retain: false, qos: 0},
        );
    });

    it('Should log error when there is nothing to bind', async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        mockClear(device);
        mockLogger.error.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'button'}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(0);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {}, status: 'error', error: 'Nothing to bind'}),
            {retain: false, qos: 0},
        );
    });

    it('Should unbind', async () => {
        const device = devices.remote;
        const target = devices.bulb_color.getEndpoint(1)!;

        // setup
        target.configureReporting.mockImplementationOnce(() => {
            throw new Error('timeout');
        });
        const originalRemoteBinds = device.getEndpoint(1)!.binds;
        device.getEndpoint(1)!.binds = [];
        const originalTargetBinds = target.binds;
        target.binds = [
            {cluster: {name: 'genOnOff'}, target: devices.coordinator.getEndpoint(1)!},
            {cluster: {name: 'genLevelCtrl'}, target: devices.coordinator.getEndpoint(1)!},
            {cluster: {name: 'lightingColorCtrl'}, target: devices.coordinator.getEndpoint(1)!},
        ];

        const endpoint = device.getEndpoint(1)!;
        mockClear(device);
        delete devices.bulb_color.meta.configured;
        expect(devices.bulb_color.meta.configured).toBe(undefined);
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/unbind', stringify({from: 'remote', to: 'bulb_color'}));
        await flushPromises();
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        expect(endpoint.unbind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.unbind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.unbind).toHaveBeenCalledWith('genScenes', target);

        // Disable reporting
        expect(target.configureReporting).toHaveBeenCalledTimes(3);
        expect(target.configureReporting).toHaveBeenCalledWith('genOnOff', [
            {attribute: 'onOff', maximumReportInterval: 0xffff, minimumReportInterval: 0, reportableChange: 0},
        ]);
        expect(target.configureReporting).toHaveBeenCalledWith('genLevelCtrl', [
            {attribute: 'currentLevel', maximumReportInterval: 0xffff, minimumReportInterval: 5, reportableChange: 1},
        ]);
        expect(target.configureReporting).toHaveBeenCalledWith('lightingColorCtrl', [
            {attribute: 'colorTemperature', minimumReportInterval: 5, maximumReportInterval: 0xffff, reportableChange: 1},
            {attribute: 'currentX', minimumReportInterval: 5, maximumReportInterval: 0xffff, reportableChange: 1},
            {attribute: 'currentY', minimumReportInterval: 5, maximumReportInterval: 0xffff, reportableChange: 1},
        ]);
        expect(devices.bulb_color.meta.configured).toBe(332242049);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/unbind',
            stringify({
                data: {from: 'remote', from_endpoint: 'default', to: 'bulb_color', clusters: ['genScenes', 'genOnOff', 'genLevelCtrl'], failed: []},
                status: 'ok',
            }),
            {retain: false, qos: 0},
        );

        // Teardown
        target.binds = originalTargetBinds;
        device.getEndpoint(1)!.binds = originalRemoteBinds;
    });

    it('Should unbind coordinator', async () => {
        const device = devices.remote;
        const target = devices.coordinator.getEndpoint(1)!;
        const endpoint = device.getEndpoint(1)!;
        mockClear(device);
        endpoint.unbind.mockClear();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/unbind', stringify({from: 'remote', to: 'Coordinator'}));
        await flushPromises();
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        expect(endpoint.unbind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.unbind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.unbind).toHaveBeenCalledWith('genScenes', target);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/unbind',
            stringify({
                data: {from: 'remote', from_endpoint: 'default', to: 'Coordinator', clusters: ['genScenes', 'genOnOff', 'genLevelCtrl'], failed: []},
                status: 'ok',
            }),
            {retain: false, qos: 0},
        );
    });

    it('Should bind to groups', async () => {
        const device = devices.remote;
        const target = groups.group_1;
        const target1Member = devices.bulb.getEndpoint(1)!;
        const endpoint = device.getEndpoint(1)!;
        target.members.push(target1Member);
        target1Member.configureReporting.mockClear();
        mockClear(device);
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'group_1'}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genScenes', target);
        expect(target1Member.configureReporting).toHaveBeenCalledTimes(2);
        expect(target1Member.configureReporting).toHaveBeenCalledWith('genOnOff', [
            {attribute: 'onOff', maximumReportInterval: 3600, minimumReportInterval: 0, reportableChange: 0},
        ]);
        expect(target1Member.configureReporting).toHaveBeenCalledWith('genLevelCtrl', [
            {attribute: 'currentLevel', maximumReportInterval: 3600, minimumReportInterval: 5, reportableChange: 1},
        ]);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                data: {from: 'remote', from_endpoint: 'default', to: 'group_1', clusters: ['genScenes', 'genOnOff', 'genLevelCtrl'], failed: []},
                status: 'ok',
            }),
            {retain: false, qos: 0},
        );

        // Should configure reporting for device added to group
        target1Member.configureReporting.mockClear();
        await mockMQTTEvents.message('zigbee2mqtt/bridge/request/group/members/add', stringify({group: 'group_1', device: 'bulb'}));
        await flushPromises();
        expect(target1Member.configureReporting).toHaveBeenCalledTimes(2);
        expect(target1Member.configureReporting).toHaveBeenCalledWith('genOnOff', [
            {attribute: 'onOff', maximumReportInterval: 3600, minimumReportInterval: 0, reportableChange: 0},
        ]);
        expect(target1Member.configureReporting).toHaveBeenCalledWith('genLevelCtrl', [
            {attribute: 'currentLevel', maximumReportInterval: 3600, minimumReportInterval: 5, reportableChange: 1},
        ]);
    });

    it('Should unbind from group', async () => {
        const device = devices.remote;
        const target = groups.group_1;
        const target1Member = devices.bulb.getEndpoint(1)!;
        const endpoint = device.getEndpoint(1)!;
        target.members.push(target1Member);
        target1Member.configureReporting.mockClear();
        mockClear(device);
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/unbind', stringify({from: 'remote', to: 'group_1'}));
        await flushPromises();
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        expect(endpoint.unbind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.unbind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.unbind).toHaveBeenCalledWith('genScenes', target);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/unbind',
            stringify({
                data: {from: 'remote', from_endpoint: 'default', to: 'group_1', clusters: ['genScenes', 'genOnOff', 'genLevelCtrl'], failed: []},
                status: 'ok',
            }),
            {retain: false, qos: 0},
        );
    });

    it('Should unbind from group with skip_disable_reporting=true', async () => {
        const device = devices.remote;
        const target = groups.group_1;
        const target1Member = devices.bulb_2.getEndpoint(1)!;
        const endpoint = device.getEndpoint(1)!;
        target.members.push(target1Member);

        // The device unbind mock doesn't remove binds, therefore remove them here already otherwise configure reporiting is not disabled.
        const originalBinds = endpoint.binds;
        endpoint.binds = [];

        target1Member.binds = [
            {cluster: {name: 'genLevelCtrl'}, target: devices.coordinator.getEndpoint(1)!},
            {cluster: {name: 'genOnOff'}, target: devices.coordinator.getEndpoint(1)!},
        ];
        target1Member.configureReporting.mockClear();
        mockClear(device);
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/unbind', stringify({from: 'remote', to: 'group_1', skip_disable_reporting: true}));
        await flushPromises();
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        // with skip_disable_reporting set to false, we don't expect it to reconfigure reporting
        expect(target1Member.configureReporting).toHaveBeenCalledTimes(0);
        endpoint.binds = originalBinds;
    });

    it('Should unbind from group with skip_disable_reporting=false', async () => {
        const device = devices.remote;
        const target = groups.group_1;
        const target1Member = devices.bulb_2.getEndpoint(1)!;
        const endpoint = device.getEndpoint(1)!;
        target.members.push(target1Member);

        // The device unbind mock doesn't remove binds, therefore remove them here already otherwise configure reporiting is not disabled.
        const originalBinds = endpoint.binds;
        endpoint.binds = [];

        target1Member.binds = [
            {cluster: {name: 'genLevelCtrl'}, target: devices.coordinator.getEndpoint(1)!},
            {cluster: {name: 'genOnOff'}, target: devices.coordinator.getEndpoint(1)!},
        ];
        target1Member.configureReporting.mockClear();
        mockClear(device);
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/unbind', stringify({from: 'remote', to: 'group_1', skip_disable_reporting: false}));
        await flushPromises();
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        // with skip_disable_reporting set, we expect it to reconfigure reporting
        expect(target1Member.configureReporting).toHaveBeenCalledTimes(2);
        expect(target1Member.configureReporting).toHaveBeenCalledWith('genLevelCtrl', [
            {attribute: 'currentLevel', maximumReportInterval: 65535, minimumReportInterval: 5, reportableChange: 1},
        ]);
        expect(target1Member.configureReporting).toHaveBeenCalledWith('genOnOff', [
            {attribute: 'onOff', maximumReportInterval: 65535, minimumReportInterval: 0, reportableChange: 0},
        ]);
        endpoint.binds = originalBinds;
    });

    it('Should bind to group by number', async () => {
        const device = devices.remote;
        const target = groups.group_1;
        const endpoint = device.getEndpoint(1)!;
        mockClear(device);
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: '1'}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genScenes', target);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                data: {from: 'remote', from_endpoint: 'default', to: '1', clusters: ['genScenes', 'genOnOff', 'genLevelCtrl'], failed: []},
                status: 'ok',
            }),
            {retain: false, qos: 0},
        );
    });

    it('Should log when bind fails', async () => {
        mockLogger.error.mockClear();
        const device = devices.remote;
        const endpoint = device.getEndpoint(1)!;
        mockClear(device);
        endpoint.bind.mockImplementation(() => {
            throw new Error('failed');
        });
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'bulb_color'}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {}, status: 'error', error: 'Failed to bind'}),
            {retain: false, qos: 0},
        );
    });

    it('Should bind from non default endpoint names', async () => {
        const device = devices.remote;
        const target = devices.QBKG03LM.getEndpoint(3)!;
        const endpoint = device.getEndpoint(2)!;
        mockClear(device);
        mockMQTTEvents.message(
            'zigbee2mqtt/bridge/request/device/bind',
            stringify({from: 'remote', from_endpoint: 'ep2', to: 'wall_switch_double', to_endpoint: 'right'}),
        );
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                data: {from: 'remote', from_endpoint: 'ep2', to: 'wall_switch_double', to_endpoint: 'right', clusters: ['genOnOff'], failed: []},
                status: 'ok',
            }),
            {retain: false, qos: 0},
        );
    });

    it('Should bind from non default endpoint IDs', async () => {
        const device = devices.remote;
        const target = devices.QBKG03LM.getEndpoint(3)!;
        const endpoint = device.getEndpoint(2)!;
        mockClear(device);
        mockMQTTEvents.message(
            'zigbee2mqtt/bridge/request/device/bind',
            stringify({from: 'remote', from_endpoint: 2, to: 'wall_switch_double', to_endpoint: 3}),
        );
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                data: {from: 'remote', from_endpoint: 2, to: 'wall_switch_double', to_endpoint: 3, clusters: ['genOnOff'], failed: []},
                status: 'ok',
            }),
            {retain: false, qos: 0},
        );
    });

    it('Should bind server clusters to client clusters', async () => {
        const device = devices.temperature_sensor;
        const target = devices.heating_actuator.getEndpoint(1)!;
        const endpoint = device.getEndpoint(1)!;
        mockClear(device);
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'temperature_sensor', to: 'heating_actuator'}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith('msTemperatureMeasurement', target);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                data: {
                    from: 'temperature_sensor',
                    from_endpoint: 'default',
                    to: 'heating_actuator',
                    clusters: ['msTemperatureMeasurement'],
                    failed: [],
                },
                status: 'ok',
            }),
            {retain: false, qos: 0},
        );
    });

    it('Should bind to default endpoint returned by endpoints()', async () => {
        const device = devices.remote;
        const target = devices.QBKG04LM.getEndpoint(2)!;
        const endpoint = device.getEndpoint(2)!;
        mockClear(device);
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', from_endpoint: 'ep2', to: 'wall_switch'}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {from: 'remote', from_endpoint: 'ep2', to: 'wall_switch', clusters: ['genOnOff'], failed: []}, status: 'ok'}),
            {retain: false, qos: 0},
        );
    });

    it('Should unbind from default_bind_group', async () => {
        const device = devices.remote;
        const target = 'default_bind_group';
        const endpoint = device.getEndpoint(1)!;
        mockClear(device);
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/unbind', stringify({from: 'remote', to: target}));
        await flushPromises();
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        expect(endpoint.unbind).toHaveBeenCalledWith('genOnOff', 901);
        expect(endpoint.unbind).toHaveBeenCalledWith('genLevelCtrl', 901);
        expect(endpoint.unbind).toHaveBeenCalledWith('genScenes', 901);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/unbind',
            stringify({
                data: {
                    from: 'remote',
                    from_endpoint: 'default',
                    to: 'default_bind_group',
                    clusters: ['genScenes', 'genOnOff', 'genLevelCtrl'],
                    failed: [],
                },
                status: 'ok',
            }),
            {retain: false, qos: 0},
        );
    });

    it('Error bind fails when source device does not exist', async () => {
        const device = devices.remote;
        mockClear(device);
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote_not_existing', to: 'bulb_color'}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {}, status: 'error', error: "Source device 'remote_not_existing' does not exist"}),
            {retain: false, qos: 0},
        );
    });

    it("Error bind fails when source device's endpoint does not exist", async () => {
        const device = devices.remote;
        mockClear(device);
        mockMQTTEvents.message(
            'zigbee2mqtt/bridge/request/device/bind',
            stringify({from: 'remote', from_endpoint: 'not_existing_endpoint', to: 'bulb_color'}),
        );
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {}, status: 'error', error: "Source device 'remote' does not have endpoint 'not_existing_endpoint'"}),
            {retain: false, qos: 0},
        );
    });

    it('Error bind fails when target device or group does not exist', async () => {
        const device = devices.remote;
        mockClear(device);
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'bulb_color_not_existing'}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {}, status: 'error', error: "Target device or group 'bulb_color_not_existing' does not exist"}),
            {retain: false, qos: 0},
        );
    });

    it("Error bind fails when target device's endpoint does not exist", async () => {
        const device = devices.remote;
        mockClear(device);
        mockMQTTEvents.message(
            'zigbee2mqtt/bridge/request/device/bind',
            stringify({from: 'remote', to: 'bulb_color', to_endpoint: 'not_existing_endpoint'}),
        );
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {}, status: 'error', error: "Target device 'bulb_color' does not have endpoint 'not_existing_endpoint'"}),
            {retain: false, qos: 0},
        );
    });

    it('Should poll bounded Hue bulb when receiving message from Hue dimmer', async () => {
        const remote = devices.remote;
        const data = {button: 3, unknown1: 3145728, type: 2, unknown2: 0, time: 1};
        const payload = {
            data,
            cluster: 'manuSpecificPhilips',
            device: remote,
            endpoint: remote.getEndpoint(2)!,
            type: 'commandHueNotification',
            linkquality: 10,
            groupID: 0,
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(mockDebounce).toHaveBeenCalledTimes(1);
        expect(devices.bulb_color.getEndpoint(1)!.read).toHaveBeenCalledWith('genLevelCtrl', ['currentLevel']);
    });

    it('Should poll bounded Hue bulb when receiving message from scene controller', async () => {
        const remote = devices.bj_scene_switch;
        const data = {action: 'recall_2_row_1'};
        devices.bulb_color_2.getEndpoint(1)!.read.mockImplementationOnce(() => {
            throw new Error('failed');
        });
        const payload = {
            data,
            cluster: 'genScenes',
            device: remote,
            endpoint: remote.getEndpoint(10)!,
            type: 'commandRecall',
            linkquality: 10,
            groupID: 0,
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        // Calls to three clusters are expected in this case
        expect(mockDebounce).toHaveBeenCalledTimes(3);
        expect(devices.bulb_color_2.getEndpoint(1)!.read).toHaveBeenCalledWith('genOnOff', ['onOff']);
        expect(devices.bulb_color_2.getEndpoint(1)!.read).toHaveBeenCalledWith('genLevelCtrl', ['currentLevel']);
        expect(devices.bulb_color_2.getEndpoint(1)!.read).toHaveBeenCalledWith('lightingColorCtrl', ['currentX', 'currentY', 'colorTemperature']);
    });

    it('Should poll grouped Hue bulb when receiving message from TRADFRI remote', async () => {
        devices.bulb_color_2.getEndpoint(1)!.read.mockClear();
        devices.bulb_2.getEndpoint(1)!.read.mockClear();
        const remote = devices.tradfri_remote;
        const data = {stepmode: 0, stepsize: 43, transtime: 5};
        const payload = {
            data,
            cluster: 'genLevelCtrl',
            device: remote,
            endpoint: remote.getEndpoint(1)!,
            type: 'commandStepWithOnOff',
            linkquality: 10,
            groupID: 15071,
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(mockDebounce).toHaveBeenCalledTimes(2);
        expect(devices.bulb_color_2.getEndpoint(1)!.read).toHaveBeenCalledTimes(2);
        expect(devices.bulb_color_2.getEndpoint(1)!.read).toHaveBeenCalledWith('genLevelCtrl', ['currentLevel']);
        expect(devices.bulb_color_2.getEndpoint(1)!.read).toHaveBeenCalledWith('genOnOff', ['onOff']);

        // Should also only debounce once
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(mockDebounce).toHaveBeenCalledTimes(2);
        expect(devices.bulb_color_2.getEndpoint(1)!.read).toHaveBeenCalledTimes(4);

        // Should only call Hue bulb, not e.g. tradfri
        expect(devices.bulb_2.getEndpoint(1)!.read).toHaveBeenCalledTimes(0);
    });
});
