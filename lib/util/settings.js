const data = require('./data');
const utils = require('./utils');
const file = process.env.ZIGBEE2MQTT_CONFIG || data.joinPath('configuration.yaml');
const objectAssignDeep = require(`object-assign-deep`);
const path = require('path');
const yaml = require('./yaml');
const Ajv = require('ajv');
const ajv = new Ajv({allErrors: true});

const defaults = {
    whitelist: [],
    ban: [],
    permit_join: false,
    mqtt: {
        include_device_information: false,
    },
    serial: {
        disable_led: false,
    },
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
        // json or attribute or attribute_and_json
        output: 'json',
    },
    advanced: {
        log_output: ['console', 'file'],
        log_directory: path.join(data.getPath(), 'log', '%TIMESTAMP%'),
        log_file: 'log.txt',
        log_level: /* istanbul ignore next */ process.env.DEBUG ? 'debug' : 'info',
        soft_reset_timeout: 0,
        pan_id: 0x1a62,
        ext_pan_id: [0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD],
        channel: 11,
        baudrate: 115200,
        rtscts: true,

        // Availability timeout in seconds, disabled by default.
        availability_timeout: 0,
        availability_blacklist: [],
        availability_whitelist: [],

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

        /**
         * Configurable timestampFormat
         * https://github.com/Koenkk/zigbee2mqtt/commit/44db557a0c83f419d66755d14e460cd78bd6204e
         */
        timestamp_format: 'YYYY-MM-DD HH:mm:ss',
    },
};

