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

    it('Should subscribe to topics', async () => {
        expect(MQTT.subscribe).toHaveBeenCalledWith('zigbee2mqtt/bridge/ota_update/check');
        expect(MQTT.subscribe).toHaveBeenCalledWith('zigbee2mqtt/bridge/ota_update/update');
    });

    it('Should OTA update a device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.endpoints[0];
        let count = 0;
        endpoint.read.mockImplementation(() => {
            count++;
            return {swBuildId: count, dateCode: '2019010' + count}
        });
        const mapped = zigbeeHerdsmanConverters.findByDevice(device)
        mockClear(mapped);
        logger.info.mockClear();
        logger.error.mockClear();
        device.save.mockClear();
        mapped.ota.updateToLatest.mockImplementationOnce((a, b, onUpdate) => {
            onUpdate(0, null);
            onUpdate(10, 3600);
        });

        MQTT.events.message('zigbee2mqtt/bridge/ota_update/update', 'bulb');
        await flushPromises();
        expect(logger.info).toHaveBeenCalledWith(`Updating 'bulb' to latest firmware`);
        expect(mapped.ota.isUpdateAvailable).toHaveBeenCalledTimes(0);
        expect(mapped.ota.updateToLatest).toHaveBeenCalledTimes(1);
        expect(mapped.ota.updateToLatest).toHaveBeenCalledWith(device, logger, expect.any(Function));
        expect(logger.info).toHaveBeenCalledWith(`Update of 'bulb' at 0%`);
        expect(logger.info).toHaveBeenCalledWith(`Update of 'bulb' at 10%, +- 60 minutes remaining`);
        expect(logger.info).toHaveBeenCalledWith(`Finished update of 'bulb', from '{"softwareBuildID":1,"dateCode":"20190101"}' to '{"softwareBuildID":2,"dateCode":"20190102"}'`);
        expect(logger.error).toHaveBeenCalledTimes(0);
        expect(device.save).toHaveBeenCalledTimes(1);
        expect(device.dateCode).toBe('20190102');
        expect(device.softwareBuildID).toBe(2);
    });

    it('Should handle when OTA update fails', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.endpoints[0];
        endpoint.read.mockImplementation(() => {return {swBuildId: 1, dateCode: '2019010'}});
        const mapped = zigbeeHerdsmanConverters.findByDevice(device)
        mockClear(mapped);
        logger.info.mockClear();
        logger.error.mockClear();
        device.save.mockClear();
        mapped.ota.updateToLatest.mockImplementationOnce((a, b, onUpdate) => {
            throw new Error('Update failed');
        });

        MQTT.events.message('zigbee2mqtt/bridge/ota_update/update', 'bulb');
        await flushPromises();
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(`Update of 'bulb' failed (Update failed)`);
    });

    it('Should be able to check if OTA update is available', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const mapped = zigbeeHerdsmanConverters.findByDevice(device)
        mockClear(mapped);

        logger.info.mockClear();
        mapped.ota.isUpdateAvailable.mockReturnValueOnce(false);
        MQTT.events.message('zigbee2mqtt/bridge/ota_update/check', 'bulb');
        await flushPromises();
        expect(mapped.ota.isUpdateAvailable).toHaveBeenCalledTimes(1);
        expect(mapped.ota.updateToLatest).toHaveBeenCalledTimes(0);
        expect(logger.info).toHaveBeenCalledWith(`No update available for 'bulb'`);

        logger.info.mockClear();
        mapped.ota.isUpdateAvailable.mockReturnValueOnce(true);
        MQTT.events.message('zigbee2mqtt/bridge/ota_update/check', 'bulb');
        await flushPromises();
        expect(mapped.ota.isUpdateAvailable).toHaveBeenCalledTimes(2);
        expect(mapped.ota.updateToLatest).toHaveBeenCalledTimes(0);
        expect(logger.info).toHaveBeenCalledWith(`Update available for 'bulb'`);
    });

    it('Should handle if OTA update check fails', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const mapped = zigbeeHerdsmanConverters.findByDevice(device)
        mockClear(mapped);
        logger.error.mockClear();
        mapped.ota.isUpdateAvailable.mockImplementationOnce(() => {throw new Error('RF singals disturbed because of dogs barking')});

        MQTT.events.message('zigbee2mqtt/bridge/ota_update/check', 'bulb');
        await flushPromises();
        expect(mapped.ota.isUpdateAvailable).toHaveBeenCalledTimes(1);
        expect(mapped.ota.updateToLatest).toHaveBeenCalledTimes(0);
        expect(logger.error).toHaveBeenCalledWith(`Failed to check if update available for 'bulb' (RF singals disturbed because of dogs barking)`);
    });

    it('Should not check for OTA when device does not support it', async () => {
        MQTT.events.message('zigbee2mqtt/bridge/ota_update/check', 'ZNLDP12LM');
        await flushPromises();
        expect(logger.error).toHaveBeenCalledWith(`Device 'ZNLDP12LM' does not support OTA updates`);
    });

    it('Should refuse to check/update when already in progress', async () => {
        jest.useFakeTimers();
        const device = zigbeeHerdsman.devices.bulb;
        const mapped = zigbeeHerdsmanConverters.findByDevice(device)
        mockClear(mapped);

        logger.info.mockClear();
        mapped.ota.isUpdateAvailable.mockImplementationOnce(() => {
            return new Promise((resolve, reject) => {setTimeout(() => resolve(), 99999)})
        });
        MQTT.events.message('zigbee2mqtt/bridge/ota_update/check', 'bulb');
        await flushPromises();
        MQTT.events.message('zigbee2mqtt/bridge/ota_update/check', 'bulb');
        await flushPromises();
        expect(mapped.ota.isUpdateAvailable).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(`Update or check already in progress for 'bulb', skipping...`);
        jest.runAllTimers();
        await flushPromises();
    });

    it('Shouldnt crash when read modelID after OTA update fails', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.endpoints[0];
        let count = 0;
        endpoint.read.mockImplementation(() => {
            if (count === 1) throw new Error('Failed!')
            count++;
            return {swBuildId: 1, dateCode: '2019010'}
        });

        const mapped = zigbeeHerdsmanConverters.findByDevice(device)
        mockClear(mapped);
        logger.info.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/ota_update/update', 'bulb');
        await flushPromises();
        expect(logger.info).toHaveBeenCalledWith(`Finished update of 'bulb'`);
    });

    it('Should check for update when device requests it', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const data = {imageType: 12382};
        const mapped = zigbeeHerdsmanConverters.findByDevice(device)
        mockClear(mapped);
        mapped.ota.isUpdateAvailable.mockReturnValueOnce(true);
        const payload = {data, cluster: 'genOta', device, endpoint: device.getEndpoint(1), type: 'commandQueryNextImageRequest', linkquality: 10};
        logger.info.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(mapped.ota.isUpdateAvailable).toHaveBeenCalledTimes(1);
        expect(mapped.ota.isUpdateAvailable).toHaveBeenCalledWith(device, logger, {"imageType": 12382});
        expect(logger.info).toHaveBeenCalledWith(`Update available for 'bulb'`);
        expect(device.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(device.endpoints[0].commandResponse).toHaveBeenCalledWith("genOta", "queryNextImageResponse", {"status": 0x95});

        // Should not request again when device asks again after a short time
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(mapped.ota.isUpdateAvailable).toHaveBeenCalledTimes(1);

        const extension = controller.extensions.find((e) => e.constructor.name === 'OTAUpdate');
        extension.lastChecked = {};
        logger.info.mockClear();
        mapped.ota.isUpdateAvailable.mockReturnValueOnce(false);
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(logger.info).not.toHaveBeenCalledWith(`Update available for 'bulb'`)
    });

    it('Should respond with NO_IMAGE_AVAILABLE when not supporting OTA', async () => {
        const device = zigbeeHerdsman.devices.QBKG04LM;
        const data = {imageType: 12382};
        const payload = {data, cluster: 'genOta', device, endpoint: device.getEndpoint(1), type: 'commandQueryNextImageRequest', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(device.endpoints[0].commandResponse).toHaveBeenCalledTimes(1);
        expect(device.endpoints[0].commandResponse).toHaveBeenCalledWith("genOta", "queryNextImageResponse", {"status": 152});
    });
});
