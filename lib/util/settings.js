const yamlConfig = require('yaml-config');
const file = `${__dirname}/../../data/configuration.yaml`;
let settings = read();

// Create empty device array if not set yet.
if (!settings.devices) {
    settings.devices = {};
    write();
}

function write() {
    yamlConfig.updateConfig(settings, file, 'user');
    settings = read();
}

function read() {
    return yamlConfig.readConfig(file, 'user');
}


module.exports = {
    get: () => settings,
    write: () => write(),
}
