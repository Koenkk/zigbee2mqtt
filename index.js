var util = require("util");
var perfy = require('perfy');
var ZShepherd = require('zigbee-shepherd');
var mqtt = require('mqtt')

var client  = mqtt.connect('mqtt://192.168.1.10')

var shepherd = new ZShepherd('/dev/ttyACM0', {
    net: {
        panId: 0x1a62
    }
});

shepherd.on('ready', function() {
    console.log('Server is ready.');
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
    var pl = null;
    var topic = 'xiaomiZb/';
    
    if(msg.endpoints.length > 0 && typeof msg.endpoints[0].device !== "undefined")
            topic += msg.endpoints[0].device.ieeeAddr.substr(2);
        
    switch (msg.type) {
        case 'devIncoming':
            console.log('Device: ' + msg.data + ' joining the network!');
            break;
        case 'attReport':
            console.log('attreport: ' + msg.endpoints[0].device.ieeeAddr + ' ' + msg.endpoints[0].devId + ' ' + msg.endpoints[0].epId + ' ' + util.inspect(msg.data, false, null));

            // defaults. Some devices like switches do not need anything else.
            topic = 'xiaomiZb/' + msg.endpoints[0].device.ieeeAddr.substr(2) + '/' + msg.endpoints[0].epId;
            pl=1;

            // Aqara Temperature/Humidity
            switch (msg.data.cid) { 
                case 'msTemperatureMeasurement':
                    topic += "/temperature";
                    pl = parseFloat(msg.data.data['measuredValue']) / 100.0;
                    break;
                case 'msRelativeHumidity':
                    topic += "/relative_humidity";
                    pl = parseFloat(msg.data.data['measuredValue']) / 100.0;
                    break;
                case 'msPressureMeasurement':
                    topic += "/pressure";
                    pl = parseFloat(msg.data.data['16']) / 10.0;
                    break;
            }

            switch (msg.endpoints[0].devId) {
                case 260: // WXKG01LM
                    if (msg.data.data['onOff'] == 0) { // click down
                        perfy.start(msg.endpoints[0].device.ieeeAddr); // start timer
                        pl = null; // do not send mqtt message
                    } else if (msg.data.data['onOff'] == 1) { // click release
                        var clicktime = perfy.end(msg.endpoints[0].device.ieeeAddr); // end timer
                        if (clicktime.seconds > 0 || clicktime.milliseconds > 240) { // seems like a long press so ..

                            topic += '/2'; //change topic to 2
                            pl = clicktime.seconds + Math.floor(clicktime.milliseconds) + ''; // and payload to elapsed seconds
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