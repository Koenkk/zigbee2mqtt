const perfy = require('perfy');

const clickLookup = {
    2: 'double',
    3: 'triple',
    4: 'quadruple',
}

module.exports = [
    {
        supportedDevices: [260],
        description: 'WXKG01LM switch (260)',
        topic: 'switch',
        parse: (msg, publish) => {
            const deviceID = msg.endpoints[0].device.ieeeAddr;
            const state = msg.data.data['onOff'];

             // 0 = click down, 1 = click up, else = multiple clicks
            if (state === 0) {
                perfy.start(deviceID);
                setTimeout(() => {
                    if (perfy.exists(deviceID)) {
                        publish('long');
                        perfy.end(deviceID);
                    }
                }, 300); // After 300 seconds of not releasing we assume long click.
            } else if (state === 1) {
                if (perfy.exists(deviceID)) {
                    perfy.end(deviceID);
                    publish('single');
                }
            } else {
                const clicks = msg.data.data['32768'];
                if (clickLookup[clicks]) {
                    publish(clickLookup[clicks]);
                } else {
                    publish('many');
                }
            }
        }
    },
]

// // TODO
// 1001: {
//     topic: 'temperature',
//     payload: (msg) => parseFloat(msg.data.data['measuredValue']) / 100.0,
// },
// // TODO
// 1002: {
//     topic: 'humidity',
//     payload: (msg) => parseFloat(msg.data.data['measuredValue']) / 100.0,
// },
// // TODO
// 1003: {
//     topic: 'pressure',
//     payload: (msg) => parseFloat(msg.data.data['16']) / 10.0,
// },
// // TODO
// 1004: {
//     topic: 'occupancy',
//     payload: (msg) => msg.data.data['occupancy'],      
// },
// // TODO
// 1005: {
//     topic: 'illuminance',
//     payload: (msg) => msg.data.data['measuredValue'],       
// },