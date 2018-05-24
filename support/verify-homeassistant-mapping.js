// Verify that there are homeassistant mappings for every device.
const devices = require('zigbee-shepherd-converters').devices;
const homeassistant = require('../lib/homeassistant');

let failed = false;
Object.values(devices).forEach((d) => {
    if (!homeassistant.mapping[d.model]) {
        console.error(`Missing homeassistant mapping for '${d.model}'`);
        failed = true;
    }
});

process.exit(failed ? 1 : 0);