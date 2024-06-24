const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = require('./lib/flushPromises');
const stringify = require('json-stable-stringify-without-jsonify');
jest.mock('debounce', () => jest.fn((fn) => fn));
const debounce = require('debounce');

describe('Bind', () => {
    let controller;

    const mockClear = (device) => {
        for (const endpoint of device.endpoints) {
            endpoint.read.mockClear();
            endpoint.write.mockClear();
            endpoint.configureReporting.mockClear();
            endpoint.bind = jest.fn();
            endpoint.bind.mockClear();
            endpoint.unbind.mockClear();
        }
    };

    let resetExtension = async () => {
        await controller.enableDisableExtension(false, 'Bind');
        await controller.enableDisableExtension(true, 'Bind');
    };

    beforeAll(async () => {
        jest.useFakeTimers();
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
    });

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings.reRead();
        zigbeeHerdsman.groups.group_1.members = [];
        zigbeeHerdsman.devices.bulb_color.getEndpoint(1).configureReporting.mockClear();
        zigbeeHerdsman.devices.bulb_color.getEndpoint(1).bind.mockClear();
        zigbeeHerdsman.devices.bulb_color_2.getEndpoint(1).read.mockClear();
        debounce.mockClear();
        await resetExtension();
        MQTT.publish.mockClear();
    });

    afterAll(async () => {
        jest.useRealTimers();
    });

    it('Should bind to device and configure reporting', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);

        // Setup
        const originalDeviceOutputClusters = device.getEndpoint(1).outputClusters;
        device.getEndpoint(1).outputClusters = [...device.getEndpoint(1).outputClusters, 768];
        const originalTargetBinds = target.binds;
        target.binds = [{cluster: {name: 'genLevelCtrl'}, target: zigbeeHerdsman.devices.coordinator.getEndpoint(1)}];
        target.getClusterAttributeValue.mockImplementationOnce((cluster, value) => undefined);
        mockClear(device);
        target.configureReporting.mockImplementationOnce(() => {
            throw new Error('timeout');
        });

        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({transaction: '1234', from: 'remote', to: 'bulb_color'}));
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
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                transaction: '1234',
                data: {from: 'remote', to: 'bulb_color', clusters: ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl'], failed: []},
                status: 'ok',
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0}, expect.any(Function));

        // Teardown
        target.binds = originalTargetBinds;
        device.getEndpoint(1).outputClusters = originalDeviceOutputClusters;
    });

    it('Filters out unsupported clusters for reporting setup', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);

        // Setup
        const originalDeviceInputClusters = device.getEndpoint(1).inputClusters;
        device.getEndpoint(1).inputClusters = [...device.getEndpoint(1).inputClusters, 8];
        const originalDeviceOutputClusters = device.getEndpoint(1).outputClusters;
        device.getEndpoint(1).outputClusters = [...device.getEndpoint(1).outputClusters, 768];
        const originalTargetInputClusters = target.inputClusters;
        target.inputClusters = [...originalTargetInputClusters];
        target.inputClusters.splice(originalTargetInputClusters.indexOf(8), 1); // remove genLevelCtrl
        const originalTargetOutputClusters = target.outputClusters;
        target.outputClusters = [...target.outputClusters, 8];
        const originalTargetBinds = target.binds;
        target.binds = [{cluster: {name: 'genLevelCtrl'}, target: zigbeeHerdsman.devices.coordinator.getEndpoint(1)}];
        target.getClusterAttributeValue.mockImplementationOnce((cluster, value) => undefined);
        mockClear(device);
        target.configureReporting.mockImplementationOnce(() => {
            throw new Error('timeout');
        });

        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({transaction: '1234', from: 'remote', to: 'bulb_color'}));
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
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                transaction: '1234',
                data: {from: 'remote', to: 'bulb_color', clusters: ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl'], failed: []},
                status: 'ok',
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0}, expect.any(Function));

        // Teardown
        target.binds = originalTargetBinds;
        target.inputClusters = originalTargetInputClusters;
        target.outputClusters = originalTargetOutputClusters;
        device.getEndpoint(1).inputClusters = originalDeviceInputClusters;
        device.getEndpoint(1).outputClusters = originalDeviceOutputClusters;
    });

    it('Filters out reporting setup based on bind status', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);

        // Setup
        const originalDeviceOutputClusters = device.getEndpoint(1).outputClusters;
        device.getEndpoint(1).outputClusters = [...device.getEndpoint(1).outputClusters, 768];
        const originalTargetBinds = target.binds;
        target.binds = [{cluster: {name: 'genLevelCtrl'}, target: zigbeeHerdsman.devices.coordinator.getEndpoint(1)}];
        target.getClusterAttributeValue.mockImplementationOnce((cluster, value) => undefined);
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

        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({transaction: '1234', from: 'remote', to: 'bulb_color'}));
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
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                transaction: '1234',
                data: {from: 'remote', to: 'bulb_color', clusters: ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl'], failed: []},
                status: 'ok',
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), {retain: true, qos: 0}, expect.any(Function));

        // Teardown
        target.configuredReportings = originalTargetCR;
        target.binds = originalTargetBinds;
        device.getEndpoint(1).outputClusters = originalDeviceOutputClusters;
    });

    it('Should bind only specified clusters', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'bulb_color', clusters: ['genOnOff']}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {from: 'remote', to: 'bulb_color', clusters: ['genOnOff'], failed: []}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should log error when there is nothing to bind', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        logger.error.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'button'}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {from: 'remote', to: 'button', clusters: [], failed: []}, status: 'error', error: 'Nothing to bind'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should unbind', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);

        // setup
        target.configureReporting.mockImplementationOnce(() => {
            throw new Error('timeout');
        });
        const originalRemoteBinds = device.getEndpoint(1).binds;
        device.getEndpoint(1).binds = [];
        const originalTargetBinds = target.binds;
        target.binds = [
            {cluster: {name: 'genOnOff'}, target: zigbeeHerdsman.devices.coordinator.getEndpoint(1)},
            {cluster: {name: 'genLevelCtrl'}, target: zigbeeHerdsman.devices.coordinator.getEndpoint(1)},
            {cluster: {name: 'lightingColorCtrl'}, target: zigbeeHerdsman.devices.coordinator.getEndpoint(1)},
        ];

        const endpoint = device.getEndpoint(1);
        mockClear(device);
        delete zigbeeHerdsman.devices.bulb_color.meta.configured;
        expect(zigbeeHerdsman.devices.bulb_color.meta.configured).toBe(undefined);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/unbind', stringify({from: 'remote', to: 'bulb_color'}));
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
        expect(zigbeeHerdsman.devices.bulb_color.meta.configured).toBe(332242049);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/unbind',
            stringify({data: {from: 'remote', to: 'bulb_color', clusters: ['genScenes', 'genOnOff', 'genLevelCtrl'], failed: []}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        // Teardown
        target.binds = originalTargetBinds;
        device.getEndpoint(1).binds = originalRemoteBinds;
    });

    it('Should unbind coordinator', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.coordinator.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        endpoint.unbind.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/unbind', stringify({from: 'remote', to: 'Coordinator'}));
        await flushPromises();
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        expect(endpoint.unbind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.unbind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.unbind).toHaveBeenCalledWith('genScenes', target);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/unbind',
            stringify({data: {from: 'remote', to: 'Coordinator', clusters: ['genScenes', 'genOnOff', 'genLevelCtrl'], failed: []}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should bind to groups', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.groups.group_1;
        const target1Member = zigbeeHerdsman.devices.bulb.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        target.members.push(target1Member);
        target1Member.configureReporting.mockClear();
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'group_1'}));
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
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {from: 'remote', to: 'group_1', clusters: ['genScenes', 'genOnOff', 'genLevelCtrl'], failed: []}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );

        // Should configure reproting for device added to group
        target1Member.configureReporting.mockClear();
        await MQTT.events.message('zigbee2mqtt/bridge/group/group_1/add', 'bulb');
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
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.groups.group_1;
        const target1Member = zigbeeHerdsman.devices.bulb.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        target.members.push(target1Member);
        target1Member.configureReporting.mockClear();
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/unbind', stringify({from: 'remote', to: 'group_1'}));
        await flushPromises();
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        expect(endpoint.unbind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.unbind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.unbind).toHaveBeenCalledWith('genScenes', target);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/unbind',
            stringify({data: {from: 'remote', to: 'group_1', clusters: ['genScenes', 'genOnOff', 'genLevelCtrl'], failed: []}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should unbind from group with skip_disable_reporting=true', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.groups.group_1;
        const target1Member = zigbeeHerdsman.devices.bulb_2.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        target.members.push(target1Member);

        // The device unbind mock doesn't remove binds, therefore remove them here already otherwise configure reporiting is not disabled.
        const originalBinds = endpoint.binds;
        endpoint.binds = [];

        target1Member.binds = [
            {cluster: {name: 'genLevelCtrl'}, target: zigbeeHerdsman.devices.coordinator.getEndpoint(1)},
            {cluster: {name: 'genOnOff'}, target: zigbeeHerdsman.devices.coordinator.getEndpoint(1)},
        ];
        target1Member.configureReporting.mockClear();
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/unbind', stringify({from: 'remote', to: 'group_1', skip_disable_reporting: true}));
        await flushPromises();
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        // with skip_disable_reporting set to false, we don't expect it to reconfigure reporting
        expect(target1Member.configureReporting).toHaveBeenCalledTimes(0);
        endpoint.binds = originalBinds;
    });

    it('Should unbind from group with skip_disable_reporting=false', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.groups.group_1;
        const target1Member = zigbeeHerdsman.devices.bulb_2.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        target.members.push(target1Member);

        // The device unbind mock doesn't remove binds, therefore remove them here already otherwise configure reporiting is not disabled.
        const originalBinds = endpoint.binds;
        endpoint.binds = [];

        target1Member.binds = [
            {cluster: {name: 'genLevelCtrl'}, target: zigbeeHerdsman.devices.coordinator.getEndpoint(1)},
            {cluster: {name: 'genOnOff'}, target: zigbeeHerdsman.devices.coordinator.getEndpoint(1)},
        ];
        target1Member.configureReporting.mockClear();
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/unbind', stringify({from: 'remote', to: 'group_1', skip_disable_reporting: false}));
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
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.groups.group_1;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: '1'}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genScenes', target);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {from: 'remote', to: '1', clusters: ['genScenes', 'genOnOff', 'genLevelCtrl'], failed: []}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should log when bind fails', async () => {
        logger.error.mockClear();
        const device = zigbeeHerdsman.devices.remote;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        endpoint.bind.mockImplementation(() => {
            throw new Error('failed');
        });
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'bulb_color'}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                data: {from: 'remote', to: 'bulb_color', clusters: [], failed: ['genScenes', 'genOnOff', 'genLevelCtrl']},
                status: 'error',
                error: 'Failed to bind',
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should bind from non default endpoints', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.QBKG03LM.getEndpoint(3);
        const endpoint = device.getEndpoint(2);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote/ep2', to: 'wall_switch_double/right'}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {from: 'remote/ep2', to: 'wall_switch_double/right', clusters: ['genOnOff'], failed: []}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should bind server clusters to client clusters', async () => {
        const device = zigbeeHerdsman.devices.temperature_sensor;
        const target = zigbeeHerdsman.devices.heating_actuator.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'temperature_sensor', to: 'heating_actuator'}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith('msTemperatureMeasurement', target);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {from: 'temperature_sensor', to: 'heating_actuator', clusters: ['msTemperatureMeasurement'], failed: []}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should bind to default endpoint returned by endpoints()', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.QBKG04LM.getEndpoint(2);
        const endpoint = device.getEndpoint(2);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote/ep2', to: 'wall_switch'}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({data: {from: 'remote/ep2', to: 'wall_switch', clusters: ['genOnOff'], failed: []}, status: 'ok'}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should unbind from default_bind_group', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = 'default_bind_group';
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/unbind', stringify({from: 'remote', to: target}));
        await flushPromises();
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        expect(endpoint.unbind).toHaveBeenCalledWith('genOnOff', 901);
        expect(endpoint.unbind).toHaveBeenCalledWith('genLevelCtrl', 901);
        expect(endpoint.unbind).toHaveBeenCalledWith('genScenes', 901);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/unbind',
            stringify({
                data: {from: 'remote', to: 'default_bind_group', clusters: ['genScenes', 'genOnOff', 'genLevelCtrl'], failed: []},
                status: 'ok',
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Error bind fails when source device does not exist', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote_not_existing', to: 'bulb_color'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                data: {from: 'remote_not_existing', to: 'bulb_color'},
                status: 'error',
                error: "Source device 'remote_not_existing' does not exist",
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it("Error bind fails when source device's endpoint does not exist", async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote/not_existing_endpoint', to: 'bulb_color'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                data: {from: 'remote/not_existing_endpoint', to: 'bulb_color'},
                status: 'error',
                error: "Source device 'remote' does not have endpoint 'not_existing_endpoint'",
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Error bind fails when target device or group does not exist', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'bulb_color_not_existing'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                data: {from: 'remote', to: 'bulb_color_not_existing'},
                status: 'error',
                error: "Target device or group 'bulb_color_not_existing' does not exist",
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it("Error bind fails when target device's endpoint does not exist", async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'bulb_color/not_existing_endpoint'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({
                data: {from: 'remote', to: 'bulb_color/not_existing_endpoint'},
                status: 'error',
                error: "Target device 'bulb_color' does not have endpoint 'not_existing_endpoint'",
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Legacy api: Should bind', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/bind/remote', 'bulb_color');
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genScenes', target);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({
            type: 'device_bind',
            message: {from: 'remote', to: 'bulb_color', cluster: 'genScenes'},
        });
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({
            type: 'device_bind',
            message: {from: 'remote', to: 'bulb_color', cluster: 'genOnOff'},
        });
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({
            type: 'device_bind',
            message: {from: 'remote', to: 'bulb_color', cluster: 'genLevelCtrl'},
        });
    });

    it('Legacy api: Should log error when there is nothing to bind', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        logger.error.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/bind/remote', 'button');
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(0);
        expect(logger.error).toHaveBeenCalledWith(`Nothing to bind from 'remote' to 'button'`);
    });

    it('Legacy api: Should unbind', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/unbind/remote', 'bulb_color');
        await flushPromises();
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        expect(endpoint.unbind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.unbind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.unbind).toHaveBeenCalledWith('genScenes', target);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({
            type: 'device_unbind',
            message: {from: 'remote', to: 'bulb_color', cluster: 'genScenes'},
        });
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({
            type: 'device_unbind',
            message: {from: 'remote', to: 'bulb_color', cluster: 'genOnOff'},
        });
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({
            type: 'device_unbind',
            message: {from: 'remote', to: 'bulb_color', cluster: 'genLevelCtrl'},
        });
    });

    it('Legacy api: Should unbind coordinator', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.coordinator.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        endpoint.unbind.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/unbind/remote', 'Coordinator');
        await flushPromises();
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        expect(endpoint.unbind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.unbind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.unbind).toHaveBeenCalledWith('genScenes', target);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({
            type: 'device_unbind',
            message: {from: 'remote', to: 'Coordinator', cluster: 'genScenes'},
        });
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({
            type: 'device_unbind',
            message: {from: 'remote', to: 'Coordinator', cluster: 'genOnOff'},
        });
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({
            type: 'device_unbind',
            message: {from: 'remote', to: 'Coordinator', cluster: 'genLevelCtrl'},
        });
    });

    it('Legacy api: Should bind to groups', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.groups.group_1;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/bind/remote', 'group_1');
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genScenes', target);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({
            type: 'device_bind',
            message: {from: 'remote', to: 'group_1', cluster: 'genScenes'},
        });
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({
            type: 'device_bind',
            message: {from: 'remote', to: 'group_1', cluster: 'genOnOff'},
        });
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({
            type: 'device_bind',
            message: {from: 'remote', to: 'group_1', cluster: 'genLevelCtrl'},
        });
    });

    it('Legacy api: Should bind to group by number', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.groups.group_1;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/bind/remote', '1');
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', target);
        expect(endpoint.bind).toHaveBeenCalledWith('genScenes', target);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({
            type: 'device_bind',
            message: {from: 'remote', to: 'group_1', cluster: 'genScenes'},
        });
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({
            type: 'device_bind',
            message: {from: 'remote', to: 'group_1', cluster: 'genOnOff'},
        });
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({
            type: 'device_bind',
            message: {from: 'remote', to: 'group_1', cluster: 'genLevelCtrl'},
        });
    });

    it('Legacy api: Should log when bind fails', async () => {
        logger.error.mockClear();
        const device = zigbeeHerdsman.devices.remote;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        endpoint.bind.mockImplementationOnce(() => {
            throw new Error('failed');
        });
        MQTT.events.message('zigbee2mqtt/bridge/bind/remote', 'bulb_color');
        await flushPromises();
        expect(logger.error).toHaveBeenCalledWith("Failed to bind cluster 'genScenes' from 'remote' to 'bulb_color' (Error: failed)");
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
    });

    it('Legacy api: Should bind from non default endpoints', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.QBKG03LM.getEndpoint(3);
        const endpoint = device.getEndpoint(2);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/bind/remote/ep2', 'wall_switch_double/right');
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
    });

    it('Legacy api: Should bind to default endpoint returned by endpoints()', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.QBKG04LM.getEndpoint(2);
        const endpoint = device.getEndpoint(2);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/bind/remote/ep2', 'wall_switch');
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith('genOnOff', target);
    });

    it('Legacy api: Should unbind from default_bind_group', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = 'default_bind_group';
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/unbind/remote', target);
        await flushPromises();
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        expect(endpoint.unbind).toHaveBeenCalledWith('genOnOff', 901);
        expect(endpoint.unbind).toHaveBeenCalledWith('genLevelCtrl', 901);
        expect(endpoint.unbind).toHaveBeenCalledWith('genScenes', 901);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({
            type: 'device_unbind',
            message: {from: 'remote', to: 'default_bind_group', cluster: 'genScenes'},
        });
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({
            type: 'device_unbind',
            message: {from: 'remote', to: 'default_bind_group', cluster: 'genOnOff'},
        });
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({
            type: 'device_unbind',
            message: {from: 'remote', to: 'default_bind_group', cluster: 'genLevelCtrl'},
        });
    });

    it('Should poll bounded Hue bulb when receiving message from Hue dimmer', async () => {
        const remote = zigbeeHerdsman.devices.remote;
        const data = {button: 3, unknown1: 3145728, type: 2, unknown2: 0, time: 1};
        const payload = {
            data,
            cluster: 'manuSpecificPhilips',
            device: remote,
            endpoint: remote.getEndpoint(2),
            type: 'commandHueNotification',
            linkquality: 10,
            groupID: 0,
        };
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(debounce).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.devices.bulb_color.getEndpoint(1).read).toHaveBeenCalledWith('genLevelCtrl', ['currentLevel']);
    });

    it('Should poll bounded Hue bulb when receiving message from scene controller', async () => {
        const remote = zigbeeHerdsman.devices.bj_scene_switch;
        const data = {action: 'recall_2_row_1'};
        zigbeeHerdsman.devices.bulb_color_2.getEndpoint(1).read.mockImplementationOnce(() => {
            throw new Error('failed');
        });
        const payload = {
            data,
            cluster: 'genScenes',
            device: remote,
            endpoint: remote.getEndpoint(10),
            type: 'commandRecall',
            linkquality: 10,
            groupID: 0,
        };
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        // Calls to three clusters are expected in this case
        expect(debounce).toHaveBeenCalledTimes(3);
        expect(zigbeeHerdsman.devices.bulb_color_2.getEndpoint(1).read).toHaveBeenCalledWith('genOnOff', ['onOff']);
        expect(zigbeeHerdsman.devices.bulb_color_2.getEndpoint(1).read).toHaveBeenCalledWith('genLevelCtrl', ['currentLevel']);
        expect(zigbeeHerdsman.devices.bulb_color_2.getEndpoint(1).read).toHaveBeenCalledWith('lightingColorCtrl', [
            'currentX',
            'currentY',
            'colorTemperature',
        ]);
    });

    it('Should poll grouped Hue bulb when receiving message from TRADFRI remote', async () => {
        zigbeeHerdsman.devices.bulb_color_2.getEndpoint(1).read.mockClear();
        zigbeeHerdsman.devices.bulb_2.getEndpoint(1).read.mockClear();
        const remote = zigbeeHerdsman.devices.tradfri_remote;
        const data = {stepmode: 0, stepsize: 43, transtime: 5};
        const payload = {
            data,
            cluster: 'genLevelCtrl',
            device: remote,
            endpoint: remote.getEndpoint(1),
            type: 'commandStepWithOnOff',
            linkquality: 10,
            groupID: 15071,
        };
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(debounce).toHaveBeenCalledTimes(2);
        expect(zigbeeHerdsman.devices.bulb_color_2.getEndpoint(1).read).toHaveBeenCalledTimes(2);
        expect(zigbeeHerdsman.devices.bulb_color_2.getEndpoint(1).read).toHaveBeenCalledWith('genLevelCtrl', ['currentLevel']);
        expect(zigbeeHerdsman.devices.bulb_color_2.getEndpoint(1).read).toHaveBeenCalledWith('genOnOff', ['onOff']);

        // Should also only debounce once
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(debounce).toHaveBeenCalledTimes(2);
        expect(zigbeeHerdsman.devices.bulb_color_2.getEndpoint(1).read).toHaveBeenCalledTimes(4);

        // Should only call Hue bulb, not e.g. tradfri
        expect(zigbeeHerdsman.devices.bulb_2.getEndpoint(1).read).toHaveBeenCalledTimes(0);
    });
});
