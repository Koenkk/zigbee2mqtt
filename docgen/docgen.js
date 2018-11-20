const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..', 'docs');

const supportDevices = require('./supported-devices');
const integratingWithHomeassistant = require('./integrating-with-homeassistant');

fs.writeFileSync(path.join(base, 'supported-devices.md'), supportDevices);
fs.writeFileSync(path.join(base, 'integrating-with-homeassistant.md'), integratingWithHomeassistant);
