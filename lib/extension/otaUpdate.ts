import assert from "node:assert";
import {existsSync, mkdirSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import bind from "bind-decorator";
import stringify from "json-stable-stringify-without-jsonify";
import {setOtaConfiguration, Zcl} from "zigbee-herdsman";
import type {OtaDataSettings, OtaSource, OtaUpdateAvailableResult} from "zigbee-herdsman/dist/controller/tstype";
import Device from "../model/device";
import type {Zigbee2MQTTAPI} from "../types/api";
import dataDir from "../util/data";
import logger from "../util/logger";
import * as settings from "../util/settings";
import utils from "../util/utils";
import Extension from "./extension";

type UpdateState = "updating" | "idle" | "available" | "scheduled";

export interface UpdatePayload {
    update: {
        progress?: number;
        remaining?: number;
        state: UpdateState;
        installed_version: number | null;
        latest_version: number | null;
        latest_source: string | null;
        latest_release_notes: string | null;
    };
}

/**
 * Write to `dataDir` and return created path
 */
function writeFirmwareHexToDataDir(hex: string, fileName: string | undefined, deviceIeee: string): string {
    if (!fileName) {
        fileName = `${deviceIeee}_${Date.now()}`;
    }

    const baseDir = dataDir.joinPath("ota");

    if (!existsSync(baseDir)) {
        mkdirSync(baseDir, {recursive: true});
    }

    const filePath = join(baseDir, fileName);

    writeFileSync(filePath, Buffer.from(hex, "hex"));

    return filePath;
}

export default class OTAUpdate extends Extension {
    #topicRegex = new RegExp(
        `^${settings.get().mqtt.base_topic}/bridge/request/device/ota_update/(update|check|schedule|unschedule)/?(downgrade)?`,
        "i",
    );
    #inProgress = new Set<string>();
    #lastChecked = new Map<string, number>();

    // biome-ignore lint/suspicious/useAwait: API
    override async start(): Promise<void> {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onDeviceMessage(this, this.onZigbeeEvent);

        setOtaConfiguration(dataDir.getPath(), settings.get().ota.zigbee_ota_override_index_location);

        // In case Zigbee2MQTT is restared during an update, progress and remaining values are still in state, remove them.
        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            this.#removeProgressAndRemainingFromState(device);

            // Reset update state, e.g. when Z2M restarted during update.
            if (this.state.get(device).update?.state === "updating") {
                this.state.get(device).update.state = "idle";
            }
        }
    }

    // mostly intended for testing
    clearState(): void {
        this.#inProgress.clear();
        this.#lastChecked.clear();
    }

    #removeProgressAndRemainingFromState(device: Device): void {
        const deviceState = this.state.get(device);

        if (deviceState.update) {
            delete deviceState.update.progress;
            delete deviceState.update.remaining;
        }
    }

    @bind private async onZigbeeEvent(data: eventdata.DeviceMessage): Promise<void> {
        if (data.type !== "commandQueryNextImageRequest" || !data.device.definition || this.#inProgress.has(data.device.ieeeAddr)) {
            return;
        }

        // `commandQueryNextImageRequest` check above should ensures this is valid but...
        assert(
            data.meta.zclTransactionSequenceNumber !== undefined,
            "Missing 'queryNextImageRequest' transaction sequence number (cannot match reply)",
        );

        logger.debug(`Device '${data.device.name}' requested OTA`);

        if (data.device.zh.scheduledOta) {
            // allow custom source to override check for definition `ota`
            if (data.device.zh.scheduledOta?.url !== undefined || data.device.definition.ota) {
                this.#inProgress.add(data.device.ieeeAddr);

                logger.info(`Updating '${data.device.name}' to latest firmware`);

                try {
                    const otaSettings = settings.get().ota;
                    const [, toVersion] = await this.#update(
                        undefined, // uses internally registered schedule
                        data.device,
                        data.data as Zcl.ClustersTypes.TClusterCommandPayload<"genOta", "queryNextImageRequest">,
                        data.meta.zclTransactionSequenceNumber,
                        {
                            // fallbacks are only to satisfy typing, should always be defined from settings defaults
                            requestTimeout: otaSettings.image_block_request_timeout ?? /* v8 ignore next */ 150000,
                            responseDelay: otaSettings.image_block_response_delay ?? /* v8 ignore next */ 250,
                            baseSize: otaSettings.default_maximum_data_size ?? /* v8 ignore next */ 50,
                        },
                        data.endpoint,
                    );

                    if (toVersion === undefined) {
                        logger.info(`No OTA image currently available for '${data.device.name}'. Unscheduled.`);
                    }
                } catch (e) {
                    logger.debug(`OTA update of '${data.device.name}' failed (${e}). Retry scheduled for next request.`);

                    this.#removeProgressAndRemainingFromState(data.device);
                    await this.publishEntityState(data.device, this.#getEntityPublishPayload(data.device, "scheduled"));
                }

                this.#inProgress.delete(data.device.ieeeAddr);

                return; // we're done
            }
        }

        if (data.device.definition.ota) {
            if (!data.device.options.disable_automatic_update_check && !settings.get().ota.disable_automatic_update_check) {
                // When a device does a next image request, it will usually do it a few times after each other
                // with only 10 - 60 seconds inbetween. It doesn't make sense to check for a new update
                // each time, so this interval can be set by the user. The default is 1,440 minutes (one day).
                const updateCheckInterval = settings.get().ota.update_check_interval * 1000 * 60;
                const deviceLastChecked = this.#lastChecked.get(data.device.ieeeAddr);
                const check = deviceLastChecked !== undefined ? Date.now() - deviceLastChecked > updateCheckInterval : true;

                if (!check) {
                    return;
                }

                this.#inProgress.add(data.device.ieeeAddr);
                this.#lastChecked.set(data.device.ieeeAddr, Date.now());
                let availableResult: OtaUpdateAvailableResult | undefined;

                try {
                    // auto-check defaults to zigbee-OTA + potential local index, and never `downgrade`
                    availableResult = await data.device.zh.checkOta(
                        {downgrade: false},
                        data.data as Zcl.ClustersTypes.TClusterCommandPayload<"genOta", "queryNextImageRequest">,
                        data.device.otaExtraMetas,
                        data.endpoint,
                    );
                } catch (error) {
                    logger.debug(`Failed to check if OTA update available for '${data.device.name}' (${error})`);
                }

                await this.publishEntityState(data.device, this.#getEntityPublishPayload(data.device, availableResult ?? "idle"));

                if (availableResult?.available) {
                    logger.info(`OTA update available for '${data.device.name}'`);
                }
            }
        }

        // Respond to stop the client from requesting OTAs
        await data.endpoint.commandResponse(
            "genOta",
            "queryNextImageResponse",
            {status: Zcl.Status.NO_IMAGE_AVAILABLE},
            undefined,
            data.meta.zclTransactionSequenceNumber,
        );
        logger.debug(`Responded to OTA request of '${data.device.name}' with 'NO_IMAGE_AVAILABLE'`);
        this.#inProgress.delete(data.device.ieeeAddr);
    }

    async #readSoftwareBuildIDAndDateCode(
        device: Device,
        sendPolicy?: "immediate",
    ): Promise<{softwareBuildID: string; dateCode: string} | undefined> {
        try {
            const endpoint = device.zh.endpoints.find((e) => e.supportsInputCluster("genBasic"));
            assert(endpoint);

            const result = await endpoint.read("genBasic", ["dateCode", "swBuildId"], {sendPolicy});

            return {softwareBuildID: result.swBuildId, dateCode: result.dateCode};
        } catch {
            return undefined;
        }
    }

    #getEntityPublishPayload(device: Device, state: OtaUpdateAvailableResult | UpdateState, progress?: number, remaining?: number): UpdatePayload {
        const deviceUpdateState = this.state.get(device).update as UpdatePayload["update"];
        const update: UpdatePayload["update"] =
            typeof state === "string"
                ? {
                      state,
                      installed_version: deviceUpdateState?.installed_version,
                      latest_version: deviceUpdateState?.latest_version,
                      latest_source: deviceUpdateState?.latest_source,
                      latest_release_notes: deviceUpdateState?.latest_release_notes,
                  }
                : {
                      state: state.available === 0 ? "idle" : "available",
                      installed_version: state.current.fileVersion,
                      latest_version: state.availableMeta?.fileVersion ?? state.current.fileVersion,
                      latest_source: state.availableMeta?.url || null,
                      latest_release_notes: state.availableMeta?.releaseNotes || null,
                  };

        if (progress !== undefined) {
            update.progress = progress;
        }

        if (remaining !== undefined) {
            update.remaining = Math.round(remaining);
        }

        return {update};
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const topicMatch = data.topic.match(this.#topicRegex);

        if (!topicMatch) {
            return;
        }

        const message = utils.parseJSON(data.message, data.message) as
            | Zigbee2MQTTAPI["bridge/request/device/ota_update/check"]
            | Zigbee2MQTTAPI["bridge/request/device/ota_update/check/downgrade"]
            | Zigbee2MQTTAPI["bridge/request/device/ota_update/update"]
            | Zigbee2MQTTAPI["bridge/request/device/ota_update/update/downgrade"]
            | Zigbee2MQTTAPI["bridge/request/device/ota_update/schedule"]
            | Zigbee2MQTTAPI["bridge/request/device/ota_update/schedule/downgrade"]
            | Zigbee2MQTTAPI["bridge/request/device/ota_update/unschedule"];
        // TODO: deprecated 3.0 should remove string payload, enforce object
        const messageObject = typeof message === "object";

        if (messageObject) {
            assert(message.id, "Invalid payload");
        }

        const ID = (messageObject ? message.id : message) as string;
        const device = this.zigbee.resolveEntity(ID);
        const type = topicMatch[1] as "check" | "update" | "schedule" | "unschedule";
        const downgrade = topicMatch[2] === "downgrade";
        let error: string | undefined;
        let errorStack: string | undefined;

        if (!(device instanceof Device)) {
            error = `Device '${ID}' does not exist`;
        } else if (this.#inProgress.has(device.ieeeAddr)) {
            // also guards against scheduling while check/update op in progress that could result in undesired OTA state
            error = `OTA update or check for update already in progress for '${device.name}'`;
        } else {
            switch (type) {
                case "check": {
                    this.#inProgress.add(device.ieeeAddr);

                    const source: OtaSource = {downgrade};

                    if (messageObject) {
                        const payload = message as
                            | Zigbee2MQTTAPI["bridge/request/device/ota_update/check"]
                            | Zigbee2MQTTAPI["bridge/request/device/ota_update/check/downgrade"];

                        if (payload.url) {
                            source.url = payload.url;
                        } else if (!device.definition || !device.definition.ota) {
                            error = `Device '${device.name}' does not support OTA updates`;
                            break;
                        }
                    } else if (!device.definition || !device.definition.ota) {
                        error = `Device '${device.name}' does not support OTA updates`;
                        break;
                    }

                    logger.info(`Checking if OTA update available for '${device.name}'`);

                    try {
                        const availableResult = await device.zh.checkOta(source, undefined, device.otaExtraMetas);

                        logger.info(`${availableResult.available ? "" : "No "}OTA update available for '${device.name}'`);

                        await this.publishEntityState(device, this.#getEntityPublishPayload(device, availableResult));
                        this.#lastChecked.set(device.ieeeAddr, Date.now());

                        const available = availableResult.available !== 0;
                        const response = utils.getResponse<"bridge/response/device/ota_update/check">(message, {
                            id: ID,
                            update_available: available,
                            source: availableResult.availableMeta?.url,
                            release_notes: availableResult.availableMeta?.releaseNotes,
                            downgrade: available ? availableResult.available === 1 : undefined,
                        });

                        await this.mqtt.publish("bridge/response/device/ota_update/check", stringify(response));
                    } catch (e) {
                        error = `Failed to check if OTA update available for '${device.name}' (${(e as Error).message})`;
                        errorStack = (e as Error).stack;
                    }

                    break;
                }

                case "update": {
                    this.#inProgress.add(device.ieeeAddr);

                    const otaSettings = settings.get().ota;
                    const source: OtaSource = {downgrade};
                    const dataSettings: OtaDataSettings = {
                        // fallbacks are only to satisfy typing, should always be defined from settings defaults
                        requestTimeout: otaSettings.image_block_request_timeout ?? /* v8 ignore next */ 150000,
                        responseDelay: otaSettings.image_block_response_delay ?? /* v8 ignore next */ 250,
                        baseSize: otaSettings.default_maximum_data_size ?? /* v8 ignore next */ 50,
                    };

                    if (messageObject) {
                        const payload = message as
                            | Zigbee2MQTTAPI["bridge/request/device/ota_update/update"]
                            | Zigbee2MQTTAPI["bridge/request/device/ota_update/update/downgrade"];

                        if (payload.hex) {
                            assert(payload.hex.data);

                            // write to `dataDir` and pass created path as source URL
                            source.url = writeFirmwareHexToDataDir(payload.hex.data, payload.hex.file_name, device.ieeeAddr);
                        } else if (payload.url) {
                            source.url = payload.url;
                        } else if (!device.definition || !device.definition.ota) {
                            error = `Device '${device.name}' does not support OTA updates`;
                            break;
                        }

                        if (payload.image_block_request_timeout) {
                            dataSettings.requestTimeout = payload.image_block_request_timeout;
                        }

                        if (payload.image_block_response_delay) {
                            dataSettings.responseDelay = payload.image_block_response_delay;
                        }

                        if (payload.default_maximum_data_size) {
                            dataSettings.baseSize = payload.default_maximum_data_size;
                        }
                    } else if (!device.definition || !device.definition.ota) {
                        error = `Device '${device.name}' does not support OTA updates`;
                        break;
                    }

                    logger.info(`OTA updating '${device.name}' to ${downgrade ? "previous" : "latest"} firmware`);

                    try {
                        const firmwareFrom = await this.#readSoftwareBuildIDAndDateCode(device, "immediate");
                        const [fromVersion, toVersion] = await this.#update(source, device, undefined, undefined, dataSettings);

                        if (toVersion === undefined) {
                            error = `Update of '${device.name}' failed (No image currently available)`;
                            break;
                        }

                        const firmwareTo = await this.#readSoftwareBuildIDAndDateCode(device);
                        const response = utils.getResponse<"bridge/response/device/ota_update/update">(message, {
                            id: ID,
                            from: {
                                file_version: fromVersion,
                                software_build_id: firmwareFrom?.softwareBuildID,
                                date_code: firmwareFrom?.dateCode,
                            },
                            to: {file_version: toVersion, software_build_id: firmwareTo?.softwareBuildID, date_code: firmwareTo?.dateCode},
                        });

                        await this.mqtt.publish("bridge/response/device/ota_update/update", stringify(response));
                    } catch (e) {
                        logger.debug(`OTA update of '${device.name}' failed (${e})`);
                        error = `OTA update of '${device.name}' failed (${(e as Error).message})`;
                        errorStack = (e as Error).stack;

                        this.#removeProgressAndRemainingFromState(device);
                        await this.publishEntityState(device, this.#getEntityPublishPayload(device, "available"));
                    }

                    break;
                }

                case "schedule": {
                    const source: OtaSource = {downgrade};

                    if (messageObject) {
                        const payload = message as
                            | Zigbee2MQTTAPI["bridge/request/device/ota_update/schedule"]
                            | Zigbee2MQTTAPI["bridge/request/device/ota_update/schedule/downgrade"];

                        if (payload.hex) {
                            assert(payload.hex.data);

                            // write to `dataDir` and pass created path as source URL
                            source.url = writeFirmwareHexToDataDir(payload.hex.data, payload.hex.file_name, device.ieeeAddr);
                        } else if (payload.url) {
                            source.url = payload.url;
                        } else if (!device.definition || !device.definition.ota) {
                            error = `Device '${device.name}' does not support OTA updates`;
                            break;
                        }
                    } else if (!device.definition || !device.definition.ota) {
                        error = `Device '${device.name}' does not support OTA updates`;
                        break;
                    }

                    device.zh.scheduleOta(source);
                    await this.publishEntityState(device, this.#getEntityPublishPayload(device, "scheduled"));

                    const response = utils.getResponse<"bridge/response/device/ota_update/schedule">(message, {id: ID, url: source.url});

                    await this.mqtt.publish("bridge/response/device/ota_update/schedule", stringify(response));

                    break;
                }

                case "unschedule": {
                    if (device.zh.scheduledOta?.url?.startsWith(dataDir.joinPath("ota"))) {
                        rmSync(device.zh.scheduledOta.url, {force: true});
                    }

                    device.zh.unscheduleOta();
                    await this.publishEntityState(device, this.#getEntityPublishPayload(device, "idle"));

                    const response = utils.getResponse<"bridge/response/device/ota_update/unschedule">(message, {
                        id: ID,
                    });

                    await this.mqtt.publish("bridge/response/device/ota_update/unschedule", stringify(response));

                    break;
                }
            }

            this.#inProgress.delete(device.ieeeAddr);
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

    /**
     * Do the bulk of the update work (hand over to zigbee-herdsman, then re-interview).
     *
     * `dataSettings` object may be mutated by zigbee-herdsman to fit request (e.g. known manuf quirk)
     */
    async #update(
        source: OtaSource | undefined,
        device: Device,
        requestPayload: Zcl.ClustersTypes.TClusterCommandPayload<"genOta", "queryNextImageRequest"> | undefined,
        requestTsn: number | undefined,
        dataSettings: OtaDataSettings,
        endpoint?: zh.Endpoint,
    ): Promise<[from: number, to: number | undefined]> {
        const [from, to] = await device.zh.updateOta(
            source,
            requestPayload,
            requestTsn,
            device.otaExtraMetas,
            async (progress, remaining) => {
                await this.publishEntityState(device, this.#getEntityPublishPayload(device, "updating", progress, remaining));
            },
            dataSettings,
            endpoint,
        );

        if (to === undefined) {
            this.#removeProgressAndRemainingFromState(device);
            await this.publishEntityState(device, this.#getEntityPublishPayload(device, {available: 0, current: from}));

            return [from.fileVersion, undefined];
        }

        logger.info(`Finished update of '${device.name}'`);

        this.#removeProgressAndRemainingFromState(device);
        await this.publishEntityState(device, this.#getEntityPublishPayload(device, {available: 0, current: to}));

        logger.info(() => `Device '${device.name}' was OTA updated from '${from.fileVersion}' to '${to.fileVersion}'`);

        // OTA update can bring new features & co, force full re-interview and re-configure, same as a "device joined"
        if (device.zh.meta.configured !== undefined) {
            delete device.zh.meta.configured;

            device.zh.save();
        }

        setTimeout(() => {
            device.reInterview(this.eventBus).catch((error) => {
                logger.error(`${error.message}. Re-try manually after some time.`);
            });
        }, 5000);

        return [from.fileVersion, to.fileVersion];
    }
}
