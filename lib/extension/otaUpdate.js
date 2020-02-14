const settings = require('../util/settings');
const logger = require('../util/logger');
const assert = require('assert');
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/ota_update/.+$`);
const BaseExtension = require('./baseExtension');

class OTAUpdate extends BaseExtension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.inProgress = new Set();
    }

    onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/ota_update/check`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/ota_update/update`);
    }

    async readSoftwareBuildIDAndDateCode(device, update) {
        try {
            const endpoint = device.endpoints.find((e) => e.supportsInputCluster('genBasic'));
            const result = await endpoint.read('genBasic', ['dateCode', 'swBuildId']);

            if (update) {
                device.softwareBuildID = result.swBuildId;
                device.dateCode = result.dateCode;
                device.save();
            }

            return {softwareBuildID: result.swBuildId, dateCode: result.dateCode};
        } catch (e) {
            return null;
        }
    }

    async onMQTTMessage(topic, message) {
        if (!topic.match(topicRegex)) {
            return null;
        }

        const device = this.zigbee.resolveEntity(message);
        assert(device != null && device.type === 'device', 'Device not found or not a device');
        if (!device.mapped || !device.mapped.ota) {
            const message=`Device '${device.name}' does not support OTA updates`;
            logger.error(message);
            this.mqtt.log('OTA_update', message, {status: `failed`, device: device.name});
            return;
        }

        if (this.inProgress.has(device.device.ieeeAddr)) {
            logger.error(`Update or check already in progress for '${device.name}', skipping...`);
            return;
        }
        this.inProgress.add(device.device.ieeeAddr);

        const type = topic.split('/')[3];
        if (type === 'check') {
            const message=`Checking if update available for '${device.name}'`;
            logger.info(message);
            this.mqtt.log('OTA_update', message, {status: `in_progress`, device: device.name});
            try {
                const available = await device.mapped.ota.isUpdateAvailable(device.device, logger);
                const message=(available ?
                    `Update available for '${device.name}'` : `No update available for '${device.name}'`);
                logger.info(message);
                this.mqtt.log('OTA_update', message, {status: `success`, device: device.name});
            } catch (error) {
                const message=`Failed to check if update available for '${device.name}' (${error.message})`;
                logger.error(message);
                this.mqtt.log('OTA_update', message, {status: `failed`, device: device.name});
            }
        } else { // type === 'update'
            const message=`Updating '${device.name}' to latest firmware`;
            logger.info(message);
            this.mqtt.log('OTA_update', message, {status: `in_progress`, device: device.name});
            try {
                const onProgress = (progress, remaining) => {
                    let message = `Update of '${device.name}' at ${progress}%`;
                    if (remaining) {
                        message += `, +- ${Math.round(remaining / 60)} minutes remaining`;
                    }

                    logger.info(message);
                };

                const from_ = await this.readSoftwareBuildIDAndDateCode(device.device, false);
                await device.mapped.ota.updateToLatest(device.device, logger, onProgress);
                const to = await this.readSoftwareBuildIDAndDateCode(device.device, true);
                const [fromS, toS] = [JSON.stringify(from_), JSON.stringify(to)];
                const message=`Finished update of '${device.name}'` + (to ? `, from '${fromS}' to '${toS}'` : ``);
                logger.info(message);
                this.mqtt.log('OTA_update', message, {status: `success`, device: device.name});
            } catch (error) {
                const message=`Update of '${device.name}' failed (${error.message})`;
                logger.error(message);
                this.mqtt.log('OTA_update', message, {status: `failed`, device: device.name});
            }
        }

        this.inProgress.delete(device.device.ieeeAddr);
    }
}

module.exports = OTAUpdate;
