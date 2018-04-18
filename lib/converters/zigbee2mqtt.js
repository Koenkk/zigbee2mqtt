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
        devices: ['WXKG01LM', 'RTCGQ01LM', 'WSDCGQ01LM', 'MCCGQ01LM'],
        cid: 'genBasic',
        type: 'attReport',
        disablePublish: true,
        convert: (msg, publish) => {
            let voltage = null;

            if (msg.data.data['65281']) {
                voltage = msg.data.data['65281']['1'];
            } else if (msg.data.data['65282']) {
                voltage = msg.data.data['65282']['1'].elmVal;
            }

            if (voltage) {
                return {battery: toPercentage(voltage, battery.min, battery.max)}
            }
        }
    },
    {
        devices: ['WXKG01LM'],
        cid: 'genOnOff',
        type: 'attReport',
        convert: (msg, publish) => {
            const deviceID = msg.endpoints[0].device.ieeeAddr;
            const state = msg.data.data['onOff'];

             // 0 = click down, 1 = click up, else = multiple clicks
            if (state === 0) {
                store[deviceID] = setTimeout(() => {
                    publish({click: 'long'});
                    store[deviceID] = null;
                }, 300); // After 300 milliseconds of not releasing we assume long click.
            } else if (state === 1) {
                if (store[deviceID]) {
                    clearTimeout(store[deviceID]);
                    store[deviceID] = null;
                    publish({click: 'single'});
                }
            } else {
                const clicks = msg.data.data['32768'];
                const payload = clickLookup[clicks] ? clickLookup[clicks] : 'many';
                publish({click: payload});
            }
        }
    },
    {
        devices: ['WSDCGQ01LM'],
        cid: 'msTemperatureMeasurement',
        type: 'attReport',
        convert: (msg) => {return {temperature: parseFloat(msg.data.data['measuredValue']) / 100.0}}
    },
    {
        devices: ['WSDCGQ01LM'],
        cid: 'msRelativeHumidity',
        type: 'attReport',
        convert: (msg) => {return {humidity: parseFloat(msg.data.data['measuredValue']) / 100.0}}
    },
    {
        devices: ['RTCGQ01LM'],
        cid: 'msOccupancySensing',
        type: 'attReport',
        convert: (msg, publish) => {
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
                publish({occupancy: 'no_motion'})
                store[deviceID] = null;
            }, noMotionTimeout * 60 * 1000);
            return {occupancy: 'motion'};
        }
    },
    {
        devices: ['MCCGQ01LM'],
        cid: 'genOnOff',
        type: 'attReport',
        convert: (msg) => {return {state: msg.data.data['onOff'] ? 'open' : 'closed'}}
    },
    {
        devices: ['LED1545G12'],
        cid: 'genLevelCtrl',
        type: 'devChange',
        convert: (msg) => {return {brightness: msg.data.data['currentLevel']}},
    },
    {
        devices: ['LED1545G12'],
        cid: 'lightingColorCtrl',
        type: 'devChange',
        convert: (msg) => {return {color_temp: msg.data.data['colorTemperature']}},
    },

    // Ignore the following messages:
    {
        devices: ['LED1545G12'],
        cid: 'genOnOff',
        type: 'devChange',
        convert: (msg) => null
    },
    {
        devices: ['WXKG01LM'],
        cid: 'genOnOff',
        type: 'devChange',
        convert: (msg) => null
    },
];

module.exports = parsers;
