import * as settings from '../util/settings';
import logger from '../util/logger';
import stringify from 'json-stable-stringify-without-jsonify';
import utils from '../util/utils';
import tradfriOTA from 'zigbee-herdsman-converters/lib/ota/tradfri';
import zigbeeOTA from 'zigbee-herdsman-converters/lib/ota/zigbeeOTA';
import Extension from './extension';
import bind from 'bind-decorator';
import Device from '../model/device';
import dataDir from '../util/data';
import * as URI from 'uri-js';
import path from 'path';

function isValidUrl(url: string): boolean {
    let parsed;
    try {
        parsed = URI.parse(url);
    } catch (_) {
        // istanbul ignore next
        return false;
    }
    return parsed.scheme === 'http' || parsed.scheme === 'https';
}

type UpdateState = 'updating' | 'idle' | 'available';
interface UpdatePayload {
    // eslint-disable-next-line camelcase
    update: {progress?: number, remaining?: number, state: UpdateState}, update_available?: boolean}

const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/ota_update/.+$`);
const topicRegex =
    new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/ota_update/(update|check)`, 'i');

export default class OTAUpdate extends Extension {
    private inProgress = new Set();
    private lastChecked: {[s: string]: number} = {};
    private legacyApi = settings.get().advanced.legacy_api;

    override async start(): Promise<void> {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onDeviceMessage(this, this.onZigbeeEvent);
        if (settings.get().ota.ikea_ota_use_test_url) {
            tradfriOTA.useTestURL();
        }

        // Let zigbeeOTA module know if the override index file is provided
        let overrideOTAIndex = settings.get().ota.zigbee_ota_override_index_location;
        if (overrideOTAIndex) {
            // If the file name is not a full path, then treat it as a relative to the data directory
            if (!isValidUrl(overrideOTAIndex) && !path.isAbsolute(overrideOTAIndex)) {
                overrideOTAIndex = dataDir.joinPath(overrideOTAIndex);
            }

            zigbeeOTA.useIndexOverride(overrideOTAIndex);
        }

        // In order to support local firmware files we need to let zigbeeOTA know where the data directory is
        zigbeeOTA.setDataDir(dataDir.getPath());

        // In case Zigbee2MQTT is restared during an update, progress and remaining values are still in state.
        // remove them.
        for (const device of this.zigbee.devices(false)) {
            this.removeProgressAndRemainingFromState(device);
        }
    }

    private removeProgressAndRemainingFromState(device: Device): void {
        delete this.state.get(device).update?.progress;
        delete this.state.get(device).update?.remaining;
    }

