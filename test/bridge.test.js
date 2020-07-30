const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);

const {coordinator, bulb, unsupported, WXKG11LM} = zigbeeHerdsman.devices;
zigbeeHerdsman.returnDevices.push(coordinator.ieeeAddr);
zigbeeHerdsman.returnDevices.push(bulb.ieeeAddr);
zigbeeHerdsman.returnDevices.push(unsupported.ieeeAddr);
zigbeeHerdsman.returnDevices.push(WXKG11LM.ieeeAddr);

describe('Bridge', () => {
    let controller;

    beforeEach(async () => {
        MQTT.mock.reconnecting = false;
        data.writeDefaultConfiguration();
        settings._reRead();
        settings.set(['advanced', 'legacy_api'], false);
        settings.set(['experimental', 'new_api'], true);
        data.writeDefaultState();
        logger.info.mockClear();
        logger.warn.mockClear();
        logger.setTransportsEnabled(false);
        MQTT.publish.mockClear();
        const device = zigbeeHerdsman.devices.bulb;
        device.removeFromDatabase.mockClear();
        device.removeFromNetwork.mockClear();
        controller = new Controller();
        await controller.start();
        await flushPromises();
    });

    it('Should publish bridge info on startup', async () => {
        const version = await require('../lib/util/utils').getZigbee2mqttVersion();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/info',
          JSON.stringify({"version":version.version,"commit":version.commitHash,"coordinator":{"type":"z-Stack","meta":{"version":1,"revision":20190425}},"network":{"channel":15,"pan_id":5674,"extended_pan_id":[0,11,22]},"log_level":"info","permit_join":false}),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish devices on startup', async () => {
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/devices',
          JSON.stringify([{"ieee_address":"0x000b57fffec6a5b2","type":"Router","network_address":40369,"supported":true,"friendly_name":"bulb","definition":{"model":"LED1545G12","vendor":"IKEA","description":"TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white","supports":"on/off, brightness, color temperature"},"power_source":"Mains (single phase)","date_code":null,"interviewing":false,"interview_completed":true},{"ieee_address":"0x0017880104e45518","type":"EndDevice","network_address":6536,"supported":false,"friendly_name":"0x0017880104e45518","definition":null,"power_source":"Battery","date_code":null,"interviewing":false,"interview_completed":true},{"ieee_address":"0x0017880104e45520","type":"EndDevice","network_address":6537,"supported":true,"friendly_name":"button","definition":{"model":"WXKG11LM","vendor":"Xiaomi","description":"Aqara wireless switch","supports":"single, double click (and triple, quadruple, hold, release depending on model)"},"power_source":"Battery","date_code":null,"interviewing":false,"interview_completed":true}]),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should log to MQTT', async () => {
        logger.setTransportsEnabled(true);
        MQTT.publish.mockClear();
        logger.info.mockClear();
        logger.info("this is a test");
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/logging',
            JSON.stringify({message: 'this is a test', level: 'info'}),
          { retain: false, qos: 0 },
          expect.any(Function)
        );
        expect(logger.info).toHaveBeenCalledTimes(1);
    });

    it('Shouldnt log to MQTT when not connected', async () => {
        logger.setTransportsEnabled(true);
        MQTT.mock.reconnecting = true;
        MQTT.publish.mockClear();
        logger.info.mockClear();
        logger.error.mockClear();
        logger.info("this is a test");
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledTimes(0);
    });

    it('Should publish devices on startup', async () => {
        logger.setTransportsEnabled(true);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/groups',
          JSON.stringify([{"id":1,"friendly_name":"group_1","members":[]},{"id":15071,"friendly_name":"group_tradfri_remote","members":[]},{"id":99,"friendly_name":99,"members":[]},{"id":11,"friendly_name":"group_with_tradfri","members":[]},{"id":2,"friendly_name":"group_2","members":[]}]),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish event when device joined', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceJoined({device: zigbeeHerdsman.devices.bulb});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
          JSON.stringify({"type":"device_joined","data":{"friendly_name":"bulb","ieee_address":"0x000b57fffec6a5b2"}}),
          { retain: false, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish event when device interview started', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceInterview({device: zigbeeHerdsman.devices.bulb, status: 'started'});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
          JSON.stringify({"type":"device_interview","data":{"friendly_name":"bulb","status":"started","ieee_address":"0x000b57fffec6a5b2"}}),
          { retain: false, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish event and devices when device interview failed', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceInterview({device: zigbeeHerdsman.devices.bulb, status: 'failed'});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
          JSON.stringify({"type":"device_interview","data":{"friendly_name":"bulb","status":"failed","ieee_address":"0x000b57fffec6a5b2"}}),
          { retain: false, qos: 0 },
          expect.any(Function)
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/devices',
          expect.any(String),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish event and devices when device interview successful', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceInterview({device: zigbeeHerdsman.devices.bulb, status: 'successful'});
        await zigbeeHerdsman.events.deviceInterview({device: zigbeeHerdsman.devices.unsupported, status: 'successful'});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(4);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
            JSON.stringify({"type":"device_interview","data":{"friendly_name":"bulb","status":"successful","ieee_address":"0x000b57fffec6a5b2","supported":true,"definition":{"model":"LED1545G12","vendor":"IKEA","description":"TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white","supports":"on/off, brightness, color temperature"}}}),
            { retain: false, qos: 0 },
            expect.any(Function)
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
          'zigbee2mqtt/bridge/event',
            JSON.stringify({"type":"device_interview","data":{"friendly_name":"0x0017880104e45518","status":"successful","ieee_address":"0x0017880104e45518","supported":false,"definition":null}}),
            { retain: false, qos: 0 },
            expect.any(Function)
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/devices',
            expect.any(String),
            { retain: true, qos: 0 },
            expect.any(Function)
        );
    });

    it('Should publish event and devices when device leaves', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceLeave({ieeeAddr: zigbeeHerdsman.devices.bulb.ieeeAddr});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
          JSON.stringify({"type":"device_leave","data":{"ieee_address":"0x000b57fffec6a5b2"}}),
          { retain: false, qos: 0 },
          expect.any(Function)
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/devices',
          expect.any(String),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should allow permit join', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', 'true');
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(true);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), { retain: true, qos: 0 }, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            JSON.stringify({"data":{"value":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );

        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', JSON.stringify({"value": false}));
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(false);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), { retain: true, qos: 0 }, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            JSON.stringify({"data":{"value":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should put transaction in response when request is done with transaction', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', JSON.stringify({"value": false, "transaction": 22}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            JSON.stringify({"data":{"value":false},"status":"ok", "transaction": 22}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should put error in response when request fails', async () => {
        zigbeeHerdsman.permitJoin.mockImplementationOnce(() => {throw new Error('Failed to connect to adapter')});
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', JSON.stringify({"value": false}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            JSON.stringify({"data":{},"status":"error","error": "Failed to connect to adapter"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should put error in response when format is incorrect', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', JSON.stringify({"value_not_good": false}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            JSON.stringify({"data":{},"status":"error","error": "No value given"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Coverage satisfaction', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/random', JSON.stringify({"value": false}));
        const device = zigbeeHerdsman.devices.bulb;
        await zigbeeHerdsman.events.message({data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10});
        await flushPromises();
    });

    it('Should allow a healthcheck', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/health_check', '');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/health_check',
            JSON.stringify({"data":{"healthy": true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to remove device by string', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        controller.state.state = {'0x000b57fffec6a5b3': {brightness: 100}};
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', 'bulb');
        await flushPromises();
        expect(controller.state[device.ieeeAddr]).toBeUndefined();
        expect(device.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(device.removeFromDatabase).not.toHaveBeenCalled();
        expect(settings.getDevice('bulb')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            JSON.stringify({"data":{"id": "bulb","block":false,"force":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
        expect(settings.get().blocklist).toStrictEqual([]);
    });

    it('Should allow to remove device by object ID', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', JSON.stringify({id: "bulb"}));
        await flushPromises();
        expect(device.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(device.removeFromDatabase).not.toHaveBeenCalled();
        expect(settings.getDevice('bulb')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            JSON.stringify({"data":{"id": "bulb","block":false,"force":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to force remove device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', JSON.stringify({id: "bulb", force: true}));
        await flushPromises();
        expect(device.removeFromDatabase).toHaveBeenCalledTimes(1);
        expect(device.removeFromNetwork).not.toHaveBeenCalled();
        expect(settings.getDevice('bulb')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            JSON.stringify({"data":{"id": "bulb","block":false,"force":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to block device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', JSON.stringify({id: "bulb", block: true, force: true}));
        await flushPromises();
        expect(device.removeFromDatabase).toHaveBeenCalledTimes(1);
        expect(settings.getDevice('bulb')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            JSON.stringify({"data":{"id": "bulb","block":true,"force":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
        expect(settings.get().blocklist).toStrictEqual(["0x000b57fffec6a5b2"]);
    });

    it('Should allow to remove group', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/remove', 'group_1');
        await flushPromises();
        expect(group.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(settings.getGroup('group_1')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/remove',
            JSON.stringify({"data":{"id": "group_1", "force": false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to force remove group', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/remove', JSON.stringify({id: "group_1", force: true}));
        await flushPromises();
        expect(group.removeFromDatabase).toHaveBeenCalledTimes(1);
        expect(settings.getGroup('group_1')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/remove',
            JSON.stringify({"data":{"id": "group_1", "force": true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error on removing non-existing device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', JSON.stringify({id: "non-existing-device"}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            JSON.stringify({"data":{},"status":"error","error":"Device 'non-existing-device' does not exist"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error when remove device fails', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        device.removeFromNetwork.mockImplementationOnce(() => {throw new Error('device timeout')})
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', JSON.stringify({id: "bulb"}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            JSON.stringify({"data":{},"status":"error","error":"Failed to remove device 'bulb' (block: false, force: false) (Error: device timeout)"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow rename device', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', JSON.stringify({from: 'bulb', to: 'bulb_new_name'}));
        await flushPromises();
        expect(settings.getDevice('bulb')).toBeNull();
        expect(settings.getDevice('bulb_new_name')).toStrictEqual({"ID": "0x000b57fffec6a5b2", "friendly_name": "bulb_new_name", "friendlyName": "bulb_new_name", "retain": true});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            JSON.stringify({"data":{"from":"bulb","to":"bulb_new_name"},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow rename group', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/rename', JSON.stringify({from: 'group_1', to: 'group_new_name'}));
        await flushPromises();
        expect(settings.getGroup('group_1')).toBeNull();
        expect(settings.getGroup('group_new_name')).toStrictEqual({"ID": 1, "devices": [], "friendly_name": "group_new_name", "friendlyName": "group_new_name", "optimistic": true, "retain": false});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/rename',
            JSON.stringify({"data":{"from":"group_1","to":"group_new_name"},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error on invalid device rename payload', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', JSON.stringify({from_bla: 'bulb', to: 'bulb_new_name'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            JSON.stringify({"data":{},"status":"error","error":"Invalid payload"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error on non-existing device rename', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', JSON.stringify({from: 'bulb_not_existing', to: 'bulb_new_name'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            JSON.stringify({"data":{},"status":"error","error":"Device 'bulb_not_existing' does not exist"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to rename last joined device', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceJoined({device: zigbeeHerdsman.devices.bulb});
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', JSON.stringify({last: true, to: 'bulb_new_name'}));
        await flushPromises();
        expect(settings.getDevice('bulb')).toBeNull();
        expect(settings.getDevice('bulb_new_name')).toStrictEqual({"ID": "0x000b57fffec6a5b2", "friendly_name": "bulb_new_name", "friendlyName": "bulb_new_name", "retain": true});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            JSON.stringify({"data":{"from":"bulb","to":"bulb_new_name"},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error when renaming last joined device but none has joined', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', JSON.stringify({last: true, to: 'bulb_new_name'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            JSON.stringify({"data":{},"status":"error","error":"No device has joined since start"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow change device options', async () => {
        MQTT.publish.mockClear();
        expect(settings.getDevice('bulb')).toStrictEqual({"ID": "0x000b57fffec6a5b2", "friendly_name": "bulb", "friendlyName": "bulb", "retain": true});
        MQTT.events.message('zigbee2mqtt/bridge/request/device/options', JSON.stringify({options: {retain: false, transition: 1}, id: 'bulb'}));
        await flushPromises();
        expect(settings.getDevice('bulb')).toStrictEqual({"ID": "0x000b57fffec6a5b2", "friendly_name": "bulb", "friendlyName": "bulb", "retain": false, "transition": 1});
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/options',
            JSON.stringify({"data":{"from":{"retain": true},"to":{"retain": false,"transition":1}, "id":"bulb"},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow change group options', async () => {
        MQTT.publish.mockClear();
        expect(settings.getGroup('group_1')).toStrictEqual({"ID": 1, "devices": [], "friendly_name": "group_1", "retain": false, "friendlyName": "group_1", "optimistic": true});
        MQTT.events.message('zigbee2mqtt/bridge/request/group/options', JSON.stringify({options: {retain: true, transition: 1}, id: 'group_1'}));
        await flushPromises();
        expect(settings.getGroup('group_1')).toStrictEqual({"ID": 1, "devices": [], "friendly_name": "group_1", "retain": true, "friendlyName": "group_1", "optimistic": true, "transition": 1});
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/options',
            JSON.stringify({"data":{"from":{"optimistic": true,"retain": false},"to":{"optimistic": true,"retain": true,"transition":1}, "id":"group_1"},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error on invalid device change options payload', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/options', JSON.stringify({options_: {retain: true, transition: 1}, id: 'bulb'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/options',
            JSON.stringify({"data":{},"status":"error","error":"Invalid payload"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to add group by string', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/add', 'group_193');
        await flushPromises();
        expect(settings.getGroup('group_193')).toStrictEqual({"ID": 3, "devices": [], "friendly_name": "group_193", "friendlyName": "group_193", "optimistic": true});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/add',
            JSON.stringify({"data":{"friendly_name":"group_193","id": 3},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to add group with ID', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/add', JSON.stringify({friendly_name: "group_193", id: 9}));
        await flushPromises();
        expect(settings.getGroup('group_193')).toStrictEqual({"ID": 9, "devices": [], "friendly_name": "group_193", "friendlyName": "group_193", "optimistic": true});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/add',
            JSON.stringify({"data":{"friendly_name":"group_193","id": 9},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error when add with invalid payload', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/add', JSON.stringify({friendly_name9: "group_193"}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/add',
            JSON.stringify({"data":{},"status":"error","error":"Invalid payload"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to enable/disable Home Assistant extension', async () => {
        // Test if disabled intially
        const device = zigbeeHerdsman.devices.WXKG11LM;
        settings.set(['devices', device.ieeeAddr, 'legacy'], false);
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        expect(settings.get().homeassistant).toBeFalsy();
        expect(MQTT.publish).not.toHaveBeenCalledWith('zigbee2mqtt/button/action', 'single', {retain: false, qos: 0}, expect.any(Function));

        // Disable when already disabled should go OK
        MQTT.events.message('zigbee2mqtt/bridge/request/config/homeassistant', JSON.stringify({value: false}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/homeassistant',
            JSON.stringify({"data":{"value":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
        expect(settings.get().homeassistant).toBeFalsy();

        // Enable
        MQTT.events.message('zigbee2mqtt/bridge/request/config/homeassistant', JSON.stringify({value: true}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/homeassistant',
            JSON.stringify({"data":{"value":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
        expect(settings.get().homeassistant).toBeTruthy();
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/button/action', 'single', {retain: false, qos: 0}, expect.any(Function));

        // Disable
        MQTT.events.message('zigbee2mqtt/bridge/request/config/homeassistant', JSON.stringify({value: false}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/homeassistant',
            JSON.stringify({"data":{"value":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
        expect(settings.get().homeassistant).toBeFalsy();
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).not.toHaveBeenCalledWith('zigbee2mqtt/button/action', 'single', {retain: false, qos: 0}, expect.any(Function));
    });

    it('Should fail to set Home Assistant when invalid type', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/homeassistant', 'invalid_one');
        await flushPromises();
        expect(settings.get().homeassistant).toBeFalsy();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/homeassistant',
            JSON.stringify({"data":{},"status":"error","error":"'invalid_one' is not an allowed value, allowed: true,false"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to set last_seen', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/last_seen', 'ISO_8601');
        await flushPromises();
        expect(settings.get().advanced.last_seen).toBe('ISO_8601');
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/last_seen',
            JSON.stringify({"data":{"value":"ISO_8601"},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should fail to set last_seen when invalid type', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/last_seen', 'invalid_one');
        await flushPromises();
        expect(settings.get().advanced.last_seen).toBe('disable');
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/last_seen',
            JSON.stringify({"data":{},"status":"error","error":"'invalid_one' is not an allowed value, allowed: disable,ISO_8601,epoch,ISO_8601_local"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to set elapsed', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/elapsed', 'true');
        await flushPromises();
        expect(settings.get().advanced.elapsed).toBe(true);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/elapsed',
            JSON.stringify({"data":{"value":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should fail to set last_seen when invalid type', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/elapsed', 'not_valid');
        await flushPromises();
        expect(settings.get().advanced.elapsed).toBe(false);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/elapsed',
            JSON.stringify({"data":{},"status":"error","error":"'not_valid' is not an allowed value, allowed: true,false"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to set log level', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/log_level', 'debug');
        await flushPromises();
        expect(logger.getLevel()).toBe('debug');
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/log_level',
            JSON.stringify({"data":{"value":'debug'},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should fail to set log level when invalid type', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/log_level', 'not_valid');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/log_level',
            JSON.stringify({"data":{},"status":"error","error":"'not_valid' is not an allowed value, allowed: error,warn,info,debug"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to touchlink factory reset (succeeds)', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkFactoryReset.mockClear();
        zigbeeHerdsman.touchlinkFactoryReset.mockReturnValueOnce(true);
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/factory_reset', '');
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkFactoryReset).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/factory_reset',
            JSON.stringify({"data":{},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to touchlink factory reset (fails)', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkFactoryReset.mockClear();
        zigbeeHerdsman.touchlinkFactoryReset.mockReturnValueOnce(false);
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/factory_reset', '');
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkFactoryReset).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/factory_reset',
            JSON.stringify({"data":{},"status":"error","error":"Failed to factory reset device through Touchlink"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });
});
