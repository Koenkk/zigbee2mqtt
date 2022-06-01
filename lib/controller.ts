import MQTT from './mqtt';
import Zigbee from './zigbee';
import EventBus from './eventBus';
import State from './state';
import logger from './util/logger';
import * as settings from './util/settings';
import utils from './util/utils';
import stringify from 'json-stable-stringify-without-jsonify';
import assert from 'assert';
import bind from 'bind-decorator';

// Extensions
import ExtensionFrontend from './extension/frontend';
import ExtensionPublish from './extension/publish';
import ExtensionReceive from './extension/receive';
import ExtensionNetworkMap from './extension/networkMap';
import ExtensionSoftReset from './extension/legacy/softReset';
import ExtensionHomeAssistant from './extension/homeassistant';
import ExtensionConfigure from './extension/configure';
import ExtensionDeviceGroupMembership from './extension/legacy/deviceGroupMembership';
import ExtensionBridgeLegacy from './extension/legacy/bridgeLegacy';
import ExtensionBridge from './extension/bridge';
import ExtensionGroups from './extension/groups';
import ExtensionAvailability from './extension/availability';
import ExtensionBind from './extension/bind';
import ExtensionReport from './extension/legacy/report';
import ExtensionOnEvent from './extension/onEvent';
import ExtensionOTAUpdate from './extension/otaUpdate';
import ExtensionExternalConverters from './extension/externalConverters';
import ExtensionExternalExtension from './extension/externalExtension';

const AllExtensions = [
    ExtensionPublish, ExtensionReceive, ExtensionNetworkMap, ExtensionSoftReset, ExtensionHomeAssistant,
    ExtensionConfigure, ExtensionDeviceGroupMembership, ExtensionBridgeLegacy, ExtensionBridge, ExtensionGroups,
    ExtensionBind, ExtensionReport, ExtensionOnEvent, ExtensionOTAUpdate,
    ExtensionExternalConverters, ExtensionFrontend, ExtensionExternalExtension, ExtensionAvailability,
];

type ExtensionArgs = [Zigbee, MQTT, State, PublishEntityState, EventBus,
    (enable: boolean, name: string) => Promise<void>, () => void, (extension: Extension) => Promise<void>];

class Controller {
    private eventBus: EventBus;
    private zigbee: Zigbee;
    private state: State;
    private mqtt: MQTT;
    private restartCallback: () => void;
    private exitCallback: (code: number, restart: boolean) => void;
    private extensions: Extension[];
    private extensionArgs: ExtensionArgs;

    constructor(restartCallback: () => void, exitCallback: (code: number) => void) {
        logger.init();
        this.eventBus = new EventBus( /* istanbul ignore next */ (error) => {
            logger.error(`Error: ${error.message}`);
            logger.debug(error.stack);
        });
        this.zigbee = new Zigbee(this.eventBus);
        this.mqtt = new MQTT(this.eventBus);
        this.state = new State(this.eventBus);
        this.restartCallback = restartCallback;
        this.exitCallback = exitCallback;

        // Initialize extensions.
        this.extensionArgs = [this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus,
            this.enableDisableExtension, this.restartCallback, this.addExtension];

        this.extensions = [
            new ExtensionBridge(...this.extensionArgs),
            new ExtensionPublish(...this.extensionArgs),
            new ExtensionReceive(...this.extensionArgs),
            new ExtensionDeviceGroupMembership(...this.extensionArgs),
            new ExtensionConfigure(...this.extensionArgs),
            new ExtensionNetworkMap(...this.extensionArgs),
            new ExtensionGroups(...this.extensionArgs),
            new ExtensionBind(...this.extensionArgs),
            new ExtensionOnEvent(...this.extensionArgs),
            new ExtensionOTAUpdate(...this.extensionArgs),
            new ExtensionReport(...this.extensionArgs),
            new ExtensionExternalExtension(...this.extensionArgs),
            new ExtensionAvailability(...this.extensionArgs),
            settings.get().frontend && new ExtensionFrontend(...this.extensionArgs),
            settings.get().advanced.legacy_api && new ExtensionBridgeLegacy(...this.extensionArgs),
            settings.get().external_converters.length && new ExtensionExternalConverters(...this.extensionArgs),
            settings.get().homeassistant && new ExtensionHomeAssistant(...this.extensionArgs),
            /* istanbul ignore next */
            settings.get().advanced.soft_reset_timeout !== 0 && new ExtensionSoftReset(...this.extensionArgs),
        ].filter((n) => n);
    }

