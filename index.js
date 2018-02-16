var debug = require('debug')('xiaomi-zb2mqtt')
var util = require("util");
var perfy = require('perfy');
var ZShepherd = require('zigbee-shepherd');
var mqtt = require('mqtt')
var Q = require('q')

var bridgeID = 'bridge'

var client  = mqtt.connect('mqtt://localhost')

var shepherd = new ZShepherd('/dev/ttyACM0', {
    net: {
        panId: 0x1a62
    }
});

shepherd.on('ready', function() {
    console.log('Server is ready. Current devices:');
    shepherd.list().forEach(function(dev){
        if (dev.type === 'EndDevice') {
	        console.log(dev.ieeeAddr + ' ' + dev.nwkAddr + ' ' + dev.modelId);
        }

        if (dev.manufId === 4151) // set all xiaomi devices to be online, so shepherd won't try to query info from devices (which would fail because they go tosleep)
            shepherd.find(dev.ieeeAddr,1).getDevice().update({ status: 'online', joinTime: Math.floor(Date.now()/1000) });
    });

	reportBridgeStatus();
    reportConnectedDevices();
});
shepherd.on('permitJoining', function(joinTimeLeft) {
	if(joinTimeLeft % 5 == 0) {
   		client.publish('xiaomi/'+ bridgeID +'/joinTimeLeft', joinTimeLeft.toString())
    }
});
shepherd.on('ind', function(msg) {
    // debug('msg: ' + util.inspect(msg, false, null));
    var pl = null;
    var topic = 'xiaomi/';

    switch (msg.type) {
        case 'devIncoming':
            reportConnectedDevices();
            console.log('Device: ' + msg.data + ' joining the network!');
            break;
        case 'attReport':

            console.log('attreport: ' + msg.endpoints[0].device.ieeeAddr + ' ' + msg.endpoints[0].devId + ' ' + msg.endpoints[0].epId + ' ' + util.inspect(msg.data, false, null));

            // defaults, will be extended or overridden based on device and message
            topic += msg.endpoints[0].device.ieeeAddr;
            pl=null;

            var modelId = msg.endpoints[0].device.modelId;

            switch (msg.data.cid) {
	            case 'genBasic':
					if(msg.data.data['modelId']) {
						if(!modelId || modelId != msg.data.data['modelId']) {
							var device = shepherd.find(msg.endpoints[0].device.ieeeAddr,1).getDevice();
							device.update({ modelId: msg.data.data['modelId'] });
							Q.ninvoke(shepherd._devbox, 'set', device._getId(), device);
							Q.ninvoke(shepherd._devbox, 'sync', device._getId());
							client.publish('xiaomi/'+ msg.endpoints[0].device.ieeeAddr + '/model', shortModel(msg.data.data['modelId']));
							reportConnectedDevices();
						}
					}

					if(msg.data.data['65281'] && Array.isArray(msg.data.data['65281']) && msg.data.data['65281'].length > 1) {
						client.publish('xiaomi/'+ msg.endpoints[0].device.ieeeAddr + '/battery_level', msg.data.data['65281'][0]['data'].toString());
					}
	            break;

                case 'genOnOff':  // various switches
                    topic += '/state'; // + msg.endpoints[0].epId;
                    pl = msg.data.data['onOff'];
                    if(modelId == 'lumi.sensor_magnet') pl = pl ? 'open' : 'close'
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
                    topic += "/state";
                    pl = msg.data.data['occupancy'] ? 'motion' : 'no_motion';
                    break;
                case 'msIlluminanceMeasurement':
                    topic += "/lux";
                    pl = msg.data.data['measuredValue'];
                    break;
            }

            if(modelId == 'lumi.sensor_switch') {
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
                        }
                    } else if (msg.data.data['32768']) { // multiple clicks
	                    var count = msg.data.data['32768'];
	                    if(count == 2) pl = 'double_click';
                        else pl = 'multiple_'+ msg.data.data['32768'];
                    }
            }
    }

    if (pl != null) { // only publish message if we have not set payload to null
        console.log("MQTT Reporting to ", topic, " value ", pl)
        client.publish(topic, pl.toString());
    }
});

client.on('connect', function() {
    client.subscribe('xiaomi/cmnd/#')
})

client.on('message', function (topic, message) {
  try {
  // message is Buffer
	var array = topic.split("cmnd/")
	if(array.length > 1) {
		array = array[1].split('/');
		if(array.length > 1) {
			var device = array[0];
			var path = array[1];
		  	if(device == bridgeID) {
			  if(path == 'pair') {
				var duration = parseInt(message);
				if(!duration || duration == 0) duration = 60;
				shepherd.permitJoin(duration, function(err) {
				    if (err)
				        console.log(err);
				});
				console.log("Pairing enabled for "+ duration + " seconds");

		  	  }

		  	if(path == 'getDevices') {
			  	reportConnectedDevices();
		  	}
		} else {
			if(path == 'unpair') {
				try {
					var dev = shepherd.find(device,1).getDevice();
					Q.ninvoke(shepherd._devbox, 'remove', dev._getId());
					Q.ninvoke(shepherd._devbox, 'sync', dev._getId());

				} catch(e) {}
				client.publish('xiaomi/'+ device + '/unpair', '');
			}
		}
	}
  	}
  } catch(e) {}

})

shepherd.start(function(err) { // start the server
    if (err)
        console.log(err);
});

process.on('uncaughtException', function (err) {
  console.error(err);
  console.log("Node NOT Exiting...");
});

function reportBridgeStatus() {
	client.publish('xiaomi/'+ bridgeID +'/state', shepherd.info().enabled ? 'online' : 'offline')
}

setInterval(reportBridgeStatus, 60000);

function reportConnectedDevices() {
	var devices = shepherd.list().filter(function(dev) { return dev.type === 'EndDevice'; }).map(function(dev){
		var modelId = shortModel(dev.modelId);
		if(!modelId) modelId = 'unknown';
        return {sid: dev.ieeeAddr, model:modelId}
    });
    client.publish('xiaomi/'+ bridgeID +'/devices', JSON.stringify(devices))
}

function shortModel(model) {
	if(model && typeof model === 'string') model = model.replace(/^lumi\.(sensor_)?/, '');
	return model;
}