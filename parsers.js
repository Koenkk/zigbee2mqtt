const clickLookup = {
    2: 'double',
    3: 'triple',
    4: 'quadruple',
}

const battery = {
    min: 2500,
    max: 3000,
}

const toPercentage = (value, min, max) => {
    if (value > max) {
        value = max;
    } else if (value < min) {
        value = min;
    }

    const normalised = (value - min) / (max - min);
    return (normalised * 100).toFixed(2);
}

// Global variable store that can be used by devices.
const store = {}

const parsers = [
    {
        devices: ['WXKG01LM'],
        cid: 'genBasic',
        topic: 'battery',
        parse: (msg, publish) => {
            if (msg.data.data['65282']) {
                const voltage = msg.data.data['65282']['1'].elmVal;
                return voltage ? toPercentage(voltage, battery.min, battery.max) : null;
            }
        }
    },
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
