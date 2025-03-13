import type {IClientPublishOptions} from 'mqtt';

import type Extension from './extension/extension';
import type {Zigbee2MQTTAPI} from './types/api';

import bind from 'bind-decorator';
import stringify from 'json-stable-stringify-without-jsonify';

import {setLogger as zhSetLogger} from 'zigbee-herdsman';
import {setLogger as zhcSetLogger} from 'zigbee-herdsman-converters';

import EventBus from './eventBus';
// Extensions
import ExtensionAvailability from './extension/availability';
import ExtensionBind from './extension/bind';
import ExtensionBridge from './extension/bridge';
import ExtensionConfigure from './extension/configure';
import ExtensionExternalConverters from './extension/externalConverters';
import ExtensionExternalExtensions from './extension/externalExtensions';
import ExtensionGroups from './extension/groups';
import ExtensionNetworkMap from './extension/networkMap';
import ExtensionOnEvent from './extension/onEvent';
import ExtensionOTAUpdate from './extension/otaUpdate';
import ExtensionPublish from './extension/publish';
import ExtensionReceive from './extension/receive';
import MQTT from './mqtt';
import State from './state';
import logger from './util/logger';
import {initSdNotify} from './util/sd-notify';
import * as settings from './util/settings';
import utils from './util/utils';
import Zigbee from './zigbee';

export class Controller {
    private eventBus: EventBus;
    private zigbee: Zigbee;
    private state: State;
    private mqtt: MQTT;
    private restartCallback: () => Promise<void>;
    private exitCallback: (code: number, restart: boolean) => Promise<void>;
    public readonly extensions: Set<Extension>;
    public readonly extensionArgs: ConstructorParameters<typeof Extension>;
    private sdNotify: Awaited<ReturnType<typeof initSdNotify>>;

    constructor(restartCallback: () => Promise<void>, exitCallback: (code: number, restart: boolean) => Promise<void>) {
        logger.init();
        zhSetLogger(logger);
        zhcSetLogger(logger);
        this.eventBus = new EventBus();
        this.zigbee = new Zigbee(this.eventBus);
        this.mqtt = new MQTT(this.eventBus);
        this.state = new State(this.eventBus, this.zigbee);
        this.restartCallback = restartCallback;
        this.exitCallback = exitCallback;

        // Initialize extensions.
        this.extensionArgs = [
            this.zigbee,
            this.mqtt,
            this.state,
            this.publishEntityState,
            this.eventBus,
            this.enableDisableExtension,
            this.restartCallback,
            this.addExtension,
        ];

        this.extensions = new Set([
            new ExtensionExternalConverters(...this.extensionArgs),
            new ExtensionOnEvent(...this.extensionArgs),
            new ExtensionBridge(...this.extensionArgs),
            new ExtensionPublish(...this.extensionArgs),
            new ExtensionReceive(...this.extensionArgs),
            new ExtensionConfigure(...this.extensionArgs),
            new ExtensionNetworkMap(...this.extensionArgs),
            new ExtensionGroups(...this.extensionArgs),
            new ExtensionBind(...this.extensionArgs),
            new ExtensionOTAUpdate(...this.extensionArgs),
            new ExtensionExternalExtensions(...this.extensionArgs),
            new ExtensionAvailability(...this.extensionArgs),
        ]);
    }

    async start(): Promise<void> {
        if (settings.get().frontend.enabled) {
            const {Frontend} = await import('./extension/frontend.js');

            this.extensions.add(new Frontend(...this.extensionArgs));
        }

        if (settings.get().homeassistant.enabled) {
            const {HomeAssistant} = await import('./extension/homeassistant.js');

            this.extensions.add(new HomeAssistant(...this.extensionArgs));
        }

        this.state.start();

        const info = await utils.getZigbee2MQTTVersion();
        logger.info(`Starting Zigbee2MQTT version ${info.version} (commit #${info.commitHash})`);

        // Start zigbee
        try {
            await this.zigbee.start();
            this.eventBus.onAdapterDisconnected(this, this.onZigbeeAdapterDisconnected);
        } catch (error) {
            logger.error('Failed to start zigbee-herdsman');
            logger.error(
                'Check https://www.zigbee2mqtt.io/guide/installation/20_zigbee2mqtt-fails-to-start_crashes-runtime.html for possible solutions',
            );
            logger.error('Exiting...');
            logger.error((error as Error).stack!);

            /* v8 ignore start */
            if ((error as Error).message.includes('USB adapter discovery error (No valid USB adapter found)')) {
                logger.error('If this happens after updating to Zigbee2MQTT 2.0.0, see https://github.com/Koenkk/zigbee2mqtt/discussions/24364');
            }
            /* v8 ignore stop */

            return await this.exit(1);
        }

        // Log zigbee clients on startup
        let deviceCount = 0;

        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            // `definition` validated by `isSupported`
            const model = device.isSupported
                ? `${device.definition!.model} - ${device.definition!.vendor} ${device.definition!.description}`
                : 'Not supported';
            logger.info(`${device.name} (${device.ieeeAddr}): ${model} (${device.zh.type})`);

            deviceCount++;
        }

