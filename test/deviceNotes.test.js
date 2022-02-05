const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const path = require('path');
const rimraf = require('rimraf');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const stringify = require('json-stable-stringify-without-jsonify');
const flushPromises = require('./lib/flushPromises');
const mocksClear = [
    zigbeeHerdsman.permitJoin, MQTT.end, zigbeeHerdsman.stop, logger.debug,
    MQTT.publish, MQTT.connect, zigbeeHerdsman.devices.bulb_color.removeFromNetwork,
    zigbeeHerdsman.devices.bulb.removeFromNetwork, logger.error,
];

const fs = require('fs');
const notesExtension = '.txt';
const notesDirectoryName = 'notes';
const exampleNotes = 'Example notes with json symbols like { ", and utf-8 👍 and windows\r\n and unix\n line breaks'
const mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync');
const writeSyncSpy = jest.spyOn(fs, 'writeFileSync');
const readSyncSpy = jest.spyOn(fs, 'readFileSync');

describe('Device notes', () => {
    let controller;

    beforeAll(async () => {
        jest.useFakeTimers();
    });

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings.reRead();
        mocksClear.forEach((m) => m.mockClear());
    });

    afterAll(async () => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        zigbeeHerdsman.returnDevices.splice(0);
        controller = new Controller(jest.fn(), jest.fn());
        mocksClear.forEach((m) => m.mockClear());
        data.writeDefaultConfiguration();
        settings.reRead();
        data.writeDefaultState();
    });

    afterEach(() => {
        const notesDirectory = path.join(data.mockDir, notesDirectoryName);
        rimraf.sync(notesDirectory);
    });

    it('Should read initial empty notes for ieee_address', async () => {
        // Prepare
        const id = zigbeeHerdsman.devices.bulb_color.ieeeAddr;
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();
        mkdirSyncSpy.mockClear();
        writeSyncSpy.mockClear();

        // Test
        MQTT.events.message('zigbee2mqtt/bridge/request/device/notes/read', stringify({ id }));

        // Expect
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/response/device/notes/read', stringify({ status: 'ok', data: { notes: '', mtime: null } }), { retain: false, qos: 0 }, expect.any(Function));
        expect(mkdirSyncSpy).not.toHaveBeenCalled();
        expect(writeSyncSpy).not.toHaveBeenCalled();
    });

    it('Should read existing notes for friendly_name', async () => {
        // Prepare
        const device = zigbeeHerdsman.devices.bulb_color;
        const notesDirectory = path.join(data.mockDir, notesDirectoryName);
        const noteFilePath = path.join(notesDirectory, `${device.ieeeAddr}${notesExtension}`);
        fs.mkdirSync(notesDirectory);
        fs.writeFileSync(noteFilePath, exampleNotes, 'utf-8');

        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();
        mkdirSyncSpy.mockClear();
        writeSyncSpy.mockClear();
        readSyncSpy.mockClear();

        // Test
        MQTT.events.message('zigbee2mqtt/bridge/request/device/notes/read', stringify({ id: 'bulb_color' }));

        // Expect
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/response/device/notes/read', expect.any(String), { retain: false, qos: 0 }, expect.any(Function));
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toEqual({
            status: 'ok',
            data: expect.objectContaining({
                notes: exampleNotes,
                mtime: expect.any(String)
            })
        });
        expect(mkdirSyncSpy).not.toHaveBeenCalled();
        expect(writeSyncSpy).not.toHaveBeenCalled();
        expect(writeSyncSpy).not.toHaveBeenCalledWith(noteFilePath);
    });

    it('Should read existing notes with transaction', async () => {
        // Prepare
        const id = zigbeeHerdsman.devices.bulb_color.ieeeAddr;
        const transaction = '42'
        const notesDirectory = path.join(data.mockDir, notesDirectoryName);
        const noteFilePath = path.join(notesDirectory, `${id}${notesExtension}`);
        fs.mkdirSync(notesDirectory);
        fs.writeFileSync(noteFilePath, exampleNotes, 'utf-8');

        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();

        // Test
        MQTT.events.message('zigbee2mqtt/bridge/request/device/notes/read', stringify({ id, transaction }));

        // Expect
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/response/device/notes/read', expect.any(String), { retain: false, qos: 0 }, expect.any(Function));
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toEqual({
            status: 'ok',
            transaction,
            data: expect.objectContaining({
                notes: exampleNotes,
                mtime: expect.any(String)
            })
        });
    });

    it('Should fail saving for invalid id', async () => {
        // Prepare
        const notes = 'some notes';
        const id = 'invalidNonExistingDeviceID';
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();
        mkdirSyncSpy.mockClear();
        writeSyncSpy.mockClear();

        // Test
        MQTT.events.message('zigbee2mqtt/bridge/request/device/notes/save', stringify({ id, notes }));

        // Expect
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/response/device/notes/save', stringify({ status: 'error', data: {}, error: `Device '${id}' is unknown` }), { retain: false, qos: 0 }, expect.any(Function));
        expect(mkdirSyncSpy).not.toHaveBeenCalled();
        expect(writeSyncSpy).not.toHaveBeenCalled();
    });

    it('Should save first notes', async () => {
        // Prepare
        const notes = 'some notes';
        const transaction = '3.141'
        const id = zigbeeHerdsman.devices.bulb_color.ieeeAddr;
        const notesDirectory = path.join(data.mockDir, notesDirectoryName);
        const noteFilePath = path.join(notesDirectory, `${id}${notesExtension}`);

        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();
        mkdirSyncSpy.mockClear();
        writeSyncSpy.mockClear();

        // Test
        MQTT.events.message('zigbee2mqtt/bridge/request/device/notes/save', stringify({ id, notes, transaction }));

        // Expect
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/response/device/notes/save', stringify({ status: 'ok', transaction, data: {}}), { retain: false, qos: 0 }, expect.any(Function));
        expect(mkdirSyncSpy).toHaveBeenCalledWith(notesDirectory);
        expect(writeSyncSpy).toHaveBeenCalledWith(noteFilePath, notes, 'utf-8');
    });

    it('Should overwrite notes and read back', async () => {
        // Prepare
        const id = zigbeeHerdsman.devices.bulb_color_2.ieeeAddr;
        let transaction = '12345'
        const notesDirectory = path.join(data.mockDir, notesDirectoryName);
        const noteFilePath = path.join(notesDirectory, `${id}${notesExtension}`);
        const newNotes = 'some other "notes"\r\nwith utf-8 😀 + non ascii symbols: Device=Gerät';

        fs.mkdirSync(notesDirectory);
        fs.writeFileSync(noteFilePath, exampleNotes, 'utf-8');

        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();
        mkdirSyncSpy.mockClear();
        writeSyncSpy.mockClear();

        // Test
        MQTT.events.message('zigbee2mqtt/bridge/request/device/notes/save', stringify({ id, transaction, notes: newNotes }));

        // Expect
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/response/device/notes/save', stringify({ status: 'ok', transaction, data: {}}), { retain: false, qos: 0 }, expect.any(Function));
        expect(mkdirSyncSpy).not.toHaveBeenCalledWith(notesDirectory);
        expect(writeSyncSpy).toHaveBeenCalledWith(noteFilePath, newNotes, 'utf-8');
        expect(fs.readFileSync(noteFilePath, 'utf-8')).toBe(newNotes);

        // Test read back
        MQTT.publish.mockClear();
        transaction = 'read-back'
        MQTT.events.message('zigbee2mqtt/bridge/request/device/notes/read', stringify({ id, transaction }));

        // Expect
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/response/device/notes/read', expect.any(String), { retain: false, qos: 0 }, expect.any(Function));
        expect(JSON.parse(MQTT.publish.mock.calls[0][1])).toEqual({
            status: 'ok',
            transaction,
            data: expect.objectContaining({
                notes: newNotes,
                mtime: expect.any(String)
            })
        });
    });
});
