const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
const legacy = require('zigbee-herdsman-converters/lib/legacy');
const extend = require('zigbee-herdsman-converters/lib/extend');
const ota = require('zigbee-herdsman-converters/lib/ota');
const tuya = require('zigbee-herdsman-converters/lib/tuya');
const utils = require('zigbee-herdsman-converters/lib/utils');
const globalStore = require('zigbee-herdsman-converters/lib/store');
const e = exposes.presets;
const ea = exposes.access;

const definition = {
    zigbeeModel: ['ESPC6TEST'],
    model: 'ESP32C6',
    vendor: 'CEDAR',
    description: 'My super lamp!',
    // Note that fromZigbee, toZigbee and exposes are missing here since we use extend here.
    // Extend contains a default set of fromZigbee/toZigbee converters and expose for common device types.
    // The following extends are available:
    // - extend.switch
    // - extend.light_onoff_brightness
    // - extend.light_onoff_brightness_colortemp
    // - extend.light_onoff_brightness_color
    // - extend.light_onoff_brightness_colortemp_color
    extend: extend.light_onoff_brightness_colortemp_color(),
};

module.exports = definition;
