const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const path = require('path');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const stringify = require('json-stable-stringify-without-jsonify');
const flushPromises = () => new Promise(setImmediate);
const tmp = require('tmp');
const mocksClear = [
    zigbeeHerdsman.permitJoin, MQTT.end, zigbeeHerdsman.stop, logger.debug,
    MQTT.publish, MQTT.connect, zigbeeHerdsman.devices.bulb_color.removeFromNetwork,
    zigbeeHerdsman.devices.bulb.removeFromNetwork, logger.error,
];

const fs = require('fs');
const mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync');

describe('User extensions', () => {
    let controller;
    let mockExit;

    beforeEach(() => {
        zigbeeHerdsman.returnDevices.splice(0);
        mockExit = jest.fn();
        controller = new Controller(jest.fn(), mockExit);
        mocksClear.forEach((m) => m.mockClear());
        data.writeDefaultConfiguration();
        settings._reRead();
        data.writeDefaultState();
    });
    afterEach(() => {
        const extensionPath = path.join(data.mockDir, 'extension');
        fs.rmdirSync(extensionPath, {recursive: true});
    })

    it('Load user extension', async () => {
        const extensionPath = path.join(data.mockDir, 'extension');
        const extensionCode = fs.readFileSync(path.join(__dirname, 'assets', 'exampleExtension.js'), 'utf-8');
        fs.mkdirSync(extensionPath);
        fs.copyFileSync(path.join(__dirname, 'assets', 'exampleExtension.js'), path.join(extensionPath, 'exampleExtension.js'))
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'test', { retain: false, qos: 0 }, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/extensions', stringify(['exampleExtension.js']), { retain: true, qos: 0 }, expect.any(Function));
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/extension/request/read', stringify({"name": "exampleExtension.js"}));
        await flushPromises();
        const expectedResponse = {"data": {"name": "exampleExtension.js", "content": extensionCode}, "status":"ok"};
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/extension/response/read', stringify(expectedResponse), { retain: false, qos: 0 }, expect.any(Function));
    });

    it('Load user extension from api call', async () => {
        const extensionPath = path.join(data.mockDir, 'extension');
        const extensionCode = fs.readFileSync(path.join(__dirname, 'assets', 'exampleExtension.js'), 'utf-8');
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/extension/request/save', stringify({"name": "foo.js", "content": extensionCode}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/extensions', stringify(['foo.js']), { retain: true, qos: 0 }, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'call from constructor', { retain: false, qos: 0 }, expect.any(Function));
        expect(mkdirSyncSpy).toHaveBeenCalledWith(extensionPath);
    });

    it('Do not load corrupted extensions', async () => {
        const extensionPath = path.join(data.mockDir, 'extension');
        const extensionCode = "definetly not a correct javascript code";
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/extension/request/save', stringify({"name": "foo.js", "content": extensionCode}));
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/extension/response/save', stringify({"data":{},"error":"Unexpected identifier","status":"error"}), { retain: false, qos: 0 }, expect.any(Function));
    });
});
