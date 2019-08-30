const MQTT = require('./mqtt');
const Zigbee = require('./zigbee');
const State = require('./state');
const logger = require('./util/logger');
const settings = require('./util/settings');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const objectAssignDeep = require('object-assign-deep');
const utils = require('./util/utils');

// Extensions
const ExtensionEntityPublish = require('./extension/entityPublish');
const ExtensionDeviceReceive = require('./extension/deviceReceive');
// const ExtensionNetworkMap = require('./extension/networkMap');
const ExtensionSoftReset = require('./extension/softReset');
const ExtensionHomeAssistant = require('./extension/homeassistant');
const ExtensionDeviceConfigure = require('./extension/deviceConfigure');
const ExtensionDeviceGroupMembership = require('./extension/deviceGroupMembership');
const ExtensionBridgeConfig = require('./extension/bridgeConfig');
const ExtensionGroups = require('./extension/groups');
const ExtensionDeviceAvailability = require('./extension/deviceAvailability');
const ExtensionDeviceBind = require('./extension/deviceBind');
const ExtensionDeviceReport = require('./extension/deviceReport');
// const ExtensionLivolo = require('./extension/livolo');

class Controller {
    constructor() {
        this.zigbee = new Zigbee();
        this.mqtt = new MQTT();
        this.state = new State();

        this.publishEntityState = this.publishEntityState.bind(this);
        this.onZigbeeAdapterDisconnected = this.onZigbeeAdapterDisconnected.bind(this);

        // Initialize extensions.
        this.extensions = [
            new ExtensionEntityPublish(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            new ExtensionDeviceReceive(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            new ExtensionDeviceGroupMembership(this.zigbee, this.mqtt, this.publishEntityState),
            new ExtensionDeviceConfigure(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            // new ExtensionNetworkMap(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            new ExtensionBridgeConfig(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            new ExtensionGroups(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            new ExtensionDeviceBind(this.zigbee, this.mqtt, this.state, this.publishEntityState),
        ];

        if (settings.get().advanced.report) {
            this.extensions.push(new ExtensionDeviceReport(
                this.zigbee, this.mqtt, this.state, this.publishEntityState
            ));
        }

        if (settings.get().homeassistant) {
            this.extensions.push(new ExtensionHomeAssistant(
                this.zigbee, this.mqtt, this.state, this.publishEntityState
            ));
        }

        if (settings.get().advanced.soft_reset_timeout !== 0) {
            this.extensions.push(new ExtensionSoftReset(
                this.zigbee, this.mqtt, this.state, this.publishEntityState
            ));
        }

        if (settings.get().advanced.availability_timeout) {
            this.extensions.push(new ExtensionDeviceAvailability(
                this.zigbee, this.mqtt, this.state, this.publishEntityState
            ));
        }

        // if (settings.get().experimental.livolo) {
        //     // https://github.com/Koenkk/zigbee2mqtt/issues/592
        //     this.extensions.push(new ExtensionLivolo(
        //         this.zigbee, this.mqtt, this.state, this.publishEntityState
        //     ));
        // }
    }

    async start() {
        logger.info(`Logging to directory: '${logger.directory}'`);
        logger.cleanup();
        this.state.start();

        const info = await utils.getZigbee2mqttVersion();
        logger.info(`Starting zigbee2mqtt version ${info.version} (commit #${info.commitHash})`);

        // Start zigbee
        try {
            this.zigbee.on('event', this.onZigbeeEvent.bind(this));
            this.zigbee.on('adapterDisconnected', this.onZigbeeAdapterDisconnected);
            await this.zigbee.start();
        } catch (error) {
            logger.error('Failed to start zigbee');
            logger.error('Exiting...');
            process.exit(1);
        }

        // Log zigbee clients on startup
        const devices = await this.zigbee.getClients();
        logger.info(`Currently ${devices.length} devices are joined:`);
        for (const device of devices) {
            const entity = await this.zigbee.resolveEntity(device);
            logger.info(
                (entity.settings ? entity.settings.friendlyName : entity.device.ieeeAddr) +
                ` (${entity.device.ieeeAddr}): ` +
                (entity.mapped ?
                    `${entity.mapped.model} - ${entity.mapped.vendor} ${entity.mapped.description} ` :
                    'Not supported ') +
                `(${entity.device.type})`
            );
        }

        // Enable zigbee join.
        if (settings.get().permit_join) {
            logger.warn('`permit_join` set to  `true` in configuration.yaml.');
            logger.warn('Allowing new devices to join.');
            logger.warn('Set `permit_join` to `false` once you joined all devices.');
        }

        this.zigbee.permitJoin(settings.get().permit_join);

        // Call extensions
        this.callExtensionMethod('onZigbeeStarted', []);

        // MQTT
        this.mqtt.on('message', this.onMQTTMessage.bind(this));
        await this.mqtt.connect();

        // Send all cached states.
        for (const device of await this.zigbee.getClients()) {
            if (this.state.exists(device.ieeeAddr)) {
                this.publishEntityState(device.ieeeAddr, this.state.get(device.ieeeAddr));
            }
        }

        // Call extensions
        this.callExtensionMethod('onMQTTConnected', []);
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
        const entity = await this.zigbee.resolveEntity(data.device || data.ieeeAddr);
        if (!entity.settings && data.device) {
            // Only deviceLeave doesn't have a device (not interesting to add to settings)
            entity.settings = settings.addDevice(data.device.ieeeAddr);
        }

        const friendlyName = entity.settings.friendlyName;

        if (type === 'message') {
            logger.debug(
                `Received Zigbee message from '${entity.settings.friendlyName}' of type '${data.type}' ` +
                `with data '${JSON.stringify(data.data)}' from endpoint ${data.endpoint.ID}` +
                (data.hasOwnProperty('groupID') ? ` with groupID ${data.groupID}` : ``)
            );
        } else if (type === 'deviceJoined') {
            logger.info(`Device '${friendlyName}' joined`);
            this.mqtt.log('device_connected', friendlyName);
        } else if (type === 'deviceInterview') {
            if (data.status === 'successful') {
                logger.info(`Successfully interviewed '${friendlyName}', device has succesfully been paired`);

                if (entity.mapped) {
                    const {vendor, description, model} = entity.mapped;
                    logger.info(
                        `Device '${friendlyName}' is supported, identified as: ${vendor} ${description} (${model})`
                    );

                    const log = {friendlyName, model, vendor, description, supported: true};
                    this.mqtt.log('pairing', 'interview_successful', log);
                } else {
                    logger.warn(
                        `Device '${friendlyName}' with Zigbee model '${data.device.modelID}' is NOT supported, ` +
                        `please follow https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html`
                    );
                    this.mqtt.log('pairing', 'interview_successful', {friendlyName, supported: false});
                }
            } else if (data.status === 'failed') {
                logger.error(`Failed to interview '${friendlyName}', device has not succesfully been paired`);
                this.mqtt.log('pairing', 'interview_failed', {friendlyName});
            } else {
                /* istanbul ignore else */
                if (data.status === 'started') {
                    logger.info(`Starting interview of '${friendlyName}'`);
                    this.mqtt.log('pairing', 'interview_started', {friendlyName});
                }
            }
        } else if (type === 'deviceAnnounce') {
            logger.debug(`Device '${friendlyName}' announced itself`);
        } else {
            /* istanbul ignore else */
            if (type === 'deviceLeave') {
                logger.warn(`Device '${friendlyName}' left the network`);
                this.mqtt.log('device_removed', 'left_network', {friendlyName});
            }
        }

        // Call extensions
        this.callExtensionMethod('onZigbeeEvent', [type, data, entity.mapped, entity.settings]);
    }

    onMQTTMessage(payload) {
        const {topic, message} = payload;
        logger.debug(`Received MQTT message on '${topic}' with data '${message}'`);

        // Call extensions
        this.callExtensionMethod('onMQTTMessage', [topic, message]);
    }

    async publishEntityState(IDorName, payload) {
        const entity = settings.getEntity(IDorName);
        if (!entity) {
            logger.error(`'${IDorName}' does not exist, skipping publish`);
            return;
        }

        let messagePayload = {...payload};
        const currentState = this.state.exists(entity.ID) ? this.state.get(entity.ID) : {};
        const newState = objectAssignDeep.noMutate(currentState, payload);

        // Update state cache with new state.
        this.state.set(entity.ID, newState);

        if (settings.get().advanced.cache_state) {
            // Add cached state to payload
            messagePayload = newState;
        }

        const options = {
            retain: entity.hasOwnProperty('retain') ? entity.retain : false,
            qos: entity.hasOwnProperty('qos') ? entity.qos : 0,
        };

        if (entity.type === 'device' && settings.get().mqtt.include_device_information) {
            const device = await this.zigbee.getDevice({ieeeAddr: entity.ID});
            const attributes = [
                'ieeeAddr', 'networkAddress', 'type', 'manufacturerID', 'manufacturerName', 'powerSource',
                'applicationVersion', 'stackVersion', 'zclVersion', 'hardwareVersion', 'dateCode', 'softwareBuildID',
            ];

            messagePayload.device = {friendlyName: entity.friendly_name};
            attributes.forEach((a) => messagePayload.device[a] = device[a]);
        }

        if (Object.entries(messagePayload).length) {
            if (settings.get().experimental.output === 'json') {
                await this.mqtt.publish(entity.friendly_name, JSON.stringify(messagePayload), options);
            } else {
                /* istanbul ignore else */
                if (settings.get().experimental.output === 'attribute') {
                    await this.iteratePayloadAttributeOutput(`${entity.friendly_name}/`, messagePayload, options);
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
                    logger.error(`Failed to call '${extension.constructor.name}' '${method}' (${error})`);
                }
            }
        }
    }
}

module.exports = Controller;
