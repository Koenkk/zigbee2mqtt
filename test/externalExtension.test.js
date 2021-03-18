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
const unlinkSyncSpy = jest.spyOn(fs, 'unlinkSync');

describe('User extensions', () => {
    let controller;
    let mockExit;

    beforeEach(() => {
        zigbeeHerdsman.returnDevices.splice(0);
        mockExit = jest.fn();
        controller = new Controller(jest.fn(), mockExit);
        mocksClear.forEach((m) => m.mockClear());
        data.writeDefaultConfiguration();
        settings.reRead();
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
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/extensions', stringify([{"name": "exampleExtension.js", "code": extensionCode}]), { retain: true, qos: 0 }, expect.any(Function));
    });

    it('Load user extension from api call', async () => {
        const extensionPath = path.join(data.mockDir, 'extension');
        const extensionCode = fs.readFileSync(path.join(__dirname, 'assets', 'exampleExtension.js'), 'utf-8');
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/extension/save', stringify({"name": "foo.js", "code": extensionCode}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/extensions', stringify([{"name": "foo.js", "code": extensionCode}]), { retain: true, qos: 0 }, expect.any(Function));
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
        MQTT.events.message('zigbee2mqtt/bridge/request/extension/save', stringify({"name": "foo.js", "code": extensionCode}));
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/response/extension/save', stringify({"data":{},"error":"Unexpected identifier","status":"error"}), { retain: false, qos: 0 }, expect.any(Function));
    });

    it('Removes user extension', async () => {
        const extensionPath = path.join(data.mockDir, 'extension');
        const extensionCode = fs.readFileSync(path.join(__dirname, 'assets', 'exampleExtension.js'), 'utf-8');
        fs.mkdirSync(extensionPath);
        const extensionFilePath = path.join(extensionPath, 'exampleExtension.js')
        fs.copyFileSync(path.join(__dirname, 'assets', 'exampleExtension.js'), extensionFilePath)
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/example/extension', 'test', { retain: false, qos: 0 }, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/extensions', stringify([{"name": "exampleExtension.js", "code": extensionCode}]), { retain: true, qos: 0 }, expect.any(Function));

        MQTT.events.message('zigbee2mqtt/bridge/request/extension/remove', stringify({"name": "exampleExtension.js"}));
        await flushPromises();
        expect(unlinkSyncSpy).toHaveBeenCalledWith(extensionFilePath);
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/extension/remove', stringify({"name": "non existing.js"}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/extension/remove',
            stringify({"data":{},"status":"error","error":"Extension non existing.js doesn't exists"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });
});
