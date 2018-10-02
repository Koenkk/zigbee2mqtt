const yaml = require('js-yaml');
const fs = require('fs');
const data = require('./data');
const file = data.joinPath('configuration.yaml');
const objectAssignDeep = require(`object-assign-deep`);
const path = require('path');

const defaults = {
    permit_join: false,
    advanced: {
        log_directory: path.join(data.getPath(), 'log', '%TIMESTAMP%'),
        log_level: process.env.DEBUG ? 'debug' : 'info',
        soft_reset_timeout: 0,
    },
};

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
    if (settings.devices && settings.devices[id]) {
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

function changeFriendlyName(old, new_) {
    const ID = getIDByFriendlyName(old);

    if (!ID) {
        return false;
    }

    settings.devices[ID].friendly_name = new_;
    writeRead();
    return true;
}

module.exports = {
    get: () => objectAssignDeep.noMutate(defaults, settings),
    write: () => write(),
    getDevice: (id) => settings.devices ? settings.devices[id] : null,
    addDevice: (id) => addDevice(id),
    removeDevice: (id) => removeDevice(id),
    getIDByFriendlyName: (friendlyName) => getIDByFriendlyName(friendlyName),
    changeFriendlyName: (old, new_) => changeFriendlyName(old, new_),
};
