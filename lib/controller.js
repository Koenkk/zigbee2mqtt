const MQTT = require('./mqtt');
const Zigbee = require('./zigbee');
const State = require('./state');
const logger = require('./util/logger');
const settings = require('./util/settings');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const objectAssignDeep = require('object-assign-deep');

// Extensions
const ExtensionNetworkMap = require('./extension/networkMap');
const ExtensionSoftReset = require('./extension/softReset');
const ExtensionRouterPollXiaomi = require('./extension/routerPollXiaomi');
const ExtensionDevicePublish = require('./extension/devicePublish');
const ExtensionHomeAssistant = require('./extension/homeassistant');
const ExtensionDeviceConfigure = require('./extension/deviceConfigure');
const ExtensionDeviceReceive = require('./extension/deviceReceive');
const ExtensionMarkOnlineXiaomi = require('./extension/markOnlineXiaomi');
const ExtensionBridgeConfig = require('./extension/bridgeConfig');

class Controller {
    constructor() {
        this.zigbee = new Zigbee();
        this.mqtt = new MQTT();
        this.state = new State();

        // Bind methods
        this.onMQTTConnected = this.onMQTTConnected.bind(this);
        this.onZigbeeMessage = this.onZigbeeMessage.bind(this);
        this.onMQTTMessage = this.onMQTTMessage.bind(this);

        // Initialize extensions.
        this.extensions = [
            new ExtensionDeviceReceive(this.zigbee, this.mqtt, this.state, this.publishDeviceState),
            new ExtensionDeviceConfigure(this.zigbee, this.mqtt, this.state, this.publishDeviceState),
            new ExtensionDevicePublish(this.zigbee, this.mqtt, this.state, this.publishDeviceState),
            new ExtensionNetworkMap(this.zigbee, this.mqtt, this.state, this.publishDeviceState),
            new ExtensionRouterPollXiaomi(this.zigbee, this.mqtt, this.state, this.publishDeviceState),
            new ExtensionMarkOnlineXiaomi(this.zigbee, this.mqtt, this.state, this.publishDeviceState),
            new ExtensionBridgeConfig(this.zigbee, this.mqtt, this.state, this.publishDeviceState),
        ];

        if (settings.get().homeassistant) {
            this.extensions.push(new ExtensionHomeAssistant(
                this.zigbee, this.mqtt, this.state, this.publishDeviceState
            ));
        }

        if (settings.get().advanced.soft_reset_timeout !== 0) {
            this.extensions.push(new ExtensionSoftReset(
                this.zigbee, this.mqtt, this.state, this.publishDeviceState
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
        if (message.endpoints && message.endpoints[0].device) {
            device = message.endpoints[0].device;
        }

        // Retrieve modelId from message
        if (device && device.modelId) {
            mappedDevice = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
        }

        // Log
        logger.debug(
            `Received zigbee message of type '${message.type}' with data '${JSON.stringify(message.data)}'` +
            (device ? ` of device '${device.modelId}' (${device.ieeeAddr})` : '')
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
        this.startupLogVersion(() => {
            this.zigbee.start(this.onZigbeeMessage, (error) => {
                if (error) {
                    logger.error('Failed to start', error);
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
        this.state.save();
        this.mqtt.disconnect();
        this.zigbee.stop(callback);
    }

    startupLogVersion(callback) {
        const git = require('git-last-commit');
        const packageJSON = require('../package.json');
        const version = packageJSON.version;

        git.getLastCommit((err, commit) => {
            let commitHash = null;

            if (err) {
                try {
                    commitHash = require('../.hash.json').hash;
                } catch (error) {
                    commitHash = 'unknown';
                }
            } else {
                commitHash = commit.shortHash;
            }

            logger.info(`Starting zigbee2mqtt version ${version} (commit #${commitHash})`);

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
                this.publishDeviceState(device, this.state.get(device.ieeeAddr), false);
            }
        });
    }

    publishDeviceState(device, payload, cache) {
        const deviceID = device.ieeeAddr;
        const appSettings = settings.get();
        let messagePayload = {...payload};

        if (appSettings.advanced.cache_state) {
            // Add cached state to payload
            if (this.state.exists(deviceID)) {
                messagePayload = objectAssignDeep.noMutate(this.state.get(deviceID), payload);
            }

            // Update state cache with new state.
            if (cache) {
                this.state.set(deviceID, messagePayload);
            }
        }

        const deviceSettings = settings.getDevice(deviceID);
        const friendlyName = deviceSettings ? deviceSettings.friendly_name : deviceID;
        const options = {
            retain: deviceSettings ? deviceSettings.retain : false,
            qos: deviceSettings && deviceSettings.qos ? deviceSettings.qos : 0,
        };

        if (appSettings.mqtt.include_device_information) {
            messagePayload.device = this.getDeviceInfoForMqtt(device);
        }

        this.mqtt.publish(friendlyName, JSON.stringify(messagePayload), options);
    }

    getDeviceInfoForMqtt(device) {
        const {type, ieeeAddr, nwkAddr, manufId, manufName, powerSource, modelId, status} = device;
        const deviceSettings = settings.getDevice(device.ieeeAddr);

        return {
            ieeeAddr,
            friendlyName: deviceSettings.friendly_name || '',
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
