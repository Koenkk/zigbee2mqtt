var debug = require('debug')('xiaomi-zb2mqtt')
var util = require("util");
var perfy = require('perfy');
var ZShepherd = require('zigbee-shepherd');
var mqtt = require('mqtt')
var Q = require('q')
var serialport = require('serialport');
var config = require('yaml-config');

var bridgeID = 'bridge';

var shepherd;
var serial_port;

var settings = config.readConfig(__dirname + '/configuration.yaml');

var client = mqtt.connect('mqtt://'+settings.mqtt.server, {
    will: {
        topic: settings.mqtt.base_topic + '/' + bridgeID + '/state',
        payload: 'offline',
        retain: true
    }
});


var fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

try {
	bridgeID = fs.readFileSync(__dirname + '/bridgeid.txt');
} catch (e){}

client.on('connect', function() {
    client.subscribe(settings.mqtt.base_topic+'/cmnd/#');
})

client.on('message', function(topic, message) {
    try {
        // message is Buffer
        var array = topic.split("cmnd/")
        if (array.length > 1) {
            array = array[1].split('/');
            if (array.length > 1) {
                var device = array[0];
                var path = array[1];
                if (device == bridgeID) {
                    if (path == 'pair') {
                        var duration = parseInt(message);
                        if (!duration || duration == 0) duration = 60;
                        shepherd.permitJoin(duration, function(err) {
                            if (err)
                                console.log(err);
                        });
                        console.log("Pairing enabled for " + duration + " seconds");

                    }
                } else {
                    if (path == 'unpair') {
                        try {
                            var dev = shepherd.find(device, 1).getDevice();
                            Q.ninvoke(shepherd._devbox, 'remove', dev._getId());
                            Q.ninvoke(shepherd._devbox, 'sync', dev._getId());

                        } catch (e) {}
                        client.publish(settings.mqtt.base_topic+'/' + device + '/unpair', '');
                    }
                }
            }
        }
    } catch (e) {}

})

function selectChip() {
        if (settings.serial && settings.serial.port) { 
            serial_port = settings.serial.port;
            initShepherd();
		} else {
            var found = [];
            serialport.list(function(err, ports) {
                ports.forEach(function(port) {
                    if ((port.pnpId && port.pnpId.match(/TI_CC253/i)) || (port.vendorId && port.vendorId.match('0451'))) {
                        found.push(port.comName);
					}
                });

                if (found.length > 1) {
                    console.log("Found multiple ZigBee Chips.");
                    var i = 0;
                    found.forEach(function(port) {
                        console.log("[" + i++ + "] " + port);
                    });

                    rl.question('Please enter the number of the Chip you would like to use: ', (answer) => {
                        // TODO: Log the answer in a database
                        if (answer >= 0 && answer < found.length) {
                            serial_port = found[answer];
                            saveChipSelection();
                            initShepherd();
                        } else {
                            console.error("Invalid input.");
                            process.exit();
                        }

                        rl.close();
                    });
                    return;
                } else if (found.length == 0) {
                    console.error("Error: Did not detect any available ZigBee Chips. Trying again...");
                    setTimeout(selectChip, 10 * 1000);
                    return;
                }

                //only one chip
				try {
                serial_port = found[0];
                saveChipSelection();
                initShepherd();
				} catch(err) {
					console.log(err)
				}
            });
		}
}

function saveChipSelection() {
	if (!settings.serial) 
		settings.serial = Object();
	settings.serial.port = serial_port;
	config.updateConfig(settings, __dirname + "/configuration.yaml", "default");
}

function startShepherd() {
    shepherd.start(function(err) { // start the server
        if (err) {
            if (err.message.match(/timeout/)) {
                console.error("Error: Could not connect to the chip, trying again...");
                shepherd.controller._znp.close(function(err){});
                shepherd.stop();
                setTimeout(startShepherd, 10 * 1000);
            } else {
                bridgeError(err.message);
            }
        }
    });
}

