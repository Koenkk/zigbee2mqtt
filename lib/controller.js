const MQTT = require('./mqtt');
const Zigbee = require('./zigbee');
const EventBus = require('./eventBus');
const State = require('./state');
const logger = require('./util/logger');
const settings = require('./util/settings');
const objectAssignDeep = require('object-assign-deep');
const utils = require('./util/utils');

// Extensions
const ExtensionEntityPublish = require('./extension/entityPublish');
const ExtensionDeviceReceive = require('./extension/deviceReceive');
const ExtensionNetworkMap = require('./extension/networkMap');
const ExtensionSoftReset = require('./extension/softReset');
const ExtensionHomeAssistant = require('./extension/homeassistant');
const ExtensionDeviceConfigure = require('./extension/deviceConfigure');
const ExtensionDeviceGroupMembership = require('./extension/deviceGroupMembership');
const ExtensionBridgeConfig = require('./extension/bridgeConfig');
const ExtensionGroups = require('./extension/groups');
const ExtensionDeviceAvailability = require('./extension/deviceAvailability');
const ExtensionDeviceBind = require('./extension/deviceBind');
const ExtensionDeviceReport = require('./extension/deviceReport');
const ExtensionDeviceEvent = require('./extension/deviceEvent');

class Controller {
    constructor() {
        this.zigbee = new Zigbee();
        this.mqtt = new MQTT();
        this.eventBus = new EventBus();
        this.state = new State();

        this.publishEntityState = this.publishEntityState.bind(this);
        this.onZigbeeAdapterDisconnected = this.onZigbeeAdapterDisconnected.bind(this);

        // Initialize extensions.
        this.extensions = [
            new ExtensionEntityPublish(this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus),
            new ExtensionDeviceReceive(this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus),
            new ExtensionDeviceGroupMembership(
                this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus,
            ),
            new ExtensionDeviceConfigure(this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus),
            new ExtensionNetworkMap(this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus),
            new ExtensionBridgeConfig(this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus),
            new ExtensionGroups(this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus),
            new ExtensionDeviceBind(this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus),
            new ExtensionDeviceEvent(this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus),
        ];

        if (settings.get().advanced.report) {
            this.extensions.push(new ExtensionDeviceReport(
                this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus,
            ));
        }

        if (settings.get().homeassistant) {
            this.extensions.push(new ExtensionHomeAssistant(
                this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus,
            ));
        }

        /* istanbul ignore next */
        if (settings.get().advanced.soft_reset_timeout !== 0) {
            this.extensions.push(new ExtensionSoftReset(
                this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus,
            ));
        }

        if (settings.get().advanced.availability_timeout) {
            this.extensions.push(new ExtensionDeviceAvailability(
                this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus,
            ));
        }
    }

    async start() {
        const settingsErrors = settings.validate();
        if (settingsErrors) {
            logger.error(`Refusing to start, configuration.yaml is not valid, found the following errors:`);
            for (const error of settingsErrors) {
                logger.error(`\t - ${error}`);
            }
            logger.error(
                `If you don't know how to solve this, read https://www.zigbee2mqtt.io/configuration/configuration.html`,
            );
            process.exit(1);
        }

        this.state.start();

        const info = await utils.getZigbee2mqttVersion();
        logger.info(`Starting zigbee2mqtt version ${info.version} (commit #${info.commitHash})`);

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
            logger.info(
                (entity.settings ? entity.settings.friendlyName : entity.device.ieeeAddr) +
                ` (${entity.device.ieeeAddr}): ` +
                (entity.mapped ?
                    `${entity.mapped.model} - ${entity.mapped.vendor} ${entity.mapped.description} ` :
                    'Not supported ') +
                `(${entity.device.type})`,
            );
        }

        // Enable zigbee join.
        if (settings.get().permit_join) {
            logger.warn('`permit_join` set to  `true` in configuration.yaml.');
            logger.warn('Allowing new devices to join.');
            logger.warn('Set `permit_join` to `false` once you joined all devices.');
        }

        await this.zigbee.permitJoin(settings.get().permit_join);

        // MQTT
        this.mqtt.on('message', this.onMQTTMessage.bind(this));
        await this.mqtt.connect();

        // Send all cached states.
        if (settings.get().advanced.cache_state) {
            for (const device of this.zigbee.getClients()) {
                if (this.state.exists(device.ieeeAddr)) {
                    this.publishEntityState(device.ieeeAddr, this.state.get(device.ieeeAddr));
                }
            }
        }

        // Call extensions
        await this.callExtensionMethod('onMQTTConnected', []);
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
        const entity = this.zigbee.resolveEntity(data.device || data.ieeeAddr);
        if (data.device && !entity.settings) {
            // Only deviceLeave doesn't have a device (not interesting to add to settings)
            entity.settings = settings.addDevice(data.device.ieeeAddr);
        }

        const name = entity && entity.settings ? entity.settings.friendlyName : null;

