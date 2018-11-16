const devices = require('zigbee-shepherd-converters').devices;
const HomeassistantExtension = require('../lib/extension/homeassistant');
const chai = require('chai');
const homeassistant = new HomeassistantExtension(null, null, null, null);

describe('HomeAssistant extension', () => {
    it('Should have mapping for all devices supported by zigbee-shepherd-converters', () => {
        const missing = [];

        devices.forEach((d) => {
            if (!homeassistant._getMapping()[d.model]) {
                missing.push(d.model);
            }
        });

        chai.assert.strictEqual(missing.length, 0, `Missing HomeAssistant mapping for: ${missing.join(', ')}`);
    });
});
