const debug = require('debug')('xiaomi-zb2mqtt')
const util = require("util");
const ZShepherd = require('zigbee-shepherd');
const mqtt = require('mqtt')
const fs = require('fs');
const parsers = require('./parsers');
const deviceMapping = require('./devices');
const config = require('yaml-config');
const configFile = `${__dirname}/data/configuration.yaml`
let settings = config.readConfig(configFile, 'user');

// Create empty device array if not set yet.
if (!settings.devices) {
    settings.devices = {};
    writeConfig();
}

// Setup client
console.log(`Connecting to MQTT server at ${settings.mqtt.server}`)
const client  = mqtt.connect(settings.mqtt.server)
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

// Start server
console.log(`Starting zigbee-shepherd with device ${settings.serial.port}`)
shepherd.start((err) => {
    if (err) {
        console.error('Error while starting zigbee-shepherd');
        console.error(err);
    } else {
        console.error('zigbee-shepherd started');
    }
});

// Callbacks
function handleReady() {
    console.log('zigbee-shepherd ready');

    const devices = shepherd.list().filter((device) => {
        return device.manufId === 4151 && device.type === 'EndDevice'
    });

    console.log(`Currently ${devices.length} devices are joined:`);
    devices.forEach((device) => console.log(getDeviceLogMessage(device)));

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
        console.log(`
            WARNING: allowJoin set to  true in configuration.yaml.
            Allowing new devices to join. 
            Remove this parameter once you joined all devices.
        `);
    }

    shepherd.permitJoin(settings.allowJoin ? 255 : 0, (err) => {
        if (err) {
            console.log(err);
        }
    });
}

function handleConnect() {
    client.publish(`${settings.mqtt.base_topic}/bridge/state`, 'online');
}

function handleMessage(msg) {
    if (msg.type !== 'attReport') {
        return;
    }

    const device = msg.endpoints[0].device;

    // New device!
    if (!settings.devices[device.ieeeAddr]) {
        console.log(`New device with address ${device.ieeeAddr} connected!`);

        settings.devices[device.ieeeAddr] = {
            friendly_name: device.ieeeAddr
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
        console.log(`
            WARNING: Device with modelID '${modelID}' is not supported.
            Please create an issue on https://github.com/Koenkk/xiaomi-zb2mqtt/issues
            to add support for your device`);
    }

    // Find a parser for this modelID and cid.
    const cid = msg.data.cid;
    const parser = parsers.find((p) => p.devices.includes(mappedModel.model) && p.cid === cid);

    if (!parser) {
        console.log(`
            WARNING: No parser available for '${mappedModel.model}' with cid '${cid}'
            Please create an issue on https://github.com/Koenkk/xiaomi-zb2mqtt/issues
            with this message.`);
        return;
    }

    // Parse generic information from message.
    const friendlyName = settings.devices[device.ieeeAddr].friendly_name;
    const topic = `${settings.mqtt.base_topic}/${friendlyName}/${parser.topic}`;

    // Define publih function.
    const publish = (payload) => {
        console.log(`MQTT publish, topic: '${topic}', payload: '${payload}'`);
        client.publish(topic, payload.toString());
    }

    // Get payload for the message.
    // - If a payload is returned publish it to the MQTT broker
    // - If NO payload is returned do nothing. This is for non-standard behaviour
    //   for e.g. click switches where we need to count number of clicks and detect long presses.
    const payload = parser.parse(msg, publish);
    if (payload) {
        publish(payload);
    }
}

function handleQuit() {
    shepherd.stop((err) => {
        if (err) {
            console.error('Error while stopping zigbee-shepherd');
        } else {
            console.error('zigbee-shepherd stopped')
        }

        client.publish(`${settings.mqtt.base_topic}/bridge/state`, 'offline');
        process.exit();
    });
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
