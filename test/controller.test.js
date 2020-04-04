const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const path = require('path');
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);
const tmp = require('tmp');
const mocksClear = [
    zigbeeHerdsman.permitJoin, mockExit, MQTT.end, zigbeeHerdsman.stop, logger.debug,
    MQTT.publish, MQTT.connect, zigbeeHerdsman.devices.bulb_color.removeFromNetwork,
    zigbeeHerdsman.devices.bulb.removeFromNetwork, logger.error,
];

const fs = require('fs');

describe('Controller', () => {
    let controller;

    beforeEach(() => {
        zigbeeHerdsman.returnDevices.splice(0);
        controller = new Controller();
        mocksClear.forEach((m) => m.mockClear());
        data.writeDefaultConfiguration();
        settings._reRead();
        data.writeDefaultState();
    });

    it('Start controller', async () => {
        await controller.start();
        expect(zigbeeHerdsman.constructor).toHaveBeenCalledWith({"network":{"panID":6754,"extendedPanID":[221,221,221,221,221,221,221,221],"channelList":[11],"networkKey":[1,3,5,7,9,11,13,15,0,2,4,6,8,10,12,13]},"databasePath":path.join(data.mockDir, "database.db"), "databaseBackupPath":path.join(data.mockDir, "database.db.backup"),"backupPath":path.join(data.mockDir, "coordinator_backup.json"),"acceptJoiningDeviceHandler": expect.any(Function),adapter: {concurrent: null}, "serialPort":{"baudRate":115200,"rtscts":true,"path":"/dev/dummy"}});
        expect(zigbeeHerdsman.start).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.setLED).toHaveBeenCalledTimes(0);
        expect(zigbeeHerdsman.setTransmitPower).toHaveBeenCalledTimes(0);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(true);
        expect(logger.info).toHaveBeenCalledWith(`Currently ${Object.values(zigbeeHerdsman.devices).length - 1} devices are joined:`)
        expect(logger.info).toHaveBeenCalledWith('bulb (0x000b57fffec6a5b2): LED1545G12 - IKEA TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white (Router)');
        expect(logger.info).toHaveBeenCalledWith('remote (0x0017880104e45517): 324131092621 - Philips Hue dimmer switch (EndDevice)');
        expect(logger.info).toHaveBeenCalledWith('0x0017880104e45518 (0x0017880104e45518): Not supported (EndDevice)');
        expect(MQTT.connect).toHaveBeenCalledTimes(1);
        expect(MQTT.connect).toHaveBeenCalledWith("mqtt://localhost", {"will": {"payload": "offline", "retain": true, "topic": "zigbee2mqtt/bridge/state"}});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb', '{"state":"ON","brightness":50,"color_temp":370,"linkquality":99}',{ retain: true, qos: 0 }, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/remote', '{"brightness":255}', { retain: true, qos: 0 }, expect.any(Function));
    });

    it('Start controller with specific MQTT settings', async () => {
        const ca = tmp.fileSync().name;
        fs.writeFileSync(ca, "ca");
        const key = tmp.fileSync().name;
        fs.writeFileSync(key, "key");
        const cert = tmp.fileSync().name;
        fs.writeFileSync(cert, "cert");

        const configuration = {
            base_topic: "zigbee2mqtt",
            server: "mqtt://localhost",
            keepalive: 30,
            ca, cert, key,
            password: 'pass',
            user: 'user1',
            client_id: 'my_client_id',
            reject_unauthorized: false,
            version: 5,
        }
        settings.set(['mqtt'], configuration)
        await controller.start();
        await flushPromises();
        expect(MQTT.connect).toHaveBeenCalledTimes(1);
        const expected = {
            "will": {"payload": "offline", "retain": true, "topic": "zigbee2mqtt/bridge/state"},
            keepalive: 30,
            ca: Buffer.from([99, 97]),
            key: Buffer.from([107, 101, 121]),
            cert: Buffer.from([99, 101, 114, 116]),
            password: 'pass',
            username: 'user1',
            clientId: 'my_client_id',
            rejectUnauthorized: false,
            protocolVersion: 5,

        }
        expect(MQTT.connect).toHaveBeenCalledWith("mqtt://localhost", expected);
    });

    it('Start controller should publish cached states', async () => {
        data.writeDefaultState();
        await controller.start();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb", `{"state":"ON","brightness":50,"color_temp":370,"linkquality":99}`, {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/remote", `{"brightness":255}`, {"qos": 0, "retain": true}, expect.any(Function));
    });

    it('Start controller should not publish cached states when cache_state is false', async () => {
        settings.set(['advanced', 'cache_state'], false);
        data.writeDefaultState();
        await controller.start();
        await flushPromises();
        expect(MQTT.publish).not.toHaveBeenCalledWith("zigbee2mqtt/bulb", `{"state":"ON","brightness":50,"color_temp":370,"linkquality":99}`, {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).not.toHaveBeenCalledWith("zigbee2mqtt/remote", `{"brightness":255}`, {"qos": 0, "retain": true}, expect.any(Function));
    });

    it('Log when MQTT client is unavailable', async () => {
        jest.useFakeTimers();
        await controller.start();
        await flushPromises();
        logger.error.mockClear();
        controller.mqtt.client.reconnecting = true;
        jest.advanceTimersByTime(11 * 1000);
        await flushPromises();
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith("Not connected to MQTT server!");
        controller.mqtt.client.reconnecting = false;
    });

    it('Dont publish to mqtt when client is unavailable', async () => {
        await controller.start();
        await flushPromises();
        logger.error.mockClear();
        controller.mqtt.client.reconnecting = true;
        await controller.publishEntityState('bulb', {state: 'ON', brightness: 50, color_temp: 370, color: {r: 100, g: 50, b: 10}, dummy: {1: 'yes', 2: 'no'}});
        await flushPromises();
        expect(logger.error).toHaveBeenCalledTimes(2);
        expect(logger.error).toHaveBeenCalledWith("Not connected to MQTT server!");
        expect(logger.error).toHaveBeenCalledWith("Cannot send message: topic: 'zigbee2mqtt/bulb', payload: '{\"state\":\"ON\",\"brightness\":50,\"color_temp\":370,\"linkquality\":99,\"color\":{\"r\":100,\"g\":50,\"b\":10},\"dummy\":{\"1\":\"yes\",\"2\":\"no\"}}");
        controller.mqtt.client.reconnecting = false;
    });

    it('Load empty state when state file does not exist', async () => {
        data.removeState();
        await controller.start();
        await flushPromises();
        expect(controller.state.state).toStrictEqual({});
    });

    it('Should remove non whitelisted devices on startup', async () => {
        settings.set(['whitelist'], [zigbeeHerdsman.devices.bulb_color.ieeeAddr]);
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsman.devices.bulb_color.removeFromNetwork).toHaveBeenCalledTimes(0);
        expect(zigbeeHerdsman.devices.bulb.removeFromNetwork).toHaveBeenCalledTimes(1);
    });

    it('Should remove banned devices on startup', async () => {
        settings.set(['ban'], [zigbeeHerdsman.devices.bulb_color.ieeeAddr]);
        await controller.start();
        await flushPromises();
        expect(zigbeeHerdsman.devices.bulb_color.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.devices.bulb.removeFromNetwork).toHaveBeenCalledTimes(0);
    });

    it('Start controller fails', async () => {
        zigbeeHerdsman.start.mockImplementationOnce(() => {throw new Error('failed')});
        await controller.start();
        expect(mockExit).toHaveBeenCalledTimes(1);
    });

    it('Start controller with permit join true', async () => {
        settings.set(['permit_join'], false);
        await controller.start();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(false);
    });

    it('Refuse to start when configuration.yaml is invalid', async () => {
        settings.set(['permit_join'], 'invalid');
        await controller.start();
        expect(logger.error).toHaveBeenCalledWith('Refusing to start, configuration.yaml is not valid, found the following errors:');
        expect(logger.error).toHaveBeenCalledWith('\t - permit_join should be boolean');
        expect(mockExit).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('Start controller with disable_led', async () => {
        settings.set(['serial', 'disable_led'], true);
        await controller.start();
        expect(zigbeeHerdsman.setLED).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.setLED).toHaveBeenCalledWith(false);
    });

    it('Start controller with transmit power', async () => {
        settings.set(['experimental', 'transmit_power'], 14);
        await controller.start();
        expect(zigbeeHerdsman.setTransmitPower).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.setTransmitPower).toHaveBeenCalledWith(14);
    });

    it('Start controller and stop', async () => {
        await controller.start();
        await controller.stop();
        expect(MQTT.end).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.stop).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('Start controller and stop', async () => {
        zigbeeHerdsman.stop.mockImplementationOnce(() => {throw new Error('failed')})
        await controller.start();
        await controller.stop();
        expect(MQTT.end).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.stop).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('Start controller adapter disconnects', async () => {
        zigbeeHerdsman.stop.mockImplementationOnce(() => {throw new Error('failed')})
        await controller.start();
        await zigbeeHerdsman.events.adapterDisconnected();
        await flushPromises();
        expect(MQTT.end).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.stop).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('Handle mqtt message', async () => {
        await controller.start();
        logger.debug.mockClear();
        await MQTT.events.message('dummytopic', 'dummymessage');
        expect(logger.debug).toHaveBeenCalledWith("Received MQTT message on 'dummytopic' with data 'dummymessage'")
    });

    it('On zigbee event message', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.bulb;
        const payload = {device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10, cluster: 'genBasic', data: {modelId: device.modelID}};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(logger.debug).toHaveBeenCalledWith(`Received Zigbee message from 'bulb', type 'attributeReport', cluster 'genBasic', data '{"modelId":"TRADFRI bulb E27 WS opal 980lm"}' from endpoint 1`);
    });

    it('On zigbee event message with group ID', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.bulb;
        const payload = {device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10, groupID: 0, cluster: 'genBasic', data: {modelId: device.modelID}};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(logger.debug).toHaveBeenCalledWith(`Received Zigbee message from 'bulb', type 'attributeReport', cluster 'genBasic', data '{"modelId":"TRADFRI bulb E27 WS opal 980lm"}' from endpoint 1 with groupID 0`);
    });

    it('Should add entities which are missing from configuration but are in database to configuration', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.notInSettings;
        expect(settings.getDevice(device.ieeeAddr)).not.toBeNull();
    });

    it('On zigbee event message from unkown device should create it', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.notInSettings;
        settings.removeDevice(device.ieeeAddr);
        expect(settings.getDevice(device.ieeeAddr)).toBeNull();
        const payload = {device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10, groupID: 0, cluster: 'genBasic', data: {modelId: device.modelID}};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(settings.getDevice(device.ieeeAddr)).toStrictEqual({"ID": "0x0017880104e45519", "friendlyName": "0x0017880104e45519", "friendly_name": "0x0017880104e45519"});
    });

    it('On zigbee deviceJoined', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.bulb;
        const payload = {device};
        await zigbeeHerdsman.events.deviceJoined(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bridge/log", '{"type":"device_connected","message":{"friendly_name":"bulb"}}', {"retain": false, qos: 0}, expect.any(Function));
    });

    it('acceptJoiningDeviceHandler reject banned device', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.bulb;
        settings.set(['ban'], [device.ieeeAddr]);
        const handler = zigbeeHerdsman.constructor.mock.calls[0][0].acceptJoiningDeviceHandler;
        expect(await handler(device.ieeeAddr)).toBe(false);
    });

    it('acceptJoiningDeviceHandler accept not banned device', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.bulb;
        settings.set(['ban'], ['123']);
        const handler = zigbeeHerdsman.constructor.mock.calls[0][0].acceptJoiningDeviceHandler;
        expect(await handler(device.ieeeAddr)).toBe(true);
    });

    it('acceptJoiningDeviceHandler accept whitelisted device', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.bulb;
        settings.set(['whitelist'], [device.ieeeAddr]);
        const handler = zigbeeHerdsman.constructor.mock.calls[0][0].acceptJoiningDeviceHandler;
        expect(await handler(device.ieeeAddr)).toBe(true);
    });

    it('acceptJoiningDeviceHandler reject non-whitelisted device', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.bulb;
        settings.set(['whitelist'], ['123']);
        const handler = zigbeeHerdsman.constructor.mock.calls[0][0].acceptJoiningDeviceHandler;
        expect(await handler(device.ieeeAddr)).toBe(false);
    });

    it('acceptJoiningDeviceHandler should prefer whitelist above ban', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.bulb;
        settings.set(['whitelist'], [device.ieeeAddr]);
        settings.set(['ban'], [device.ieeeAddr]);
        const handler = zigbeeHerdsman.constructor.mock.calls[0][0].acceptJoiningDeviceHandler;
        expect(await handler(device.ieeeAddr)).toBe(true);
    });

    it('acceptJoiningDeviceHandler accept when no ban and whitelist', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.bulb;
        const handler = zigbeeHerdsman.constructor.mock.calls[0][0].acceptJoiningDeviceHandler;
        expect(await handler(device.ieeeAddr)).toBe(true);
    });

    it('Shouldnt crash when two device join events are received', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.bulb;
        const payload = {device};
        zigbeeHerdsman.events.deviceJoined(payload);
        zigbeeHerdsman.events.deviceJoined(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bridge/log", '{"type":"device_connected","message":{"friendly_name":"bulb"}}', {"retain": false, qos: 0}, expect.any(Function));
    });

    it('On zigbee deviceInterview started', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.bulb;
        const payload = {device, status: 'started'};
        await zigbeeHerdsman.events.deviceInterview(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/log', '{"type":"pairing","message":"interview_started","meta":{"friendly_name":"bulb"}}', { retain: false, qos: 0 }, expect.any(Function));
    });

    it('On zigbee deviceInterview failed', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.bulb;
        const payload = {device, status: 'failed'};
        await zigbeeHerdsman.events.deviceInterview(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/log', '{"type":"pairing","message":"interview_failed","meta":{"friendly_name":"bulb"}}', { retain: false, qos: 0 }, expect.any(Function));
    });

    it('On zigbee deviceInterview successful supported', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.bulb;
        const payload = {device, status: 'successful'};
        await zigbeeHerdsman.events.deviceInterview(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/log', '{"type":"pairing","message":"interview_successful","meta":{"friendly_name":"bulb","model":"LED1545G12","vendor":"IKEA","description":"TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white","supported":true}}', { retain: false, qos: 0 }, expect.any(Function));
    });

    it('On zigbee deviceInterview successful not supported', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.unsupported;
        const payload = {device, status: 'successful'};
        await zigbeeHerdsman.events.deviceInterview(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/log', '{"type":"pairing","message":"interview_successful","meta":{"friendly_name":"0x0017880104e45518","supported":false}}', { retain: false, qos: 0 }, expect.any(Function));
    });

    it('On zigbee event device announce', async () => {
        await controller.start();
        const device = zigbeeHerdsman.devices.bulb;
        const payload = {device};
        await zigbeeHerdsman.events.deviceAnnounce(payload);
        await flushPromises();
        expect(logger.debug).toHaveBeenCalledWith(`Device 'bulb' announced itself`);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/log', '{"type":"device_announced","message":"announce","meta":{"friendly_name":"bulb"}}', { retain: false, qos: 0}, expect.any(Function));
    });

    it('On zigbee event device leave (removed from database and settings)', async () => {
        await controller.start();
        zigbeeHerdsman.returnDevices.push('0x00124b00120144ae');
        settings.set(['devices'], {})
        MQTT.publish.mockClear();
        const device = zigbeeHerdsman.devices.bulb;
        const payload = {ieeeAddr: device.ieeeAddr};
        await zigbeeHerdsman.events.deviceLeave(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/log', '{"type":"device_removed","message":"left_network","meta":{"friendly_name":"0x000b57fffec6a5b2"}}', { retain: false, qos: 0}, expect.any(Function));
    });

    it('On zigbee event device leave (removed from database and NOT settings)', async () => {
        await controller.start();
        zigbeeHerdsman.returnDevices.push('0x00124b00120144ae');
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        const payload = {ieeeAddr: device.ieeeAddr};
        await zigbeeHerdsman.events.deviceLeave(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/log', '{"type":"device_removed","message":"left_network","meta":{"friendly_name":"0x000b57fffec6a5b2"}}', { retain: false, qos: 0}, expect.any(Function));
    });

    it('Publish entity state attribute output', async () => {
        await controller.start();
        settings.set(['experimental', 'output'], 'attribute');
        MQTT.publish.mockClear();
        await controller.publishEntityState('bulb', {state: 'ON', brightness: 50, color_temp: 370, color: {r: 100, g: 50, b: 10}, dummy: {1: 'yes', 2: 'no'}});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb/state", "ON", {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb/brightness", "50", {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb/color_temp", "370", {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb/color", '100,50,10', {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb/dummy-1", 'yes', {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb/dummy-2", 'no', {"qos": 0, "retain": true}, expect.any(Function));
    });

    it('Publish entity state attribute_json output', async () => {
        await controller.start();
        settings.set(['experimental', 'output'], 'attribute_and_json');
        MQTT.publish.mockClear();
        await controller.publishEntityState('bulb', {state: 'ON', brightness: 200, color_temp: 370, linkquality: 99});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(5);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb/state", "ON", {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb/brightness", "200", {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb/color_temp", "370", {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb/linkquality", "99", {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb", '{"state":"ON","brightness":200,"color_temp":370,"linkquality":99}', {"qos": 0, "retain": true}, expect.any(Function));
    });


    it('Publish entity state attribute_json output filtered', async () => {
        await controller.start();
        settings.set(['experimental', 'output'], 'attribute_and_json');
        settings.set(['devices', zigbeeHerdsman.devices.bulb.ieeeAddr, 'filtered_attributes'], ['color_temp', 'linkquality']);
        MQTT.publish.mockClear();
        await controller.publishEntityState('bulb', {state: 'ON', brightness: 200, color_temp: 370, linkquality: 99});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(3);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb/state", "ON", {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb/brightness", "200", {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb", '{"state":"ON","brightness":200}', {"qos": 0, "retain": true}, expect.any(Function));
    });

    it('Publish entity state attribute_json output filtered (device_options)', async () => {
        await controller.start();
        settings.set(['experimental', 'output'], 'attribute_and_json');
        settings.set(['device_options', 'filtered_attributes'], ['color_temp', 'linkquality']);
        MQTT.publish.mockClear();
        await controller.publishEntityState('bulb', {state: 'ON', brightness: 200, color_temp: 370, linkquality: 99});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(3);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb/state", "ON", {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb/brightness", "200", {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb", '{"state":"ON","brightness":200}', {"qos": 0, "retain": true}, expect.any(Function));
    });

    it('Publish entity state with device information', async () => {
        await controller.start();
        settings.set(['mqtt', 'include_device_information'], true);
        MQTT.publish.mockClear();
        await controller.publishEntityState('bulb', {state: 'ON'});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb', '{"state":"ON","brightness":50,"color_temp":370,"linkquality":99,"device":{"friendlyName":"bulb","model":"LED1545G12","ieeeAddr":"0x000b57fffec6a5b2","networkAddress":40369,"type":"Router","manufacturerID":4476,"powerSource":"Mains (single phase)","dateCode":null}}', {"qos": 0, "retain": true}, expect.any(Function));

        // Unsupported device should have model "unknown"
        await controller.publishEntityState('unsupported2', {state: 'ON'});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/unsupported2', '{"state":"ON","device":{"friendlyName":"unsupported2","model":"unknown","ieeeAddr":"0x0017880104e45529","networkAddress":6536,"type":"EndDevice","manufacturerID":0,"powerSource":"Battery","dateCode":null}}', {"qos": 0, "retain": false}, expect.any(Function));
    });

    it('Should publish entity state without retain', async () => {
        await controller.start();
        settings.set(['devices', zigbeeHerdsman.devices.bulb.ieeeAddr, 'retain'], false);
        MQTT.publish.mockClear();
        await controller.publishEntityState('bulb', {state: 'ON'});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb', '{"state":"ON","brightness":50,"color_temp":370,"linkquality":99}', {"qos": 0, "retain": false}, expect.any(Function));
    });

    it('Should publish entity state with retain', async () => {
        await controller.start();
        settings.set(['devices', zigbeeHerdsman.devices.bulb.ieeeAddr, 'retain'], true);
        MQTT.publish.mockClear();
        await controller.publishEntityState('bulb', {state: 'ON'});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb', '{"state":"ON","brightness":50,"color_temp":370,"linkquality":99}', {"qos": 0, "retain": true}, expect.any(Function));
    });

    it('Should publish entity state with expiring retention', async () => {
        await controller.start();
        settings.set(['mqtt', 'version'], 5);
        settings.set(['devices', zigbeeHerdsman.devices.bulb.ieeeAddr, 'retain'], true);
        settings.set(['devices', zigbeeHerdsman.devices.bulb.ieeeAddr, 'retention'], 37);
        MQTT.publish.mockClear();
        await controller.publishEntityState('bulb', {state: 'ON'});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb', '{"state":"ON","brightness":50,"color_temp":370,"linkquality":99}', {"qos": 0, "retain": true, "properties": {messageExpiryInterval: 37}}, expect.any(Function));
    });

    it('Publish entity state no empty messages', async () => {
        data.writeEmptyState();
        await controller.start();
        MQTT.publish.mockClear();
        await controller.publishEntityState('bulb', {});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Publish should not cache when set', async () => {
        settings.set(['advanced', 'cache_state'], false);
        data.writeEmptyState();
        await controller.start();
        MQTT.publish.mockClear();
        await controller.publishEntityState('bulb', {state: 'ON'});
        await controller.publishEntityState('bulb', {brightness: 200});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb", "{\"state\":\"ON\"}", {"qos": 0, "retain": true}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith("zigbee2mqtt/bulb", "{\"brightness\":200}", {"qos": 0, "retain": true}, expect.any(Function));
    });

    it('Publish should not do anything for unknown entity', async () => {
        await controller.start();
        MQTT.publish.mockClear();
        await controller.publishEntityState('bulb-unknown', {brightness: 200});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
    });

    it('Should start when state is corrupted', async () => {
        fs.writeFileSync(path.join(data.mockDir, 'state.json'), 'corrupted');
        await controller.start();
        await flushPromises();
        expect(controller.state.state).toStrictEqual({});
    });
});
