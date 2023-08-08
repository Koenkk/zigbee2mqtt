const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
const extend = require('zigbee-herdsman-converters/lib/extend');
const e = exposes.presets;
const ea = exposes.access;

const DATA_ACCESS         = 1;
const DEFINITION_MSG_ID_S = 0x00;
const NOTIFY_MSG_ID_S     = 0x01;
const DEFINITION_MSG_ID_R = 0x02;
const NOTIFY_MSG_ID_R     = 0x03;

function reverse_hex_str(str) {
    
    const length = str.length;
    rev_str = ""
    
    for (i = 0; i < length; i+=2) {
        rev_str += str.substring(length-2-i, length-i);
    }
    return rev_str
}

function hextofloat32(rev_str) {
    str = reverse_hex_str(rev_str);
    
    number = 0;
    exp = parseInt(str,16);
    sign = (exp >> 31)? -1:1;
    mantiss = (exp >> 23 & 255) - 127;
    order = ((exp & 8388607) + 8388608).toString(2);
    for (i = 0; i < order.length; i += 1) {
        number += parseInt(order[i],10)? Math.pow(2,mantiss):0;
        mantiss--;
    }
    
    return number;
}

const fzLocal = {

    data_report: {
        cluster: 'cedar',
        type: ['raw'],
        convert: (model, msg, publish, options, meta) => {
            const commandID = msg.data[2];
            const len = msg.data.length;

            let result = "";   

            for (let i = 9; i < len; i++) {
                result += msg.data[i].toString(16).padStart(2, '0');
            }

            switch (commandID) {
                case NOTIFY_MSG_ID_R:
                    return {
                        data: result,
                        encoding: 'hex',
                    };
                case DEFINITION_MSG_ID_R:
                    return {
                        definition: result,
                        encoding: "hex",
                    }
                default:
                    break;
            }

            return {
                status: "failed to interpret data",
                encoding: "hex",
            };
        },
    },
    modbus: {
        cluster: 'cedar',
        type: ['readResponse'],
        convert: (model, msg, publish, options, meta) => {
            result = {}
            if(msg.data.hasOwnProperty('slave_id')) {
                result['slave_id'] = msg.data.slave_id;
            }
            if(msg.data.hasOwnProperty('baudrate')) {
                result['baudrate'] = msg.data.baudrate;
            }
            if(msg.data.hasOwnProperty('s_bit')) {
                result['s_bit'] = msg.data.s_bit;
            }
            if(msg.data.hasOwnProperty('parity')) {
                const lookup = {
                    78: 'N',
                    69: 'E',
                    79: 'O',
                };

                result['parity'] = lookup[msg.data.parity];
            }
            if(msg.data.hasOwnProperty('e_bit')) {
                result['e_bit'] = msg.data.e_bit;
            }
            if(msg.data.hasOwnProperty('force_single')) {
                result['force_single'] = msg.data.force_single;
            }

            console.log("Result <<<<<<<<<<<<<");
            console.log(result);

            return result;
        },
    },
};

