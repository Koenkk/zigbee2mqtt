const debug = require('debug')('xiaomi-zb2mqtt')
const util = require("util");
const perfy = require('perfy');
const ZShepherd = require('zigbee-shepherd');
const mqtt = require('mqtt')
const ArgumentParser = require('argparse').ArgumentParser;
const fs = require('fs');

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
        console.log(device.ieeeAddr + ' ' + device.nwkAddr + ' ' + device.modelId);
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
    // debug('msg: ' + util.inspect(msg, false, null));
    var pl = null;
    var topic = 'xiaomiZb/';

    switch (msg.type) {
        case 'devIncoming':
            console.log('Device: ' + msg.data + ' joining the network!');
            break;
        case 'attReport':
            console.log('attreport: ' + msg.endpoints[0].device.ieeeAddr + ' ' + msg.endpoints[0].devId + ' ' + msg.endpoints[0].epId + ' ' + util.inspect(msg.data, false, null));

            // defaults, will be extended or overridden based on device and message
            topic += msg.endpoints[0].device.ieeeAddr.substr(2);
            pl=1;

            switch (msg.data.cid) {
                case 'genOnOff':  // various switches
                    topic += '/' + msg.endpoints[0].epId;
                    pl = msg.data.data['onOff'];
                    break;
                case 'msTemperatureMeasurement':  // Aqara Temperature/Humidity
                    topic += "/temperature";
                    pl = parseFloat(msg.data.data['measuredValue']) / 100.0;
                    break;
                case 'msRelativeHumidity':
                    topic += "/humidity";
                    pl = parseFloat(msg.data.data['measuredValue']) / 100.0;
                    break;
                case 'msPressureMeasurement':
                    topic += "/pressure";
                    pl = parseFloat(msg.data.data['16']) / 10.0;
                    break;
                case 'msOccupancySensing': // motion sensor
                    topic += "/occupancy";
                    pl = msg.data.data['occupancy'];
                    break;
                case 'msIlluminanceMeasurement':
                    topic += "/illuminance";
                    pl = msg.data.data['measuredValue'];
                    break;
            }

            switch (msg.endpoints[0].devId) {
                case 260: // WXKG01LM switch
                    if (msg.data.data['onOff'] == 0) { // click down
                        perfy.start(msg.endpoints[0].device.ieeeAddr); // start timer
                        pl = null; // do not send mqtt message
                    } else if (msg.data.data['onOff'] == 1) { // click release
                        if (perfy.exists(msg.endpoints[0].device.ieeeAddr)) { // do we have timer running
                            var clicktime = perfy.end(msg.endpoints[0].device.ieeeAddr); // end timer
                            if (clicktime.seconds > 0 || clicktime.milliseconds > 240) { // seems like a long press so ..
                                topic = topic.slice(0,-1) + '2'; //change topic to 2
                                pl = clicktime.seconds + Math.floor(clicktime.milliseconds) + ''; // and payload to elapsed seconds
                            }
                        }
                    } else if (msg.data.data['32768']) { // multiple clicks
                        pl = msg.data.data['32768'];
                    }
            }

            break;
        default:
            // console.log(util.inspect(msg, false, null));
            // Not deal with other msg.type in this example
            break;
    }

    if (pl != null) { // only publish message if we have not set payload to null
        console.log("MQTT Reporting to ", topic, " value ", pl)
        client.publish(topic, pl.toString());
    }
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