function initShepherd() {
    console.log("Starting bridge using serial port " + serial_port);
    shepherd = new ZShepherd(serial_port.toString(), {
        net: {
            panId: 0x1a62
        }
    });

    shepherd.on('ready', function() {
        console.log('Bridge is ready. Current devices:');
        shepherd.list().forEach(function(dev) {
            if (dev.type === 'EndDevice') {
                console.log(dev.ieeeAddr + ' ' + dev.nwkAddr + ' ' + dev.modelId);
            }

            if (dev.manufId === 4151) // set all xiaomi devices to be online, so shepherd won't try to query info from devices (which would fail because they go to sleep)
                shepherd.find(dev.ieeeAddr, 1).getDevice().update({
                    status: 'online',
                    joinTime: Math.floor(Date.now() / 1000)
                });
        });

        reportBridgeStatus();
        reportConnectedDevices();
    });

    shepherd.on('permitJoining', function(joinTimeLeft) {
        if (joinTimeLeft % 5 == 0) {
            client.publish(settings.mqtt.base_topic+'/' + bridgeID + '/joinTimeLeft', joinTimeLeft.toString())
        }
        if (joinTimeLeft == 0) console.log("Pairing ended.");
    });

    shepherd.on('ind', function(msg) {
        // debug('msg: ' + util.inspect(msg, false, null));
        var pl = null;
        var topic = settings.mqtt.base_topic+'/';

        switch (msg.type) {
            case 'devIncoming':
                reportConnectedDevices();
                console.log('Device: ' + msg.data + ' joining the network!');
                break;
            case 'attReport':

                console.log('attreport: ' + msg.endpoints[0].device.ieeeAddr + ' ' + msg.endpoints[0].devId + ' ' + msg.endpoints[0].epId + ' ' + util.inspect(msg.data, false, null));

                // defaults, will be extended or overridden based on device and message
                topic += msg.endpoints[0].device.ieeeAddr;
                pl = null;

                var modelId = msg.endpoints[0].device.modelId;
                if (modelId) modelId = modelId.replace("\u0000", "");

                switch (msg.data.cid) {
                    case 'genBasic':
                        if (msg.data.data['modelId']) {
                            if (!modelId || modelId != msg.data.data['modelId']) {
                                var device = shepherd.find(msg.endpoints[0].device.ieeeAddr, 1).getDevice();
                                device.update({
                                    modelId: msg.data.data['modelId']
                                });
                                Q.ninvoke(shepherd._devbox, 'set', device._getId(), device);
                                Q.ninvoke(shepherd._devbox, 'sync', device._getId());
                                client.publish(settings.mqtt.base_topic+'/' + msg.endpoints[0].device.ieeeAddr + '/model', shortModel(msg.data.data['modelId']));
                                reportConnectedDevices();
                            }
                        }

                        if (msg.data.data['65281'] && Array.isArray(msg.data.data['65281']) && msg.data.data['65281'].length > 1) {
                            client.publish(settings.mqtt.base_topic+'/' + msg.endpoints[0].device.ieeeAddr + '/battery_level', msg.data.data['65281'][0]['data'].toString());
                        }
                        break;

                    case 'genOnOff': // various switches
                        pl = msg.data.data['onOff'];
                        if (modelId.match(/magnet/)) pl = pl ? 'open' : 'close'
                        if (modelId.match(/86sw(1|2)/)) { //one or two channel wall switch
                            topic += '/channel_' + (msg.endpoints[0].epId - 1);
                            pl = 'click';
                        } else topic += '/state';
                        break;
                    case 'msTemperatureMeasurement': // Aqara Temperature/Humidity
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
                        topic += "/state";
                        pl = msg.data.data['occupancy'] ? 'motion' : 'no_motion';
                        break;
                    case 'msIlluminanceMeasurement':
                        topic += "/lux";
                        pl = msg.data.data['measuredValue'];
                        break;

                    default:
                        console.log(msg.data);
                        break;
                }

                if (modelId.match(/switch/)) { // click counting
                    if (msg.data.data['onOff'] == 0) { // click down
                        perfy.start(msg.endpoints[0].device.ieeeAddr); // start timer
                        pl = null;
                        setTimeout(function() {
                            if (perfy.exists(msg.endpoints[0].device.ieeeAddr)) {
                                client.publish(topic, 'long_click_press');
                            }
                        }, 300);
                    } else if (msg.data.data['onOff'] == 1) { // click release
                        if (perfy.exists(msg.endpoints[0].device.ieeeAddr)) { // do we have timer running
                            var clicktime = perfy.end(msg.endpoints[0].device.ieeeAddr); // end timer
                            if (clicktime.seconds > 0 || clicktime.milliseconds > 240) { // seems like a long press so ..
                                pl = 'long_click_release';
                            } else {
                                pl = 'click_release';
                            }
                        } else {
	                        pl = 'click_release';
                        }
                    } else if (msg.data.data['32768']) { // multiple clicks
                        var count = msg.data.data['32768'];
                        if (count == 2) pl = 'double_click';
                        else pl = 'multiple_' + msg.data.data['32768'];
                    }
                }

                if (modelId.match(/magnet/)) { //filter duplicate messages (happens when device does not receive ack from gateway)
                    var timerID = msg.endpoints[0].device.ieeeAddr + "_" + pl;
                    var timerCounterID = msg.endpoints[0].device.ieeeAddr + "_" + (pl == 'open' ? 'close' : 'open');
                    if (perfy.exists(timerID)) {
                        if (!perfy.exists(timerCounterID)) {
                            var lastTime = perfy.end(timerID);
                            pl = null;
                        } else {
                            perfy.end(timerCounterID);
                        }
                    }
                    setTimeout(function() {
                        if (perfy.exists(timerID)) {
                            perfy.end(timerID);
                        }
                    }, 2000);
                    perfy.start(timerID);
                }
        }

        if (pl != null) { // only publish message if we have not set payload to null
            console.log("MQTT Reporting to ", topic, " value ", pl)
            client.publish(topic, pl.toString());
        }
    });

    startShepherd();
}

process.on('uncaughtException', function(err) {
    var message = err.message;
    if (err.message.match(/Cannot get the Node Descriptor/i)) {
        message = "Pairing failed, the device went to sleep. Please try again and keep it awake by shortly pressing the paring button every 2 seconds until paring succeeds.";
    }
    bridgeError(message);
});

function reportBridgeStatus() {
    client.publish(settings.mqtt.base_topic+'/' + bridgeID + '/state', shepherd.info().enabled ? 'online' : 'offline', {retain: true});
}

function bridgeError(message) {
    console.error("Error: " + message);
    client.publish(settings.mqtt.base_topic+'/' + bridgeID + '/error', message);
}

setInterval(reportBridgeStatus, 60 * 1000);

function reportConnectedDevices() {
    var devices = shepherd.list().filter(function(dev) {
        return dev.type === 'EndDevice';
    }).map(function(dev) {
        var modelId = shortModel(dev.modelId);
        if (!modelId) modelId = 'unknown';
        return {
            sid: dev.ieeeAddr,
            model: modelId
        }
    });
    client.publish(settings.mqtt.base_topic+'/' + bridgeID + '/devices', JSON.stringify(devices), {retain: true})
}

function shortModel(model) {
    if (model && typeof model === 'string') model = model.replace(/^lumi\.(sensor_)?/, '');
    return model;
}

selectChip();
