import data from './data';
import * as utils from './utils';
import objectAssignDeep from 'object-assign-deep';
import path from 'path';
import * as yaml from './yaml';
import Ajv from 'ajv';
import schemaJson from './settings.schema.json';
export const schema = schemaJson;

// DEPRECATED ZIGBEE2MQTT_CONFIG: https://github.com/Koenkk/zigbee2mqtt/issues/4697
const file = process.env.ZIGBEE2MQTT_CONFIG ?? data.joinPath('configuration.yaml');
const ajvSetting = new Ajv({allErrors: true}).addKeyword('requiresRestart').compile(schema);
const ajvRestartRequired = new Ajv({allErrors: true})
    .addKeyword({keyword: 'requiresRestart', validate: (schema: unknown) => !schema}).compile(schema);

const defaults: Settings = {
    passlist: [],
    blocklist: [],
    // Deprecated: use block/passlist
    whitelist: [],
    ban: [],
    permit_join: false,
    mqtt: {
        include_device_information: false,
        /**
         * Configurable force disable retain flag on mqtt publish.
         * https://github.com/Koenkk/zigbee2mqtt/pull/4948
         */
        force_disable_retain: false,
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
        legacy_api: true,
        log_rotation: true,
        log_symlink_current: false,
        log_output: ['console', 'file'],
        log_directory: path.join(data.getPath(), 'log', '%TIMESTAMP%'),
        log_file: 'log.txt',
        log_level: /* istanbul ignore next */ process.env.DEBUG ? 'debug' : 'info',
        log_syslog: {},
        soft_reset_timeout: 0,
        pan_id: 0x1a62,
        ext_pan_id: [0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD],
        channel: 11,
        adapter_concurrent: null,
        adapter_delay: null,

        // Availability timeout in seconds, disabled by default.
        availability_timeout: 0,
        availability_blocklist: [],
        availability_passlist: [],
        // Deprecated, use block/passlist
        availability_blacklist: [],
        availability_whitelist: [],

        /**
         * Home Assistant requires ALL attributes to be present in ALL MQTT messages send by the device.
         * https://community.home-assistant.io/t/missing-value-with-mqtt-only-last-data-set-is-shown/47070/9
         *
         * Therefore Zigbee2MQTT BY DEFAULT caches all values and resend it with every message.
         * advanced.cache_state in configuration.yaml allows to configure this.
         * https://www.zigbee2mqtt.io/configuration/configuration.html
         */
        cache_state: true,
        cache_state_persistent: true,
        cache_state_send_on_startup: true,

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
         * Home Assistant legacy entity attributes, when enabled:
         * Zigbee2MQTT will send additional states as attributes with each entity.
         * For example, A temperature & humidity sensor will have 2 entities for
         * the temperature and humidity, with this setting enabled both entities
         * will also have an temperature and humidity attribute.
         */
        homeassistant_legacy_entity_attributes: true,

        /**
         * Home Assistant legacy triggers, when enabled:
         * - Zigbee2mqt will send an empty 'action' or 'click' after one has been send
         * - A 'sensor_action' and 'sensor_click' will be discoverd
         */
        homeassistant_legacy_triggers: true,

        /**
         * Configurable timestampFormat
         * https://github.com/Koenkk/zigbee2mqtt/commit/44db557a0c83f419d66755d14e460cd78bd6204e
         */
        timestamp_format: 'YYYY-MM-DD HH:mm:ss',
    },
    ota: {
        /**
         * Minimal time delta in minutes between polling third party server for potential firmware updates
         */
        update_check_interval: 24 * 60,
        /**
         * Completely disallow Zigbee devices to initiate a search for a potential firmware update.
         * If set to true, only a user-initiated update search will be possible.
         */
        disable_automatic_update_check: false,
    },
    external_converters: [],
};

let _settings: Partial<Settings>;
let _settingsWithDefaults: Settings;

