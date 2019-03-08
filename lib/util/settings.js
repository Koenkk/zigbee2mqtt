const yaml = require('js-yaml');
const fs = require('fs');
const data = require('./data');
const file = data.joinPath('configuration.yaml');
const objectAssignDeep = require(`object-assign-deep`);
const path = require('path');

const onChangeHandlers = [];

const defaults = {
    permit_join: false,
    mqtt: {
        include_device_information: false,
    },
    groups: {},
    device_options: {},
    experimental: {
        livolo: false,
        // json or attribute
        output: 'json',
    },
    advanced: {
        log_directory: path.join(data.getPath(), 'log', '%TIMESTAMP%'),
        log_level: process.env.DEBUG ? 'debug' : 'info',
        soft_reset_timeout: 0,
        pan_id: 0x1a62,
        ext_pan_id: [0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD],
        channel: 11,
        baudrate: 115200,
        rtscts: true,

        // Availability timeout in seconds, disabled by default.
        availability_timeout: 0,
        availability_blacklist: [],

        /**
         * Home Assistant requires ALL attributes to be present in ALL MQTT messages send by the device.
         * https://community.home-assistant.io/t/missing-value-with-mqtt-only-last-data-set-is-shown/47070/9
         *
         * Therefore zigbee2mqtt BY DEFAULT caches all values and resend it with every message.
         * advanced.cache_state in configuration.yaml allows to configure this.
         * https://www.zigbee2mqtt.io/configuration/configuration.html
         */
        cache_state: true,

        /**
         * Add a last_seen attribute to mqtt messages, contains date/time of zigbee message arrival
         * "ISO_8601": ISO 8601 format
         * "ISO_8601_local": Local ISO 8601 format (instead of UTC-based)
         * "epoch": milliseconds elapsed since the UNIX epoch
         * "disable": no last_seen attribute (default)
         */
        last_seen: 'disable',

        // Optional: Add an elapsed attribute to MQTT messages, contains milliseconds since the previous msg
        elapsed: false,

        /**
         * https://github.com/Koenkk/zigbee2mqtt/issues/685#issuecomment-449112250
         *
         * Network key will serve as the encryption key of your network.
         * Changing this will require you to repair your devices.
         */
        network_key: [1, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 10, 12, 13],

        /**
         * Enables reporting feature
         */
        report: false,
    },
};

let _settings;

const getSettings = () => _settings||(_settings = read());

function writeRead() {
    write();
    _settings = read();
    onChangeHandlers.forEach((handler) => handler());
}

function write() {
    const settings = getSettings();
    const toWrite = objectAssignDeep.noMutate(settings);

    // Read settings to check if we have to split devices/groups into seperate file.
    const actual = readYaml(file);
    if (typeof actual.devices === 'string') {
        writeYaml(data.joinPath(actual.devices), settings.devices);
        toWrite.devices = actual.devices;
    }

    if (typeof actual.groups === 'string') {
        writeYaml(data.joinPath(actual.groups), settings.groups);
        toWrite.groups = actual.groups;
    }

    writeYaml(file, toWrite);
}

function readYaml(file) {
    return yaml.safeLoad(fs.readFileSync(file, 'utf8'));
}

function writeYaml(file, content) {
    fs.writeFileSync(file, yaml.safeDump(content));
}

function read() {
    const s = readYaml(file);

    // Read devices/groups configuration from separate file.
    if (typeof s.devices === 'string') {
        const file = data.joinPath(s.devices);
        s.devices = fs.existsSync(file) ? readYaml(file) : null;
    }

    if (typeof s.groups === 'string') {
        const file = data.joinPath(s.groups);
        s.groups = fs.existsSync(file) ? readYaml(file) : null;
    }

    return s;
}

function set(path, value) {
    let obj = getSettings();

    for (let i = 0; i < path.length; i++) {
        const key = path[i];
        if (i === path.length - 1) {
            obj[key] = value;
        } else {
            if (!obj[key]) {
                obj[key] = {};
            }

            obj = obj[key];
        }
    }

    writeRead();
}

