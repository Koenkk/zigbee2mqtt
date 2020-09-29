const MQTT = require('./mqtt');
const Zigbee = require('./zigbee');
const EventBus = require('./eventBus');
const State = require('./state');
const logger = require('./util/logger');
const settings = require('./util/settings');
const objectAssignDeep = require('object-assign-deep');
const utils = require('./util/utils');
const stringify = require('json-stable-stringify');
const fs = require('fs');
const data = require('./util/data');
const path = require('path');
const assert = require('assert');

// Extensions
const ExtensionPublish = require('./extension/publish');
const ExtensionReceive = require('./extension/receive');
const ExtensionNetworkMap = require('./extension/networkMap');
const ExtensionSoftReset = require('./extension/legacy/softReset');
const ExtensionHomeAssistant = require('./extension/homeassistant');
const ExtensionConfigure = require('./extension/configure');
const ExtensionDeviceGroupMembership = require('./extension/legacy/deviceGroupMembership');
const ExtensionBridgeLegacy = require('./extension/legacy/bridgeLegacy');
const ExtensionBridge = require('./extension/bridge');
const ExtensionGroups = require('./extension/groups');
const ExtensionAvailability = require('./extension/availability');
const ExtensionBind = require('./extension/bind');
const ExtensionReport = require('./extension/report');
const ExtensionOnEvent = require('./extension/onEvent');
const ExtensionOTAUpdate = require('./extension/otaUpdate');
const ExtensionExternalConverters = require('./extension/externalConverters');

const AllExtensions = [
    ExtensionPublish, ExtensionReceive, ExtensionNetworkMap, ExtensionSoftReset, ExtensionHomeAssistant,
    ExtensionConfigure, ExtensionDeviceGroupMembership, ExtensionBridgeLegacy, ExtensionBridge, ExtensionGroups,
    ExtensionAvailability, ExtensionBind, ExtensionReport, ExtensionOnEvent, ExtensionOTAUpdate,
    ExtensionExternalConverters,
];

class Controller {
    constructor() {
        this.zigbee = new Zigbee();
        this.mqtt = new MQTT();
        this.eventBus = new EventBus();
        this.state = new State(this.eventBus);

        this.publishEntityState = this.publishEntityState.bind(this);
        this.enableDisableExtension = this.enableDisableExtension.bind(this);
        this.onZigbeeAdapterDisconnected = this.onZigbeeAdapterDisconnected.bind(this);

        // Initialize extensions.
        const args = [this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus];
        this.extensions = [
            new ExtensionPublish(...args),
            new ExtensionReceive(...args),
            new ExtensionDeviceGroupMembership(...args),
            new ExtensionConfigure(...args),
            new ExtensionNetworkMap(...args),
            new ExtensionGroups(...args),
            new ExtensionBind(...args),
            new ExtensionOnEvent(...args),
            new ExtensionOTAUpdate(...args),
            new ExtensionReport(...args),
        ];

        if (settings.get().experimental.new_api) {
            this.extensions.push(new ExtensionBridge(...args, this.enableDisableExtension));
        }

        if (settings.get().advanced.legacy_api) {
            this.extensions.push(new ExtensionBridgeLegacy(...args));
        }

        if (settings.get().homeassistant) {
            this.extensions.push(new ExtensionHomeAssistant(...args));
        }

        /* istanbul ignore next */
        if (settings.get().advanced.soft_reset_timeout !== 0) {
            this.extensions.push(new ExtensionSoftReset(...args));
        }

        if (settings.get().advanced.availability_timeout) {
            this.extensions.push(new ExtensionAvailability(...args));
        }
        if (settings.get().external_converters.length) {
            this.extensions.push(new ExtensionExternalConverters(...args));
        }

        const extensionPath = data.joinPath('extension');
        if (fs.existsSync(extensionPath)) {
            const extensions = fs.readdirSync(extensionPath).filter((f) => f.endsWith('.js'));
            for (const extension of extensions) {
                const Extension = require(path.join(extensionPath, extension.split('.')[0]));
                this.extensions.push(new Extension(...args, settings, logger));
            }
        }
    }

