const data = require('./data');
const file = data.joinPath('configuration.yaml');
const objectAssignDeep = require(`object-assign-deep`);
const path = require('path');
const yaml = require('./yaml');
const onChangeHandlers = [];

const defaults = {
    whitelist: [],
    ban: [],
    permit_join: false,
    mqtt: {
        include_device_information: false,
    },
    devices: {},
    groups: {},
    device_options: {},
    map_options: {
        graphviz: {
            colors: {
                fill: {
                    enddevice: '#fff8ce',
                    coordinator: '#e04e5d',
                    router: '#4ea3e0',
                },
                font: {
                    coordinator: '#ffffff',
                    router: '#ffffff',
                    enddevice: '#000000',
                },
                line: {
                    active: '#009900',
                    inactive: '#994444',
                },
            },
        },
    },
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

        /**
         * Home Assistant discovery topic
         */
        homeassistant_discovery_topic: 'homeassistant',

        /**
         * Home Assistant status topic
         */
        homeassistant_status_topic: 'hass/status',
    },
};

let _settings;
let _settingsWithDefaults;

function write() {
    const settings = get();
    const toWrite = objectAssignDeep.noMutate(settings);

    // Read settings to check if we have to split devices/groups into separate file.
    const actual = yaml.read(file);
    if (typeof actual.devices === 'string') {
        yaml.write(data.joinPath(actual.devices), settings.devices);
        toWrite.devices = actual.devices;
    }

    if (typeof actual.groups === 'string') {
        yaml.write(data.joinPath(actual.groups), settings.groups);
        toWrite.groups = actual.groups;
    }

    yaml.write(file, toWrite);

    _settings = read();
    _settingsWithDefaults = objectAssignDeep.noMutate(defaults, get());
    onChangeHandlers.forEach((handler) => handler());
}

function read() {
    const s = yaml.read(file);

    // Read devices/groups configuration from separate file.
    if (typeof s.devices === 'string') {
        const file = data.joinPath(s.devices);
        s.devices = yaml.readIfExists(file);
    }

    if (typeof s.groups === 'string') {
        const file = data.joinPath(s.groups);
        s.groups = yaml.readIfExists(file);
    }

    return s;
}

function get() {
    if (!_settings) {
        _settings = read();
    }

    return _settings;
}

function getWithDefaults() {
    if (!_settingsWithDefaults) {
        _settingsWithDefaults = objectAssignDeep.noMutate(defaults, get());
    }

    return _settingsWithDefaults;
}

function set(path, value) {
    let settings = get();

    for (let i = 0; i < path.length; i++) {
        const key = path[i];
        if (i === path.length - 1) {
            settings[key] = value;
        } else {
            if (!settings[key]) {
                settings[key] = {};
            }

            settings = settings[key];
        }
    }

    write();
}

function getGroup(IDorName) {
    const settings = getWithDefaults();
    const byID = settings.groups[IDorName];
    if (byID) {
        return {...byID, ID: Number(IDorName), friendlyName: byID.friendly_name};
    }

    for (const [ID, group] of Object.entries(settings.groups)) {
        if (group.friendly_name === IDorName) {
            return {...group, ID: Number(ID), friendlyName: group.friendly_name};
        }
    }

    return null;
}

function getGroups() {
    const settings = getWithDefaults();
    return Object.entries(settings.groups).map(([ID, group]) => {
        return {...group, ID: Number(ID), friendlyName: group.friendly_name};
    });
}

function getGroupThrowIfNotExists(IDorName) {
    const group = getGroup(IDorName);
    if (!group) {
        throw new Error(`Group '${IDorName}' does not exist`);
    }

    return group;
}

function getDevice(IDorName) {
    const settings = getWithDefaults();
    const byID = settings.devices[IDorName];
    if (byID) {
        return {...byID, ID: IDorName, friendlyName: byID.friendly_name};
    }

    for (const [ID, device] of Object.entries(settings.devices)) {
        if (device.friendly_name === IDorName) {
            return {...device, ID, friendlyName: device.friendly_name};
        }
    }

    return null;
}

