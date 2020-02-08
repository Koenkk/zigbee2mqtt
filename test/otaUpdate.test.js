const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');

describe('OTA update', () => {
    let controller;

    mockClear = (mapped) => {
        mapped.ota.updateToLatest = jest.fn();
        mapped.ota.isUpdateAvailable = jest.fn();
    }

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings._reRead();
        data.writeEmptyState();
        controller = new Controller();
        await controller.start();
        await flushPromises();
        MQTT.publish.mockClear();
    });

    it('Should subscribe to nested topics', async () => {
        expect(MQTT.subscribe).toHaveBeenCalledWith('zigbee2mqtt/bridge/ota_update/check');
        expect(MQTT.subscribe).toHaveBeenCalledWith('zigbee2mqtt/bridge/ota_update/update');
    });

    it('Should OTA update a device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const mapped = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID)
        mockClear(mapped);
        logger.info.mockClear();
        mapped.ota.isUpdateAvailable.mockReturnValueOnce(true);
        mapped.ota.updateToLatest.mockImplementationOnce((a, b, onUpdate) => {
            onUpdate(2);
            return {from: {softwareBuildID: 1}, to: {softwareBuildID: 2}};
        });

        MQTT.events.message('zigbee2mqtt/bridge/ota_update/update', 'bulb');
        await flushPromises();
        expect(logger.info).toHaveBeenCalledWith(`Update available for 'bulb'`);
        expect(mapped.ota.isUpdateAvailable).toHaveBeenCalledTimes(1);
        expect(mapped.ota.updateToLatest).toHaveBeenCalledTimes(1);
        expect(mapped.ota.updateToLatest).toHaveBeenCalledWith(device, logger, expect.any(Function));
        expect(logger.info).toHaveBeenCalledWith(`Update of 'bulb' at 2%`);
        expect(logger.info).toHaveBeenCalledWith(`Finished update of 'bulb', from '{"softwareBuildID":1}' to '{"softwareBuildID":2}'`);
    });

    it('Should refuse to OTA update a device when no update is available', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const mapped = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID)
        mockClear(mapped);
        logger.info.mockClear();
        mapped.ota.isUpdateAvailable.mockReturnValueOnce(false);

        MQTT.events.message('zigbee2mqtt/bridge/ota_update/update', 'bulb');
        await flushPromises();
        expect(mapped.ota.isUpdateAvailable).toHaveBeenCalledTimes(1);
        expect(mapped.ota.updateToLatest).toHaveBeenCalledTimes(0);
        expect(logger.error).toHaveBeenCalledWith(`No update available for 'bulb'`);
    });

    it('Should be able to check if OTA update is available', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const mapped = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID)
        mockClear(mapped);
        logger.info.mockClear();
        mapped.ota.isUpdateAvailable.mockReturnValueOnce(false);

        MQTT.events.message('zigbee2mqtt/bridge/ota_update/check', 'bulb');
        await flushPromises();
        expect(mapped.ota.isUpdateAvailable).toHaveBeenCalledTimes(1);
        expect(mapped.ota.updateToLatest).toHaveBeenCalledTimes(0);
        expect(logger.info).toHaveBeenCalledWith(`No update available for 'bulb'`);
    });

    it('Should not check for OTA when device does not support it', async () => {
        MQTT.events.message('zigbee2mqtt/bridge/ota_update/check', 'bulb_color_2');
        await flushPromises();
        expect(logger.error).toHaveBeenCalledWith(`Device 'bulb_color_2' does not support OTA updates`);
    });
});