    async start() {
        this.state.start();

        const info = await utils.getZigbee2mqttVersion();
        logger.info(`Starting Zigbee2MQTT version ${info.version} (commit #${info.commitHash})`);

        // Start zigbee
        try {
            await this.zigbee.start();
            this.callExtensionMethod('onZigbeeStarted', []);
            this.zigbee.on('event', this.onZigbeeEvent.bind(this));
            this.zigbee.on('adapterDisconnected', this.onZigbeeAdapterDisconnected);
        } catch (error) {
            logger.error('Failed to start zigbee');
            logger.error('Exiting...');
            logger.error(error.stack);
            process.exit(1);
        }

        // Log zigbee clients on startup
        const devices = this.zigbee.getClients();
        logger.info(`Currently ${devices.length} devices are joined:`);
        for (const device of devices) {
            const entity = this.zigbee.resolveEntity(device);
            const model = entity.definition ?
                `${entity.definition.model} - ${entity.definition.vendor} ${entity.definition.description}` :
                'Not supported';
            logger.info(`${entity.name} (${entity.device.ieeeAddr}): ${model} (${entity.device.type})`);
        }

        // Enable zigbee join.
        if (settings.get().permit_join) {
            logger.warn('`permit_join` set to  `true` in configuration.yaml.');
            logger.warn('Allowing new devices to join.');
            logger.warn('Set `permit_join` to `false` once you joined all devices.');
        }

        try {
            await this.zigbee.permitJoin(settings.get().permit_join);
        } catch (error) {
            logger.error(`Failed to set permit join to ${settings.get().permit_join}`);
        }

        // MQTT
        this.mqtt.on('message', this.onMQTTMessage.bind(this));
        await this.mqtt.connect();

        // Send all cached states.
        if (settings.get().advanced.cache_state_send_on_startup && settings.get().advanced.cache_state) {
            for (const device of this.zigbee.getClients()) {
                if (this.state.exists(device.ieeeAddr)) {
                    this.publishEntityState(device.ieeeAddr, this.state.get(device.ieeeAddr));
                }
            }
        }

        // Add devices which are in database but not in configuration to configuration
        for (const device of this.zigbee.getClients()) {
            if (!settings.getDevice(device.ieeeAddr)) {
                settings.addDevice(device.ieeeAddr);
            }
        }

        // Call extensions
        await this.callExtensionMethod('onMQTTConnected', []);
    }

    async enableDisableExtension(enable, name) {
        if (!enable) {
            const extension = this.extensions.find((e) => e.constructor.name === name);
            if (extension) {
                await this.callExtensionMethod('stop', [], [extension]);
                this.extensions.splice(this.extensions.indexOf(extension), 1);
            }
        } else {
            const Extension = AllExtensions.find((e) => e.name === name);
            assert(Extension, `Extension '${name}' does not exist`);
            const extension = new Extension(this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus);
            this.extensions.push(extension);
            this.callExtensionMethod('onZigbeeStarted', [], [extension]);
            this.callExtensionMethod('onMQTTConnected', [], [extension]);
        }
    }

    async stop() {
        // Call extensions
        await this.callExtensionMethod('stop', []);

        // Wrap-up
        this.state.stop();
        await this.mqtt.disconnect();

        try {
            await this.zigbee.stop();
            process.exit(0);
        } catch (error) {
            logger.error('Failed to stop zigbee');
            process.exit(1);
        }
    }

    async onZigbeeAdapterDisconnected() {
        logger.error('Adapter disconnected, stopping');
        await this.stop();
    }

    async onZigbeeEvent(type, data) {
        const resolvedEntity = this.zigbee.resolveEntity(data.device || data.ieeeAddr);
        if (data.device && !settings.getDevice(data.device.ieeeAddr) && data.device.type !== 'Coordinator') {
            // Only deviceLeave doesn't have a device (not interesting to add to settings)
            resolvedEntity.settings = {...settings.get().device_options, ...settings.addDevice(data.device.ieeeAddr)};
        }

        const name = resolvedEntity && resolvedEntity.settings ? resolvedEntity.settings.friendlyName : null;

        if (type === 'message') {
            logger.debug(
                `Received Zigbee message from '${name}', type '${data.type}', cluster '${data.cluster}'` +
                `, data '${stringify(data.data)}' from endpoint ${data.endpoint.ID}` +
                (data.hasOwnProperty('groupID') ? ` with groupID ${data.groupID}` : ``),
            );
        } else if (type === 'deviceJoined') {
            logger.info(`Device '${name}' joined`);
        } else if (type === 'deviceInterview') {
            if (data.status === 'successful') {
                logger.info(`Successfully interviewed '${name}', device has successfully been paired`);

                if (resolvedEntity.definition) {
                    const {vendor, description, model} = resolvedEntity.definition;
                    logger.info(`Device '${name}' is supported, identified as: ${vendor} ${description} (${model})`);
                } else {
                    logger.warn(
                        `Device '${name}' with Zigbee model '${data.device.modelID}' is NOT supported, ` +
                        `please follow https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html`,
                    );
                }
            } else if (data.status === 'failed') {
                logger.error(`Failed to interview '${name}', device has not successfully been paired`);
            } else {
                /* istanbul ignore else */
                if (data.status === 'started') {
                    logger.info(`Starting interview of '${name}'`);
                }
            }
        } else if (type === 'deviceAnnounce') {
            logger.debug(`Device '${name}' announced itself`);
        } else {
            /* istanbul ignore else */
            if (type === 'deviceLeave') {
                logger.warn(`Device '${name || data.ieeeAddr}' left the network`);
            }
        }

        // Call extensions
        this.callExtensionMethod('onZigbeeEvent', [type, data, resolvedEntity]);
    }

