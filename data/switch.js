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
};

const definition = {
    zigbeeModel: ['ESP32C6TEST'],
    model: 'ESP32c6',
    vendor: 'CEDAR',
    description: 'My super switch!',
    fromZigbee: [fzLocal.data_report],
    toZigbee: [tzLocal.send_data],
    exposes: [e.list("data", exposes.access.STATE, 'numeric'), e.list("definition", exposes.access.STATE, 'text'), e.enum('send_state', exposes.access.SET, ['NOTIFY', 'DEFINITION'])],
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
