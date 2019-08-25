const MQTT = require('./mqtt');
const Zigbee = require('./zigbee');
const State = require('./state');
const logger = require('./util/logger');
const settings = require('./util/settings');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const objectAssignDeep = require('object-assign-deep');
const utils = require('./util/utils');

// Extensions
const ExtensionPublishToZigbee = require('./extension/publishToZigbee');
// const ExtensionNetworkMap = require('./extension/networkMap');
// const ExtensionSoftReset = require('./extension/softReset');
// const ExtensionDevicePublish = require('./extension/devicePublish');
// const ExtensionHomeAssistant = require('./extension/homeassistant');
// const ExtensionDeviceConfigure = require('./extension/deviceConfigure');
// const ExtensionDeviceGroupMembership = require('./extension/deviceGroupMembership');
// const ExtensionDeviceReceive = require('./extension/deviceReceive');
// const ExtensionBridgeConfig = require('./extension/bridgeConfig');
// const ExtensionGroups = require('./extension/groups');
// const ExtensionDeviceAvailability = require('./extension/deviceAvailability');
// const ExtensionDeviceBind = require('./extension/deviceBind');
// const ExtensionDeviceReport = require('./extension/deviceReport');
// const ExtensionLivolo = require('./extension/livolo');

class Controller {
    constructor() {
        this.zigbee = new Zigbee();
        this.mqtt = new MQTT();
        this.state = new State();

        this.publishEntityState = this.publishEntityState.bind(this);

        // Initialize extensions.
        this.extensions = [
            new ExtensionPublishToZigbee(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            // new ExtensionDeviceReceive(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            // new ExtensionDeviceGroupMembership(this.zigbee, this.mqtt, this.publishEntityState),
            // // new ExtensionDeviceConfigure(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            // new ExtensionDevicePublish(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            // new ExtensionNetworkMap(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            // new ExtensionBridgeConfig(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            // new ExtensionGroups(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            // new ExtensionDeviceBind(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            // new ExtensionResponder(this.zigbee, this.mqtt, this.state, this.publishEntityState),
        ];

        // if (settings.get().advanced.report) {
        //     this.extensions.push(new ExtensionDeviceReport(
        //         this.zigbee, this.mqtt, this.state, this.publishEntityState
        //     ));
        // }

        // if (settings.get().homeassistant) {
        //     this.extensions.push(new ExtensionHomeAssistant(
        //         this.zigbee, this.mqtt, this.state, this.publishEntityState
        //     ));
        // }

        // if (settings.get().advanced.soft_reset_timeout !== 0) {
        //     this.extensions.push(new ExtensionSoftReset(
        //         this.zigbee, this.mqtt, this.state, this.publishEntityState
        //     ));
        // }

        // if (settings.get().advanced.availability_timeout) {
        //     this.extensions.push(new ExtensionDeviceAvailability(
        //         this.zigbee, this.mqtt, this.state, this.publishEntityState
        //     ));
        // }

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
            this.zigbee.on('adapterDisconnected', this.onZigbeeAdapterDisconnected.bind(this));
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
            const mappedDevice = zigbeeShepherdConverters.findByZigbeeModel(device.modelID);
            const {vendor, model, description} = mappedDevice;
            const {friendlyName} = settings.getDevice(device.ieeeAddr);
            const line = mappedDevice ? `${model} - ${vendor} ${description}` : 'Not supported';
            logger.info(`${friendlyName} (${device.ieeeAddr}): ${line} (${device.type})`);
        }

        // Enable zigbee join.
        if (settings.get().permit_join) {
            logger.warn('`permit_join` set to  `true` in configuration.yaml.');
            logger.warn('Allowing new devices to join.');
            logger.warn('Set `permit_join` to `false` once you joined all devices.');
        }

        this.zigbee.permitJoin(settings.get().permit_join);

        // Call extensions
        this.extensions.filter((e) => e.onZigbeeStarted).forEach((e) => e.onZigbeeStarted());

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
        this.extensions.filter((e) => e.onMQTTConnected).forEach((e) => e.onMQTTConnected());
    }

    async stop() {
        // Call extensions
        this.extensions.filter((e) => e.stop).forEach((e) => e.stop());

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

    onZigbeeAdapterDisconnected() {
        logger.error('Adapter disconnected, stopping');
        this.stop();
    }

    onZigbeeEvent(type, data) {
        const mappedDevice = data.device ? zigbeeShepherdConverters.findByZigbeeModel(data.device.modelID) : null;
        let settingsDevice = data.device ? settings.getDevice(data.device.ieeeAddr) : null;
        if (!settingsDevice && data.device) {
            // Only deviceLeave doesn't have a device (not interesting to add to settings)
            settingsDevice = settings.addDevice(data.device.ieeeAddr);
        }

        const friendlyName = settingsDevice ? settingsDevice.friendly_name : null;

        if (type === 'message') {
            logger.debug(
                `Received Zigbee message from '${friendlyName}' of type '${data.type}' ` +
                `with data '${JSON.stringify(data.data)}' from endpoint ${data.endpoint.ID}` +
                (data.groupID ? ` with groupID ${data.groupID}` : ``)
            );
        } else if (type === 'deviceJoined') {
            logger.info(`Device '${friendlyName}' joined`);
            this.mqtt.log('device_connected', friendlyName);
        } else if (type === 'deviceInterview') {
            if (data.status === 'started') {
                logger.info(`Starting interview of '${friendlyName}'`);
                this.mqtt.log('pairing', 'interview_started', {friendlyName});
            } else if (data.status === 'failed') {
                logger.error(`Failed to interview '${friendlyName}', device has not succesfully been paired`);
                this.mqtt.log('pairing', 'interview_failed', {friendlyName});
            } else if (data.status === 'successful') {
                logger.info(`Successfully interviewed '${friendlyName}', device has succesfully been paired`);

                if (mappedDevice) {
                    const {vendor, description, model} = mappedDevice;
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
            }
        } else if (type === 'deviceAnnounce') {
            logger.debug(`Device '${friendlyName}' announced itself`);
        } else if (type === 'deviceLeave') {
            logger.warn(`Device '${friendlyName}' left the network`);
            this.mqtt.log('device_removed', 'left_network');
        }

        // Call extensions
        this.extensions
            .filter((e) => e.onZigbeeEvent)
            .forEach((e) => e.onZigbeeEvent(type, data, mappedDevice, settingsDevice));
    }

    onMQTTMessage(payload) {
        const {topic, message} = payload;
        logger.debug(`Received MQTT message on '${topic}' with data '${message}'`);

        // Call extensions
        this.extensions.filter((e) => e.onMQTTMessage).map((e) => e.onMQTTMessage(topic, message));
    }

    async publishEntityState(IDorName, payload) {
        const {entityType, entity} = settings.getEntity(IDorName);
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

        if (entityType === 'device' && settings.get().mqtt.include_device_information) {
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
                this.mqtt.publish(entity.friendly_name, JSON.stringify(messagePayload), options);
            } else if (settings.get().experimental.output === 'attribute') {
                this.iteratePayloadAttributeOutput(`${entity.friendly_name}/`, messagePayload, options);
            }
        }
    }

    iteratePayloadAttributeOutput(topicRoot, payload, options) {
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

            this.mqtt.publish(`${topicRoot}${key}`, message, options);
        }
    }
}

module.exports = Controller;
