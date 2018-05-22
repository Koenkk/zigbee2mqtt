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

const parsers = {
    'xiaomiBattery': {
        cid: 'genBasic',
        type: 'attReport',
        convert: (dev, msg) => {
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
    'xiaomiClick': {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (dev, msg, publish) => {
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
    'xiaomiTemperature': {
        cid: 'msTemperatureMeasurement',
        type: 'attReport',
        convert: (dev, msg) => {
            return {temperature: parseFloat(msg.data.data['measuredValue']) / 100.0};
        },
    },
    'xiaomiCubeEvents': {
        cid: 'genMultistateInput',
        type: 'attReport',
        convert: (dev, msg) => {
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
    'xiaomiCubeRotation': {
        cid: 'genAnalogInput',
        type: 'attReport',
        convert: (dev, msg) => {
            /*
            Source: https://github.com/kirovilya/ioBroker.zigbee
            presentValue = rotation angel left < 0, rigth > 0
            */
            const value = msg.data.data['presentValue'];
            return {action: value < 0 ? 'rotate_left' : 'rotate_right'};
        },
    },
    'xiaomiHumidity': {
        cid: 'msRelativeHumidity',
        type: 'attReport',
        convert: (dev, msg) => {
            return {humidity: parseFloat(msg.data.data['measuredValue']) / 100.0};
        },
    },
    'xiaomiOccupancy': {
        cid: 'msOccupancySensing',
        type: 'attReport',
        convert: (dev, msg, publish, options) => {
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
    'xiaomiContact': {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (dev, msg) => {
            return {contact: msg.data.data['onOff'] === 0};
        },
    },
    'brightness': {
        cid: 'genLevelCtrl',
        type: 'devChange',
        convert: (dev, msg) => {
            return {brightness: msg.data.data['currentLevel']};
        },
    },
    'color': {
        cid: 'lightingColorCtrl',
        type: 'devChange',
        convert: (dev, msg) => {
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
    'xiaomiClicks': {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (dev, msg) => {
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
    'xiaomiIlluminance': {
        cid: 'msIlluminanceMeasurement',
        type: 'attReport',
        convert: (dev, msg) => {
            return {illuminance: msg.data.data['measuredValue']};
        },
    },
    'xiaomiPressure': {
        cid: 'msPressureMeasurement',
        type: 'attReport',
        convert: (dev, msg) => {
            return {pressure: msg.data.data['measuredValue']};
        },
    },
    'xiaomiClickEp': {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (dev, msg) => {
            return {click: dev.ep[msg.endpoints[0].epId]};
        },
    },
    'xiaomiSingleClick': {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (dev, msg) => {
            return {click: 'single'};
        },
    },
    'xiaomiDetectedReport': {
        cid: 'genBasic',
        type: 'attReport',
        convert: (dev, msg) => {
            return {water_leak: msg.data.data['65281']['100'] === 1};
        },
    },
    'xiaomiDetectedLeak': {
        cid: 'ssIasZone',
        type: 'statusChange',
        convert: (dev, msg) => {
            return {water_leak: msg.data.zoneStatus === 1};
        },
    },
    'xiaomiState': {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (dev, msg) => {
            return {state: msg.data.data['onOff'] === 1 ? 'ON' : 'OFF'};
        },
    },
    'xiaomiPower': {
        cid: 'genAnalogInput',
        type: 'attReport',
        convert: (dev, msg) => {
            return {power: precisionRound(msg.data.data['presentValue'], 2)};
        },
    },
    'xiaomiPlugReport': {
        cid: 'genBasic',
        type: 'attReport',
        convert: (dev, msg) => {
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
    'xiaomiSwitchState': {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (dev, msg) => {
            if (msg.data.data['61440']) {
                return {state: msg.data.data['onOff'] === 1 ? 'ON' : 'OFF'};
            }
        },
    },
    'xiaomiSwitch': {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (dev, msg) => {
            if (msg.data.data['61440']) {
                const key = `state_${QBKG03LM[msg.endpoints[0].epId]}`;
                const payload = {};
                payload[key] = msg.data.data['onOff'] === 1 ? 'ON' : 'OFF';
                return payload;
            }
        },
    },
    'xiaomiDetectedSmoke': {
        cid: 'ssIasZone',
        type: 'statusChange',
        convert: (dev, msg) => {
            return {smoke: msg.data.zoneStatus === 1};
        },
    },
    'plugEdpPower': {
        cid: 'seMetering',
        type: 'attReport',
        convert: (dev, msg) => {
            return {power: precisionRound(msg.data.data['instantaneousDemand'], 2)};
        },
    },
    'cc2530RouterState': {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (dev, msg) => {
            return {state: msg.data.data['onOff'] === 1};
        },
    },
    'cc2530Router': {
        cid: 'genBinaryValue',
        type: 'attReport',
        convert: (dev, msg) => {
            const data = msg.data.data;
            return {
                description: data['description'],
                type: data['inactiveText'],
                rssi: data['presentValue'],
            };
        },
    },
};

module.exports = parsers;
