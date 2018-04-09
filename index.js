const debug = require('debug')('xiaomi-zb2mqtt')
const util = require("util");
const perfy = require('perfy');
const ZShepherd = require('zigbee-shepherd');
const mqtt = require('mqtt')
const ArgumentParser = require('argparse').ArgumentParser;
const fs = require('fs');
const parsers = require('./parsers');

const configFile = `${__dirname}/data/config.json`

// Create configFile if does not exsist.
if (!fs.existsSync(configFile)) {
    console.log(`Created config file at ${configFile}`);
    console.log('Modify this config file according to your situation.');
    console.log('"mqtt": the MQTT host, E.G. mqtt://192.168.1.10')
    console.log('"device": location of CC2531 usb stick, E.G. /dev/ttyACM0')
    console.log("")
    console.log('Once finished, restart the application.');
    console.log('Exiting...');

    const template = {
        'mqtt': 'mqtt://192.168.1.10',
        'device': '/dev/ttyACM0',
        'friendlyNames': {}
    }

    writeConfig(template);
    process.exit();
}

const config = readConfig();

// Parse arguments
const parser = new ArgumentParser({
    version: '1.0.0',
    addHelp:true,
    description: 'Xiaomi Zigbee to MQTT bridge using zigbee-shepherd'
});

parser.addArgument(
    ['--join'],
    {
        help: 'Allow new devices to join the network',
        action: 'storeTrue',
    }
);

const args = parser.parseArgs();

// Setup client
console.log(`Connecting to MQTT server at ${config.mqtt}`)
const client  = mqtt.connect(config.mqtt)
const shepherd = new ZShepherd(
    config.device, 
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
console.log(`Starting zigbee-shepherd with device ${config.device}`)
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
    if (args.join) {
        console.log('WARNING: --join parameter detected, allowing new devices to join. Remove this parameter once you added all devices.')
    }

    shepherd.permitJoin(args.join ? 255 : 0, (err) => {
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
    if (!config.devices[device.ieeeAddr]) {
        console.log(`Detected new device: ${device.ieeeAddr} ${device.nwkAddr} ${device.modelId}`);
        config.devices[device.ieeeAddr] = device.ieeeAddr;
        writeConfig(config);
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
    const friendlyName = config.devices[device.ieeeAddr];
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

function readConfig() {
    return JSON.parse(fs.readFileSync(configFile, 'utf8'));
}

function writeConfig(content) {
    const pretty = JSON.stringify(content, null, 2);
    fs.writeFileSync(configFile, pretty);
}
