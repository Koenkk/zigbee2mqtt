const settings = require('../util/settings');
const logger = require('../util/logger');
const stringify = require('json-stable-stringify');
const utils = require('../util/utils');
const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/ota_update/.+$`);
const topicRegex =
    new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/ota_update/(update|check)`, 'i');

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

        /* istanbul ignore else */
        if (settings.get().experimental.new_api) {
            this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/request/device/ota_update/check`);
            this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/request/device/ota_update/update`);
        }

        for (const device of this.zigbee.getClients()) {
            // In case Zigbee2MQTT is restared during an update, progress and remaining values are still in state.
            // remove them.
            this.removeProgressAndRemainingFromState(device);
        }
    }

    removeProgressAndRemainingFromState(device) {
        this.state.removeKey(device.ieeeAddr, ['update', 'progress']);
        this.state.removeKey(device.ieeeAddr, ['update', 'remaining']);
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
            const payload = this.getEntityPublishPayload(available ? 'available' : 'idle');
            this.publishEntityState(data.device.ieeeAddr, payload);

            if (available) {
                const message = `Update available for '${resolvedEntity.settings.friendly_name}'`;
                logger.info(message);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = {status: 'available', device: resolvedEntity.settings.friendly_name};
                    this.mqtt.publish(
                        'bridge/log',
                        stringify({type: `ota_update`, message, meta}),
                    );
                }
            }
        }

        // Respond to the OTA request:
        // - In case we don't support OTA: respond with NO_IMAGE_AVAILABLE (0x98) (so the client stops requesting OTAs)
        // - In case we do support OTA: respond with ABORT (0x95) as we don't want to update now.
        const endpoint = data.device.endpoints.find((e) => e.supportsOutputCluster('genOta'));
        if (endpoint) {
            // Some devices send OTA requests without defining OTA cluster as input cluster.
            await endpoint.commandResponse('genOta', 'queryNextImageResponse', {status: supportsOTA ? 0x95 : 0x98});
        }
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

    getEntityPublishPayload(state, progress=null, remaining=null) {
        const payload = {};

        /* istanbul ignore else */
        if (this.legacyApi) {
            payload.update_available = state === 'available';
        }

        /* istanbul ignore else */
        if (settings.get().experimental.new_api) {
            payload.update = {state};
            if (progress !== null) payload.update.progress = progress;
            if (remaining !== null) payload.update.remaining = Math.round(remaining);
        }

        return payload;
    }

    async onMQTTMessage(topic, message) {
        if ((!this.legacyApi || !topic.match(legacyTopicRegex)) && !topic.match(topicRegex)) {
            return null;
        }

        message = utils.parseJSON(message, message);
        const ID = typeof message === 'object' && message.hasOwnProperty('id') ? message.id : message;
        const resolvedEntity = this.zigbee.resolveEntity(ID);
        const type = topic.substring(topic.lastIndexOf('/') + 1);
        const responseData = {id: ID};
        let error = null;

        if (!resolvedEntity || resolvedEntity.type !== 'device') {
            error = `Device '${ID}' does not exist`;
        } else if (!resolvedEntity.definition || !resolvedEntity.definition.ota) {
            error = `Device '${resolvedEntity.name}' does not support OTA updates`;

            /* istanbul ignore else */
            if (settings.get().advanced.legacy_api) {
                const meta = {status: `not_supported`, device: resolvedEntity.name};
                this.mqtt.publish(
                    'bridge/log',
                    stringify({type: `ota_update`, message: error, meta}),
                );
            }
        } else if (this.inProgress.has(resolvedEntity.device.ieeeAddr)) {
            error = `Update or check for update already in progress for '${resolvedEntity.name}'`;
        } else {
            this.inProgress.add(resolvedEntity.device.ieeeAddr);

            if (type === 'check') {
                const msg = `Checking if update available for '${resolvedEntity.name}'`;
                logger.info(msg);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = {status: `checking_if_available`, device: resolvedEntity.name};
                    this.mqtt.publish(
                        'bridge/log',
                        stringify({type: `ota_update`, message: msg, meta}),
                    );
                }

                try {
                    const available = await resolvedEntity.definition.ota.isUpdateAvailable(
                        resolvedEntity.device, logger,
                    );
                    const msg = `${available ? 'Update' : 'No update'} available for '${resolvedEntity.name}'`;
                    logger.info(msg);

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {status: available ? 'available' : 'not_available', device: resolvedEntity.name};
                        this.mqtt.publish(
                            'bridge/log',
                            stringify({type: `ota_update`, message: msg, meta}),
                        );
                    }

                    const payload = this.getEntityPublishPayload(available ? 'available' : 'idle');
                    this.publishEntityState(resolvedEntity.device.ieeeAddr, payload);
                    this.lastChecked[resolvedEntity.device.ieeeAddr] = Date.now();
                    responseData.updateAvailable = available;
                } catch (e) {
                    error = `Failed to check if update available for '${resolvedEntity.name}' (${e.message})`;

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {status: `check_failed`, device: resolvedEntity.name};
                        this.mqtt.publish(
                            'bridge/log',
                            stringify({type: `ota_update`, message: error, meta}),
                        );
                    }
                }
            } else { // type === 'update'
                const msg = `Updating '${resolvedEntity.name}' to latest firmware`;
                logger.info(msg);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = {status: `update_in_progress`, device: resolvedEntity.name};
                    this.mqtt.publish(
                        'bridge/log',
                        stringify({type: `ota_update`, msg, meta}),
                    );
                }

                try {
                    const onProgress = (progress, remaining) => {
                        let msg = `Update of '${resolvedEntity.name}' at ${progress.toFixed(2)}%`;
                        if (remaining) {
                            msg += `, +- ${Math.round(remaining / 60)} minutes remaining`;
                        }

                        logger.info(msg);

                        const payload = this.getEntityPublishPayload('updating', progress, remaining);
                        this.publishEntityState(resolvedEntity.device.ieeeAddr, payload);

                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            const meta = {status: `update_progress`, device: resolvedEntity.name, progress};
                            this.mqtt.publish('bridge/log', stringify({type: `ota_update`, message: msg, meta}));
                        }
                    };

                    const from_ = await this.readSoftwareBuildIDAndDateCode(resolvedEntity.device, false);
                    await resolvedEntity.definition.ota.updateToLatest(resolvedEntity.device, logger, onProgress);
                    const to = await this.readSoftwareBuildIDAndDateCode(resolvedEntity.device, true);
                    const [fromS, toS] = [stringify(from_), stringify(to)];
                    const msg = `Finished update of '${resolvedEntity.name}'` +
                        (to ? `, from '${fromS}' to '${toS}'` : ``);
                    logger.info(msg);
                    this.removeProgressAndRemainingFromState(resolvedEntity.device);
                    const payload = this.getEntityPublishPayload('idle');
                    this.publishEntityState(resolvedEntity.device.ieeeAddr, payload);
                    responseData.from = from_ ? utils.toSnakeCase(from_) : null;
                    responseData.to = to ? utils.toSnakeCase(to) : null;

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {status: `update_succeeded`, device: resolvedEntity.name, from: from_, to};
                        this.mqtt.publish('bridge/log', stringify({type: `ota_update`, message, meta}));
                    }
                } catch (e) {
                    error = `Update of '${resolvedEntity.name}' failed (${e.message})`;

                    this.removeProgressAndRemainingFromState(resolvedEntity.device);
                    const payload = this.getEntityPublishPayload('available');
                    this.publishEntityState(resolvedEntity.device.ieeeAddr, payload);

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {status: `update_failed`, device: resolvedEntity.name};
                        this.mqtt.publish('bridge/log', stringify({type: `ota_update`, message: error, meta}));
                    }
                }
            }

            this.inProgress.delete(resolvedEntity.device.ieeeAddr);
        }

        const triggeredViaLegacyApi = topic.match(legacyTopicRegex);
        if (!triggeredViaLegacyApi) {
            const response = utils.getResponse(message, responseData, error);
            await this.mqtt.publish(`bridge/response/device/ota_update/${type}`, stringify(response));
        }

        if (error) {
            logger.error(error);
        }
    }
}

module.exports = OTAUpdate;
