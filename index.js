const debug = require('debug')('xiaomi-zb2mqtt')
const util = require("util");
const perfy = require('perfy');
const ZShepherd = require('zigbee-shepherd');
const mqtt = require('mqtt')
const ArgumentParser = require('argparse').ArgumentParser;

// Parse arguments
const parser = new ArgumentParser({
    version: '1.0.0',
    addHelp:true,
    description: 'Xiaomi Zigbee to MQTT bridge using zigbee-shepherd'
});

parser.addArgument(
    ['-d', '--device'],
    {
        help: 'CC2531 USB stick location, E.G. /dev/ttyACM0',
        required: true,
    }
);

parser.addArgument(
    ['-m', '--mqtt'],
    {
        help: 'MQTT server URL, E.G. mqtt://192.168.1.10',
        required: true,
    }
);

const args = parser.parseArgs();

// Setup client
const client  = mqtt.connect(args.mqtt)
const shepherd = new ZShepherd(args.device, {net: {panId: 0x1a62}});

shepherd.on('ready', function() {
    console.log('Server is ready. Current devices:');
    shepherd.list().forEach(function(dev){
        if (dev.type === 'EndDevice')
            console.log(dev.ieeeAddr + ' ' + dev.nwkAddr + ' ' + dev.modelId);
        if (dev.manufId === 4151) // set all xiaomi devices to be online, so shepherd won't try to query info from devices (which would fail because they go tosleep)
            shepherd.find(dev.ieeeAddr,1).getDevice().update({ status: 'online', joinTime: Math.floor(Date.now()/1000) });
    });
    // allow devices to join the network within 60 secs
    shepherd.permitJoin(60, function(err) {
        if (err)
            console.log(err);
    });
});
shepherd.on('permitJoining', function(joinTimeLeft) {
    console.log(joinTimeLeft);
});
shepherd.on('ind', function(msg) {
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
});
client.on('connect', function() {
    client.publish('xiaomiZb', 'Bridge online')
})

shepherd.start(function(err) { // start the server
    if (err)
        console.log(err);
});