    async start(): Promise<void> {
        this.state.start();
        logger.logOutput();

        const info = await utils.getZigbee2MQTTVersion();
        logger.info(`Starting Zigbee2MQTT version ${info.version} (commit #${info.commitHash})`);

        // Start zigbee
        let startResult;
        try {
            startResult = await this.zigbee.start();
            this.eventBus.onAdapterDisconnected(this, this.onZigbeeAdapterDisconnected);
        } catch (error) {
            logger.error('Failed to start zigbee');
            logger.error('Check https://www.zigbee2mqtt.io/guide/installation/20_zigbee2mqtt-fails-to-start.html for possible solutions'); /* eslint-disable-line max-len */
            logger.error('Exiting...');
            logger.error(error.stack);
            await this.exit(1);
        }

        // Disable some legacy options on new network creation
        if (startResult === 'reset') {
            settings.set(['advanced', 'homeassistant_legacy_entity_attributes'], false);
            settings.set(['advanced', 'legacy_api'], false);
            settings.set(['advanced', 'legacy_availability_payload'], false);
            settings.set(['device_options', 'legacy'], false);
            this.enableDisableExtension(false, 'BridgeLegacy');
        }

        // Log zigbee clients on startup
        const devices = this.zigbee.devices(false);
        logger.info(`Currently ${devices.length} devices are joined:`);
        for (const device of devices) {
            const model = device.definition ?
                `${device.definition.model} - ${device.definition.vendor} ${device.definition.description}` :
                'Not supported';
            logger.info(`${device.name} (${device.ieeeAddr}): ${model} (${device.zh.type})`);
        }

        // Enable zigbee join
        try {
            if (settings.get().permit_join) {
                logger.warn('`permit_join` set to  `true` in configuration.yaml.');
                logger.warn('Allowing new devices to join.');
                logger.warn('Set `permit_join` to `false` once you joined all devices.');
            }

            await this.zigbee.permitJoin(settings.get().permit_join);
        } catch (error) {
            logger.error(`Failed to set permit join to ${settings.get().permit_join}`);
        }

        // MQTT
        try {
            await this.mqtt.connect();
        } catch (error) {
            logger.error(`MQTT failed to connect: ${error.message}`);
            logger.error('Exiting...');
            await this.zigbee.stop();
            await this.exit(1);
        }

        // Call extensions
        await this.callExtensions('start', [...this.extensions]);

        // Send all cached states.
        if (settings.get().advanced.cache_state_send_on_startup && settings.get().advanced.cache_state) {
            for (const device of devices) {
                if (this.state.exists(device)) {
                    this.publishEntityState(device, this.state.get(device));
                }
            }
        }

        this.eventBus.onLastSeenChanged(this,
            (data) => utils.publishLastSeen(data, settings.get(), false, this.publishEntityState));
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
        // Call extensions
        await this.callExtensions('stop', this.extensions);
        this.eventBus.removeListeners(this);

        // Wrap-up
        this.state.stop();
        await this.mqtt.disconnect();

        try {
            await this.zigbee.stop();
            logger.info('Stopped Zigbee2MQTT');
            await this.exit(0, restart);
        } catch (error) {
            logger.error('Failed to stop Zigbee2MQTT');
            await this.exit(1, restart);
        }
    }

    async exit(code: number, restart = false): Promise<void> {
        await logger.end();
        this.exitCallback(code, restart);
    }

    @bind async onZigbeeAdapterDisconnected(): Promise<void> {
        logger.error('Adapter disconnected, stopping');
        await this.stop();
    }

    @bind async publishEntityState(entity: Group | Device, payload: KeyValue,
        stateChangeReason?: StateChangeReason): Promise<void> {
        let message = {...payload};

        // Update state cache with new state.
        const newState = this.state.set(entity, payload, stateChangeReason);

        if (settings.get().advanced.cache_state) {
            // Add cached state to payload
            message = newState;
        }

        const options: MQTTOptions = {
            retain: utils.getObjectProperty(entity.options, 'retain', false) as boolean,
            qos: utils.getObjectProperty(entity.options, 'qos', 0) as 0 | 1 | 2,
        };

        const retention = utils.getObjectProperty(entity.options, 'retention', false);
        if (retention !== false) {
            options.properties = {messageExpiryInterval: retention as number};
        }

        if (entity.isDevice() && settings.get().mqtt.include_device_information) {
            message.device = {
                friendlyName: entity.name, model: entity.definition ? entity.definition.model : 'unknown',
                ieeeAddr: entity.ieeeAddr, networkAddress: entity.zh.networkAddress, type: entity.zh.type,
                manufacturerID: entity.zh.manufacturerID, manufacturerName: entity.zh.manufacturerName,
                powerSource: entity.zh.powerSource, applicationVersion: entity.zh.applicationVersion,
                stackVersion: entity.zh.stackVersion, zclVersion: entity.zh.zclVersion,
                hardwareVersion: entity.zh.hardwareVersion, dateCode: entity.zh.dateCode,
                softwareBuildID: entity.zh.softwareBuildID,
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

        // filter mqtt message attributes
        if (entity.options.filtered_attributes) {
            entity.options.filtered_attributes.forEach((a) => delete message[a]);
        }

        if (Object.entries(message).length) {
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

    async iteratePayloadAttributeOutput(topicRoot: string, payload: KeyValue, options: MQTTOptions): Promise<void> {
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
                /* istanbul ignore next */
                logger.error(`Failed to call '${extension.constructor.name}' '${method}' (${error.stack})`);
            }
        }
    }
}

module.exports = Controller;
