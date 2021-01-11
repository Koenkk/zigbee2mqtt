const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);
const stringify = require('json-stable-stringify-without-jsonify');

describe('Bind', () => {
    let controller;

    mockClear = (device) => {
        for (const endpoint of device.endpoints) {
            endpoint.read.mockClear();
            endpoint.write.mockClear();
            endpoint.configureReporting.mockClear();
            endpoint.bind = jest.fn();
            endpoint.bind.mockClear();
            endpoint.unbind.mockClear();
        }
    }

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings._reRead();
        data.writeEmptyState();
        zigbeeHerdsman.groups.group_1.members = [];
        zigbeeHerdsman.devices.bulb_color.getEndpoint(1).configureReporting.mockClear();
        zigbeeHerdsman.devices.bulb_color.getEndpoint(1).bind.mockClear();
        controller = new Controller();
        await controller.start();
        await flushPromises();
        this.coordinatorEndoint = zigbeeHerdsman.devices.coordinator.getEndpoint(1);
        MQTT.publish.mockClear();
    });

    it('Should bind to device and configure reporting', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        target.getClusterAttributeValue.mockImplementationOnce((cluster, value) =>  undefined);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'bulb_color'}));
        await flushPromises();
        expect(target.read).toHaveBeenCalledWith('lightingColorCtrl', [ 'colorCapabilities' ]);
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith("genOnOff", target);
        expect(endpoint.bind).toHaveBeenCalledWith("genLevelCtrl", target);
        expect(endpoint.bind).toHaveBeenCalledWith("genScenes", target);
        expect(target.configureReporting).toHaveBeenCalledTimes(3);
        expect(target.configureReporting).toHaveBeenCalledWith("genOnOff",[{"attribute": "onOff", "maximumReportInterval": 3600, "minimumReportInterval": 0, "reportableChange": 0}]);
        expect(target.configureReporting).toHaveBeenCalledWith("genLevelCtrl",[{"attribute": "currentLevel", "maximumReportInterval": 3600, "minimumReportInterval": 5, "reportableChange": 1}]);
        expect(target.configureReporting).toHaveBeenCalledWith("lightingColorCtrl",[{"attribute":"colorTemperature","minimumReportInterval":5,"maximumReportInterval":3600,"reportableChange":1},{"attribute":"currentX","minimumReportInterval":5,"maximumReportInterval":3600,"reportableChange":1},{"attribute":"currentY","minimumReportInterval":5,"maximumReportInterval":3600,"reportableChange":1}]);
        expect(MQTT.publish).toHaveBeenCalledTimes(6);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({"data":{"from":"remote","to":"bulb_color","clusters":["genScenes","genOnOff","genLevelCtrl"],"failed":[]},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/devices',
            expect.any(String),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should bind only specifief clusters', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'bulb_color', clusters: ["genOnOff"]}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith("genOnOff", target);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({"data":{"from":"remote","to":"bulb_color","clusters":["genOnOff"],"failed":[]},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
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
            stringify({"data":{"from":"remote","to":"button","clusters":[],"failed":[]},"status":"error","error":"Nothing to bind"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should unbind', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/unbind', stringify({from: 'remote', to: 'bulb_color'}));
        await flushPromises();
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        expect(endpoint.unbind).toHaveBeenCalledWith("genOnOff", target);
        expect(endpoint.unbind).toHaveBeenCalledWith("genLevelCtrl", target);
        expect(endpoint.unbind).toHaveBeenCalledWith("genScenes", target);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/unbind',
            stringify({"data":{"from":"remote","to":"bulb_color","clusters":["genScenes","genOnOff","genLevelCtrl"],"failed":[]},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
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
        expect(endpoint.unbind).toHaveBeenCalledWith("genOnOff", target);
        expect(endpoint.unbind).toHaveBeenCalledWith("genLevelCtrl", target);
        expect(endpoint.unbind).toHaveBeenCalledWith("genScenes", target);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/unbind',
            stringify({"data":{"from":"remote","to":"Coordinator","clusters":["genScenes","genOnOff","genLevelCtrl"],"failed":[]},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
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
        expect(endpoint.bind).toHaveBeenCalledWith("genOnOff", target);
        expect(endpoint.bind).toHaveBeenCalledWith("genLevelCtrl", target);
        expect(endpoint.bind).toHaveBeenCalledWith("genScenes", target);
        expect(target1Member.configureReporting).toHaveBeenCalledTimes(2);
        expect(target1Member.configureReporting).toHaveBeenCalledWith("genOnOff",[{"attribute": "onOff", "maximumReportInterval": 3600, "minimumReportInterval": 0, "reportableChange": 0}]);
        expect(target1Member.configureReporting).toHaveBeenCalledWith("genLevelCtrl",[{"attribute": "currentLevel", "maximumReportInterval": 3600, "minimumReportInterval": 5, "reportableChange": 1}]);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({"data":{"from":"remote","to":"group_1","clusters":["genScenes","genOnOff","genLevelCtrl"],"failed":[]},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );

        // Should configure reproting for device added to group
        target1Member.configureReporting.mockClear();
        await MQTT.events.message('zigbee2mqtt/bridge/group/group_1/add', 'bulb');
        await flushPromises();
        expect(target1Member.configureReporting).toHaveBeenCalledTimes(2);
        expect(target1Member.configureReporting).toHaveBeenCalledWith("genOnOff",[{"attribute": "onOff", "maximumReportInterval": 3600, "minimumReportInterval": 0, "reportableChange": 0}]);
        expect(target1Member.configureReporting).toHaveBeenCalledWith("genLevelCtrl",[{"attribute": "currentLevel", "maximumReportInterval": 3600, "minimumReportInterval": 5, "reportableChange": 1}]);
    });

    it('Should bind to group by number', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.groups.group_1;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: '1'}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith("genOnOff", target);
        expect(endpoint.bind).toHaveBeenCalledWith("genLevelCtrl", target);
        expect(endpoint.bind).toHaveBeenCalledWith("genScenes", target);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({"data":{"from":"remote","to":"1","clusters":["genScenes","genOnOff","genLevelCtrl"],"failed":[]},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should log when bind fails', async () => {
        logger.error.mockClear();
        const device = zigbeeHerdsman.devices.remote;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        endpoint.bind.mockImplementation(() => {throw new Error('failed')});
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'bulb_color'}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({"data":{"from":"remote","to":"bulb_color","clusters":[],"failed":["genScenes","genOnOff","genLevelCtrl"]},"status":"error","error":"Failed to bind"}),
            {retain: false, qos: 0}, expect.any(Function)
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
        expect(endpoint.bind).toHaveBeenCalledWith("genOnOff", target);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({"data":{"from":"remote/ep2","to":"wall_switch_double/right","clusters":["genOnOff"],"failed":[]},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
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
        expect(endpoint.bind).toHaveBeenCalledWith("genOnOff", target);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({"data":{"from":"remote/ep2","to":"wall_switch","clusters":["genOnOff"],"failed":[]},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
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
        expect(endpoint.unbind).toHaveBeenCalledWith("genOnOff", 901);
        expect(endpoint.unbind).toHaveBeenCalledWith("genLevelCtrl", 901);
        expect(endpoint.unbind).toHaveBeenCalledWith("genScenes", 901);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/unbind',
            stringify({"data":{"from":"remote","to":"default_bind_group","clusters":["genScenes","genOnOff","genLevelCtrl"],"failed":[]},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Error bind fails when source not existing', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote_not_existing', to: 'bulb_color'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({"data":{"from":"remote_not_existing","to":"bulb_color"},"status":"error","error":"Source device 'remote_not_existing' does not exist"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Error bind fails when target not existing', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'bulb_color_not_existing'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({"data":{"from":"remote","to":"bulb_color_not_existing"},"status":"error","error":"Target device or group 'bulb_color_not_existing' does not exist"}),
            {retain: false, qos: 0}, expect.any(Function)
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
        expect(endpoint.bind).toHaveBeenCalledWith("genOnOff", target);
        expect(endpoint.bind).toHaveBeenCalledWith("genLevelCtrl", target);
        expect(endpoint.bind).toHaveBeenCalledWith("genScenes", target);
        expect(MQTT.publish).toHaveBeenCalledTimes(5);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'bulb_color', cluster: 'genScenes'}});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'bulb_color', cluster: 'genOnOff'}});
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'bulb_color', cluster: 'genLevelCtrl'}});
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
        expect(endpoint.unbind).toHaveBeenCalledWith("genOnOff", target);
        expect(endpoint.unbind).toHaveBeenCalledWith("genLevelCtrl", target);
        expect(endpoint.unbind).toHaveBeenCalledWith("genScenes", target);
        expect(MQTT.publish).toHaveBeenCalledTimes(5);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'bulb_color', cluster: 'genScenes'}});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'bulb_color', cluster: 'genOnOff'}});
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'bulb_color', cluster: 'genLevelCtrl'}});
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
        expect(endpoint.unbind).toHaveBeenCalledWith("genOnOff", target);
        expect(endpoint.unbind).toHaveBeenCalledWith("genLevelCtrl", target);
        expect(endpoint.unbind).toHaveBeenCalledWith("genScenes", target);
        expect(MQTT.publish).toHaveBeenCalledTimes(5);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'Coordinator', cluster: 'genScenes'}});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'Coordinator', cluster: 'genOnOff'}});
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'Coordinator', cluster: 'genLevelCtrl'}});
    });

    it('Legacy api: Should bind to groups', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.groups.group_1;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/bind/remote', 'group_1');
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith("genOnOff", target);
        expect(endpoint.bind).toHaveBeenCalledWith("genLevelCtrl", target);
        expect(endpoint.bind).toHaveBeenCalledWith("genScenes", target);
        expect(MQTT.publish).toHaveBeenCalledTimes(5);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'group_1', cluster: 'genScenes'}});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'group_1', cluster: 'genOnOff'}});
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'group_1', cluster: 'genLevelCtrl'}});
    });

    it('Legacy api: Should bind to group by number', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.groups.group_1;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/bind/remote', '1');
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith("genOnOff", target);
        expect(endpoint.bind).toHaveBeenCalledWith("genLevelCtrl", target);
        expect(endpoint.bind).toHaveBeenCalledWith("genScenes", target);
        expect(MQTT.publish).toHaveBeenCalledTimes(5);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'group_1', cluster: 'genScenes'}});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'group_1', cluster: 'genOnOff'}});
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'group_1', cluster: 'genLevelCtrl'}});
    });

    it('Legacy api: Should log when bind fails', async () => {
        logger.error.mockClear();
        const device = zigbeeHerdsman.devices.remote;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        endpoint.bind.mockImplementationOnce(() => {throw new Error('failed')});
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
        expect(endpoint.bind).toHaveBeenCalledWith("genOnOff", target);
    });

    it('Legacy api: Should bind to default endpoint returned by endpoints()', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.QBKG04LM.getEndpoint(2);
        const endpoint = device.getEndpoint(2);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/bind/remote/ep2', 'wall_switch');
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith("genOnOff", target);
    });

    it('Legacy api: Should unbind from default_bind_group', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = 'default_bind_group';
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/unbind/remote', target);
        await flushPromises();
        expect(endpoint.unbind).toHaveBeenCalledTimes(3);
        expect(endpoint.unbind).toHaveBeenCalledWith("genOnOff", 901);
        expect(endpoint.unbind).toHaveBeenCalledWith("genLevelCtrl", 901);
        expect(endpoint.unbind).toHaveBeenCalledWith("genScenes", 901);
        expect(MQTT.publish).toHaveBeenCalledTimes(5);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'default_bind_group', cluster: 'genScenes'}});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'default_bind_group', cluster: 'genOnOff'}});
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'default_bind_group', cluster: 'genLevelCtrl'}});
    });

    it('Shouldnt configure again', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.bulb_color.getEndpoint(1);
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        target.binds.push({cluster: {name: 'genOnOff'}, target: zigbeeHerdsman.devices.coordinator.getEndpoint(1)});
        target.configureReporting.mockImplementationOnce(() => {throw new Error('')});
        target.configuredReportings.push({cluster: {name: 'genOnOff'}, attribute: {name: 'onOff'}, maximumReportInterval: 3600, minimumReportInterval: 0, reportableChange: 0});
        MQTT.events.message('zigbee2mqtt/bridge/request/device/bind', stringify({from: 'remote', to: 'bulb_color'}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
        expect(endpoint.bind).toHaveBeenCalledWith("genOnOff", target);
        expect(endpoint.bind).toHaveBeenCalledWith("genLevelCtrl", target);
        expect(endpoint.bind).toHaveBeenCalledWith("genScenes", target);
        expect(target.configureReporting).toHaveBeenCalledTimes(2);
        expect(target.configureReporting).toHaveBeenCalledWith("genLevelCtrl",[{"attribute": "currentLevel", "maximumReportInterval": 3600, "minimumReportInterval": 5, "reportableChange": 1}]);
        expect(target.configureReporting).toHaveBeenCalledWith("lightingColorCtrl",[{"attribute":"colorTemperature","minimumReportInterval":5,"maximumReportInterval":3600,"reportableChange":1},{"attribute":"currentX","minimumReportInterval":5,"maximumReportInterval":3600,"reportableChange":1},{"attribute":"currentY","minimumReportInterval":5,"maximumReportInterval":3600,"reportableChange":1}]);
        expect(logger.warn).toHaveBeenCalledWith("Failed to setup reporting for 'bulb_color/1' cluster 'genLevelCtrl'")
        expect(MQTT.publish).toHaveBeenCalledTimes(6);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/bind',
            stringify({"data":{"from":"remote","to":"bulb_color","clusters":["genScenes","genOnOff","genLevelCtrl"],"failed":[]},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/devices',
            expect.any(String),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });
});
