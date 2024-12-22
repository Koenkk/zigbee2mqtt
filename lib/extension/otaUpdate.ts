import type {Zigbee2MQTTAPI} from 'lib/types/api';
import type {Ota} from 'zigbee-herdsman-converters';

import assert from 'node:assert';
import path from 'node:path';

import bind from 'bind-decorator';
import stringify from 'json-stable-stringify-without-jsonify';

import {Zcl} from 'zigbee-herdsman';
import {ota} from 'zigbee-herdsman-converters';

import Device from '../model/device';
import dataDir from '../util/data';
import logger from '../util/logger';
import * as settings from '../util/settings';
import utils from '../util/utils';
import Extension from './extension';

type UpdateState = 'updating' | 'idle' | 'available';
interface UpdatePayload {
    update: {
        progress?: number;
        remaining?: number;
        state: UpdateState;
        installed_version: number | null;
        latest_version: number | null;
    };
}

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/ota_update/(update|check)/?(downgrade)?`, 'i');

export default class OTAUpdate extends Extension {
    private inProgress = new Set();
    private lastChecked: {[s: string]: number} = {};

    override async start(): Promise<void> {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onDeviceMessage(this, this.onZigbeeEvent);

        const otaSettings = settings.get().ota;
        // Let OTA module know if the override index file is provided
        let overrideIndexLocation = otaSettings.zigbee_ota_override_index_location;

        // If the file name is not a full path, then treat it as a relative to the data directory
        if (overrideIndexLocation && !ota.isValidUrl(overrideIndexLocation) && !path.isAbsolute(overrideIndexLocation)) {
            overrideIndexLocation = dataDir.joinPath(overrideIndexLocation);
        }

        // In order to support local firmware files we need to let zigbeeOTA know where the data directory is
        ota.setConfiguration({
            dataDir: dataDir.getPath(),
            overrideIndexLocation,
            // TODO: implement me
            imageBlockResponseDelay: otaSettings.image_block_response_delay,
            defaultMaximumDataSize: otaSettings.default_maximum_data_size,
        });

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
        const deviceState = this.state.get(device);

        if (deviceState.update) {
            delete deviceState.update.progress;
            delete deviceState.update.remaining;
        }
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
            let availableResult: Ota.UpdateAvailableResult | undefined;

            try {
                // never use 'previous' when responding to device request
                availableResult = await ota.isUpdateAvailable(data.device.zh, data.device.otaExtraMetas, data.data as Ota.ImageInfo, false);
            } catch (error) {
                logger.debug(`Failed to check if update available for '${data.device.name}' (${error})`);
            }

            await this.publishEntityState(data.device, this.getEntityPublishPayload(data.device, availableResult ?? 'idle'));

            if (availableResult?.available) {
                const message = `Update available for '${data.device.name}'`;
                logger.info(message);
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
        state: Ota.UpdateAvailableResult | UpdateState,
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

        if (progress !== undefined) {
            payload.update.progress = progress;
        }

        if (remaining !== undefined) {
            payload.update.remaining = Math.round(remaining);
        }

        return payload;
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const topicMatch = data.topic.match(topicRegex);

        if (!topicMatch) {
            return;
        }

        const message = utils.parseJSON(data.message, data.message) as
            | Zigbee2MQTTAPI['bridge/request/device/ota_update/check']
            | Zigbee2MQTTAPI['bridge/request/device/ota_update/check/downgrade']
            | Zigbee2MQTTAPI['bridge/request/device/ota_update/update']
            | Zigbee2MQTTAPI['bridge/request/device/ota_update/update/downgrade'];
        const ID = (typeof message === 'object' && message['id'] !== undefined ? message.id : message) as string;
        const device = this.zigbee.resolveEntity(ID);
        const type = topicMatch[1];
        const downgrade = Boolean(topicMatch[2]);
        let error: string | undefined;
        let errorStack: string | undefined;

        if (!(device instanceof Device)) {
            error = `Device '${ID}' does not exist`;
        } else if (!device.definition || !device.definition.ota) {
            error = `Device '${device.name}' does not support OTA updates`;
        } else if (this.inProgress.has(device.ieeeAddr)) {
            error = `Update or check for update already in progress for '${device.name}'`;
        } else {
            this.inProgress.add(device.ieeeAddr);

            if (type === 'check') {
                const msg = `Checking if update available for '${device.name}'`;
                logger.info(msg);

                try {
                    const availableResult = await ota.isUpdateAvailable(device.zh, device.otaExtraMetas, undefined, downgrade);
                    const msg = `${availableResult.available ? 'Update' : 'No update'} available for '${device.name}'`;
                    logger.info(msg);

                    await this.publishEntityState(device, this.getEntityPublishPayload(device, availableResult));

                    this.lastChecked[device.ieeeAddr] = Date.now();
                    const response = utils.getResponse<'bridge/response/device/ota_update/check'>(message, {
                        id: ID,
                        update_available: availableResult.available,
                    });

                    await this.mqtt.publish(`bridge/response/device/ota_update/check`, stringify(response));
                } catch (e) {
                    error = `Failed to check if update available for '${device.name}' (${(e as Error).message})`;
                    errorStack = (e as Error).stack;
                }
            } else {
                // type === 'update'
                const msg = `Updating '${device.name}' to ${downgrade ? 'previous' : 'latest'} firmware`;
                logger.info(msg);

                try {
                    const firmwareFrom = await this.readSoftwareBuildIDAndDateCode(device, 'immediate');
                    const fileVersion = await ota.update(device.zh, device.otaExtraMetas, downgrade, async (progress, remaining) => {
                        let msg = `Update of '${device.name}' at ${progress.toFixed(2)}%`;

                        if (remaining) {
                            msg += `, ≈ ${Math.round(remaining / 60)} minutes remaining`;
                        }

                        logger.info(msg);

                        await this.publishEntityState(device, this.getEntityPublishPayload(device, 'updating', progress, remaining ?? undefined));
                    });

                    logger.info(`Finished update of '${device.name}'`);
                    this.removeProgressAndRemainingFromState(device);
                    await this.publishEntityState(
                        device,
                        this.getEntityPublishPayload(device, {available: false, currentFileVersion: fileVersion, otaFileVersion: fileVersion}),
                    );

                    const firmwareTo = await this.readSoftwareBuildIDAndDateCode(device);

                    logger.info(() => `Device '${device.name}' was updated from '${stringify(firmwareFrom)}' to '${stringify(firmwareTo)}'`);

                    /**
                     * Re-configure after reading software build ID and date code, some devices use a
                     * custom attribute for this (e.g. Develco SMSZB-120)
                     */
                    this.eventBus.emitReconfigure({device});
                    this.eventBus.emitDevicesChanged();

                    const response = utils.getResponse<'bridge/response/device/ota_update/update'>(message, {
                        id: ID,
                        from: firmwareFrom ? {software_build_id: firmwareFrom.softwareBuildID, date_code: firmwareFrom.dateCode} : undefined,
                        to: firmwareTo ? {software_build_id: firmwareTo.softwareBuildID, date_code: firmwareTo.dateCode} : undefined,
                    });

                    await this.mqtt.publish(`bridge/response/device/ota_update/update`, stringify(response));
                } catch (e) {
                    logger.debug(`Update of '${device.name}' failed (${e})`);
                    error = `Update of '${device.name}' failed (${(e as Error).message})`;
                    errorStack = (e as Error).stack;

                    this.removeProgressAndRemainingFromState(device);
                    await this.publishEntityState(device, this.getEntityPublishPayload(device, 'available'));
                }
            }

            this.inProgress.delete(device.ieeeAddr);
        }

        if (error) {
            const response = utils.getResponse(message, {}, error);

            await this.mqtt.publish(`bridge/response/device/ota_update/${type}`, stringify(response));
            logger.error(error);

            if (errorStack) {
                logger.debug(errorStack);
            }
        }
    }
}
