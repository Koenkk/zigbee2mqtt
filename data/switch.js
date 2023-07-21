const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
const extend = require('zigbee-herdsman-converters/lib/extend');
const e = exposes.presets;
const ea = exposes.access;

const fzLocal = {

    data_report: {
        cluster: 69,
        type: ['raw'],
        convert: (model, msg, publish, options, meta) => {
            let result = ""

            const len = msg.data.length;
            for (let i = 9; i < len; i++) {
                result += msg.data[i].toString(16).padStart(2, '0');
            }

            return {
                data: result,
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

            console.log(state);

            await entity.command('genOnOff', state, {}, null);//tz.utils.getOptions(meta.mapped, entity));
        },
    },
};

const definition = {
    zigbeeModel: ['ESP32C6TEST'],
    model: 'ESP32c6',
    vendor: 'CEDAR',
    description: 'My super switch!',
    fromZigbee: [fzLocal.data_report, fz.on_off, fz.occupancy],
    toZigbee: [/*tz.on_off, */tzLocal.send_data],
    exposes: [e.occupancy(), /*e.switch(),*/ e.list("data", 69, 'numeric'), e.enum('send_state', exposes.access.SET, ['ON', 'OFF'])],
    // The configure method below is needed to make the device reports on/off state changes
    // when the device is controlled manually through the button on it.
    configure: async (device, coordinatorEndpoint, logger) => {
        const endpoint = device.getEndpoint(1);
        console.log("I GET HERE!: " + coordinatorEndpoint.toString());
        // await reporting.bind(endpoint, coordinatorEndpoint, ['msOccupancySensing', 'genOnOff']);
        // await reporting.onOff(endpoint);
    },
};

module.exports = definition;