    @bind private async onZigbeeEvent(data: eventdata.DeviceMessage): Promise<void> {
        if (data.type !== 'commandQueryNextImageRequest' || !data.device.definition ||
            this.inProgress.has(data.device.ieeeAddr)) return;
        logger.debug(`Device '${data.device.name}' requested OTA`);

        const automaticOTACheckDisabled = settings.get().ota.disable_automatic_update_check;
        let supportsOTA = data.device.definition.hasOwnProperty('ota');
        if (supportsOTA && !automaticOTACheckDisabled) {
            // When a device does a next image request, it will usually do it a few times after each other
            // with only 10 - 60 seconds inbetween. It doesn't make sense to check for a new update
            // each time, so this interval can be set by the user. The default is 1,440 minutes (one day).
            const updateCheckInterval = settings.get().ota.update_check_interval * 1000 * 60;
            const check = this.lastChecked.hasOwnProperty(data.device.ieeeAddr) ?
                (Date.now() - this.lastChecked[data.device.ieeeAddr]) > updateCheckInterval : true;
            if (!check) return;

            this.lastChecked[data.device.ieeeAddr] = Date.now();
            let available = false;
            try {
                available = await data.device.definition.ota.isUpdateAvailable(data.device.zh, logger, data.data);
            } catch (e) {
                supportsOTA = false;
                logger.debug(`Failed to check if update available for '${data.device.name}' (${e.message})`);
            }

            const payload = this.getEntityPublishPayload(available ? 'available' : 'idle');
            this.publishEntityState(data.device, payload);

            if (available) {
                const message = `Update available for '${data.device.name}'`;
                logger.info(message);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = {status: 'available', device: data.device.name};
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
        const endpoint = data.device.zh.endpoints.find((e) => e.supportsOutputCluster('genOta'));
        if (endpoint) {
            // Some devices send OTA requests without defining OTA cluster as input cluster.
            await endpoint.commandResponse('genOta', 'queryNextImageResponse', {status: supportsOTA ? 0x95 : 0x98});
        }
    }

    private async readSoftwareBuildIDAndDateCode(device: Device, sendWhen: 'active' | 'immediate'):
        Promise<{softwareBuildID: string, dateCode: string}> {
        try {
            const endpoint = device.zh.endpoints.find((e) => e.supportsInputCluster('genBasic'));
            const result = await endpoint.read('genBasic', ['dateCode', 'swBuildId'], {sendWhen});
            return {softwareBuildID: result.swBuildId, dateCode: result.dateCode};
        } catch (e) {
            return null;
        }
    }

    private getEntityPublishPayload(state: UpdateState, progress: number=null, remaining: number=null): UpdatePayload {
        const payload: UpdatePayload = {update: {state}};
        if (progress !== null) payload.update.progress = progress;
        if (remaining !== null) payload.update.remaining = Math.round(remaining);

        /* istanbul ignore else */
        if (this.legacyApi) {
            payload.update_available = state === 'available';
        }

        return payload;
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        if ((!this.legacyApi || !data.topic.match(legacyTopicRegex)) && !data.topic.match(topicRegex)) {
            return null;
        }

        const message = utils.parseJSON(data.message, data.message);
        const ID = (typeof message === 'object' && message.hasOwnProperty('id') ? message.id : message) as string;
        const device = this.zigbee.resolveEntity(ID);
        const type = data.topic.substring(data.topic.lastIndexOf('/') + 1);
        const responseData: {id: string, updateAvailable?: boolean, from?: string, to?: string}= {id: ID};
        let error = null;
        let errorStack = null;

        if (!(device instanceof Device)) {
            error = `Device '${ID}' does not exist`;
        } else if (!device.definition || !device.definition.ota) {
            error = `Device '${device.name}' does not support OTA updates`;

            /* istanbul ignore else */
            if (settings.get().advanced.legacy_api) {
                const meta = {status: `not_supported`, device: device.name};
                this.mqtt.publish(
                    'bridge/log',
                    stringify({type: `ota_update`, message: error, meta}),
                );
            }
        } else if (this.inProgress.has(device.ieeeAddr)) {
            error = `Update or check for update already in progress for '${device.name}'`;
        } else {
            this.inProgress.add(device.ieeeAddr);

            if (type === 'check') {
                const msg = `Checking if update available for '${device.name}'`;
                logger.info(msg);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = {status: `checking_if_available`, device: device.name};
                    this.mqtt.publish(
                        'bridge/log',
                        stringify({type: `ota_update`, message: msg, meta}),
                    );
                }

                try {
                    const available = await device.definition.ota.isUpdateAvailable(device.zh, logger);
                    const msg = `${available ? 'Update' : 'No update'} available for '${device.name}'`;
                    logger.info(msg);

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {status: available ? 'available' : 'not_available', device: device.name};
                        this.mqtt.publish(
                            'bridge/log',
                            stringify({type: `ota_update`, message: msg, meta}),
                        );
                    }

                    const payload = this.getEntityPublishPayload(available ? 'available' : 'idle');
                    this.publishEntityState(device, payload);
                    this.lastChecked[device.ieeeAddr] = Date.now();
                    responseData.updateAvailable = available;
                } catch (e) {
                    error = `Failed to check if update available for '${device.name}' (${e.message})`;
                    errorStack = e.stack;

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {status: `check_failed`, device: device.name};
                        this.mqtt.publish(
                            'bridge/log',
                            stringify({type: `ota_update`, message: error, meta}),
                        );
                    }
                }
            } else { // type === 'update'
                const msg = `Updating '${device.name}' to latest firmware`;
                logger.info(msg);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = {status: `update_in_progress`, device: device.name};
                    this.mqtt.publish(
                        'bridge/log',
                        stringify({type: `ota_update`, message: msg, meta}),
                    );
                }

                try {
                    const onProgress = (progress: number, remaining: number): void => {
                        let msg = `Update of '${device.name}' at ${progress.toFixed(2)}%`;
                        if (remaining) {
                            msg += `, ≈ ${Math.round(remaining / 60)} minutes remaining`;
                        }

                        logger.info(msg);

                        const payload = this.getEntityPublishPayload('updating', progress, remaining);
                        this.publishEntityState(device, payload);

                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            const meta = {status: `update_progress`, device: device.name, progress};
                            this.mqtt.publish('bridge/log', stringify({type: `ota_update`, message: msg, meta}));
                        }
                    };

                    const from_ = await this.readSoftwareBuildIDAndDateCode(device, 'immediate');
                    await device.definition.ota.updateToLatest(device.zh, logger, onProgress);
                    logger.info(`Finished update of '${device.name}'`);
                    this.eventBus.emitReconfigure({device});
                    this.removeProgressAndRemainingFromState(device);
                    const payload = this.getEntityPublishPayload('idle');
                    this.publishEntityState(device, payload);
                    const to = await this.readSoftwareBuildIDAndDateCode(device, 'active');
                    const [fromS, toS] = [stringify(from_), stringify(to)];
                    logger.info(`Device '${device.name}' was updated from '${fromS}' to '${toS}'`);
                    responseData.from = from_ ? utils.toSnakeCase(from_) : null;
                    responseData.to = to ? utils.toSnakeCase(to) : null;
                    this.eventBus.emitDevicesChanged();

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {status: `update_succeeded`, device: device.name, from: from_, to};
                        this.mqtt.publish('bridge/log', stringify({type: `ota_update`, message, meta}));
                    }
                } catch (e) {
                    logger.debug(`Update of '${device.name}' failed (${e})`);
                    error = `Update of '${device.name}' failed (${e.message})`;
                    errorStack = e.stack;

                    this.removeProgressAndRemainingFromState(device);
                    const payload = this.getEntityPublishPayload('available');
                    this.publishEntityState(device, payload);

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {status: `update_failed`, device: device.name};
                        this.mqtt.publish('bridge/log', stringify({type: `ota_update`, message: error, meta}));
                    }
                }
            }

            this.inProgress.delete(device.ieeeAddr);
        }

        const triggeredViaLegacyApi = data.topic.match(legacyTopicRegex);
        if (!triggeredViaLegacyApi) {
            const response = utils.getResponse(message, responseData, error);
            await this.mqtt.publish(`bridge/response/device/ota_update/${type}`, stringify(response));
        }

        if (error) {
            logger.error(error);
            errorStack && logger.debug(errorStack);
        }
    }
}