const getDevice = (ieeeAddr) => {
    const settings = getSettings();
    return settings.devices ? settings.devices[ieeeAddr] : null;
};

const getGroup = (ID) => {
    const settings = getSettings();
    return settings.groups ? settings.groups[ID]: null;
};

const getDevices = () => {
    const settings = getSettings();
    return settings.devices ? settings.devices : [];
};

function addDevice(ieeeAddr) {
    const settings = getSettings();
    if (!settings.devices) {
        settings.devices = {};
    }

    settings.devices[ieeeAddr] = {friendly_name: ieeeAddr, retain: false};
    writeRead();
}

function removeDevice(ieeeAddr) {
    const settings = getSettings();
    if (settings.devices && settings.devices[ieeeAddr]) {
        delete settings.devices[ieeeAddr];
        writeRead();
    }
}

function getIeeeAddrByFriendlyName(friendlyName) {
    const settings = getSettings();
    if (!settings.devices) {
        return null;
    }

    return Object.keys(settings.devices).find((ieeeAddr) =>
        settings.devices[ieeeAddr].friendly_name === friendlyName
    );
}

function getGroupIDByFriendlyName(friendlyName) {
    const settings = getSettings();
    if (!settings.groups) {
        return null;
    }

    return Object.keys(settings.groups).find((ID) =>
        settings.groups[ID].friendly_name === friendlyName
    );
}

function changeDeviceOptions(ieeeAddr, newOptions) {
    const settings = getSettings();
    const currentOptions = settings.devices[ieeeAddr];

    if (!currentOptions) {
        return;
    }

    Object.keys(currentOptions).forEach((key) => {
        if (newOptions[key]) {
            currentOptions[key] = newOptions[key];
        }
    });

    writeRead();
}

function changeFriendlyName(old, new_) {
    const settings = getSettings();
    const ieeeAddr = getIeeeAddrByFriendlyName(old);

    if (!ieeeAddr) {
        return false;
    }

    settings.devices[ieeeAddr].friendly_name = new_;
    writeRead();
    return true;
}

// An entity can be either a group or a device.
function resolveEntity(ID) {
    let type = null;
    let friendlyName = null;

    if (module.exports.getIeeeAddrByFriendlyName(ID)) {
        // Check if the ID is a friendly_name of a device.
        friendlyName = ID;
        ID = module.exports.getIeeeAddrByFriendlyName(ID);
        type = 'device';
    } else if (module.exports.getGroupIDByFriendlyName(ID)) {
        // Check if the ID is a friendly_name of a group.
        friendlyName = ID;
        ID = Number(module.exports.getGroupIDByFriendlyName(ID));
        type = 'group';
    } else if (module.exports.getGroup(ID)) {
        friendlyName = module.exports.getGroup(ID).friendly_name;
        ID = Number(ID);
        type = 'group';
    } else {
        // By default it is a device with ID as ID.
        type = 'device';
        const device = module.exports.getDevice(ID);
        friendlyName = device ? device.friendly_name : ID;
    }

    return {ID: ID, type: type, friendlyName: friendlyName};
}

module.exports = {
    get: () => objectAssignDeep.noMutate(defaults, getSettings()),
    write: () => write(),
    set: (path, value) => set(path, value),

    getDevice,
    getGroup,
    getDevices,
    addDevice: (ieeeAddr) => addDevice(ieeeAddr),
    removeDevice: (ieeeAddr) => removeDevice(ieeeAddr),

    getIeeeAddrByFriendlyName: (friendlyName) => getIeeeAddrByFriendlyName(friendlyName),
    getGroupIDByFriendlyName: (friendlyName) => getGroupIDByFriendlyName(friendlyName),
    changeFriendlyName: (old, new_) => changeFriendlyName(old, new_),
    changeDeviceOptions: (ieeeAddr, options) => changeDeviceOptions(ieeeAddr, options),
    resolveEntity,

    addOnChangeHandler: (handler) => onChangeHandlers.push(handler),

    // For test
    _getDefaults: () => {
        return objectAssignDeep.noMutate(defaults);
    },
    _clear: () => _settings = undefined,
};
