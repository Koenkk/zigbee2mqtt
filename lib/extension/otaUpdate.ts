import assert from 'assert';
import path from 'path';

import bind from 'bind-decorator';
import stringify from 'json-stable-stringify-without-jsonify';
import * as URI from 'uri-js';

import {Zcl} from 'zigbee-herdsman';
import * as zhc from 'zigbee-herdsman-converters';

import Device from '../model/device';
import dataDir from '../util/data';
import logger from '../util/logger';
import * as settings from '../util/settings';
import utils from '../util/utils';
import Extension from './extension';

function isValidUrl(url: string): boolean {
    let parsed;
    try {
        parsed = URI.parse(url);
    } catch {
        // istanbul ignore next
        return false;
    }
    return parsed.scheme === 'http' || parsed.scheme === 'https';
}

type UpdateState = 'updating' | 'idle' | 'available';
interface UpdatePayload {
    update_available?: boolean;

    update: {
        progress?: number;
        remaining?: number;
        state: UpdateState;
        installed_version: number | null;
        latest_version: number | null;
    };
}

const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/ota_update/.+$`);
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/ota_update/(update|check)`, 'i');

export default class OTAUpdate extends Extension {
    private inProgress = new Set();
    private lastChecked: {[s: string]: number} = {};
    private legacyApi = settings.get().advanced.legacy_api;

