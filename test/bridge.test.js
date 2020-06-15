const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

const {coordinator, bulb, unsupported} = zigbeeHerdsman.devices;
zigbeeHerdsman.returnDevices.push(coordinator.ieeeAddr);
zigbeeHerdsman.returnDevices.push(bulb.ieeeAddr);
zigbeeHerdsman.returnDevices.push(unsupported.ieeeAddr);

describe('Bridge', () => {
    let controller;

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings._reRead();
        settings.set(['advanced', 'legacy_api'], false);
        settings.set(['experimental', 'new_api'], true);
        data.writeDefaultState();
        logger.info.mockClear();
        logger.warn.mockClear();
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
          JSON.stringify({"version":version.version,"commit":version.commitHash,"coordinator":{"type":"z-Stack","meta":{"version":1,"revision":20190425}},"logLevel":"info","permitJoin":false}),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish devices on startup', async () => {
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/devices',
          JSON.stringify([{"ieeeAddress":"0x000b57fffec6a5b2","type":"Router","networkAddress":40369,"supported":true,"friendlyName":"bulb","definition":{"model":"LED1545G12","vendor":"IKEA","description":"TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white","supports":"on/off, brightness, color temperature"},"powerSource":"Mains (single phase)","dateCode":null,"interviewing":false,"interviewCompleted":true},{"ieeeAddress":"0x0017880104e45518","type":"EndDevice","networkAddress":6536,"supported":false,"friendlyName":"0x0017880104e45518","definition":null,"powerSource":"Battery","dateCode":null,"interviewing":false,"interviewCompleted":true}]),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish devices on startup', async () => {
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/groups',
          JSON.stringify([{"ID":1,"friendlyName":"group_1","members":[]},{"ID":15071,"friendlyName":"group_tradfri_remote","members":[]},{"ID":99,"friendlyName":99,"members":[]},{"ID":11,"friendlyName":"group_with_tradfri","members":[]},{"ID":2,"friendlyName":"group_2","members":[]}]),
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
          JSON.stringify({"type":"deviceJoined","data":{"friendlyName":"bulb","ieeeAddress":"0x000b57fffec6a5b2"}}),
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
          JSON.stringify({"type":"deviceInterview","data":{"friendlyName":"bulb","status":"started","ieeeAddress":"0x000b57fffec6a5b2"}}),
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
          JSON.stringify({"type":"deviceInterview","data":{"friendlyName":"bulb","status":"failed","ieeeAddress":"0x000b57fffec6a5b2"}}),
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
            JSON.stringify({"type":"deviceInterview","data":{"friendlyName":"bulb","status":"successful","ieeeAddress":"0x000b57fffec6a5b2","supported":true,"definition":{"model":"LED1545G12","vendor":"IKEA","description":"TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white","supports":"on/off, brightness, color temperature"}}}),
            { retain: false, qos: 0 },
            expect.any(Function)
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
          'zigbee2mqtt/bridge/event',
            JSON.stringify({"type":"deviceInterview","data":{"friendlyName":"0x0017880104e45518","status":"successful","ieeeAddress":"0x0017880104e45518","supported":false,"definition":null}}),
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
          JSON.stringify({"type":"deviceLeave","data":{"ieeeAddress":"0x000b57fffec6a5b2"}}),
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
        MQTT.events.message('zigbee2mqtt/bridge/request/permitJoin', 'true');
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(true);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), { retain: true, qos: 0 }, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permitJoin',
            JSON.stringify({"data":{"value":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );

        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permitJoin', JSON.stringify({"value": false}));
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(false);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), { retain: true, qos: 0 }, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permitJoin',
            JSON.stringify({"data":{"value":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should put transaction in response when request is done with transaction', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permitJoin', JSON.stringify({"value": false, "transaction": 22}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permitJoin',
            JSON.stringify({"data":{"value":false},"status":"ok", "transaction": 22}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should put error in response when request fails', async () => {
        zigbeeHerdsman.permitJoin.mockImplementationOnce(() => {throw new Error('Failed to connect to adapter')});
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permitJoin', JSON.stringify({"value": false}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permitJoin',
            JSON.stringify({"data":{},"status":"error","error": "Failed to connect to adapter"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should put error in response when format is incorrect', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permitJoin', JSON.stringify({"value_not_good": false}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permitJoin',
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
            JSON.stringify({"data":{"ID": "bulb","ban":false,"force":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
        expect(settings.get().ban).toStrictEqual([]);
    });

    it('Should allow to remove device by object ID', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', JSON.stringify({ID: "bulb"}));
        await flushPromises();
        expect(device.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(device.removeFromDatabase).not.toHaveBeenCalled();
        expect(settings.getDevice('bulb')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            JSON.stringify({"data":{"ID": "bulb","ban":false,"force":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to force remove device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', JSON.stringify({ID: "bulb", force: true}));
        await flushPromises();
        expect(device.removeFromDatabase).toHaveBeenCalledTimes(1);
        expect(device.removeFromNetwork).not.toHaveBeenCalled();
        expect(settings.getDevice('bulb')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            JSON.stringify({"data":{"ID": "bulb","ban":false,"force":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to ban device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', JSON.stringify({ID: "bulb", ban: true, force: true}));
        await flushPromises();
        expect(device.removeFromDatabase).toHaveBeenCalledTimes(1);
        expect(settings.getDevice('bulb')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            JSON.stringify({"data":{"ID": "bulb","ban":true,"force":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
        expect(settings.get().ban).toStrictEqual(["0x000b57fffec6a5b2"]);
    });

    it('Should allow to remove group', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/remove', 'group_1');
        await flushPromises();
        expect(group.removeFromDatabase).toHaveBeenCalledTimes(1);
        expect(settings.getGroup('group_1')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/remove',
            JSON.stringify({"data":{"ID": "group_1"},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error on removing non-existing device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', JSON.stringify({ID: "non-existing-device"}));
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
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', JSON.stringify({ID: "bulb"}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            JSON.stringify({"data":{},"status":"error","error":"Failed to remove device 'bulb' (ban: false, force: false) (Error: device timeout)"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow rename device', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', JSON.stringify({from: 'bulb', to: 'bulb_new_name'}));
        await flushPromises();
        expect(settings.getDevice('bulb')).toBeNull();
        expect(settings.getDevice('bulb_new_name')).toStrictEqual({"ID": "0x000b57fffec6a5b2", "friendlyName": "bulb_new_name", "friendly_name": "bulb_new_name", "retain": true});
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
        expect(settings.getGroup('group_new_name')).toStrictEqual({"ID": 1, "devices": [], "friendlyName": "group_new_name", "friendly_name": "group_new_name", "optimistic": true, "retain": false});
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
        expect(settings.getDevice('bulb_new_name')).toStrictEqual({"ID": "0x000b57fffec6a5b2", "friendlyName": "bulb_new_name", "friendly_name": "bulb_new_name", "retain": true});
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
        expect(settings.getDevice('bulb')).toStrictEqual({"ID": "0x000b57fffec6a5b2", "friendlyName": "bulb", "friendly_name": "bulb", "retain": true});
        MQTT.events.message('zigbee2mqtt/bridge/request/device/options', JSON.stringify({options: {retain: false, transition: 1}, ID: 'bulb'}));
        await flushPromises();
        expect(settings.getDevice('bulb')).toStrictEqual({"ID": "0x000b57fffec6a5b2", "friendlyName": "bulb", "friendly_name": "bulb", "retain": false, "transition": 1});
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/options',
            JSON.stringify({"data":{"from":{"retain": true},"to":{"retain": false,"transition":1}, "ID":"bulb"},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow change group options', async () => {
        MQTT.publish.mockClear();
        expect(settings.getGroup('group_1')).toStrictEqual({"ID": 1, "devices": [], "friendly_name": "group_1", "retain": false, "friendlyName": "group_1", "optimistic": true});
        MQTT.events.message('zigbee2mqtt/bridge/request/group/options', JSON.stringify({options: {retain: true, transition: 1}, ID: 'group_1'}));
        await flushPromises();
        expect(settings.getGroup('group_1')).toStrictEqual({"ID": 1, "devices": [], "friendly_name": "group_1", "retain": true, "friendlyName": "group_1", "optimistic": true, "transition": 1});
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/options',
            JSON.stringify({"data":{"from":{"optimistic": true,"retain": false},"to":{"optimistic": true,"retain": true,"transition":1}, "ID":"group_1"},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error on invalid device change options payload', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/options', JSON.stringify({options_: {retain: true, transition: 1}, ID: 'bulb'}));
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
        expect(settings.getGroup('group_193')).toStrictEqual({"ID": 3, "devices": [], "friendlyName": "group_193", "friendly_name": "group_193", "optimistic": true});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/add',
            JSON.stringify({"data":{"friendlyName":"group_193","ID": 3},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to add group with ID', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/add', JSON.stringify({friendlyName: "group_193", ID: 9}));
        await flushPromises();
        expect(settings.getGroup('group_193')).toStrictEqual({"ID": 9, "devices": [], "friendlyName": "group_193", "friendly_name": "group_193", "optimistic": true});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/add',
            JSON.stringify({"data":{"friendlyName":"group_193","ID": 9},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error when add with invalid payload', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/add', JSON.stringify({friendlyName9: "group_193"}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/add',
            JSON.stringify({"data":{},"status":"error","error":"Invalid payload"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to set last_seen', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/lastSeen', 'ISO_8601');
        await flushPromises();
        expect(settings.get().advanced.last_seen).toBe('ISO_8601');
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/lastSeen',
            JSON.stringify({"data":{"value":"ISO_8601"},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should fail to set last_seen when invalid type', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/lastSeen', 'invalid_one');
        await flushPromises();
        expect(settings.get().advanced.last_seen).toBe('disable');
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/lastSeen',
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
        MQTT.events.message('zigbee2mqtt/bridge/request/config/logLevel', 'debug');
        await flushPromises();
        expect(logger.getLevel()).toBe('debug');
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/logLevel',
            JSON.stringify({"data":{"value":'debug'},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should fail to set log level when invalid type', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/logLevel', 'not_valid');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/logLevel',
            JSON.stringify({"data":{},"status":"error","error":"'not_valid' is not an allowed value, allowed: error,warn,info,debug"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to touchlink factory reset (succeeds)', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkFactoryReset.mockClear();
        zigbeeHerdsman.touchlinkFactoryReset.mockReturnValueOnce(true);
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/factoryReset', '');
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkFactoryReset).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/factoryReset',
            JSON.stringify({"data":{},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to touchlink factory reset (fails)', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkFactoryReset.mockClear();
        zigbeeHerdsman.touchlinkFactoryReset.mockReturnValueOnce(false);
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/factoryReset', '');
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkFactoryReset).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/factoryReset',
            JSON.stringify({"data":{},"status":"error","error":"Failed to factory reset device through Touchlink"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });
});
