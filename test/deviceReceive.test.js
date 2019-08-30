const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);

const mocksClear = [zigbeeHerdsman.permitJoin, mockExit, MQTT.end, zigbeeHerdsman.stop, logger.debug, MQTT.publish];

describe('Device receive', () => {
    let controller;

    beforeEach(() => {
        controller = new Controller();
        mocksClear.forEach((m) => m.mockClear());
        data.writeDefaultConfiguration();
        settings._reRead();
        data.writeEmptyState();
    });

    it('onlythis Should handle a zigbee message', async () => {
        await controller.start();
        MQTT.publish.mockClear();
        const device = zigbeeHerdsman.devices.WXKG11LM;
        const data = {onOff: 1}
        const payload = {data, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/button');
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toStrictEqual({click: 'single', linkquality: 10});
        expect(MQTT.publish.mock.calls[0][2]).toStrictEqual({"qos": 0, "retain": false});
    });

});
