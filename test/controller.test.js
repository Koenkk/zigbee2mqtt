require('./stub/data');
require('./stub/logger');

const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');

const Controller = require('../lib/controller');

describe('Controller', () => {
    let controller;

    beforeEach(() => {
        controller = new Controller();
    });

    afterEach(() => {
    });

    it('Start controller', async () => {
        await controller.start();
        expect(MQTT.connect).toBeCalledTimes(1);
        expect(MQTT.connect).toBeCalledWith("mqtt://localhost", {"will": {"payload": "offline", "retain": true, "topic": "zigbee2mqtt/bridge/state"}});
    });
});
