const chai = require('chai');
const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..', 'docs');

const supportDevices = require('../docgen/supported-devices');
const integratingWithHomeassistant = require('../docgen/integrating-with-homeassistant');

describe('Docgen', () => {
    it('supported-devices.md should be up-to-date.', () => {
        const actual = fs.readFileSync(path.join(base, 'information', 'supported_devices.md')).toString();
        chai.assert.strictEqual(
            supportDevices,
            actual,
            'supported-devices.md is not up-to-date, forgot to run npm run docgen?'
        );
    });

    it('integrating-with-homeassistant.md should be up-to-date.', () => {
        const actual = fs.readFileSync(path.join(base, 'integration', 'home_assistant.md')).toString();
        chai.assert.strictEqual(
            integratingWithHomeassistant,
            actual,
            'supported-devices.md is not up-to-date, forgot to run npm run docgen?'
        );
    });
});
