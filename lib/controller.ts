import type {IClientPublishOptions} from 'mqtt';
import type * as SdNotify from 'sd-notify';

import type {Zigbee2MQTTAPI} from './types/api';

import assert from 'node:assert';

import bind from 'bind-decorator';
import stringify from 'json-stable-stringify-without-jsonify';

import {setLogger as zhSetLogger} from 'zigbee-herdsman';
import {setLogger as zhcSetLogger} from 'zigbee-herdsman-converters';

import EventBus from './eventBus';
import ExtensionAvailability from './extension/availability';
import ExtensionBind from './extension/bind';
import ExtensionBridge from './extension/bridge';
import ExtensionConfigure from './extension/configure';
import ExtensionExternalConverters from './extension/externalConverters';
import ExtensionExternalExtensions from './extension/externalExtensions';
// Extensions
import ExtensionFrontend from './extension/frontend';
import ExtensionGroups from './extension/groups';
import ExtensionHomeAssistant from './extension/homeassistant';
import ExtensionNetworkMap from './extension/networkMap';
import ExtensionOnEvent from './extension/onEvent';
import ExtensionOTAUpdate from './extension/otaUpdate';
import ExtensionPublish from './extension/publish';
import ExtensionReceive from './extension/receive';
import MQTT from './mqtt';
import State from './state';
import logger from './util/logger';
import * as settings from './util/settings';
import utils from './util/utils';
import Zigbee from './zigbee';

type SdNotifyType = typeof SdNotify;

const AllExtensions = [
    ExtensionPublish,
    ExtensionReceive,
    ExtensionNetworkMap,
    ExtensionHomeAssistant,
    ExtensionConfigure,
    ExtensionBridge,
    ExtensionGroups,
    ExtensionBind,
    ExtensionOnEvent,
    ExtensionOTAUpdate,
    ExtensionExternalConverters,
    ExtensionFrontend,
    ExtensionExternalExtensions,
    ExtensionAvailability,
];

type ExtensionArgs = [
    Zigbee,
    MQTT,
    State,
    PublishEntityState,
    EventBus,
    enableDisableExtension: (enable: boolean, name: string) => Promise<void>,
    restartCallback: () => Promise<void>,
    addExtension: (extension: Extension) => Promise<void>,
];

export class Controller {
    private eventBus: EventBus;
    private zigbee: Zigbee;
    private state: State;
    private mqtt: MQTT;
    private restartCallback: () => Promise<void>;
    private exitCallback: (code: number, restart: boolean) => Promise<void>;
    private extensions: Extension[];
    private extensionArgs: ExtensionArgs;
    private sdNotify: SdNotifyType | undefined;

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

        this.extensions = [
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
        ];

        if (settings.get().frontend.enabled) {
            this.extensions.push(new ExtensionFrontend(...this.extensionArgs));
        }

        if (settings.get().homeassistant.enabled) {
            this.extensions.push(new ExtensionHomeAssistant(...this.extensionArgs));
        }
    }

    async start(): Promise<void> {
        this.state.start();

        const info = await utils.getZigbee2MQTTVersion();
        logger.info(`Starting Zigbee2MQTT version ${info.version} (commit #${info.commitHash})`);

        try {
            this.sdNotify = process.env.NOTIFY_SOCKET ? await import('sd-notify') : undefined;
            logger.debug('sd-notify loaded');
            /* v8 ignore start */
        } catch {
            logger.debug('sd-notify is not installed');
        }
        /* v8 ignore stop */

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

        // Call extensions
        await this.callExtensions('start', [...this.extensions]);

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

        const watchdogInterval = this.sdNotify?.watchdogInterval() || 0;
        if (watchdogInterval > 0) {
            this.sdNotify?.startWatchdogMode(Math.floor(watchdogInterval / 2));
        }
        this.sdNotify?.ready();
    }

    @bind async enableDisableExtension(enable: boolean, name: string): Promise<void> {
        if (!enable) {
            const extension = this.extensions.find((e) => e.constructor.name === name);
            if (extension) {
                await this.callExtensions('stop', [extension]);
                this.extensions.splice(this.extensions.indexOf(extension), 1);
            }
        } else {
            const Extension = AllExtensions.find((e) => e.name === name);
            assert(Extension, `Extension '${name}' does not exist`);
            const extension = new Extension(...this.extensionArgs);
            this.extensions.push(extension);
            await this.callExtensions('start', [extension]);
        }
    }

    @bind async addExtension(extension: Extension): Promise<void> {
        this.extensions.push(extension);
        await this.callExtensions('start', [extension]);
    }

    async stop(restart = false): Promise<void> {
        this.sdNotify?.stopping(process.pid);

        // Call extensions
        await this.callExtensions('stop', this.extensions);
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

        this.sdNotify?.stopWatchdogMode();
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

    private async callExtensions(method: 'start' | 'stop', extensions: Extension[]): Promise<void> {
        for (const extension of extensions) {
            try {
                await extension[method]?.();
            } catch (error) {
                logger.error(`Failed to call '${extension.constructor.name}' '${method}' (${(error as Error).stack})`);
            }
        }
    }
}
