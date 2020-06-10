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

    it('Coverage satisfaction', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/random', JSON.stringify({"value": false}));
        const device = zigbeeHerdsman.devices.bulb;
        await zigbeeHerdsman.events.message({data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10});
        await flushPromises();
    });
});
