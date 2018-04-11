const clickLookup = {
    2: 'double',
    3: 'triple',
    4: 'quadruple',
}

// Global variable store that can be used by devices.
const store = {}

const parsers = [
    {
        devices: ['WXKG01LM'],
        cid: 'genOnOff',
        topic: 'switch',
        parse: (msg, publish) => {
            const deviceID = msg.endpoints[0].device.ieeeAddr;
            const state = msg.data.data['onOff'];

             // 0 = click down, 1 = click up, else = multiple clicks
            if (state === 0) {
                store[deviceID] = setTimeout(() => {
                    publish('long');
                    store[deviceID] = null;
                }, 300); // After 300 milliseconds of not releasing we assume long click.
            } else if (state === 1) {
                if (store[deviceID]) {
                    clearTimeout(store[deviceID]);
                    store[deviceID] = null;
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
        devices: ['WSDCGQ01LM'],
        cid: 'msTemperatureMeasurement',
        topic: 'temperature',
        parse: (msg) => parseFloat(msg.data.data['measuredValue']) / 100.0
    },
    {
        devices: ['WSDCGQ01LM'],
        cid: 'msRelativeHumidity',
        topic: 'humidity',
        parse: (msg) => parseFloat(msg.data.data['measuredValue']) / 100.0
    },
    {
        devices: ['RTCGQ01LM'],
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
        devices: ['MCCGQ01LM'],
        cid: 'genOnOff',
        topic: 'state',
        parse: (msg) => msg.data.data['onOff'] ? 'open' : 'closed'
    }
];

module.exports = parsers;
