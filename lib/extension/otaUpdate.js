const settings = require('../util/settings');
const logger = require('../util/logger');
const assert = require('assert');
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/ota_update/.+$`);
const BaseExtension = require('./baseExtension');

class OTAUpdate extends BaseExtension {
    onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/ota_update/check`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/ota_update/update`);
    }

    async onMQTTMessage(topic, message) {
        if (!topic.match(topicRegex)) {
            return null;
        }

        const device = this.zigbee.resolveEntity(message);
        assert(device != null && device.type === 'device', 'Device not found or not a device');

        if (!device.mapped || !device.mapped.ota) {
            logger.error(`Device '${device.name}' does not support OTA updates`);
            return;
        }

        logger.info(`Checking if update available for '${device.name}'`);

        const updateAvailable = await device.mapped.ota.isUpdateAvailable(device.device, logger);
        const type = topic.split('/')[3];

        if (updateAvailable) {
            logger.info(`Update available for '${device.name}'`);
        } else {
            const level = type === 'update' ? 'error' : 'info';
            logger[level](`No update available for '${device.name}'`);
        }

        if (type === 'update' && updateAvailable) {
            logger.info(`Starting update of '${device.name}'`);
            const onProgress = (progress) => logger.info(`Update of '${device.name}' at ${progress}%`);
            const result = await device.mapped.ota.updateToLatest(device.device, logger, onProgress);
            const [from, to] = [JSON.stringify(result.from), JSON.stringify(result.to)];
            logger.info(`Finished update of '${device.name}', from '${from}' to '${to}'`);
        }
    }
}

module.exports = OTAUpdate;