function write(): void {
    const settings = getInternalSettings();
    /* eslint-disable-line */ // @ts-ignore
    const toWrite = objectAssignDeep.noMutate(settings);

    // Read settings to check if we have to split devices/groups into separate file.
    const actual = yaml.read(file);

    // In case the setting is defined in a separte file (e.g. !secret network_key) update it there.
    for (const path of [
        ['mqtt', 'user'],
        ['mqtt', 'password'],
        ['advanced', 'network_key'],
        ['frontend', 'auth_token'],
    ]) {
        if (actual[path[0]] && actual[path[0]][path[1]]) {
            const match = /!(.*) (.*)/g.exec(actual[path[0]][path[1]]);
            if (match) {
                yaml.updateIfChanged(data.joinPath(`${match[1]}.yaml`), match[2], toWrite[path[0]][path[1]]);
                toWrite[path[0]][path[1]] = actual[path[0]][path[1]];
            }
        }
    }

    // Write devices/groups to separate file if required.
    const writeDevicesOrGroups = (type: 'devices' | 'groups'): void => {
        if (typeof actual[type] === 'string' || Array.isArray(actual[type])) {
            const fileToWrite = Array.isArray(actual[type]) ? actual[type][0] : actual[type];
            /* eslint-disable-line */ // @ts-ignore
            const content = objectAssignDeep.noMutate(settings[type]);

            // If an array, only write to first file and only devices which are not in the other files.
            if (Array.isArray(actual[type])) {
                actual[type].filter((f: string, i: number) => i !== 0)
                    .map((f: string) => yaml.readIfExists(data.joinPath(f), {}))
                    .map((c: KeyValue) => Object.keys(c))
                    .forEach((k: string) => delete content[k]);
            }

            yaml.writeIfChanged(data.joinPath(fileToWrite), content);
            toWrite[type] = actual[type];
        }
    };

    writeDevicesOrGroups('devices');
    writeDevicesOrGroups('groups');

    yaml.writeIfChanged(file, toWrite);

    _settings = read();
    /* eslint-disable-line */ // @ts-ignore
    _settingsWithDefaults = objectAssignDeep.noMutate(defaults, getInternalSettings());
}

export function validate(): string[] {
    try {
        getInternalSettings();
    } catch (error) {
        if (error.name === 'YAMLException') {
            return [
                `Your YAML file: '${error.file}' is invalid ` +
                `(use https://jsonformatter.org/yaml-validator to find and fix the issue)`,
            ];
        }

        return [error.message];
    }

    if (!ajvSetting(_settings)) {
        return ajvSetting.errors.map((v) => `${v.instancePath.substring(1)} ${v.message}`);
    }

    const errors = [];
    if (_settings.advanced && _settings.advanced.network_key && typeof _settings.advanced.network_key === 'string' &&
        _settings.advanced.network_key !== 'GENERATE') {
        errors.push(`advanced.network_key: should be array or 'GENERATE' (is '${_settings.advanced.network_key}')`);
    }

    if (_settings.advanced && _settings.advanced.pan_id && typeof _settings.advanced.pan_id === 'string' &&
        _settings.advanced.pan_id !== 'GENERATE') {
        errors.push(`advanced.pan_id: should be number or 'GENERATE' (is '${_settings.advanced.pan_id}')`);
    }

    // Verify that all friendly names are unique
    const names: string[] = [];
    const check = (name: string): void => {
        if (names.includes(name)) errors.push(`Duplicate friendly_name '${name}' found`);
        errors.push(...utils.validateFriendlyName(name));
        names.push(name);
    };

    const settingsWithDefaults = get();
    Object.values(settingsWithDefaults.devices).forEach((d) => check(d.friendly_name));
    Object.values(settingsWithDefaults.groups).forEach((g) => check(g.friendly_name));

    if (settingsWithDefaults.mqtt.version !== 5) {
        for (const device of Object.values(settingsWithDefaults.devices)) {
            if (device.retention) {
                errors.push('MQTT retention requires protocol version 5');
            }
        }
    }

    const checkAvailabilityList = (list: string[], type: string): void => {
        list.forEach((e) => {
            if (!getEntity(e)) {
                errors.push(`Non-existing entity '${e}' specified in '${type}'`);
            }
        });
    };

    checkAvailabilityList(settingsWithDefaults.advanced.availability_blacklist, 'availability_blacklist');
    checkAvailabilityList(settingsWithDefaults.advanced.availability_whitelist, 'availability_whitelist');
    checkAvailabilityList(settingsWithDefaults.advanced.availability_blocklist, 'availability_blocklist');
    checkAvailabilityList(settingsWithDefaults.advanced.availability_passlist, 'availability_passlist');

    return errors;
}

