const MQTT = require('./mqtt');
const Zigbee = require('./zigbee');
const logger = require('./util/logger');
const settings = require('./util/settings');
const deviceMapping = require('./devices');
const zigbee2mqtt = require('./converters/zigbee2mqtt');
const mqtt2zigbee = require('./converters/mqtt2zigbee');
const homeassistant = require('./homeassistant');
const debug = require('debug')('zigbee2mqtt:controller');

const mqttConfigRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/config/\\w+`, 'g');
const mqttDeviceRegex = new RegExp(`${settings.get().mqtt.base_topic}/\\w+/set`, 'g');
const mqttDevicePrefixRegex = new RegExp(`${settings.get().mqtt.base_topic}/\\w+/\\w+/set`, 'g');

const issueLink = 'https://github.com/Koenkk/zigbee2mqtt/issues';
const pollInterval = 60 * 1000; // seconds * 1000.
const softResetTimeout = 3600 * 1000; // seconds * 1000.

class Controller {
    constructor() {
        this.zigbee = new Zigbee();
        this.mqtt = new MQTT();
        this.stateCache = {};
        this.configuredReport = [];
        this.handleZigbeeMessage = this.handleZigbeeMessage.bind(this);
        this.handleMQTTMessage = this.handleMQTTMessage.bind(this);
    }

    start() {
        this.zigbee.start(this.handleZigbeeMessage, (error) => {
            if (error) {
                logger.error('Failed to start');
            } else {
                // Log zigbee clients on startup.
                const devices = this.zigbee.getAllClients();
                logger.info(`Currently ${devices.length} devices are joined:`);
                devices.forEach((device) => {
                    logger.info(this.getDeviceStartupLogMessage(device));
                    this.configureDevice(device);
                });

                // Connect to MQTT broker
                const subscriptions = [
                    `${settings.get().mqtt.base_topic}/+/set`,
                    `${settings.get().mqtt.base_topic}/+/+/set`,
                    `${settings.get().mqtt.base_topic}/bridge/config/+`,
                ];
                this.mqtt.connect(this.handleMQTTMessage, subscriptions, () => this.handleStarted());
            }
        });
    }

    handleStarted() {
        // Home Assistant MQTT discovery on startup.
        if (settings.get().homeassistant) {
            // MQTT discovery of all paired devices on startup.
            this.zigbee.getAllClients().forEach((device) => {
                if (deviceMapping[device.modelId]) {
                    homeassistant.discover(device.ieeeAddr, deviceMapping[device.modelId].model, this.mqtt);
                }
            });
        }

        // Enable zigbee join.
        if (settings.get().permit_join) {
            logger.warn('`permit_join` set to  `true` in configuration.yaml.');
            logger.warn('Allowing new devices to join.');
            logger.warn('Set `permit_join` to `false` once you joined all devices.');
            this.zigbee.permitJoin(true);
        }

        // Start timers.
        this.pollTimer(true);
        this.softResetTimeout(true);
    }

    softResetTimeout(start) {
        if (this._softResetTimer) {
            clearTimeout(this._softResetTimer);
            this._softResetTimer = null;
        }

        if (start) {
            this._softResetTimer = setTimeout(() => {
                this.zigbee.softReset((error) => {
                    if (error) {
                        logger.warn('Soft reset error', error);
                        this.zigbee.stop((error) => {
                            logger.warn('Zigbee stopped');
                            this.zigbee.start(this.handleZigbeeMessage, (error) => {
                                if (error) {
                                    logger.error('Failed to restart!');
                                }
                            });
                        });
                    } else {
                        logger.warn('Soft resetted zigbee');
                    }

                    this.softResetTimeout(true);
                });
            }, softResetTimeout);
        }
    }

    pollTimer(start) {
        // Some routers need polling to prevent them from sleeping.
        if (start && !this._pollTimer) {
            this._pollTimer = setInterval(() => {
                const devices = this.zigbee.getAllClients().filter((d) => {
                    const power = d.powerSource ? d.powerSource.toLowerCase().split(' ')[0] : 'unknown';
                    return power !== 'battery' && power !== 'unknown' && d.type === 'Router';
                });

                devices.forEach((d) => this.zigbee.ping(d.ieeeAddr));
            }, pollInterval);
        } else if (!start && this._pollTimer) {
            clearTimeout(this._pollTimer);
            this._pollTimer = null;
        }
    }

    stop(callback) {
        this.mqtt.disconnect();
        this.pollTimer(false);
        this.softResetTimeout(false);
        this.zigbee.stop(callback);
    }

    configureDevice(device) {
        // Configure reporting for this device.
        const ieeeAddr = device.ieeeAddr;
        if (ieeeAddr && device.modelId && !this.configuredReport.includes(ieeeAddr)) {
            const mappedModel = deviceMapping[device.modelId];

            if (mappedModel && mappedModel.report) {
                this.zigbee.configureReport(ieeeAddr, mappedModel.report);
            }

            this.configuredReport.push(ieeeAddr);
        }
    }

    getDeviceStartupLogMessage(device) {
        let friendlyName = 'unknown';
        let friendlyDevice = {model: 'unkown', description: 'unknown'};

        if (deviceMapping[device.modelId]) {
            friendlyDevice = deviceMapping[device.modelId];
        }

        if (settings.getDevice(device.ieeeAddr)) {
            friendlyName = settings.getDevice(device.ieeeAddr).friendly_name;
        }

        return `${friendlyName} (${device.ieeeAddr}): ${friendlyDevice.model} - ` +
            `${friendlyDevice.vendor} ${friendlyDevice.description}`;
    }

    handleZigbeeMessage(message) {
        // Zigbee message receieved, reset soft reset timeout.
        this.softResetTimeout(true);

        debug('Recieved zigbee message with data', message.data);

        if (message.type == 'devInterview') {
            logger.info('Connecting with device, please wait...');
        } else if (message.type == 'devIncoming') {
            logger.info('New device joined the network!');
        }

        // We dont handle messages without endpoints.
        if (!message.endpoints) {
            return;
        }

        const device = message.endpoints[0].device;

        if (!device) {
            logger.warn('Message without device!');
            return;
        }

        // Check if this is a new device.
        if (!settings.getDevice(device.ieeeAddr)) {
            logger.info(`New device with address ${device.ieeeAddr} connected!`);
            settings.addDevice(device.ieeeAddr);
        }

        // We can't handle devices without modelId.
        if (!device.modelId) {
            return;
        }

        // Map Zigbee modelID to vendor modelID.
        const modelID = message.endpoints[0].device.modelId;
        const mappedModel = deviceMapping[modelID];

        if (!mappedModel) {
            logger.warn(`Device with modelID '${modelID}' is not supported.`);
            logger.warn(`Please create an issue on ${issueLink} to add support for your device`);
            return;
        }

        // Configure device.
        this.configureDevice(device);

        // Home Assistant MQTT discovery
        if (settings.get().homeassistant) {
            homeassistant.discover(device.ieeeAddr, mappedModel.model, this.mqtt);
        }

        // After this point we cant handle message withoud cid anymore.
        if (!message.data.cid) {
            return;
        }

        // Find a conveter for this message.
        const cid = message.data.cid;
        const converters = zigbee2mqtt.filter((c) =>
            c.devices.includes(mappedModel.model) && c.cid === cid && c.type === message.type
        );

        if (!converters.length) {
            logger.warn(
                `No converter available for '${mappedModel.model}' with cid '${cid}' and type '${message.type}'`
            );
            logger.warn(`Please create an issue on ${issueLink} with this message.`);
            return;
        }

        // Convert this Zigbee message to a MQTT message.
        // Get payload for the message.
        // - If a payload is returned publish it to the MQTT broker
        // - If NO payload is returned do nothing. This is for non-standard behaviour
        //   for e.g. click switches where we need to count number of clicks and detect long presses.
        converters.forEach((converter) => {
            const publish = (payload) => this.mqttPublishDeviceState(
                device.ieeeAddr, payload, converter.disableCache !== true
            );

            const payload = converter.convert(message, publish, settings.getDevice(device.ieeeAddr));

            if (payload) {
                publish(payload);
            }
        });
    }

    handleMQTTMessage(topic, message) {
        if (topic.match(mqttConfigRegex)) {
            this.handleMQTTMessageConfig(topic, message);
        } else if (topic.match(mqttDeviceRegex) || topic.match(mqttDevicePrefixRegex)) {
            this.handleMQTTMessageDevice(topic, message, topic.match(mqttDevicePrefixRegex));
        } else {
            logger.warn(`Cannot handle MQTT message with topic '${topic}' and message '${message}'`);
        }
    }

    handleMQTTMessageConfig(topic, message) {
        const option = topic.split('/')[3];

        if (option === 'permit_join') {
            this.zigbee.permitJoin(message.toString().toLowerCase() === 'true');
        } else {
            logger.warn(`Cannot handle MQTT config option '${option}' with message '${message}'`);
        }
    }

    handleMQTTMessageDevice(topic, message, withPrefix) {
        const friendlyName = topic.split('/')[1];
        const topicPrefix = withPrefix ? topic.split('/')[2] : '';

        // Map friendlyName to deviceID.
        const deviceID = Object.keys(settings.get().devices).find((id) =>
            settings.getDevice(id).friendly_name === friendlyName
        );

        if (!deviceID) {
            logger.error(`Cannot handle '${topic}' because deviceID of '${friendlyName}' cannot be found`);
            return;
        }

        // Convert the MQTT message to a Zigbee message.
        let json = null;
        try {
            json = JSON.parse(message);
        } catch (e) {
            // Cannot be parsed to JSON, assume state message.
            json = {state: message.toString()};
        }

        // Find ep for this device
        const mappedModel = deviceMapping[this.zigbee.getDevice(deviceID).modelId];
        const ep = mappedModel.ep && mappedModel.ep[topicPrefix] ? mappedModel.ep[topicPrefix] : null;

        Object.keys(json).forEach((key) => {
            // Find converter for this key.
            const converter = mqtt2zigbee[key];
            if (!converter) {
                logger.error(`No converter available for '${key}' (${json[key]})`);
                return;
            }

            const message = converter(json[key]);
            const callback = (error) => {
                // Devices do not report when they go off, this ensures state (on/off) is always in sync.
                if (!error && key.startsWith('state')) {
                    const msg = {};
                    msg[key] = json[key];
                    this.mqttPublishDeviceState(deviceID, msg, true);
                }
            };

            this.zigbee.publish(deviceID, message.cid, message.cmd, message.zclData, ep, callback);
        });
    }

    mqttPublishDeviceState(deviceID, payload, cache) {
        // Add cached state to payload
        if (this.stateCache[deviceID]) {
            payload = {...this.stateCache[deviceID], ...payload};
        }

        // Update state cache with new state.
        if (cache) {
            this.stateCache[deviceID] = payload;
        }

        const deviceSettings = settings.getDevice(deviceID);
        const options = {
            retain: deviceSettings.retain,
            qos: deviceSettings.qos ? deviceSettings.qos : 0,
        };

        this.mqtt.publish(deviceSettings.friendly_name, JSON.stringify(payload), options);
    }
}

module.exports = Controller;
