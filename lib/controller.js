const MQTT = require('./mqtt');
const Zigbee = require('./zigbee');
const logger = require('./util/logger');
const settings = require('./util/settings');
const deviceMapping = require('./devices');
const zigbee2mqtt = require('./converters/zigbee2mqtt');
const mqtt2zigbee = require('./converters/mqtt2zigbee');
const homeassistant = require('./homeassistant');

class Controller {

    constructor() {
        this.zigbee = new Zigbee();
        this.mqtt = new MQTT();
        this.stateCache = {};
        this.hassDiscoveryCache = {};

        this.handleZigbeeMessage = this.handleZigbeeMessage.bind(this);
        this.handleMQTTMessage = this.handleMQTTMessage.bind(this);
    }

    start() {
        this.zigbee.start(this.handleZigbeeMessage, (error) => {
            if (error) {
                logger.error('Failed to start');
            } else {
                this.mqtt.connect(this.handleMQTTMessage, () => {
                    this.handleStarted();
                });
            }
        });
    }

    handleStarted() {
        // Home assistant MQTT discovery on startup.
        if (settings.get().homeassistant) {
            // MQTT discovery of all paired devices on startup.
            const devices = this.zigbee.getAllClients();
            devices.forEach((device) => {
                const mappedModel = deviceMapping[device.modelId];
                
                if (mappedModel && mappedModel.homeassistant && !this.hassDiscoveryCache[device.ieeeAddr]) {
                    this.homeassistantDiscover(
                        mappedModel.homeassistant, 
                        device.ieeeAddr, 
                        settings.getDevice(device.ieeeAddr).friendly_name
                    );

                    this.hassDiscoveryCache[device.ieeeAddr] = true;
                }
            });

            // MQTT discovery of zigbee2mqtt permit join switch.
            this.homeassistantDiscover([homeassistant.zigbee2mqtt_permit_join], 'zigbee2mqtt_permit_join', 'zigbee2mqtt_permit_join');
            this.mqtt.publish('permit_join', JSON.stringify({state: settings.get().permit_join ? '"ON"' : '"OFF"'}), true);
        }

        // Enable zigbee join.
        if (settings.get().permit_join) {
            logger.warn('`permit_join` set to  `true` in configuration.yaml.')
            logger.warn('Allowing new devices to join.');
            logger.warn('Set `permit_join` to `false` once you joined all devices.');
            this.zigbee.permitJoin(true);
        }
    }

    stop(callback) {
        this.mqtt.disconnect();
        this.zigbee.stop(callback);
    }

    handleZigbeeMessage(message) {
        if (message.type == 'devInterview') {
            logger.info('Connecting with device, please wait...');
        }
        if (message.type == 'devIncoming') {
            logger.info('New device joined the network!');
        }

        if (!message.endpoints) {
            // We dont handle messages without endpoints.
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
        const friendlyName = settings.getDevice(device.ieeeAddr).friendly_name;

        if (!mappedModel) {
            logger.warn(`Device with modelID '${modelID}' is not supported.`);
            logger.warn('Please create an issue on https://github.com/Koenkk/zigbee2mqtt/issues to add support for your device');
            return;
        }

        // Home assistant MQTT discovery
        if (settings.get().homeassistant && mappedModel.homeassistant && 
            !this.hassDiscoveryCache[device.ieeeAddr]) {
            this.homeassistantDiscover(mappedModel.homeassistant, device.ieeeAddr, friendlyName);
            this.hassDiscoveryCache[device.ieeeAddr] = true;
        }

        // After this point we cant handle message withoud cid anymore.
        if (!message.data.cid) {
            return;
        }

        // Find a conveter for this message.
        const cid = message.data.cid;
        const converters = zigbee2mqtt.filter((c) => c.devices.includes(mappedModel.model) && c.cid === cid && c.type === message.type);

        if (!converters.length) {
            logger.warn(`No converter available for '${mappedModel.model}' with cid '${cid}' and type '${message.type}'`);
            logger.warn('Please create an issue on https://github.com/Koenkk/zigbee2mqtt/issues with this message.');
            return;
        }

        // Convert this Zigbee message to a MQTT message.
        const retain = settings.getDevice(device.ieeeAddr).retain;

        const publish = (payload) => {
            if (this.stateCache[device.ieeeAddr]) {
                payload = {...this.stateCache[device.ieeeAddr], ...payload};
            }

            this.mqtt.publish(friendlyName, JSON.stringify(payload), retain);
        }

        // Get payload for the message.
        // - If a payload is returned publish it to the MQTT broker
        // - If NO payload is returned do nothing. This is for non-standard behaviour
        //   for e.g. click switches where we need to count number of clicks and detect long presses.
        converters.forEach((converter) => {
            const payload = converter.convert(message, publish);

            if (payload) {
                this.stateCache[device.ieeeAddr] = {...this.stateCache[device.ieeeAddr], ...payload};

                if (!converter.disablePublish) {
                    publish(payload);
                }
            }
        });
    }

    handleMQTTMessage(topic, message) {
        const friendlyName = topic.split('/')[1];

        // Convert the MQTT message to a Zigbee message.
        let json = null;
        try {
            json = JSON.parse(message);
        } catch (e) {
            // Cannot be parsed to JSON, assume state message.
            json = {state: message.toString()};
        }

        // Check if permit_join
        if (friendlyName === 'zigbee2mqtt_permit_join') {
            this.zigbee.permitJoin(json.state === 'ON' ? true : false);
            this.mqtt.publish(friendlyName, JSON.stringify({state: json.state}), true);
            return;
        }

        // Map friendlyName to deviceID.
        const deviceID = Object.keys(settings.get().devices).find((id) => settings.getDevice(id).friendly_name === friendlyName);
        if (!deviceID) {
            logger.error(`Cannot handle '${topic}' because deviceID of '${friendlyName}' cannot be found`);
            return;
        }

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
                if (!error && key === 'state') {
                    this.mqtt.publish(
                        friendlyName, 
                        JSON.stringify({state: json[key]}), 
                        settings.getDevice(deviceID).retain,
                    );
                }
            };

            this.zigbee.publish(deviceID, message.cId, message.cmd, message.zclData, callback);
        });
    }

    homeassistantDiscover(configurations, deviceID, friendlyName) {
        configurations.forEach((config) => {
            const topic = `${config.type}/${deviceID}/${config.object_id}/config`;
            const payload = config.discovery_payload;
            payload.state_topic = `${settings.get().mqtt.base_topic}/${friendlyName}`;
            payload.availability_topic = `${settings.get().mqtt.base_topic}/bridge/state`;

            // Set unique names in cases this device produces multiple entities in homeassistant.
            if (configurations.length > 1) {
                payload.name = `${friendlyName}_${config.object_id}`;
            } else {
                payload.name = friendlyName;
            }

            if (payload.command_topic) {
                payload.command_topic = `${settings.get().mqtt.base_topic}/${friendlyName}/set`;
            }

            this.mqtt.publish(topic, JSON.stringify(payload), true, null, 'homeassistant');
        });
    }
}

module.exports = Controller;