const tzLocal = {
    send_data: {
        key: ['send_state'],
        convertSet: async (entity, key, value, meta) => {
            // Send data here
            const state = meta.message.hasOwnProperty('send_state') ? meta.message.send_state.toLowerCase() : null;

            if(state == 'notify') {
                await entity.command('cedar', NOTIFY_MSG_ID_S, {}, {disableDefaultResponse: true});
            } else if (state == 'definition') {
                await entity.command('cedar', DEFINITION_MSG_ID_S, {}, {disableDefaultResponse: true});
            }
        },
    },
    test: {
        key: ['test'],
        convertSet: async (entity, key, value, meta) => {

        },
    },
    slave_id: {
        key: ['slave_id'],
        convertSet: async (entity, key, value, meta) => {
            await entity.write('cedar', {slave_id: value}, {});
            return {}
        },
        convertGet: async (entity, key, meta) => {
            await entity.read('cedar', ['slave_id']);
        },
    },
    baudrate: {
        key:['baudrate'],
        convertSet: async (entity, key, value, meta) => {
            await entity.write('cedar', {baudrate: value}, {});
            return {};
        },
        convertGet: async (entity, key, meta) => {
            await entity.read('cedar', ['baudrate']);
        },
    },
    s_bit: {
        key:['s_bit'],
        convertSet: async (entity, key, value, meta) => {
            await entity.write('cedar', {s_bit: value}, {});
            return {};
        },
        convertGet: async (entity, key, meta) => {
            await entity.read('cedar', ['s_bit']);
        },
    },
    parity: {
        key:['parity'],
        convertSet: async (entity, key, value, meta) => {
            const lookup = {
                'N': 78,
                'E': 69,
                'O' : 79
            };
            await entity.write('cedar', {parity: lookup[value]}, {});
            return {};
        },
        convertGet: async (entity, key, meta) => {
            await entity.read('cedar', ['parity']);
        },
    },
    e_bit: {
        key:['e_bit'],
        convertSet: async (entity, key, value, meta) => {
            await entity.write('cedar', {e_bit: value}, {});
            return {};
        },
        convertGet: async (entity, key, meta) => {
            await entity.read('cedar', ['e_bit']);
        },
    },
    force_single: {
        key:['force_single'],
        convertSet: async (entity, key, value, meta) => {
            await entity.write('cedar', {force_single: value}, {});
            return {};
        },
        convertGet: async (entity, key, meta) => {
            await entity.read('cedar', ['force_single']);
        },
    },
    subscribe: {
        key:['subscribe'],
        convertSet: async (entity, key, value, meta) => {
            await entity.write('cedar', {subscribe: value});
            return {};
        },
    },
    unsubscribe: {
        key:['unsubscribe'],
        convertSet: async (entity, key, value, meta) => {
            await entity.write('cedar', {unsubscribe: value});
            return {};
        },
    },
    register_set: {
        key: ['register_set'],
        convertSet: async (entity, key, value, meta) => {
            await entity.write('cedar', {register_set: value});
            return {};
        },
    },
    register_set_32: {
        key: ['register_set_32'],
        convertSet: async (entity, key, value, mata) => {
            await entity.write('cedar', {register_set_32: value});
            return {};
        },
    },
    register_set_data: {
        key: ['register_set_data'],
        convertSet: async (entity, key, value, meta) => {
            await entity.write('cedar', {register_set_data: value});
            return {};
        },
    },
};

const definition = {
    zigbeeModel: ['ESP32C6TEST'],
    model: 'ESP32c6',
    vendor: 'CEDAR',
    description: 'My super switch!',
    fromZigbee: [fzLocal.data_report, fzLocal.modbus],
    toZigbee: [
        tzLocal.send_data, 
        tzLocal.baudrate, 
        tzLocal.s_bit, 
        tzLocal.parity, 
        tzLocal.e_bit,
        tzLocal.force_single, 
        tzLocal.test,
        tzLocal.subscribe,
        tzLocal.unsubscribe,
        tzLocal.register_set,
        tzLocal.register_set_32,
        tzLocal.register_set_data,
        tzLocal.slave_id,
    ],
    exposes: [
        e.enum('test', exposes.access.SET, ['Trigger']),
        e.numeric('slave_id', exposes.access.ALL),
        e.numeric('baudrate', exposes.access.ALL),
        e.numeric('s_bit', exposes.access.ALL),
        e.enum('parity', exposes.access.ALL, ['N', 'E', 'O']),
        e.numeric('e_bit', exposes.access.ALL),
        e.binary('force_single', exposes.access.ALL, 1, 0),
        e.enum('send_state', exposes.access.SET, ['NOTIFY', 'DEFINITION']),
        // e.numeric('subscribe', exposes.access.STATE_SET),
        // e.numeric('unsubscribe', exposes.access.STATE_SET),
        // e.numeric('register_set', exposes.access.STATE_SET),
    ],
    // The configure method below is needed to make the device reports on/off state changes
    // when the device is controlled manually through the button on it.
    configure: async (device, coordinatorEndpoint, logger) => {
        const endpoint = device.getEndpoint(1);
        // console.log("I GET HERE!: " + coordinatorEndpoint.toString());
        // await reporting.bind(endpoint, coordinatorEndpoint, ['msOccupancySensing', 'genOnOff']);
        // await reporting.onOff(endpoint);
    },
};

module.exports = definition;