const schema = {
    type: 'object',
    properties: {
        homeassistant: {type: 'boolean'},
        permit_join: {type: 'boolean'},
        mqtt: {
            type: 'object',
            properties: {
                base_topic: {type: 'string'},
                server: {type: 'string'},
                keepalive: {type: 'number'},
                ca: {type: 'string'},
                key: {type: 'string'},
                cert: {type: 'string'},
                user: {type: 'string'},
                password: {type: 'string'},
                client_id: {type: 'string'},
                reject_unauthorized: {type: 'boolean'},
                include_device_information: {type: 'boolean'},
            },
            required: ['base_topic', 'server'],
        },
        serial: {
            type: 'object',
            properties: {
                port: {type: ['string', 'null']},
                disable_led: {type: 'boolean'},
            },
        },
        ban: {type: 'array', items: {type: 'string'}},
        whitelist: {type: 'array', items: {type: 'string'}},
        experimental: {
            type: 'object',
            properties: {
                transmit_power: {type: 'number'},
            },
        },
        advanced: {
            type: 'object',
            properties: {
                pan_id: {type: 'number'},
                ext_pan_id: {type: 'array', items: {type: 'number'}},
                channel: {type: 'number', minimum: 11, maximum: 26},
                cache_state: {type: 'boolean'},
                log_level: {type: 'string', enum: ['info', 'warn', 'error', 'debug']},
                log_output: {type: 'array', items: {type: 'string'}},
                log_directory: {type: 'string'},
                log_file: {type: 'string'},
                baudrate: {type: 'number'},
                rtscts: {type: 'boolean'},
                soft_reset_timeout: {type: 'number', minimum: 0},
                network_key: {type: 'array', items: {type: 'number'}},
                last_seen: {type: 'string', enum: ['disable', 'ISO_8601', 'ISO_8601_local', 'epoch']},
                elapsed: {type: 'boolean'},
                availability_timeout: {type: 'number', minimum: 0},
                availability_blacklist: {type: 'array', items: {type: 'string'}},
                availability_whitelist: {type: 'array', items: {type: 'string'}},
                report: {type: 'boolean'},
                homeassistant_discovery_topic: {type: 'string'},
                homeassistant_status_topic: {type: 'string'},
                timestamp_format: {type: 'string'},
            },
        },
        map_options: {
            type: 'object',
            properties: {
                graphviz: {
                    type: 'object',
                    properties: {
                        colors: {
                            type: 'object',
                            properties: {
                                fill: {
                                    type: 'object',
                                    properties: {
                                        enddevice: {type: 'string'},
                                        coordinator: {type: 'string'},
                                        router: {type: 'string'},
                                    },
                                },
                                font: {
                                    type: 'object',
                                    properties: {
                                        enddevice: {type: 'string'},
                                        coordinator: {type: 'string'},
                                        router: {type: 'string'},
                                    },
                                },
                                line: {
                                    type: 'object',
                                    properties: {
                                        active: {type: 'string'},
                                        inactive: {type: 'string'},
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        devices: {
            type: 'object',
            propertyNames: {
                pattern: '^0x[\\d\\w]{16}$',
            },
            patternProperties: {
                '^.*$': {
                    type: 'object',
                    properties: {
                        friendly_name: {type: 'string'},
                        retain: {type: 'boolean'},
                        qos: {type: 'number'},
                    },
                    required: ['friendly_name'],
                },
            },
        },
        groups: {
            type: 'object',
            propertyNames: {
                pattern: '^[\\w].*$',
            },
            patternProperties: {
                '^.*$': {
                    type: 'object',
                    properties: {
                        friendly_name: {type: 'string'},
                        retain: {type: 'boolean'},
                        devices: {type: 'array', items: {type: 'string'}},
                        optimistic: {type: 'boolean'},
                        qos: {type: 'number'},
                    },
                    required: ['friendly_name'],
                },
            },
        },
    },
    required: ['homeassistant', 'permit_join', 'mqtt'],
};


let _settings;
let _settingsWithDefaults;

function write() {
    const settings = get();
    const toWrite = objectAssignDeep.noMutate(settings);

    // Read settings to check if we have to split devices/groups into separate file.
    const actual = yaml.read(file);
    if (actual.mqtt && actual.mqtt.password && actual.mqtt.user) {
        toWrite.mqtt.user = actual.mqtt.user;
        toWrite.mqtt.password = actual.mqtt.password;
    }

    if (actual.advanced && actual.advanced.network_key) {
        toWrite.advanced.network_key = actual.advanced.network_key;
    }

    if (typeof actual.devices === 'string') {
        yaml.writeIfChanged(data.joinPath(actual.devices), settings.devices);
        toWrite.devices = actual.devices;
    }

    if (typeof actual.groups === 'string') {
        yaml.writeIfChanged(data.joinPath(actual.groups), settings.groups);
        toWrite.groups = actual.groups;
    }

    yaml.writeIfChanged(file, toWrite);

    _settings = read();
    _settingsWithDefaults = objectAssignDeep.noMutate(defaults, get());
}

function validate() {
    const validate = ajv.compile(schema);
    const valid = validate(_settings);
    const postfixes = utils.getPostfixes();

    // Verify that all friendly names are unique
    const names = [];
    const check = (name) => {
        if (names.includes(name)) throw new Error(`Duplicate friendly_name '${name}' found`);
        if (postfixes.includes(name)) throw new Error(`Following friendly_name are not allowed: '${postfixes}'`);
        names.push(name);
    };
    Object.values(_settingsWithDefaults.devices).forEach((d) => check(d.friendly_name));
    Object.values(_settingsWithDefaults.groups).forEach((g) => check(g.friendly_name));

    return !valid ? validate.errors.map((v) => `${v.dataPath.substring(1)} ${v.message}`) : null;
}

function read() {
    const s = yaml.read(file);

    // Read !secret MQTT username and password if set
    const interpetValue = (value) => {
        const re = /!(.*) (.*)/g;
        const match = re.exec(value);
        if (match) {
            const file = data.joinPath(`${match[1]}.yaml`);
            const key = match[2];
            return yaml.read(file)[key];
        } else {
            return value;
        }
    };

    if (s.mqtt && s.mqtt.user && s.mqtt.password) {
        s.mqtt.user = interpetValue(s.mqtt.user);
        s.mqtt.password = interpetValue(s.mqtt.password);
    }

    if (s.advanced && s.advanced.network_key) {
        s.advanced.network_key = interpetValue(s.advanced.network_key);
    }

    // Read devices/groups configuration from separate file.
    if (typeof s.devices === 'string') {
        const file = data.joinPath(s.devices);
        s.devices = yaml.readIfExists(file) || {};
    }

    if (typeof s.groups === 'string') {
        const file = data.joinPath(s.groups);
        s.groups = yaml.readIfExists(file) || {};
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

    if (!_settingsWithDefaults.devices) {
        _settingsWithDefaults.devices = {};
    }

    if (!_settingsWithDefaults.groups) {
        _settingsWithDefaults.groups = {};
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
        return {optimistic: true, devices: [], ...byID, ID: Number(IDorName), friendlyName: byID.friendly_name};
    }

    for (const [ID, group] of Object.entries(settings.groups)) {
        if (group.friendly_name === IDorName) {
            return {optimistic: true, devices: [], ...group, ID: Number(ID), friendlyName: group.friendly_name};
        }
    }

    return null;
}

function getGroups() {
    const settings = getWithDefaults();
    return Object.entries(settings.groups).map(([ID, group]) => {
        return {optimistic: true, devices: [], ...group, ID: Number(ID), friendlyName: group.friendly_name};
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

    settings.devices[ID] = {friendly_name: ID};
    write();
    return getDevice(ID);
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

function addGroup(name, ID=null) {
    if (getGroup(name) || getDevice(name)) {
        throw new Error(`friendly_name '${name}' is already in use`);
    }

    const settings = get();
    if (!settings.groups) {
        settings.groups = {};
    }

    if (ID == null) {
        // look for free ID
        ID = '1';
        while (settings.groups.hasOwnProperty(ID)) {
            ID = (Number.parseInt(ID) + 1).toString();
        }
    } else {
        // ensure provided ID is not in use
        ID = ID.toString();
        if (settings.groups.hasOwnProperty(ID)) {
            throw new Error(`group id '${ID}' is already in use`);
        }
    }

    settings.groups[ID] = {friendly_name: name};
    write();

    return getGroup(ID);
}

function groupHasDevice(group, keys) {
    for (const device of group.devices) {
        const index = keys.indexOf(device);
        if (index != -1) {
            return keys[index];
        }
    }

    return false;
}

function addDeviceToGroup(groupIDorName, keys) {
    const groupID = getGroupThrowIfNotExists(groupIDorName).ID;
    const settings = get();

    const group = settings.groups[groupID];
    if (!group.devices) {
        group.devices = [];
    }

    if (!groupHasDevice(group, keys)) {
        group.devices.push(keys[0]);
        write();
    }
}

function removeDeviceFromGroup(groupIDorName, keys) {
    const groupID = getGroupThrowIfNotExists(groupIDorName).ID;
    const settings = get();
    const group = settings.groups[groupID];

    const key = groupHasDevice(group, keys);
    if (key) {
        group.devices = group.devices.filter((d) => d != key);
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
    const device = getDeviceThrowIfNotExists(IDorName);
    const settings = get();
    const currentOptions = settings.devices[device.ID];

    Object.keys(currentOptions).forEach((key) => {
        if (newOptions[key]) {
            currentOptions[key] = newOptions[key];
        }
    });

    write();
}

function changeFriendlyName(IDorName, newName) {
    if (getGroup(newName) || getDevice(newName)) {
        throw new Error(`friendly_name '${newName}' is already in use`);
    }

    const device = getDeviceThrowIfNotExists(IDorName);
    const settings = get();
    settings.devices[device.ID].friendly_name = newName;
    write();
}

module.exports = {
    validate,
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
    changeFriendlyName,

    // For tests only
    _write: write,
    _reRead: () => {
        _settings = read();
        _settingsWithDefaults = objectAssignDeep.noMutate(defaults, get());
    },
    _getDefaults: () => defaults,
};