        if (type === 'message') {
            logger.debug(
                `Received Zigbee message from '${name}', type '${data.type}', cluster '${data.cluster}'` +
                `, data '${JSON.stringify(data.data)}' from endpoint ${data.endpoint.ID}` +
                (data.hasOwnProperty('groupID') ? ` with groupID ${data.groupID}` : ``),
            );
        } else if (type === 'deviceJoined') {
            logger.info(`Device '${name}' joined`);
            this.mqtt.log('device_connected', {friendly_name: name});
        } else if (type === 'deviceInterview') {
            if (data.status === 'successful') {
                logger.info(`Successfully interviewed '${name}', device has successfully been paired`);

                if (entity.mapped) {
                    const {vendor, description, model} = entity.mapped;
                    logger.info(
                        `Device '${name}' is supported, identified as: ${vendor} ${description} (${model})`,
                    );

                    const log = {friendly_name: name, model, vendor, description, supported: true};
                    this.mqtt.log('pairing', 'interview_successful', log);
                } else {
                    logger.warn(
                        `Device '${name}' with Zigbee model '${data.device.modelID}' is NOT supported, ` +
                        `please follow https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html`,
                    );
                    this.mqtt.log('pairing', 'interview_successful', {friendly_name: name, supported: false});
                }
            } else if (data.status === 'failed') {
                logger.error(`Failed to interview '${name}', device has not successfully been paired`);
                this.mqtt.log('pairing', 'interview_failed', {friendly_name: name});
            } else {
                /* istanbul ignore else */
                if (data.status === 'started') {
                    logger.info(`Starting interview of '${name}'`);
                    this.mqtt.log('pairing', 'interview_started', {friendly_name: name});
                }
            }
        } else if (type === 'deviceAnnounce') {
            logger.debug(`Device '${name}' announced itself`);
        } else {
            /* istanbul ignore else */
            if (type === 'deviceLeave') {
                logger.warn(`Device '${name || data.ieeeAddr}' left the network`);
                this.mqtt.log('device_removed', 'left_network', {friendly_name: name || data.ieeeAddr});
            }
        }

        // Call extensions
        this.callExtensionMethod(
            'onZigbeeEvent',
            [type, data, entity ? entity.mapped : null, entity ? entity.settings : null],
        );
    }

    onMQTTMessage(payload) {
        const {topic, message} = payload;
        logger.debug(`Received MQTT message on '${topic}' with data '${message}'`);

        // Call extensions
        this.callExtensionMethod('onMQTTMessage', [topic, message]);
    }

    async publishEntityState(IDorName, payload, stateChangeReason=null) {
        const entity = this.zigbee.resolveEntity(IDorName);
        if (!entity || !entity.settings) {
            logger.error(`'${IDorName}' does not exist, skipping publish`);
            return;
        }

        if (entity.type === 'device' && settings.get().advanced.last_seen !== 'disable' && entity.device.lastSeen) {
            payload.last_seen = utils.formatDate(entity.device.lastSeen, settings.get().advanced.last_seen);
        }

        let messagePayload = {...payload};
        const currentState = this.state.exists(entity.settings.ID) ? this.state.get(entity.settings.ID) : {};
        const newState = objectAssignDeep.noMutate(currentState, payload);

        // Update state cache with new state.
        this.state.set(entity.settings.ID, newState, stateChangeReason);

        if (settings.get().advanced.cache_state) {
            // Add cached state to payload
            messagePayload = newState;
        }

        const options = {
            retain: entity.settings.hasOwnProperty('retain') ? entity.settings.retain : false,
            qos: entity.settings.hasOwnProperty('qos') ? entity.settings.qos : 0,
        };

        if (entity.type === 'device' && settings.get().mqtt.include_device_information) {
            const device = this.zigbee.getDeviceByIeeeAddr(entity.device.ieeeAddr);
            const attributes = [
                'ieeeAddr', 'networkAddress', 'type', 'manufacturerID', 'manufacturerName', 'powerSource',
                'applicationVersion', 'stackVersion', 'zclVersion', 'hardwareVersion', 'dateCode', 'softwareBuildID',
            ];

            messagePayload.device = {
                friendlyName: entity.name,
                model: entity.mapped ? entity.mapped.model : 'unknown',
            };

            attributes.forEach((a) => messagePayload.device[a] = device[a]);
        }

        if (Object.entries(messagePayload).length) {
            if (settings.get().experimental.output === 'attribute_and_json') {
                await this.mqtt.publish(entity.name, JSON.stringify(messagePayload), options);
                await this.iteratePayloadAttributeOutput(`${entity.name}/`, messagePayload, options);
            } else if (settings.get().experimental.output === 'json') {
                await this.mqtt.publish(entity.name, JSON.stringify(messagePayload), options);
            } else {
                /* istanbul ignore else */
                if (settings.get().experimental.output === 'attribute') {
                    await this.iteratePayloadAttributeOutput(`${entity.name}/`, messagePayload, options);
                }
            }
        }
    }

    async iteratePayloadAttributeOutput(topicRoot, payload, options) {
        for (const [key, value] of Object.entries(payload)) {
            let subPayload = value;
            let message;

            // Special cases
            if (key === 'color' && utils.objectHasProperties(subPayload, ['r', 'g', 'b'])) {
                subPayload = [subPayload.r, subPayload.g, subPayload.b];
            }

            // Check Array first, since it is also an Object
            if (Array.isArray(subPayload)) {
                message = subPayload.map((x) => `${x}`).join(',');
            } else if (typeof subPayload === 'object') {
                return this.iteratePayloadAttributeOutput(`${topicRoot}${key}-`, subPayload, options);
            } else {
                message = typeof subPayload === 'string' ? subPayload : JSON.stringify(subPayload);
            }

            await this.mqtt.publish(`${topicRoot}${key}`, message, options);
        }
    }

    async callExtensionMethod(method, parameters) {
        for (const extension of this.extensions) {
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