        logger.info(`Currently ${deviceCount} devices are joined.`);

        // MQTT
        try {
            await this.mqtt.connect();
        } catch (error) {
            logger.error(`MQTT failed to connect, exiting... (${(error as Error).message})`);
            await this.zigbee.stop();
            return await this.exit(1);
        }

        for (const extension of this.extensions) {
            await this.startExtension(extension);
        }

        // Send all cached states.
        if (settings.get().advanced.cache_state_send_on_startup && settings.get().advanced.cache_state) {
            for (const entity of this.zigbee.devicesAndGroupsIterator()) {
                if (this.state.exists(entity)) {
                    await this.publishEntityState(entity, this.state.get(entity), 'publishCached');
                }
            }
        }

        this.eventBus.onLastSeenChanged(this, (data) => utils.publishLastSeen(data, settings.get(), false, this.publishEntityState));

        logger.info(`Zigbee2MQTT started!`);

        this.sdNotify = await initSdNotify();
    }

    @bind async enableDisableExtension(enable: boolean, name: string): Promise<void> {
        if (enable) {
            switch (name) {
                case 'Frontend': {
                    if (!settings.get().frontend.enabled) {
                        throw new Error('Tried to enable Frontend extension disabled in settings');
                    }

                    // this is not actually used, not tested either
                    /* v8 ignore start */
                    const {Frontend} = await import('./extension/frontend.js');

                    await this.addExtension(new Frontend(...this.extensionArgs));

                    break;
                    /* v8 ignore stop */
                }
                case 'HomeAssistant': {
                    if (!settings.get().homeassistant.enabled) {
                        throw new Error('Tried to enable HomeAssistant extension disabled in settings');
                    }

                    const {HomeAssistant} = await import('./extension/homeassistant.js');

                    await this.addExtension(new HomeAssistant(...this.extensionArgs));

                    break;
                }
                default: {
                    throw new Error(
                        `Extension ${name} does not exist (should be added with 'addExtension') or is built-in that cannot be enabled at runtime`,
                    );
                }
            }
        } else {
            switch (name) {
                case 'Frontend': {
                    if (settings.get().frontend.enabled) {
                        throw new Error('Tried to disable Frontend extension enabled in settings');
                    }

                    break;
                }
                case 'HomeAssistant': {
                    if (settings.get().homeassistant.enabled) {
                        throw new Error('Tried to disable HomeAssistant extension enabled in settings');
                    }

                    break;
                }
                case 'Availability':
                case 'Bind':
                case 'Bridge':
                case 'Configure':
                case 'ExternalConverters':
                case 'ExternalExtensions':
                case 'Groups':
                case 'NetworkMap':
                case 'OnEvent':
                case 'OTAUpdate':
                case 'Publish':
                case 'Receive': {
                    throw new Error(`Built-in extension ${name} cannot be disabled at runtime`);
                }
            }

            const extension = this.getExtension(name);

            if (extension) {
                await this.removeExtension(extension);
            }
        }
    }

    public getExtension(name: string): Extension | undefined {
        for (const extension of this.extensions) {
            if (extension.constructor.name === name) {
                return extension;
            }
        }
    }

    @bind async addExtension(extension: Extension): Promise<void> {
        for (const ext of this.extensions) {
            if (ext.constructor.name === extension.constructor.name) {
                throw new Error(`Extension with name ${ext.constructor.name} already present`);
            }
        }

        this.extensions.add(extension);
        await this.startExtension(extension);
    }

    async removeExtension(extension: Extension): Promise<void> {
        if (this.extensions.delete(extension)) {
            await this.stopExtension(extension);
        }
    }

    private async startExtension(extension: Extension): Promise<void> {
        try {
            await extension.start();
        } catch (error) {
            logger.error(`Failed to start '${extension.constructor.name}' (${(error as Error).stack})`);
        }
    }

    private async stopExtension(extension: Extension): Promise<void> {
        try {
            await extension.stop();
        } catch (error) {
            logger.error(`Failed to stop '${extension.constructor.name}' (${(error as Error).stack})`);
        }
    }

    async stop(restart = false): Promise<void> {
        this.sdNotify?.notifyStopping();

        for (const extension of this.extensions) {
            await this.stopExtension(extension);
        }

        this.eventBus.removeListeners(this);

        // Wrap-up
        this.state.stop();
        await this.mqtt.disconnect();
        let code = 0;

        try {
            await this.zigbee.stop();
            logger.info('Stopped Zigbee2MQTT');
        } catch (error) {
            logger.error(`Failed to stop Zigbee2MQTT (${(error as Error).message})`);
            code = 1;
        }

        this.sdNotify?.stop();
        return await this.exit(code, restart);
    }

    async exit(code: number, restart = false): Promise<void> {
        await logger.end();
        return await this.exitCallback(code, restart);
    }

    @bind async onZigbeeAdapterDisconnected(): Promise<void> {
        logger.error('Adapter disconnected, stopping');
        await this.stop();
    }

    @bind async publishEntityState(entity: Group | Device, payload: KeyValue, stateChangeReason?: StateChangeReason): Promise<void> {
        let message: Zigbee2MQTTAPI['{friendlyName}'] = {...payload};

        // Update state cache with new state.
        const newState = this.state.set(entity, payload, stateChangeReason);

        if (settings.get().advanced.cache_state) {
            // Add cached state to payload
            message = newState;
        }

        const options: IClientPublishOptions = {
            retain: utils.getObjectProperty(entity.options, 'retain', false),
            qos: utils.getObjectProperty(entity.options, 'qos', 0),
        };
        const retention = utils.getObjectProperty<number | false>(entity.options, 'retention', false);

        if (retention !== false) {
            options.properties = {messageExpiryInterval: retention};
        }

        if (entity.isDevice() && settings.get().mqtt.include_device_information) {
            message.device = {
                friendlyName: entity.name,
                model: entity.definition?.model,
                ieeeAddr: entity.ieeeAddr,
                networkAddress: entity.zh.networkAddress,
                type: entity.zh.type,
                manufacturerID: entity.zh.manufacturerID,
                powerSource: entity.zh.powerSource,
                applicationVersion: entity.zh.applicationVersion,
                stackVersion: entity.zh.stackVersion,
                zclVersion: entity.zh.zclVersion,
                hardwareVersion: entity.zh.hardwareVersion,
                dateCode: entity.zh.dateCode,
                softwareBuildID: entity.zh.softwareBuildID,
                // Manufacturer name can contain \u0000, remove this.
                // https://github.com/home-assistant/core/issues/85691
                /* v8 ignore next */
                manufacturerName: entity.zh.manufacturerName?.split('\u0000')[0],
            };
        }

        // Add lastseen
        const lastSeen = settings.get().advanced.last_seen;
        if (entity.isDevice() && lastSeen !== 'disable' && entity.zh.lastSeen) {
            message.last_seen = utils.formatDate(entity.zh.lastSeen, lastSeen);
        }

        // Add device linkquality.
        if (entity.isDevice() && entity.zh.linkquality !== undefined) {
            message.linkquality = entity.zh.linkquality;
        }

        for (const extension of this.extensions) {
            extension.adjustMessageBeforePublish?.(entity, message);
        }

        // Filter mqtt message attributes
        utils.filterProperties(entity.options.filtered_attributes, message);

        if (!utils.objectIsEmpty(message)) {
            const output = settings.get().advanced.output;
            if (output === 'attribute_and_json' || output === 'json') {
                await this.mqtt.publish(entity.name, stringify(message), options);
            }

            if (output === 'attribute_and_json' || output === 'attribute') {
                await this.iteratePayloadAttributeOutput(`${entity.name}/`, message, options);
            }
        }

        this.eventBus.emitPublishEntityState({entity, message, stateChangeReason, payload});
    }

    async iteratePayloadAttributeOutput(topicRoot: string, payload: KeyValue, options: IClientPublishOptions): Promise<void> {
        for (const [key, value] of Object.entries(payload)) {
            let subPayload = value;
            let message = null;

            // Special cases
            if (key === 'color' && utils.objectHasProperties(subPayload, ['r', 'g', 'b'])) {
                subPayload = [subPayload.r, subPayload.g, subPayload.b];
            }

            // Check Array first, since it is also an Object
            if (subPayload === null || subPayload === undefined) {
                message = '';
            } else if (Array.isArray(subPayload)) {
                message = subPayload.map((x) => `${x}`).join(',');
            } else if (typeof subPayload === 'object') {
                await this.iteratePayloadAttributeOutput(`${topicRoot}${key}-`, subPayload, options);
            } else {
                message = typeof subPayload === 'string' ? subPayload : stringify(subPayload);
            }

            if (message !== null) {
                await this.mqtt.publish(`${topicRoot}${key}`, message, options);
            }
        }
    }
}
