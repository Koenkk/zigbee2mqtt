const debug = require('debug')('xiaomi-zb2mqtt')
const util = require("util");
const ZShepherd = require('zigbee-shepherd');
const mqtt = require('mqtt')
const fs = require('fs');
const parsers = require('./parsers');
const deviceMapping = require('./devices');
const config = require('yaml-config');
const configFile = `${__dirname}/data/configuration.yaml`;
const winston = require('winston');
let settings = config.readConfig(configFile, 'user');
const stateCache = {};

const logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({
            timestamp: () => new Date().toLocaleString(),
            formatter: function(options) {
                return options.timestamp() + ' ' +
                        winston.config.colorize(options.level, options.level.toUpperCase()) + ' ' +
                        (options.message ? options.message : '') +
                        (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' );
            }
        })
    ]
});

// Create empty device array if not set yet.
if (!settings.devices) {
    settings.devices = {};
    writeConfig();
}

// Setup client
logger.info(`Connecting to MQTT server at ${settings.mqtt.server}`)

const options = {};
if (settings.mqtt.user && settings.mqtt.password) {
    options.username = settings.mqtt.user;
    options.password = settings.mqtt.password;
}

const client  = mqtt.connect(settings.mqtt.server, options)
const shepherd = new ZShepherd(
    settings.serial.port, 
    {
        net: {panId: 0x1a62},
        dbPath: `${__dirname}/data/database.db`
    }
);

// Register callbacks
client.on('connect', handleConnect);
shepherd.on('ready', handleReady);
shepherd.on('ind', handleMessage);
process.on('SIGINT', handleQuit);

// Check every interval if connected to MQTT server.
setInterval(() => {
    if (client.reconnecting) {
        logger.error('Not connected to MQTT server!');
    }
}, 10 * 1000); // seconds * 1000.

// Start server
logger.info(`Starting zigbee-shepherd with device ${settings.serial.port}`)
shepherd.start((err) => {
    if (err) {
        logger.error('Error while starting zigbee-shepherd');
        logger.error(err);
    } else {
        logger.info('zigbee-shepherd started');
    }
});

function handleReady() {
    logger.info('zigbee-shepherd ready');

    const devices = shepherd.list().filter((device) => {
        return device.manufId === 4151 && device.type === 'EndDevice'
    });

    logger.info(`Currently ${devices.length} devices are joined:`);
    devices.forEach((device) => logger.info(getDeviceLogMessage(device)));

    // Set all Xiaomi devices to be online, so shepherd won't try 
    // to query info from devices (which would fail because they go tosleep).
    devices.forEach((device) => {
        shepherd.find(device.ieeeAddr, 1).getDevice().update({ 
            status: 'online', 
            joinTime: Math.floor(Date.now()/1000) 
        });
    });

    // Allow or disallow new devices to join the network.
    if (settings.allowJoin) {
        logger.warn('allowJoin set to  true in configuration.yaml.')
        logger.warn('Allowing new devices to join.');
        logger.warn('Remove this parameter once you joined all devices.');
    }

    shepherd.permitJoin(settings.allowJoin ? 255 : 0, (err) => {
        if (err) {
            logger.info(err);
        }
    });
}

function handleConnect() {
    mqttPublish(`${settings.mqtt.base_topic}/bridge/state`, 'online', true);
}

function handleMessage(msg) {
    if (msg.type !== 'attReport') {
        return;
    }

    const device = msg.endpoints[0].device;

    // New device!
    if (!settings.devices[device.ieeeAddr]) {
        logger.info(`New device with address ${device.ieeeAddr} connected!`);

        settings.devices[device.ieeeAddr] = {
            friendly_name: device.ieeeAddr,
            retain: false,
        };
        
        writeConfig();
    }

    // We can't handle devices without modelId.
    if (!device.modelId) {
        return;
    }

    // Map modelID to Xiaomi model. 
    const modelID = msg.endpoints[0].device.modelId;
    const mappedModel = deviceMapping[modelID];

    if (!mappedModel) {
        logger.error(`Device with modelID '${modelID}' is not supported.`);
        logger.error('Please create an issue on https://github.com/Koenkk/xiaomi-zb2mqtt/issues to add support for your device');
    }

    // Find a parser for this modelID and cid.
    const cid = msg.data.cid;
    const _parsers = parsers.filter((p) => p.devices.includes(mappedModel.model) && p.cid === cid);

    if (!_parsers.length) {
        logger.error(`No parser available for '${mappedModel.model}' with cid '${cid}'`);
        logger.error('Please create an issue on https://github.com/Koenkk/xiaomi-zb2mqtt/issues with this message.');
        return;
    }

    // Parse generic information from message.
    const friendlyName = settings.devices[device.ieeeAddr].friendly_name;
    const retain = settings.devices[device.ieeeAddr].retain;
    const topic = `${settings.mqtt.base_topic}/${friendlyName}`;
    const publish = (payload) => {
        if (stateCache[device.ieeeAddr]) {
            payload = {...stateCache[device.ieeeAddr], ...payload};
        }

        mqttPublish(topic, JSON.stringify(payload), retain);
    }

    // Get payload for the message.
    // - If a payload is returned publish it to the MQTT broker
    // - If NO payload is returned do nothing. This is for non-standard behaviour
    //   for e.g. click switches where we need to count number of clicks and detect long presses.
    _parsers.forEach((parser) => {
        const payload = parser.parse(msg, publish);

        if (payload) {
            stateCache[device.ieeeAddr] = {...stateCache[device.ieeeAddr], ...payload};

            if (!parser.disablePublish) {
                publish(payload);
            }
        }
    });
}

function handleQuit() {
    mqttPublish(`${settings.mqtt.base_topic}/bridge/state`, 'offline', true);

    shepherd.stop((err) => {
        if (err) {
            logger.error('Error while stopping zigbee-shepherd');
        } else {
            logger.error('zigbee-shepherd stopped')
        }

        process.exit();
    });
}

function mqttPublish(topic, payload, retain) {
    if (client.reconnecting) {
        logger.error(`Not connected to MQTT server!`);
        logger.error(`Cannot send message: topic: '${topic}', payload: '${payload}`);
        return;
    }

    logger.info(`MQTT publish, topic: '${topic}', payload: '${payload}'`);
    client.publish(topic, payload, {retain: retain});
}

function writeConfig() {
    config.updateConfig(settings, configFile, 'user');
    settings = config.readConfig(configFile, 'user');
}

function getDeviceLogMessage(device) {
    let friendlyName = 'unknown';
    let friendlyDevice = {model: 'unkown', description: 'unknown'};

    if (deviceMapping[device.modelId]) {
        friendlyDevice = deviceMapping[device.modelId];
    }
    
    if (settings.devices[device.ieeeAddr]) {
        friendlyName = settings.devices[device.ieeeAddr].friendly_name
    }

    return `${friendlyName} (${device.ieeeAddr}): ${friendlyDevice.model} - ${friendlyDevice.description}`;
}
