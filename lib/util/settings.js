const yaml = require('js-yaml');
const fs = require('fs');
const data = require('./data');
const file = data.joinPath('configuration.yaml');

let settings = read();

function writeRead() {
    write();
    settings = read();
}

function write() {
    fs.writeFileSync(file, yaml.safeDump(settings));
}

function read() {
    return yaml.safeLoad(fs.readFileSync(file, 'utf8'));
}

function addDevice(id) {
    if (!settings.devices) {
        settings.devices = {};
    }

    settings.devices[id] = {friendly_name: id, retain: false};
    writeRead();
}

function removeDevice(id) {
    if (settings.devices) {
        delete settings.devices[id];
        writeRead();
    }
}

function getIDByFriendlyName(friendlyName) {
    if (!settings.devices) {
        return null;
    }

    return Object.keys(settings.devices).find((id) =>
        settings.devices[id].friendly_name === friendlyName
    );
}

module.exports = {
    get: () => settings,
    write: () => write(),
    getDevice: (id) => settings.devices ? settings.devices[id] : false,
    addDevice: (id) => addDevice(id),
    removeDevice: (id) => removeDevice(id),
    getIDByFriendlyName: (friendlyName) => getIDByFriendlyName(friendlyName),
};
