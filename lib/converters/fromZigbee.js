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

// get object property name (key) by it's value
const getKey = (object, value) => {
    for (let key in object) {
        if (object[key]==value) return key;
    }
};

// Global variable store that can be used by devices.
const store = {};

const converters = {
    xiaomi_battery_3v: {
        cid: 'genBasic',
        type: 'attReport',
        convert: (model, msg) => {
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
    WXKG01LM_click: {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (model, msg, publish) => {
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
    xiaomi_temperature: {
        cid: 'msTemperatureMeasurement',
        type: 'attReport',
        convert: (model, msg) => {
            return {temperature: parseFloat(msg.data.data['measuredValue']) / 100.0};
        },
    },
    MFKZQ01LM_action_multistate: {
        cid: 'genMultistateInput',
        type: 'attReport',
        convert: (model, msg) => {
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
    MFKZQ01LM_action_analog: {
        cid: 'genAnalogInput',
        type: 'attReport',
        convert: (model, msg) => {
            /*
            Source: https://github.com/kirovilya/ioBroker.zigbee
            presentValue = rotation angel left < 0, rigth > 0
            */
            const value = msg.data.data['presentValue'];
            return {action: value < 0 ? 'rotate_left' : 'rotate_right'};
        },
    },
    xiaomi_humidity: {
        cid: 'msRelativeHumidity',
        type: 'attReport',
        convert: (model, msg) => {
            return {humidity: parseFloat(msg.data.data['measuredValue']) / 100.0};
        },
    },
    xiaomi_occupancy: {
        cid: 'msOccupancySensing',
        type: 'attReport',
        convert: (model, msg, publish, options) => {
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
    xiaomi_contact: {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (model, msg) => {
            return {contact: msg.data.data['onOff'] === 0};
        },
    },
    light_brightness: {
        cid: 'genLevelCtrl',
        type: 'devChange',
        convert: (model, msg) => {
            return {brightness: msg.data.data['currentLevel']};
        },
    },
    light_color_colortemp: {
        cid: 'lightingColorCtrl',
        type: 'devChange',
        convert: (model, msg) => {
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
    WXKG11LM_click: {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (model, msg) => {
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
    xiaomi_illuminance: {
        cid: 'msIlluminanceMeasurement',
        type: 'attReport',
        convert: (model, msg) => {
            return {illuminance: msg.data.data['measuredValue']};
        },
    },
    xiaomi_pressure: {
        cid: 'msPressureMeasurement',
        type: 'attReport',
        convert: (model, msg) => {
            return {pressure: msg.data.data['measuredValue']};
        },
    },
    WXKG02LM_click: {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (model, msg) => {
            return {click: getKey(model.ep, msg.endpoints[0].epId)};
        },
    },
    WXKG03LM_click: {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (model, msg) => {
            return {click: 'single'};
        },
    },
    SJCGQ11LM_water_leak_basic: {
        cid: 'genBasic',
        type: 'attReport',
        convert: (model, msg) => {
            return {water_leak: msg.data.data['65281']['100'] === 1};
        },
    },
    SJCGQ11LM_water_leak_iaszone: {
        cid: 'ssIasZone',
        type: 'statusChange',
        convert: (model, msg) => {
            return {water_leak: msg.data.zoneStatus === 1};
        },
    },
    xiaomi_state: {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (model, msg) => {
            return {state: msg.data.data['onOff'] === 1 ? 'ON' : 'OFF'};
        },
    },
    xiaomi_power: {
        cid: 'genAnalogInput',
        type: 'attReport',
        convert: (model, msg) => {
            return {power: precisionRound(msg.data.data['presentValue'], 2)};
        },
    },
    ZNCZ02LM_state: {
        cid: 'genBasic',
        type: 'attReport',
        convert: (model, msg) => {
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
    QBKG04LM_state: {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (model, msg) => {
            if (msg.data.data['61440']) {
                return {state: msg.data.data['onOff'] === 1 ? 'ON' : 'OFF'};
            }
        },
    },
    QBKG03LM_state: {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (model, msg) => {
            if (msg.data.data['61440']) {
                const key = `state_${getKey(model.ep, msg.endpoints[0].epId)}`;
                const payload = {};
                payload[key] = msg.data.data['onOff'] === 1 ? 'ON' : 'OFF';
                return payload;
            }
        },
    },
    JTYJGD01LMBW_smoke: {
        cid: 'ssIasZone',
        type: 'statusChange',
        convert: (model, msg) => {
            return {smoke: msg.data.zoneStatus === 1};
        },
    },
    EDP_power: {
        cid: 'seMetering',
        type: 'attReport',
        convert: (model, msg) => {
            return {power: precisionRound(msg.data.data['instantaneousDemand'], 2)};
        },
    },
    CC2530ROUTER_state: {
        cid: 'genOnOff',
        type: 'attReport',
        convert: (model, msg) => {
            return {state: msg.data.data['onOff'] === 1};
        },
    },
    CC2530ROUTER_meta: {
        cid: 'genBinaryValue',
        type: 'attReport',
        convert: (model, msg) => {
            const data = msg.data.data;
            return {
                description: data['description'],
                type: data['inactiveText'],
                rssi: data['presentValue'],
            };
        },
    },

    // Ignore converters (these message dont need parsing).
    ignore_onoff_change: {
        cid: 'genOnOff',
        type: 'devChange',
        convert: () => null,
    },
    ignore_basic_change: {
        cid: 'genBasic',
        type: 'devChange',
        convert: () => null,
    },
    ignore_illuminance_change: {
        cid: 'msIlluminanceMeasurement',
        type: 'devChange',
        convert: () => null,
    },
    ignore_occupancy_change: {
        cid: 'msOccupancySensing',
        type: 'devChange',
        convert: () => null,
    },
    ignore_temperature_change: {
        cid: 'msTemperatureMeasurement',
        type: 'devChange',
        convert: () => null,
    },
    ignore_humidity_change: {
        cid: 'msRelativeHumidity',
        type: 'devChange',
        convert: () => null,
    },
    ignore_pressure_change: {
        cid: 'msPressureMeasurement',
        type: 'devChange',
        convert: () => null,
    },
    ignore_analog_change: {
        cid: 'genAnalogInput',
        type: 'devChange',
        convert: () => null,
    },
    ignore_multistate_change: {
        cid: 'genMultistateInput',
        type: 'devChange',
        convert: () => null,
    },
    ignore_metering_change: {
        cid: 'seMetering',
        type: 'devChange',
        convert: () => null,
    },
};

module.exports = converters;