function read(): Settings {
    const s = yaml.read(file) as Settings;

    // Read !secret MQTT username and password if set
    // eslint-disable-next-line
    const interpetValue = (value: any): any => {
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

    if (s.mqtt?.user && s.mqtt?.password) {
        s.mqtt.user = interpetValue(s.mqtt.user);
        s.mqtt.password = interpetValue(s.mqtt.password);
    }

    if (s.advanced?.network_key) {
        s.advanced.network_key = interpetValue(s.advanced.network_key);
    }

    if (s.frontend?.auth_token) {
        s.frontend.auth_token = interpetValue(s.frontend.auth_token);
    }

    // Read devices/groups configuration from separate file if specified.
    const readDevicesOrGroups = (type: 'devices' | 'groups'): void => {
        if (typeof s[type] === 'string' || Array.isArray(s[type])) {
            /* eslint-disable-line */ // @ts-ignore
            const files: string[] = Array.isArray(s[type]) ? s[type] : [s[type]];
            s[type] = {};
            for (const file of files) {
                const content = yaml.readIfExists(data.joinPath(file), {});
                /* eslint-disable-line */ // @ts-ignore
                s[type] = objectAssignDeep.noMutate(s[type], content);
            }
        }
    };

    readDevicesOrGroups('devices');
    readDevicesOrGroups('groups');

    return s;
}

function applyEnvironmentVariables(settings: Partial<Settings>): void {
    const iterate = (obj: KeyValue, path: string[]): void => {
        Object.keys(obj).forEach((key) => {
            if (key !== 'type') {
                if (key !== 'properties' && obj[key]) {
                    const type = (obj[key].type || 'object').toString();
                    const envPart = path.reduce((acc, val) => `${acc}${val}_`, '');
                    const envVariableName = (`ZIGBEE2MQTT_CONFIG_${envPart}${key}`).toUpperCase();
                    if (process.env[envVariableName]) {
                        const setting = path.reduce((acc, val) => {
                            /* eslint-disable-line */ // @ts-ignore
                            acc[val] = acc[val] || {};
                            /* eslint-disable-line */ // @ts-ignore
                            return acc[val];
                        }, settings);

                        if (type.indexOf('object') >= 0 || type.indexOf('array') >= 0) {
                            setting[key] = JSON.parse(process.env[envVariableName]);
                        } else if (type.indexOf('number') >= 0) {
                            /* eslint-disable-line */ // @ts-ignore
                            setting[key] = process.env[envVariableName] * 1;
                        } else if (type.indexOf('boolean') >= 0) {
                            setting[key] = process.env[envVariableName].toLowerCase() === 'true';
                        } else {
                            /* istanbul ignore else */
                            if (type.indexOf('string') >= 0) {
                                setting[key] = process.env[envVariableName];
                            }
                        }
                    }
                }

                if (typeof obj[key] === 'object' && obj[key]) {
                    const newPath = [...path];
                    if (key !== 'properties') {
                        newPath.push(key);
                    }
                    iterate(obj[key], newPath);
                }
            }
        });
    };
    iterate(schema.properties, []);
}

function getInternalSettings(): Partial<Settings> {
    if (!_settings) {
        _settings = read();
        applyEnvironmentVariables(_settings);
    }

    return _settings;
}

export function get(): Settings {
    if (!_settingsWithDefaults) {
        /* eslint-disable-line */ // @ts-ignore
        _settingsWithDefaults = objectAssignDeep.noMutate(defaults, getInternalSettings());
    }

    if (!_settingsWithDefaults.devices) {
        _settingsWithDefaults.devices = {};
    }

    if (!_settingsWithDefaults.groups) {
        _settingsWithDefaults.groups = {};
    }

    return _settingsWithDefaults;
}

export function set(path: string[], value: string | number | boolean | KeyValue): void {
    /* eslint-disable-next-line */
    let settings: any = getInternalSettings();

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

export function apply(newSettings: Record<string, unknown>): boolean {
    ajvSetting(newSettings);
    const errors = ajvSetting.errors && ajvSetting.errors.filter((e) => e.keyword !== 'required');
    if (errors.length) {
        const error = errors[0];
        throw new Error(`${error.instancePath.substring(1)} ${error.message}`);
    }

    getInternalSettings(); // Ensure _settings is intialized.
    /* eslint-disable-line */ // @ts-ignore
    _settings = objectAssignDeep.noMutate(_settings, newSettings);
    write();

    ajvRestartRequired(newSettings);
    const restartRequired = ajvRestartRequired.errors &&
        !!ajvRestartRequired.errors.find((e) => e.keyword === 'requiresRestart');
    return restartRequired;
}

export function getGroup(IDorName: string): GroupSettings {
    const settings = get();
    const byID = settings.groups[IDorName];
    if (byID) {
        return {devices: [], ...byID, ID: Number(IDorName), friendlyName: byID.friendly_name};
    }

    for (const [ID, group] of Object.entries(settings.groups)) {
        if (group.friendly_name === IDorName) {
            return {devices: [], ...group, ID: Number(ID), friendlyName: group.friendly_name};
        }
    }

    return null;
}

export function getGroups(): GroupSettings[] {
    const settings = get();
    return Object.entries(settings.groups).map(([ID, group]) => {
        return {devices: [], ...group, ID: Number(ID), friendlyName: group.friendly_name};
    });
}

function getGroupThrowIfNotExists(IDorName: string): GroupSettings {
    const group = getGroup(IDorName);
    if (!group) {
        throw new Error(`Group '${IDorName}' does not exist`);
    }

    return group;
}

export function getDevice(IDorName: string): DeviceSettings {
    const settings = get();
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

function getDeviceThrowIfNotExists(IDorName: string): DeviceSettings {
    const device = getDevice(IDorName);
    if (!device) {
        throw new Error(`Device '${IDorName}' does not exist`);
    }

    return device;
}

export function getEntity(IDorName: string): EntitySettings {
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

export function addDevice(ID: string): DeviceSettings {
    if (getDevice(ID)) {
        throw new Error(`Device '${ID}' already exists`);
    }

    const settings = getInternalSettings();

    if (!settings.devices) {
        settings.devices = {};
    }

    settings.devices[ID] = {friendly_name: ID};
    write();
    return getDevice(ID);
}

export function whitelistDevice(ID: string): void {
    const settings = getInternalSettings();
    if (!settings.whitelist) {
        settings.whitelist = [];
    }

    if (settings.whitelist.includes(ID)) {
        throw new Error(`Device '${ID}' already whitelisted`);
    }

    settings.whitelist.push(ID);
    write();
}

export function blockDevice(ID: string): void {
    const settings = getInternalSettings();
    if (!settings.blocklist) {
        settings.blocklist = [];
    }

    settings.blocklist.push(ID);
    write();
}

export function banDevice(ID: string): void {
    const settings = getInternalSettings();
    if (!settings.ban) {
        settings.ban = [];
    }

    settings.ban.push(ID);
    write();
}

export function removeDevice(IDorName: string): void {
    const device = getDeviceThrowIfNotExists(IDorName);
    const settings = getInternalSettings();
    delete settings.devices[device.ID];

    // Remove device from groups
    if (settings.groups) {
        const regex =
            new RegExp(`^(${device.friendlyName}|${device.ID})(/(\\d|${utils.endpointNames.join('|')}))?$`);
        for (const group of Object.values(settings.groups).filter((g) => g.devices)) {
            group.devices = group.devices.filter((device) => !device.match(regex));
        }
    }

    write();
}

export function addGroup(name: string, ID?: string): GroupSettings {
    utils.validateFriendlyName(name, true);
    if (getGroup(name) || getDevice(name)) {
        throw new Error(`friendly_name '${name}' is already in use`);
    }

    const settings = getInternalSettings();
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
            throw new Error(`Group ID '${ID}' is already in use`);
        }
    }

    settings.groups[ID] = {friendly_name: name};
    write();

    return getGroup(ID);
}

function groupGetDevice(group: {devices?: string[]}, keys: string[]): string {
    for (const device of group.devices ?? []) {
        if (keys.includes(device)) return device;
    }

    return null;
}

export function addDeviceToGroup(IDorName: string, keys: string[]): void {
    const groupID = getGroupThrowIfNotExists(IDorName).ID;
    const settings = getInternalSettings();

    const group = settings.groups[groupID];
    if (!groupGetDevice(group, keys)) {
        if (!group.devices) group.devices = [];
        group.devices.push(keys[0]);
        write();
    }
}

export function removeDeviceFromGroup(IDorName: string, keys: string[]): void {
    const groupID = getGroupThrowIfNotExists(IDorName).ID;
    const settings = getInternalSettings();
    const group = settings.groups[groupID];
    if (!group.devices) {
        return;
    }

    const key = groupGetDevice(group, keys);
    if (key) {
        group.devices = group.devices.filter((d) => d != key);
        write();
    }
}

export function removeGroup(IDorName: string): void {
    const groupID = getGroupThrowIfNotExists(IDorName).ID;
    const settings = getInternalSettings();
    delete settings.groups[groupID];
    write();
}

export function changeEntityOptions(IDorName: string, newOptions: KeyValue): void {
    const settings = getInternalSettings();
    delete newOptions.friendly_name;
    delete newOptions.devices;
    if (getDevice(IDorName)) {
        objectAssignDeep(settings.devices[getDevice(IDorName).ID], newOptions);
        utils.removeNullPropertiesFromObject(settings.devices[getDevice(IDorName).ID]);
    } else if (getGroup(IDorName)) {
        objectAssignDeep(settings.groups[getGroup(IDorName).ID], newOptions);
        utils.removeNullPropertiesFromObject(settings.groups[getGroup(IDorName).ID]);
    } else {
        throw new Error(`Device or group '${IDorName}' does not exist`);
    }

    write();
}

export function changeFriendlyName(IDorName: string, newName: string): void {
    utils.validateFriendlyName(newName, true);
    if (getGroup(newName) || getDevice(newName)) {
        throw new Error(`friendly_name '${newName}' is already in use`);
    }

    const settings = getInternalSettings();
    if (getDevice(IDorName)) {
        settings.devices[getDevice(IDorName).ID].friendly_name = newName;
    } else if (getGroup(IDorName)) {
        settings.groups[getGroup(IDorName).ID].friendly_name = newName;
    } else {
        throw new Error(`Device or group '${IDorName}' does not exist`);
    }

    write();
}

export function reRead(): void {
    _settings = null;
    getInternalSettings();
    _settingsWithDefaults = null;
    get();
}

export const testing = {
    write,
    clear: (): void => {
        _settings = null;
        _settingsWithDefaults = null;
    },
    defaults,
};