    override async start(): Promise<void> {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onDeviceMessage(this, this.onZigbeeEvent);
        if (settings.get().ota.ikea_ota_use_test_url) {
            zhc.ota.tradfri.useTestURL();
        }

        // Let zigbeeOTA module know if the override index file is provided
        let overrideOTAIndex = settings.get().ota.zigbee_ota_override_index_location;
        if (overrideOTAIndex) {
            // If the file name is not a full path, then treat it as a relative to the data directory
            if (!isValidUrl(overrideOTAIndex) && !path.isAbsolute(overrideOTAIndex)) {
                overrideOTAIndex = dataDir.joinPath(overrideOTAIndex);
            }

            zhc.ota.zigbeeOTA.useIndexOverride(overrideOTAIndex);
        }

        // In order to support local firmware files we need to let zigbeeOTA know where the data directory is
        zhc.ota.setDataDir(dataDir.getPath());

        // In case Zigbee2MQTT is restared during an update, progress and remaining values are still in state, remove them.
        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            this.removeProgressAndRemainingFromState(device);

            // Reset update state, e.g. when Z2M restarted during update.
            if (this.state.get(device).update?.state === 'updating') {
                this.state.get(device).update.state = 'available';
            }
        }
    }

    private removeProgressAndRemainingFromState(device: Device): void {
        delete this.state.get(device).update?.progress;
        delete this.state.get(device).update?.remaining;
    }

    @bind private async onZigbeeEvent(data: eventdata.DeviceMessage): Promise<void> {
        if (data.type !== 'commandQueryNextImageRequest' || !data.device.definition || this.inProgress.has(data.device.ieeeAddr)) return;
        logger.debug(`Device '${data.device.name}' requested OTA`);

        const automaticOTACheckDisabled = settings.get().ota.disable_automatic_update_check;

        if (data.device.definition.ota && !automaticOTACheckDisabled) {
            // When a device does a next image request, it will usually do it a few times after each other
            // with only 10 - 60 seconds inbetween. It doesn't make sense to check for a new update
            // each time, so this interval can be set by the user. The default is 1,440 minutes (one day).
            const updateCheckInterval = settings.get().ota.update_check_interval * 1000 * 60;
            const check =
                this.lastChecked[data.device.ieeeAddr] !== undefined
                    ? Date.now() - this.lastChecked[data.device.ieeeAddr] > updateCheckInterval
                    : true;
            if (!check) return;

            this.lastChecked[data.device.ieeeAddr] = Date.now();
            let availableResult: zhc.OtaUpdateAvailableResult | undefined;

            try {
                availableResult = await data.device.definition.ota.isUpdateAvailable(data.device.zh, data.data as zhc.ota.ImageInfo);
            } catch (error) {
                logger.debug(`Failed to check if update available for '${data.device.name}' (${error})`);
            }

            const payload = this.getEntityPublishPayload(data.device, availableResult ?? 'idle');
            await this.publishEntityState(data.device, payload);

            if (availableResult?.available) {
                const message = `Update available for '${data.device.name}'`;
                logger.info(message);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = {status: 'available', device: data.device.name};
                    await this.mqtt.publish('bridge/log', stringify({type: `ota_update`, message, meta}));
                }
            }
        }

        // Respond to stop the client from requesting OTAs
        const endpoint = data.device.zh.endpoints.find((e) => e.supportsOutputCluster('genOta')) || data.endpoint;
        await endpoint.commandResponse(
            'genOta',
            'queryNextImageResponse',
            {status: Zcl.Status.NO_IMAGE_AVAILABLE},
            undefined,
            data.meta.zclTransactionSequenceNumber,
        );
        logger.debug(`Responded to OTA request of '${data.device.name}' with 'NO_IMAGE_AVAILABLE'`);
    }

    private async readSoftwareBuildIDAndDateCode(
        device: Device,
        sendPolicy?: 'immediate',
    ): Promise<{softwareBuildID: string; dateCode: string} | undefined> {
        try {
            const endpoint = device.zh.endpoints.find((e) => e.supportsInputCluster('genBasic'));
            assert(endpoint);
            const result = await endpoint.read('genBasic', ['dateCode', 'swBuildId'], {sendPolicy});
            return {softwareBuildID: result.swBuildId, dateCode: result.dateCode};
        } catch {
            return undefined;
        }
    }

    private getEntityPublishPayload(
        device: Device,
        state: zhc.OtaUpdateAvailableResult | UpdateState,
        progress?: number,
        remaining?: number,
    ): UpdatePayload {
        const deviceUpdateState = this.state.get(device).update;
        const payload: UpdatePayload = {
            update: {
                state: typeof state === 'string' ? state : state.available ? 'available' : 'idle',
                installed_version: typeof state === 'string' ? deviceUpdateState?.installed_version : state.currentFileVersion,
                latest_version: typeof state === 'string' ? deviceUpdateState?.latest_version : state.otaFileVersion,
            },
        };

        if (progress != undefined) {
            payload.update.progress = progress;
        }

        if (remaining != undefined) {
            payload.update.remaining = Math.round(remaining);
        }

        /* istanbul ignore else */
        if (this.legacyApi) {
            payload.update_available = typeof state === 'string' ? state === 'available' : state.available;
        }

        return payload;
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        if ((!this.legacyApi || !data.topic.match(legacyTopicRegex)) && !data.topic.match(topicRegex)) {
            return;
        }

        const message = utils.parseJSON(data.message, data.message);
        const ID = (typeof message === 'object' && message['id'] !== undefined ? message.id : message) as string;
        const device = this.zigbee.resolveEntity(ID);
        const type = data.topic.substring(data.topic.lastIndexOf('/') + 1);
        const responseData: {id: string; updateAvailable?: boolean; from?: KeyValue | null; to?: KeyValue | null} = {id: ID};
        let error: string | undefined;
        let errorStack: string | undefined;

        if (!(device instanceof Device)) {
            error = `Device '${ID}' does not exist`;
        } else if (!device.definition || !device.definition.ota) {
            error = `Device '${device.name}' does not support OTA updates`;

            /* istanbul ignore else */
            if (settings.get().advanced.legacy_api) {
                const meta = {status: `not_supported`, device: device.name};
                await this.mqtt.publish('bridge/log', stringify({type: `ota_update`, message: error, meta}));
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
                    await this.mqtt.publish('bridge/log', stringify({type: `ota_update`, message: msg, meta}));
                }

                try {
                    const availableResult = await device.definition.ota.isUpdateAvailable(device.zh, undefined);
                    const msg = `${availableResult.available ? 'Update' : 'No update'} available for '${device.name}'`;
                    logger.info(msg);

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {
                            status: availableResult.available ? 'available' : 'not_available',
                            device: device.name,
                        };
                        await this.mqtt.publish('bridge/log', stringify({type: `ota_update`, message: msg, meta}));
                    }

                    const payload = this.getEntityPublishPayload(device, availableResult);
                    await this.publishEntityState(device, payload);
                    this.lastChecked[device.ieeeAddr] = Date.now();
                    responseData.updateAvailable = availableResult.available;
                } catch (e) {
                    error = `Failed to check if update available for '${device.name}' (${(e as Error).message})`;
                    errorStack = (e as Error).stack;

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {status: `check_failed`, device: device.name};
                        await this.mqtt.publish('bridge/log', stringify({type: `ota_update`, message: error, meta}));
                    }
                }
            } else {
                // type === 'update'
                const msg = `Updating '${device.name}' to latest firmware`;
                logger.info(msg);

                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = {status: `update_in_progress`, device: device.name};
                    await this.mqtt.publish('bridge/log', stringify({type: `ota_update`, message: msg, meta}));
                }

                try {
                    const onProgress = async (progress: number, remaining: number): Promise<void> => {
                        let msg = `Update of '${device.name}' at ${progress.toFixed(2)}%`;
                        if (remaining) {
                            msg += `, ≈ ${Math.round(remaining / 60)} minutes remaining`;
                        }

                        logger.info(msg);

                        const payload = this.getEntityPublishPayload(device, 'updating', progress, remaining);
                        await this.publishEntityState(device, payload);

                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            const meta = {status: `update_progress`, device: device.name, progress};
                            await this.mqtt.publish('bridge/log', stringify({type: `ota_update`, message: msg, meta}));
                        }
                    };

                    const from_ = await this.readSoftwareBuildIDAndDateCode(device, 'immediate');
                    const fileVersion = await device.definition.ota.updateToLatest(device.zh, onProgress);
                    logger.info(`Finished update of '${device.name}'`);
                    this.removeProgressAndRemainingFromState(device);
                    const payload = this.getEntityPublishPayload(device, {
                        available: false,
                        currentFileVersion: fileVersion,
                        otaFileVersion: fileVersion,
                    });
                    await this.publishEntityState(device, payload);
                    const to = await this.readSoftwareBuildIDAndDateCode(device);
                    const [fromS, toS] = [stringify(from_), stringify(to)];
                    logger.info(`Device '${device.name}' was updated from '${fromS}' to '${toS}'`);
                    responseData.from = from_ ? utils.toSnakeCaseObject(from_) : null;
                    responseData.to = to ? utils.toSnakeCaseObject(to) : null;
                    /**
                     * Re-configure after reading software build ID and date code, some devices use a
                     * custom attribute for this (e.g. Develco SMSZB-120)
                     */
                    this.eventBus.emitReconfigure({device});
                    this.eventBus.emitDevicesChanged();

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {status: `update_succeeded`, device: device.name, from: from_, to};
                        await this.mqtt.publish('bridge/log', stringify({type: `ota_update`, message, meta}));
                    }
                } catch (e) {
                    logger.debug(`Update of '${device.name}' failed (${e})`);
                    error = `Update of '${device.name}' failed (${(e as Error).message})`;
                    errorStack = (e as Error).stack;

                    this.removeProgressAndRemainingFromState(device);
                    const payload = this.getEntityPublishPayload(device, 'available');
                    await this.publishEntityState(device, payload);

                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {status: `update_failed`, device: device.name};
                        await this.mqtt.publish('bridge/log', stringify({type: `ota_update`, message: error, meta}));
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

            if (errorStack) {
                logger.debug(errorStack);
            }
        }
    }
}
