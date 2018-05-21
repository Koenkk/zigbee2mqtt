const clickLookup = {
    1: 'single',
    2: 'double',
    3: 'triple',
    4: 'quadruple',
};

const battery3V = {
    min: 2500,
    max: 3000,
};

const WXKG02LM = {
    1: 'left',
    2: 'right',
    3: 'both',
};

const QBKG03LM = {
    2: 'l1',
    3: 'l2',
};

const occupancyTimeout = 60; // In seconds

const toPercentage = (value, min, max) => {
    if (value > max) {
        value = max;
    } else if (value < min) {
        value = min;
    }

    const normalised = (value - min) / (max - min);
    return (normalised * 100).toFixed(2);
};

const precisionRound = (number, precision) => {
    const factor = Math.pow(10, precision);
    return Math.round(number * factor) / factor;
};


// Global variable store that can be used by devices.
const store = {};

const parsers = [
    {
        devices: [
            'WXKG01LM', 'RTCGQ01LM', 'WSDCGQ01LM', 'MCCGQ01LM', 'WXKG11LM', 'MCCGQ11LM', 'RTCGQ11LM', 'WSDCGQ11LM',
            'SJCGQ11LM', 'MFKZQ01LM', 'JTYJ-GD-01LM/BW', 'WXKG02LM', 'WXKG03LM',
        ],
        cid: 'genBasic',
        type: 'attReport',
        convert: (msg) => {
            let voltage = null;

            if (msg.data.data['65281']) {
                voltage = msg.data.data['65281']['1'];
            } else if (msg.data.data['65282']) {
                voltage = msg.data.data['65282']['1'].elmVal;
            }

            if (voltage) {
                return {battery: toPercentage(voltage, battery3V.min, battery3V.max)};
            }
        },
    },
    {
        devices: ['WXKG01LM'],
        cid: 'genOnOff',
        type: 'attReport',
        disableCache: true,
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
        },
    },
    {
        devices: ['WSDCGQ01LM', 'WSDCGQ11LM'],
        cid: 'msTemperatureMeasurement',
        type: 'attReport',
        convert: (msg) => {
            return {temperature: parseFloat(msg.data.data['measuredValue']) / 100.0};
        },
    },
    {
        devices: ['MFKZQ01LM'],
        cid: 'genMultistateInput',
        type: 'attReport',
        disableCache: true,
        convert: (msg) => {
            /*
            Source: https://github.com/kirovilya/ioBroker.zigbee
                +---+
                | 2 |
            +---+---+---+
            | 4 | 0 | 1 |
            +---+---+---+
                |M5I|
                +---+
                | 3 |
                +---+
            Side 5 is with the MI logo, side 3 contains the battery door.
            presentValue = 0 = shake
            presentValue = 2 = wakeup
            presentValue = 3 = fly/fall
            presentValue = y + x * 8 + 64 = 90º Flip from side x on top to side y on top
            presentValue = x + 128 = 180º flip to side x on top
            presentValue = x + 256 = push/slide cube while side x is on top
            presentValue = x + 512 = double tap while side x is on top
            */
            const value = msg.data.data['presentValue'];
            let action = null;

            if (value === 0) action = 'shake';
            else if (value === 2) action = 'wakeup';
            else if (value === 3) action = 'fall';
            else if (value >= 512) action = 'tap';
            else if (value >= 256) action = 'slide';
            else if (value >= 128) action = 'flip180';
            else if (value >= 64) action = 'flip90';

            return action ? {'action': action} : null;
        },
    },
    {
        devices: ['MFKZQ01LM'],
        cid: 'genAnalogInput',
        type: 'attReport',
        disableCache: true,
        convert: (msg) => {
            /*
            Source: https://github.com/kirovilya/ioBroker.zigbee
            presentValue = rotation angel left < 0, rigth > 0
            */
            const value = msg.data.data['presentValue'];
            return {action: value < 0 ? 'rotate_left' : 'rotate_right'};
        },
    },
    {
        devices: ['WSDCGQ01LM', 'WSDCGQ11LM'],
        cid: 'msRelativeHumidity',
        type: 'attReport',
        convert: (msg) => {
            return {humidity: parseFloat(msg.data.data['measuredValue']) / 100.0};
        },
    },
    {
        devices: ['RTCGQ01LM', 'RTCGQ11LM'],
        cid: 'msOccupancySensing',
        type: 'attReport',
        convert: (msg, publish, options) => {
            // The occupancy sensor only sends a message when motion detected.
            // Therefore we need to publish the no_motion detected by ourselves.
            const timeout = options.occupancy_timeout ? options.occupancy_timeout : occupancyTimeout;
            const deviceID = msg.endpoints[0].device.ieeeAddr;

            // Stop existing timer because motion is detected and set a new one.
            if (store[deviceID]) {
                clearTimeout(store[deviceID]);
                store[deviceID] = null;
            }

            store[deviceID] = setTimeout(() => {
                publish({occupancy: false});
                store[deviceID] = null;
            }, timeout * 1000);
            return {occupancy: true};
        },
    },
    {
        devices: ['MCCGQ01LM', 'MCCGQ11LM'],
        cid: 'genOnOff',
        type: 'attReport',
        convert: (msg) => {
            return {contact: msg.data.data['onOff'] === 0};
        },
    },
    {
        devices: [
            'LED1545G12', '7146060PH', 'LED1537R6', 'LED1623G12', 'LED1650R5', 'LED1536G5', 'F7C033',
            'LED1622G12',
        ],
        cid: 'genLevelCtrl',
        type: 'devChange',
        convert: (msg) => {
            return {brightness: msg.data.data['currentLevel']};
        },
    },
    {
        devices: ['LED1545G12', '7146060PH', 'LED1537R6', 'LED1536G5'],
        cid: 'lightingColorCtrl',
        type: 'devChange',
        convert: (msg) => {
            const result = {};

            if (msg.data.data['colorTemperature']) {
                result.color_temp = msg.data.data['colorTemperature'];
            }

            if (msg.data.data['currentX'] && msg.data.data['currentY']) {
                result.color = {
                    x: precisionRound(msg.data.data['currentX'] / 65535, 3),
                    y: precisionRound(msg.data.data['currentY'] / 65535, 3),
                };
            }

            return result;
        },
    },
    {
        devices: ['WXKG11LM'],
        cid: 'genOnOff',
        type: 'attReport',
        disableCache: true,
        convert: (msg) => {
            const data = msg.data.data;
            let clicks;

            if (data.onOff) {
                clicks = 1;
            } else if (data['32768']) {
                clicks = data['32768'];
            }

            if (clickLookup[clicks]) {
                return {click: clickLookup[clicks]};
            }
        },
    },
    {
        devices: ['RTCGQ11LM'],
        cid: 'msIlluminanceMeasurement',
        type: 'attReport',
        convert: (msg) => {
            return {illuminance: msg.data.data['measuredValue']};
        },
    },
    {
        devices: ['WSDCGQ11LM'],
        cid: 'msPressureMeasurement',
        type: 'attReport',
        convert: (msg) => {
            return {pressure: msg.data.data['measuredValue']};
        },
    },
    {
        devices: ['WXKG02LM'],
        cid: 'genOnOff',
        type: 'attReport',
        disableCache: true,
        convert: (msg) => {
            return {click: WXKG02LM[msg.endpoints[0].epId]};
        },
    },
    {
        devices: ['WXKG03LM'],
        cid: 'genOnOff',
        type: 'attReport',
        disableCache: true,
        convert: () => {
            return {click: 'single'};
        },
    },
    {
        devices: ['SJCGQ11LM'],
        cid: 'genBasic',
        type: 'attReport',
        convert: (msg) => {
            return {water_leak: msg.data.data['65281']['100'] === 1};
        },
    },
    {
        devices: ['SJCGQ11LM'],
        cid: 'ssIasZone',
        type: 'statusChange',
        convert: (msg) => {
            return {water_leak: msg.data.zoneStatus === 1};
        },
    },
    {
        devices: ['ZNCZ02LM', 'QBCZ11LM'],
        cid: 'genOnOff',
        type: 'attReport',
        convert: (msg) => {
            return {state: msg.data.data['onOff'] === 1 ? 'ON' : 'OFF'};
        },
    },
    {
        devices: ['ZNCZ02LM', 'QBCZ11LM'],
        cid: 'genAnalogInput',
        type: 'attReport',
        convert: (msg) => {
            return {power: precisionRound(msg.data.data['presentValue'], 2)};
        },
    },
    {
        devices: ['ZNCZ02LM'],
        cid: 'genBasic',
        type: 'attReport',
        convert: (msg) => {
            if (msg.data.data['65281']) {
                const data = msg.data.data['65281'];
                return {
                    state: data['100'] === 1 ? 'ON' : 'OFF',
                    power: precisionRound(data['152'], 2),
                    voltage: precisionRound(data['150'] * 0.1, 1),
                    consumption: precisionRound(data['149'], 2),
                    temperature: precisionRound(data['3'], 2),
                };
            }
        },
    },
    {
        devices: ['QBKG04LM'],
        cid: 'genOnOff',
        type: 'attReport',
        convert: (msg) => {
            if (msg.data.data['61440']) {
                return {state: msg.data.data['onOff'] === 1 ? 'ON' : 'OFF'};
            }
        },
    },
    {
        devices: ['QBKG03LM'],
        cid: 'genOnOff',
        type: 'attReport',
        convert: (msg) => {
            if (msg.data.data['61440']) {
                const key = `state_${QBKG03LM[msg.endpoints[0].epId]}`;
                const payload = {};
                payload[key] = msg.data.data['onOff'] === 1 ? 'ON' : 'OFF';
                return payload;
            }
        },
    },
    {
        devices: ['JTYJ-GD-01LM/BW'],
        cid: 'ssIasZone',
        type: 'statusChange',
        convert: (msg) => {
            return {smoke: msg.data.zoneStatus === 1};
        },
    },
    {
        devices: ['PLUG EDP RE:DY'],
        cid: 'seMetering',
        type: 'attReport',
        convert: (msg) => {
            return {power: precisionRound(msg.data.data['instantaneousDemand'], 2)};
        },
    },
    {
        devices: ['CC2530.ROUTER'],
        cid: 'genOnOff',
        type: 'attReport',
        convert: (msg) => {
            return {state: msg.data.data['onOff'] === 1};
        },
    },
    {
        devices: ['CC2530.ROUTER'],
        cid: 'genBinaryValue',
        type: 'attReport',
        convert: (msg) => {
            const data = msg.data.data;
            return {
                description: data['description'],
                type: data['inactiveText'],
                rssi: data['presentValue'],
            };
        },
    },

    // Ignore parsers (these message dont need parsing).
    {
        devices: [
            'WXKG11LM', 'MCCGQ11LM', 'MCCGQ01LM', 'WXKG01LM', 'LED1545G12', '7146060PH', 'LED1537R6', 'ZNCZ02LM',
            'QBCZ11LM', 'QBKG04LM', 'QBKG03LM', 'LED1623G12', 'LED1650R5', 'LED1536G5', 'F7C033', 'LED1622G12',
            'PLUG EDP RE:DY',
        ],
        cid: 'genOnOff',
        type: 'devChange',
        convert: () => null,
    },
    {
        devices: [
            'WXKG11LM', 'MCCGQ11LM', 'RTCGQ11LM', 'WSDCGQ11LM', 'SJCGQ11LM', 'MCCGQ01LM', 'RTCGQ01LM', 'WXKG01LM',
            'WSDCGQ01LM', 'JTYJ-GD-01LM/BW', 'ZNCZ02LM',
        ],
        cid: 'genBasic',
        type: 'devChange',
        convert: () => null,
    },
    {
        devices: ['RTCGQ11LM'],
        cid: 'msIlluminanceMeasurement',
        type: 'devChange',
        convert: () => null,
    },
    {
        devices: ['RTCGQ11LM'],
        cid: 'msOccupancySensing',
        type: 'devChange',
        convert: () => null,
    },
    {
        devices: ['WSDCGQ11LM'],
        cid: 'msTemperatureMeasurement',
        type: 'devChange',
        convert: () => null,
    },
    {
        devices: ['WSDCGQ11LM'],
        cid: 'msRelativeHumidity',
        type: 'devChange',
        convert: () => null,
    },
    {
        devices: ['WSDCGQ11LM'],
        cid: 'msPressureMeasurement',
        type: 'devChange',
        convert: () => null,
    },
    {
        devices: ['ZNCZ02LM', 'QBCZ11LM'],
        cid: 'genAnalogInput',
        type: 'devChange',
        convert: () => null,
    },
    {
        devices: ['MFKZQ01LM'],
        cid: 'genMultistateInput',
        type: 'devChange',
        convert: () => null,
    },
    {
        devices: ['MFKZQ01LM'],
        cid: 'genAnalogInput',
        type: 'devChange',
        convert: () => null,
    },
    {
        devices: ['PLUG EDP RE:DY'],
        cid: 'seMetering',
        type: 'devChange',
        convert: () => null,
    },
];

module.exports = parsers;
