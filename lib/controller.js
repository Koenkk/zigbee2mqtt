const MQTT = require('./mqtt');
const Zigbee = require('./zigbee');
const State = require('./state');
const logger = require('./util/logger');
const settings = require('./util/settings');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const objectAssignDeep = require('object-assign-deep');
const utils = require('./util/utils');

// Extensions
const ExtensionNetworkMap = require('./extension/networkMap');
const ExtensionSoftReset = require('./extension/softReset');
const ExtensionXiaomi = require('./extension/xiaomi');
const ExtensionDevicePublish = require('./extension/devicePublish');
const ExtensionHomeAssistant = require('./extension/homeassistant');
const ExtensionDeviceConfigure = require('./extension/deviceConfigure');
const ExtensionDeviceGroupMembership = require('./extension/deviceGroupMembership');
const ExtensionDeviceReceive = require('./extension/deviceReceive');
const ExtensionBridgeConfig = require('./extension/bridgeConfig');
const ExtensionGroups = require('./extension/groups');
const ExtensionDeviceAvailability = require('./extension/deviceAvailability');
const ExtensionDeviceBind = require('./extension/deviceBind');
const ExtensionDeviceReport = require('./extension/deviceReport');
const ExtensionLivolo = require('./extension/livolo');

class Controller {
    constructor() {
        this.zigbee = new Zigbee();
        this.mqtt = new MQTT();
        this.state = new State();

        // Bind methods
        this.onMQTTConnected = this.onMQTTConnected.bind(this);
        this.onZigbeeMessage = this.onZigbeeMessage.bind(this);
        this.onMQTTMessage = this.onMQTTMessage.bind(this);
        this.publishEntityState = this.publishEntityState.bind(this);

        // Initialize extensions.
        this.extensions = [
            new ExtensionDeviceReceive(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            new ExtensionDeviceGroupMembership(this.zigbee, this.mqtt, this.publishEntityState),
            new ExtensionDeviceConfigure(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            new ExtensionDevicePublish(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            new ExtensionNetworkMap(this.zigbee, this.mqtt, this.state, this.publishEntityState),
            new ExtensionXiaomi(this.zigbee, this.mqtt, this.state, this.publishEntityState),
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

        if (settings.get().experimental.livolo) {
            // https://github.com/Koenkk/zigbee2mqtt/issues/592
            this.extensions.push(new ExtensionLivolo(
                this.zigbee, this.mqtt, this.state, this.publishEntityState
            ));
        }
    }

    onMQTTConnected() {
        // Resend all cached states.
        this.sendAllCachedStates();

        // Call extensions
        this.extensions.filter((e) => e.onMQTTConnected).forEach((e) => e.onMQTTConnected());
    }

    onZigbeeStarted() {
        // Log zigbee clients on startup and configure.
        const devices = this.zigbee.getAllClients();
        logger.info(`Currently ${devices.length} devices are joined:`);
        devices.forEach((device) => {
            logger.info(this.getDeviceStartupLogMessage(device));
        });

        // Enable zigbee join.
        if (settings.get().permit_join) {
            logger.warn('`permit_join` set to  `true` in configuration.yaml.');
            logger.warn('Allowing new devices to join.');
            logger.warn('Set `permit_join` to `false` once you joined all devices.');
        }

        this.zigbee.permitJoin(settings.get().permit_join);

        // Connect to MQTT broker
        this.mqtt.connect(this.onMQTTMessage, this.onMQTTConnected);

        // Call extensions
        this.extensions.filter((e) => e.onZigbeeStarted).forEach((e) => e.onZigbeeStarted());
    }

    onZigbeeMessage(message) {
        // Variables
        let device = null;
        let mappedDevice = null;

        // Check if message has a device
        if (message.endpoints && message.endpoints.length && message.endpoints[0].device) {
            device = message.endpoints[0].device;
        }

        // Retrieve modelId from message
        if (device && device.modelId) {
            mappedDevice = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
        }

        // Log
        logger.debug(
            `Received zigbee message of type '${message.type}' with data '${JSON.stringify(message.data)}'` +
            (device ? ` of device '${device.modelId}' (${device.ieeeAddr})` : '') +
            (message.groupid ? ` with groupID ${message.groupID}` : '')
        );

        // Call extensions.
        this.extensions
            .filter((e) => e.onZigbeeMessage)
            .forEach((e) => e.onZigbeeMessage(message, device, mappedDevice));
    }

    onMQTTMessage(topic, message) {
        logger.debug(`Received MQTT message on '${topic}' with data '${message}'`);

        // Call extensions
        const results = this.extensions
            .filter((e) => e.onMQTTMessage)
            .map((e) => e.onMQTTMessage(topic, message));

        if (!results.includes(true)) {
            logger.warn(`Cannot handle MQTT message on '${topic}' with data '${message}'`);
        }
    }

    start() {
        this.state.start();

        this.startupLogVersion(() => {
            this.zigbee.start(this.onZigbeeMessage, (error) => {
                if (error) {
                    logger.error('Failed to start', error);
                    logger.error('Exiting...');
                    process.exit(1);
                } else {
                    this.onZigbeeStarted();
                }
            });
        });
    }

    stop(callback) {
        // Call extensions
        this.extensions.filter((e) => e.stop).forEach((e) => e.stop());

        // Wrap-up
        this.state.stop();
        this.mqtt.disconnect();
        this.zigbee.stop(callback);
    }

    startupLogVersion(callback) {
        utils.getZigbee2mqttVersion((info) => {
            logger.info(`Starting zigbee2mqtt version ${info.version} (commit #${info.commitHash})`);
            callback();
        });
    }

    getDeviceStartupLogMessage(device) {
        let friendlyName = 'unknown';
        let type = 'unknown';
        let friendlyDevice = {model: 'unkown', description: 'unknown'};
        const mappedModel = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
        if (mappedModel) {
            friendlyDevice = mappedModel;
        }

        if (settings.getDevice(device.ieeeAddr)) {
            friendlyName = settings.getDevice(device.ieeeAddr).friendly_name;
        }

        if (device.type) {
            type = device.type;
        }

        return `${friendlyName} (${device.ieeeAddr}): ${friendlyDevice.model} - ` +
            `${friendlyDevice.vendor} ${friendlyDevice.description} (${type})`;
    }

    sendAllCachedStates() {
        this.zigbee.getAllClients().forEach((device) => {
            if (this.state.exists(device.ieeeAddr)) {
                this.publishEntityState(device.ieeeAddr, this.state.get(device.ieeeAddr));
            }
        });
    }

    publishEntityState(entityID, payload) {
        const entity = settings.resolveEntity(entityID);
        const appSettings = settings.get();
        let messagePayload = {...payload};

        if (appSettings.advanced.cache_state) {
            // Add cached state to payload
            if (this.state.exists(entityID)) {
                messagePayload = objectAssignDeep.noMutate(this.state.get(entityID), payload);
            }

            // Update state cache with new state.
            this.state.set(entityID, messagePayload);
        }

        const entitySettings = entity.type === 'device' ? settings.getDevice(entityID) : settings.getGroup(entityID);
        const options = {
            retain: entitySettings ? entitySettings.retain : false,
            qos: entitySettings && entitySettings.qos ? entitySettings.qos : 0,
        };

        if (entity.type === 'device' && appSettings.mqtt.include_device_information) {
            messagePayload.device = this.getDeviceInfoForMqtt(entityID);
        }

        if (settings.get().experimental.output === 'json') {
            this.mqtt.publish(entity.friendlyName, JSON.stringify(messagePayload), options);
        } else if (settings.get().experimental.output === 'attribute') {
            Object.keys(messagePayload).forEach((key) => {
                if (typeof messagePayload[key] == 'object') {
                    Object.keys(messagePayload[key]).forEach((subKey) => {
                        this.mqtt.publish(`${entity.friendlyName}/${key}-${subKey}`,
                            JSON.stringify(messagePayload[key][subKey]), options);
                    });
                } else {
                    this.mqtt.publish(`${entity.friendlyName}/${key}`, JSON.stringify(messagePayload[key]), options);
                }
            });
        }
    }

    getDeviceInfoForMqtt(ieeeAddr) {
        const device = this.zigbee.getDevice(ieeeAddr);
        const {type, nwkAddr, manufId, manufName, powerSource, modelId, status} = device;
        const deviceSettings = settings.getDevice(device.ieeeAddr);

        return {
            ieeeAddr,
            friendlyName: deviceSettings ? (deviceSettings.friendly_name || '') : '',
            type,
            nwkAddr,
            manufId,
            manufName,
            powerSource,
            modelId,
            status,
        };
    }
}

module.exports = Controller;
