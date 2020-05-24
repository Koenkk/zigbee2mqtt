const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);

describe('Bind', () => {
    let controller;

    mockClear = (device) => {
        for (const endpoint of device.endpoints) {
            endpoint.read.mockClear();
            endpoint.write.mockClear();
            endpoint.configureReporting.mockClear();
            endpoint.bind.mockClear();
            endpoint.unbind.mockClear();
        }
    }

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings._reRead();
        data.writeEmptyState();
        controller = new Controller();
        await controller.start();
        await flushPromises();
        this.coordinatorEndoint = zigbeeHerdsman.devices.coordinator.getEndpoint(1);
        MQTT.publish.mockClear();
    });

    it('Should subscribe to topics', async () => {
        expect(MQTT.subscribe).toHaveBeenCalledWith('zigbee2mqtt/bridge/bind/#');
    });

    it('Should bind', async () => {
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
        expect(MQTT.publish).toHaveBeenCalledTimes(3);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'bulb_color', cluster: 'genScenes'}});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'bulb_color', cluster: 'genOnOff'}});
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'bulb_color', cluster: 'genLevelCtrl'}});
    });

    it('Should log error when there is nothing to bind', async () => {
        const device = zigbeeHerdsman.devices.bulb_color;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        logger.error.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/bind/remote', 'button');
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(0);
        expect(logger.error).toHaveBeenCalledWith(`Nothing to bind from 'remote' to 'button'`);
    });

    it('Should unbind', async () => {
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
        expect(MQTT.publish).toHaveBeenCalledTimes(3);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'bulb_color', cluster: 'genScenes'}});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'bulb_color', cluster: 'genOnOff'}});
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'bulb_color', cluster: 'genLevelCtrl'}});
    });

    it('Should unbind coordinator', async () => {
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
        expect(MQTT.publish).toHaveBeenCalledTimes(3);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'Coordinator', cluster: 'genScenes'}});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'Coordinator', cluster: 'genOnOff'}});
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'Coordinator', cluster: 'genLevelCtrl'}});
    });

    it('Should bind to groups', async () => {
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
        expect(MQTT.publish).toHaveBeenCalledTimes(3);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'group_1', cluster: 'genScenes'}});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'group_1', cluster: 'genOnOff'}});
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'group_1', cluster: 'genLevelCtrl'}});
    });

    it('Should bind to group by number', async () => {
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
        expect(MQTT.publish).toHaveBeenCalledTimes(3);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'group_1', cluster: 'genScenes'}});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'group_1', cluster: 'genOnOff'}});
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({type: 'device_bind', message: {from: 'remote', to: 'group_1', cluster: 'genLevelCtrl'}});
    });

    it('Should log when bind fails', async () => {
        logger.error.mockClear();
        const device = zigbeeHerdsman.devices.remote;
        const endpoint = device.getEndpoint(1);
        mockClear(device);
        endpoint.bind.mockImplementationOnce(() => {throw new Error('failed')});
        MQTT.events.message('zigbee2mqtt/bridge/bind/remote', 'bulb_color');
        await flushPromises();
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith("Failed to bind cluster 'genScenes' from 'remote' to 'bulb_color' (Error: failed)");
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
    });

    it('Should bind from non default endpoints', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.QBKG03LM.getEndpoint(3);
        const endpoint = device.getEndpoint(2);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/bind/remote/ep2', 'wall_switch_double/right');
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith("genOnOff", target);
    });

    it('Should bind to default endpoint returned by endpoints()', async () => {
        const device = zigbeeHerdsman.devices.remote;
        const target = zigbeeHerdsman.devices.QBKG04LM.getEndpoint(2);
        const endpoint = device.getEndpoint(2);
        mockClear(device);
        MQTT.events.message('zigbee2mqtt/bridge/bind/remote/ep2', 'wall_switch');
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith("genOnOff", target);
    });

    it('Should unbind from default_bind_group', async () => {
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
        expect(MQTT.publish).toHaveBeenCalledTimes(3);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'default_bind_group', cluster: 'genScenes'}});
        expect(MQTT.publish.mock.calls[1][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[1][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'default_bind_group', cluster: 'genOnOff'}});
        expect(MQTT.publish.mock.calls[2][0]).toStrictEqual('zigbee2mqtt/bridge/log');
        expect(JSON.parse(MQTT.publish.mock.calls[2][1])).toStrictEqual({type: 'device_unbind', message: {from: 'remote', to: 'default_bind_group', cluster: 'genLevelCtrl'}});
    });
});