function getDeviceThrowIfNotExists(IDorName) {
    const device = getDevice(IDorName);
    if (!device) {
        throw new Error(`Device '${IDorName}' does not exist`);
    }

    return device;
}

function getEntity(IDorName) {
    const device = getDevice(IDorName);
    if (device) {
        return {...device, type: 'device'};
    }

    const group = getGroup(IDorName);
    if (group) {
        return {...group, type: 'group'};
    }

    return null;
}

function addDevice(ID) {
    if (getDevice(ID)) {
        throw new Error(`Device '${ID}' already exists`);
    }

    const settings = get();

    if (!settings.devices) {
        settings.devices = {};
    }

    settings.devices[ID] = {friendly_name: ID, retain: false};
    write();
    return settings.devices[ID];
}

function whitelistDevice(ID) {
    const settings = get();
    if (!settings.whitelist) {
        settings.whitelist = [];
    }

    if (settings.whitelist.includes(ID)) {
        throw new Error(`Device '${ID}' already whitelisted`);
    }

    settings.whitelist.push(ID);
    write();
}

function banDevice(ID) {
    const settings = get();
    if (!settings.ban) {
        settings.ban = [];
    }

    settings.ban.push(ID);
    write();
}

function removeDevice(IDorName) {
    const device = getDeviceThrowIfNotExists(IDorName);
    const settings = get();
    delete settings.devices[device.ID];
    write();
}

function addGroup(name) {
    if (getGroup(name)) {
        throw new Error(`Group '${name}' already exists`);
    }

    const settings = get();
    if (!settings.groups) {
        settings.groups = {};
    }

    let ID = '1';
    while (settings.groups.hasOwnProperty(ID)) {
        ID = (Number.parseInt(ID) + 1).toString();
    }

    settings.groups[ID] = {friendly_name: name};
    write();
}

function addDeviceToGroup(groupIDorName, deviceIDorName) {
    const groupID = getGroupThrowIfNotExists(groupIDorName).ID;
    const device = getDeviceThrowIfNotExists(deviceIDorName);
    const settings = get();

    const group = settings.groups[groupID];
    if (!group.devices) {
        group.devices = [];
    }

    if (!group.devices.includes(device.ID)) {
        group.devices.push(device.ID);
        write();
    }
}

function removeDeviceFromGroup(groupIDorName, deviceIDorName) {
    const groupID = getGroupThrowIfNotExists(groupIDorName).ID;
    const device = getDeviceThrowIfNotExists(deviceIDorName);
    const settings = get();

    const group = settings.groups[groupID];
    if (group.devices && group.devices.includes(device.ID)) {
        group.devices = group.devices.filter((d) => d != device.ID);
        write();
    }
}

function removeGroup(groupIDorName) {
    const groupID = getGroupThrowIfNotExists(groupIDorName).ID;
    const settings = get();
    delete settings.groups[groupID];
    write();
}

function changeDeviceOptions(IDorName, newOptions) {
    const device = getDevice(IDorName);
    const settings = get();
    const currentOptions = settings.devices[device.ID];

    if (currentOptions) {
        Object.keys(currentOptions).forEach((key) => {
            if (newOptions[key]) {
                currentOptions[key] = newOptions[key];
            }
        });

        write();
    }
}

function changeFriendlyName(IDorName, newName) {
    const device = getDeviceThrowIfNotExists(IDorName);
    const settings = get();
    settings.devices[device.ID].friendly_name = newName;
    write();
}

function addOnChangeHandler(handler) {
    onChangeHandlers.push(handler);
}


module.exports = {
    get: getWithDefaults,
    set,
    getDevice,
    getGroup,
    getGroups,
    getEntity,
    whitelistDevice,
    banDevice,
    addDevice,
    removeDevice,
    addGroup,
    removeGroup,
    addDeviceToGroup,
    removeDeviceFromGroup,
    changeDeviceOptions,
    addOnChangeHandler,
    changeFriendlyName,
};
