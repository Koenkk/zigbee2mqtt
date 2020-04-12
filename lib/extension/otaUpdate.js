const settings = require('../util/settings');
const logger = require('../util/logger');
const assert = require('assert');
const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/ota_update/.+$`);
const Extension = require('./extension');
const MINUTES_10 = 1000 * 60 * 10;

class OTAUpdate extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.inProgress = new Set();
        this.lastChecked = {};
        this.legacyApi = settings.get().advanced.legacy_api;
    }

    onMQTTConnected() {
        /* istanbul ignore else */
        if (this.legacyApi) {
            this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/ota_update/check`);
            this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/ota_update/update`);
        }
    }

    async onZigbeeEvent(type, data, resolvedEntity) {
        if (data.type !== 'commandQueryNextImageRequest' || !resolvedEntity || !resolvedEntity.definition) return;

        const supportsOTA = resolvedEntity.definition.hasOwnProperty('ota');
        if (supportsOTA) {
            // When a device does a next image request, it will usually do it a few times after each other
            // with only 10 - 60 seconds inbetween. It doesn' make sense to check for a new update
            // each time.
            const check = this.lastChecked.hasOwnProperty(data.device.ieeeAddr) ?
                (Date.now() - this.lastChecked[data.device.ieeeAddr]) > MINUTES_10 : true;
            if (!check || this.inProgress.has(data.device.ieeeAddr)) return;

            this.lastChecked[data.device.ieeeAddr] = Date.now();
            const available = await resolvedEntity.definition.ota.isUpdateAvailable(data.device, logger, data.data);
            this.publishEntityState(data.device.ieeeAddr, {update_available: available});

            if (available) {
                const message = `Update available for '${resolvedEntity.settings.friendly_name}'`;
                logger.info(message);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = {status: 'available', device: resolvedEntity.settings.friendly_name};
                    this.mqtt.publish(
                        'bridge/log',
                        JSON.stringify({type: `ota_update`, message, meta}),
                    );
                }
            }
        }

        // Respond to the OTA request:
        // - In case we don't support OTA: respond with NO_IMAGE_AVAILABLE (0x98) (so the client stops requesting OTAs)
        // - In case we do support OTA: respond with ABORT (0x95) as we don't want to update now.
        const endpoint = data.device.endpoints.find((e) => e.supportsOutputCluster('genOta'));
        await endpoint.commandResponse('genOta', 'queryNextImageResponse', {status: supportsOTA ? 0x95 : 0x98});
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
        let resolvedEntity = null;
        /* istanbul ignore else */
        if (this.legacyApi) {
            if (!topic.match(legacyTopicRegex)) {
                return null;
            }

            resolvedEntity = this.zigbee.resolveEntity(message);
        } else {
            return null;
        }

        assert(resolvedEntity != null && resolvedEntity.type === 'device', 'Device not found or not a device');
        if (!resolvedEntity.definition || !resolvedEntity.definition.ota) {
            const message = `Device '${resolvedEntity.name}' does not support OTA updates`;
            logger.error(message);

            /* istanbul ignore else */
            if (settings.get().advanced.legacy_api) {
                const meta = {status: `not_supported`, device: resolvedEntity.name};
                this.mqtt.publish(
                    'bridge/log',
                    JSON.stringify({type: `ota_update`, message, meta}),
                );
            }

            return;
        }

        if (this.inProgress.has(resolvedEntity.device.ieeeAddr)) {
            logger.error(`Update or check already in progress for '${resolvedEntity.name}', skipping...`);
            return;
        }
        this.inProgress.add(resolvedEntity.device.ieeeAddr);

        const type = topic.substring(settings.get().mqtt.base_topic.length).split('/')[3];
        if (type === 'check') {
            const message = `Checking if update available for '${resolvedEntity.name}'`;
            logger.info(message);

            /* istanbul ignore else */
            if (settings.get().advanced.legacy_api) {
                const meta = {status: `checking_if_available`, device: resolvedEntity.name};
                this.mqtt.publish(
                    'bridge/log',
                    JSON.stringify({type: `ota_update`, message, meta}),
                );
            }

            try {
                const available = await resolvedEntity.definition.ota.isUpdateAvailable(resolvedEntity.device, logger);
                const message = `${available ? 'Update' : 'No update'} available for '${resolvedEntity.name}'`;
                logger.info(message);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = {status: available ? 'available' : 'not_available', device: resolvedEntity.name};
                    this.mqtt.publish(
                        'bridge/log',
                        JSON.stringify({type: `ota_update`, message, meta}),
                    );
                }

                this.publishEntityState(resolvedEntity.device.ieeeAddr, {update_available: available});
                this.lastChecked[resolvedEntity.device.ieeeAddr] = Date.now();
            } catch (error) {
                const message = `Failed to check if update available for '${resolvedEntity.name}' (${error.message})`;
                logger.error(message);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = {status: `check_failed`, device: resolvedEntity.name};
                    this.mqtt.publish(
                        'bridge/log',
                        JSON.stringify({type: `ota_update`, message, meta}),
                    );
                }
            }
        } else { // type === 'update'
            const message = `Updating '${resolvedEntity.name}' to latest firmware`;
            logger.info(message);

            /* istanbul ignore else */
            if (settings.get().advanced.legacy_api) {
                const meta = {status: `update_in_progress`, device: resolvedEntity.name};
                this.mqtt.publish(
                    'bridge/log',
                    JSON.stringify({type: `ota_update`, message, meta}),
                );
            }

            try {
                const onProgress = (progress, remaining) => {
                    let message = `Update of '${resolvedEntity.name}' at ${progress}%`;
                    if (remaining) {
                        message += `, +- ${Math.round(remaining / 60)} minutes remaining`;
                    }

                    logger.info(message);

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {status: `update_progress`, device: resolvedEntity.name, progress};
                        this.mqtt.publish('bridge/log', JSON.stringify({type: `ota_update`, message, meta}));
                    }
                };

                const from_ = await this.readSoftwareBuildIDAndDateCode(resolvedEntity.device, false);
                await resolvedEntity.definition.ota.updateToLatest(resolvedEntity.device, logger, onProgress);
                const to = await this.readSoftwareBuildIDAndDateCode(resolvedEntity.device, true);
                const [fromS, toS] = [JSON.stringify(from_), JSON.stringify(to)];
                const message = `Finished update of '${resolvedEntity.name}'` +
                    (to ? `, from '${fromS}' to '${toS}'` : ``);
                logger.info(message);
                this.publishEntityState(resolvedEntity.device.ieeeAddr, {update_available: false});

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = {status: `update_succeeded`, device: resolvedEntity.name, from: from_, to};
                    this.mqtt.publish('bridge/log', JSON.stringify({type: `ota_update`, message, meta}));
                }
            } catch (error) {
                const message = `Update of '${resolvedEntity.name}' failed (${error.message})`;
                logger.error(message);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = {status: `update_failed`, device: resolvedEntity.name};
                    this.mqtt.publish('bridge/log', JSON.stringify({type: `ota_update`, message, meta}));
                }
            }
        }

        this.inProgress.delete(resolvedEntity.device.ieeeAddr);
    }
}

module.exports = OTAUpdate;
