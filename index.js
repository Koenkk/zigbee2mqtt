var util = require("util");
var perfy = require('perfy');
var ZShepherd = require('zigbee-shepherd');
var mqtt = require('mqtt')

var client  = mqtt.connect('mqtt://192.168.1.10')

var shepherd = new ZShepherd('/dev/ttyACM3', {
    net: {
        panId: 0x1a61
    }
});

shepherd.on('ready', function () {
    console.log('Server is ready.');

    // allow devices to join the network within 60 secs
    shepherd.permitJoin(60, function (err) {
        if (err)
            console.log(err);
    }); 
});

shepherd.on('permitJoining', function (joinTimeLeft) {
    console.log(joinTimeLeft);
});

shepherd.on('ind', function (msg) {
    switch (msg.type) {
        case 'devIncoming':
            console.log('Device: ' + msg.data + ' joining the network!');
            break;
        case 'attReport':
	    console.log('attreport: ' + msg.endpoints[0].device.ieeeAddr +' '+ msg.endpoints[0].devId +' '+ msg.endpoints[0].epId +' '+util.inspect(msg.data, false, null));
	    var topic = 'xiaomiZb/' + msg.endpoints[0].device.ieeeAddr.substr(2) + '/' + msg.endpoints[0].epId;
	    var pl = '1';
	    switch (msg.endpoints[0].devId) {
		case 260: // WXKG01LM
		    if (msg.data.data['onOff'] == 0) { // click down
			perfy.start(msg.endpoints[0].device.ieeeAddr); // start timer
			pl = ''; // do not send mqtt message
		    } else if (msg.data.data['onOff'] == 1) { // click release
			var clicktime = perfy.end(msg.endpoints[0].device.ieeeAddr); // end timer
			if (clicktime.seconds > 0 || clicktime.milliseconds > 240) { // seems like a long press so ..
			    topic = 'xiaomiZb/' + msg.endpoints[0].device.ieeeAddr.substr(2) + '/2'; //change topic to 2
			    pl = clicktime.seconds+Math.floor(clicktime.milliseconds)+''; // and payload to elapsed seconds
			}
		    } else if (msg.data.data['32768']) { // multiple clicks
			pl = ''+msg.data.data['32768'];
		    }
	    }
	    if (pl.length > 0) {  // only publish message if we have not set payload to null
		client.publish(topic, pl);
	    } 
	    break; 
        default:
	    // console.log(util.inspect(msg, false, null));
            // Not deal with other msg.type in this example
            break;
    }
});

client.on('connect', function () {
  client.publish('xiaomiZb', 'Bridge online')
})
 

shepherd.start(function (err) {                // start the server
    if (err)
        console.log(err);
});

