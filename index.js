const debug = require('debug')('xiaomi-zb2mqtt')
const util = require("util");
const perfy = require('perfy');
const ZShepherd = require('zigbee-shepherd');
const mqtt = require('mqtt')
const fs = require('fs');
const parsers = require('./parsers');
const config = require('yaml-config');
const configFile = `${__dirname}/data/configuration.yaml`
const settings = config.readConfig(configFile, 'user');

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
    devices.forEach((device) => {
        console.log(`${device.ieeeAddr} ${device.nwkAddr} ${device.modelId}`);
    });

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
    client.publish('xiaomiZb', 'Bridge online');
}

function handleMessage(msg) {
    if (msg.type !== 'attReport') {
        return;
    }

    const device = msg.endpoints[0].device;
    
    // Check if new device, add to config if new.
    if (!settings.devices[device.ieeeAddr]) {
        console.log(`Detected new device: ${device.ieeeAddr} ${device.nwkAddr} ${device.modelId}`);

        settings.devices[device.ieeeAddr] = {
            friendly_name: device.ieeeAddr
        };
        writeConfig();
    }

    // Check if we have a parser for this type of message.
    const deviceID = msg.endpoints[0].devId;
    const parser = parsers.find((p) => p.supportedDevices.includes(deviceID));
    if (!parser) {
        console.log(`
            WARNING: No parser available for deviceID: ${deviceID}
            Please report on https://github.com/Koenkk/xiaomi-zb2mqtt/issues
            to add support for your device`);
        return;
    }

    // Parse the message.
    const friendlyName = settings.devices[device.ieeeAddr].friendly_name;
    const payload = parser.parse(msg).toString();
    const topic = `xiaomi/${friendlyName}/${parser.topic}`;

    // Send the message.
    console.log(`MQTT publish, topic: '${topic}', payload: '${payload}'`);
    client.publish(topic, payload);
}

function handleQuit() {
    shepherd.stop((err) => {
        if (err) {
            console.error('Error while stopping zigbee-shepherd');
        } else {
            console.error('zigbee-shepherd stopped')
        }

        process.exit();
    });
}


function writeConfig() {
    config.updateConfig(settings, configFile, 'user');
}
