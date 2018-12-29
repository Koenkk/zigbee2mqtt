const yaml = require('js-yaml');
const fs = require('fs');
const data = require('./data');
const file = data.joinPath('configuration.yaml');
const objectAssignDeep = require(`object-assign-deep`);
const path = require('path');

const defaults = {
    permit_join: false,
    mqtt: {
        include_device_information: false,
    },
    groups: {},
    device_options: {},
    advanced: {
        log_directory: path.join(data.getPath(), 'log', '%TIMESTAMP%'),
        log_level: process.env.DEBUG ? 'debug' : 'info',
        soft_reset_timeout: 0,
        pan_id: 0x1a62,
        channel: 11,
        baudrate: 115200,
        rtscts: true,

        /**
         * Home Assistant requires ALL attributes to be present in ALL MQTT messages send by the device.
         * https://community.home-assistant.io/t/missing-value-with-mqtt-only-last-data-set-is-shown/47070/9
         *
         * Therefore zigbee2mqtt BY DEFAULT caches all values and resend it with every message.
         * advanced.cache_state in configuration.yaml allows to configure this.
         * https://koenkk.github.io/zigbee2mqtt/configuration/configuration.html
         */
        cache_state: true,

        /**
         * https://github.com/Koenkk/zigbee2mqtt/issues/685#issuecomment-449112250
         *
         * Network key will serve as the encryption key of your network.
         * Changing this will require you to repair your devices.
         */
        network_key: [1, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 10, 12, 13],
    },
    experimental: {
        // Availability timeout in seconds, disabled by default.
        availablility_timeout: 0,
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

function addDevice(ieeeAddr) {
    if (!settings.devices) {
        settings.devices = {};
    }

    settings.devices[ieeeAddr] = {friendly_name: ieeeAddr, retain: false};
    writeRead();
}

function removeDevice(ieeeAddr) {
    if (settings.devices && settings.devices[ieeeAddr]) {
        delete settings.devices[ieeeAddr];
        writeRead();
    }
}

function getIeeeAddrByFriendlyName(friendlyName) {
    if (!settings.devices) {
        return null;
    }

    return Object.keys(settings.devices).find((ieeeAddr) =>
        settings.devices[ieeeAddr].friendly_name === friendlyName
    );
}

function getGroupIDByFriendlyName(friendlyName) {
    if (!settings.groups) {
        return null;
    }

    return Object.keys(settings.groups).find((ID) =>
        settings.groups[ID].friendly_name === friendlyName
    );
}

function changeFriendlyName(old, new_) {
    const ieeeAddr = getIeeeAddrByFriendlyName(old);

    if (!ieeeAddr) {
        return false;
    }

    settings.devices[ieeeAddr].friendly_name = new_;
    writeRead();
    return true;
}

module.exports = {
    get: () => objectAssignDeep.noMutate(defaults, settings),
    write: () => write(),

    getDevice: (ieeeAddr) => settings.devices ? settings.devices[ieeeAddr] : null,
    addDevice: (ieeeAddr) => addDevice(ieeeAddr),
    removeDevice: (ieeeAddr) => removeDevice(ieeeAddr),

    getIeeeAddrByFriendlyName: (friendlyName) => getIeeeAddrByFriendlyName(friendlyName),
    getGroupIDByFriendlyName: (friendlyName) => getGroupIDByFriendlyName(friendlyName),
    changeFriendlyName: (old, new_) => changeFriendlyName(old, new_),
};