    onMQTTMessage(payload) {
        const {topic, message} = payload;
        logger.debug(`Received MQTT message on '${topic}' with data '${message}'`);

        // Call extensions
        this.callExtensionMethod('onMQTTMessage', [topic, message]);
    }

    async publishEntityState(IDorName, payload, stateChangeReason=null) {
        const resolvedEntity = this.zigbee.resolveEntity(IDorName);
        if (!resolvedEntity || !resolvedEntity.settings) {
            logger.error(`'${IDorName}' does not exist, skipping publish`);
            return;
        }

        let messagePayload = {...payload};
        const currentState = this.state.exists(resolvedEntity.settings.ID) ?
            this.state.get(resolvedEntity.settings.ID) : {};
        const newState = objectAssignDeep.noMutate(currentState, payload);

        // Update state cache with new state.
        this.state.set(resolvedEntity.settings.ID, newState, stateChangeReason);

        if (settings.get().advanced.cache_state) {
            // Add cached state to payload
            messagePayload = newState;
        }

        const options = {
            retain: utils.getObjectProperty(resolvedEntity.settings, 'retain', false),
            qos: utils.getObjectProperty(resolvedEntity.settings, 'qos', 0),
        };

        const retention = utils.getObjectProperty(resolvedEntity.settings, 'retention', false);
        if (retention !== false) {
            options.properties = {messageExpiryInterval: retention};
        }

        const isDevice = resolvedEntity.type === 'device';
        if (isDevice && settings.get().mqtt.include_device_information) {
            const attributes = [
                'ieeeAddr', 'networkAddress', 'type', 'manufacturerID', 'manufacturerName', 'powerSource',
                'applicationVersion', 'stackVersion', 'zclVersion', 'hardwareVersion', 'dateCode', 'softwareBuildID',
            ];

            messagePayload.device = {
                friendlyName: resolvedEntity.name,
                model: resolvedEntity.definition ? resolvedEntity.definition.model : 'unknown',
            };

            attributes.forEach((a) => messagePayload.device[a] = resolvedEntity.device[a]);
        }

        const lastSeen = settings.get().advanced.last_seen;
        if (isDevice && lastSeen !== 'disable' && resolvedEntity.device.lastSeen) {
            messagePayload.last_seen = utils.formatDate(resolvedEntity.device.lastSeen, lastSeen);
        }

        // filter mqtt message attributes
        if (resolvedEntity.settings.filtered_attributes) {
            resolvedEntity.settings.filtered_attributes.forEach((a) => delete messagePayload[a]);
        }

        if (Object.entries(messagePayload).length) {
            const output = settings.get().experimental.output;
            if (output === 'attribute_and_json' || output === 'json') {
                await this.mqtt.publish(resolvedEntity.name, stringify(messagePayload), options);
            }

            if (output === 'attribute_and_json' || output === 'attribute') {
                await this.iteratePayloadAttributeOutput(`${resolvedEntity.name}/`, messagePayload, options);
            }
        }

        this.eventBus.emit('publishEntityState', {payload: messagePayload, entity: resolvedEntity, stateChangeReason});
    }

    async iteratePayloadAttributeOutput(topicRoot, payload, options) {
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
                this.iteratePayloadAttributeOutput(`${topicRoot}${key}-`, subPayload, options);
            } else {
                message = typeof subPayload === 'string' ? subPayload : stringify(subPayload);
            }

            if (message !== null) {
                await this.mqtt.publish(`${topicRoot}${key}`, message, options);
            }
        }
    }

    async callExtensionMethod(method, parameters, extensions=null) {
        for (const extension of extensions || this.extensions) {
            if (extension[method]) {
                try {
                    await extension[method](...parameters);
                } catch (error) {
                    /* istanbul ignore next */
                    logger.error(`Failed to call '${extension.constructor.name}' '${method}' (${error.stack})`);
                    /* istanbul ignore next */
                    if (process.env.JEST_WORKER_ID !== undefined) {
                        throw error;
                    }
                }
            }
        }
    }
}

module.exports = Controller;
