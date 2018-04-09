const perfy = require('perfy');

const clickLookup = {
    2: 'double',
    3: 'triple',
    4: 'quadruple',
}

// Used as reference: (DeviceID, ModelID, Description)
const sensorMapping = [
    (260, 'lumi.sensor_switch', 'WXKG01LM - button switch'),
    (24321, 'lumi.sens', 'WSDCGQ01LM - temprature/humidity sensor'),
    (260, 'lumi.sensor_motion', 'RTCGQ11LM - Human body sensor'),
    (260, 'lumi.sensor_magnet', 'YTC4005CN - Magnet door/window sensor'),
]

// Global variable store that can be used by devices.
const store = {}

module.exports = [
    {
        supportedDevices: [(260, 'lumi.sensor_switch')],
        cid: 'genOnOff',
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

            return null;
        }
    },
    {
        supportedDevices: [(24321, 'lumi.sens')],
        cid: 'msTemperatureMeasurement',
        topic: 'temperature',
        parse: (msg) => parseFloat(msg.data.data['measuredValue']) / 100.0
    },
    {
        supportedDevices: [(24321, 'lumi.sens')],
        cid: 'msRelativeHumidity',
        topic: 'humidity',
        parse: (msg) => parseFloat(msg.data.data['measuredValue']) / 100.0
    },
    {
        supportedDevices: [(260, 'lumi.sensor_motion')],
        cid: 'msOccupancySensing',
        topic: 'occupancy',
        parse: (msg, publish) => {
            // The occupancy sensor only sends a message when motion detected.
            // Therefore we need to publish the no_motion detected by ourselves.
            // no_motion is triggered after 3 minutes of no motion.
            const noMotionTimeout = 3; // in minutes
            const deviceID = msg.endpoints[0].device.ieeeAddr;

            // Stop existing timer because motion is detected and set a new one.
            if (store[deviceID]) {
                clearTimeout(store[deviceID]);
                store[deviceID] = null;
            }

            store[deviceID] = setTimeout(() => {
                publish('no_motion')
                store[deviceID] = null;
            }, noMotionTimeout * 60 * 1000); 
            return 'motion';
        }
    },
    {
        supportedDevices: [(260, 'lumi.sensor_magnet')],
        cid: 'genOnOff',
        topic: 'state',
        parse: (msg) => msg.data.data['onOff'] ? 'open' : 'closed'
    }
];