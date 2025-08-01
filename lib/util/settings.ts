import path from "node:path";
import type {ValidateFunction} from "ajv";

import Ajv from "ajv";
import objectAssignDeep from "object-assign-deep";

import data from "./data";
import schemaJson from "./settings.schema.json";
import utils from "./utils";
import yaml from "./yaml";

export {schemaJson};
// When updating also update:
// - https://github.com/Koenkk/zigbee2mqtt/blob/dev/data/configuration.example.yaml#L2
export const CURRENT_VERSION = 4;
/** NOTE: by order of priority, lower index is lower level (more important) */
export const LOG_LEVELS: readonly string[] = ["error", "warning", "info", "debug"] as const;
export type LogLevel = "error" | "warning" | "info" | "debug";

const CONFIG_FILE_PATH = data.joinPath("configuration.yaml");
const NULLABLE_SETTINGS = ["homeassistant"];
const ajvSetting = new Ajv({allErrors: true}).addKeyword("requiresRestart").compile(schemaJson);
const ajvRestartRequired = new Ajv({allErrors: true}).addKeyword({keyword: "requiresRestart", validate: (s: unknown) => !s}).compile(schemaJson);
const ajvRestartRequiredDeviceOptions = new Ajv({allErrors: true})
    .addKeyword({keyword: "requiresRestart", validate: (s: unknown) => !s})
    .compile(schemaJson.definitions.device);
const ajvRestartRequiredGroupOptions = new Ajv({allErrors: true})
    .addKeyword({keyword: "requiresRestart", validate: (s: unknown) => !s})
    .compile(schemaJson.definitions.group);
export const defaults = {
    homeassistant: {
        enabled: false,
        discovery_topic: "homeassistant",
        status_topic: "homeassistant/status",
        legacy_action_sensor: false,
        experimental_event_entities: false,
    },
    availability: {
        enabled: false,
        active: {timeout: 10, max_jitter: 30000, backoff: true, pause_on_backoff_gt: 0},
        passive: {timeout: 1500},
    },
    frontend: {
        enabled: false,
        package: "zigbee2mqtt-frontend",
        port: 8080,
        base_url: "/",
    },
    mqtt: {
        base_topic: "zigbee2mqtt",
        include_device_information: false,
        force_disable_retain: false,
        // 1MB = roughly 3.5KB per device * 300 devices for `/bridge/devices`
        maximum_packet_size: 1048576,
        keepalive: 60,
        reject_unauthorized: true,
        version: 4,
    },
    serial: {
        disable_led: false,
    },
    passlist: [],
    blocklist: [],
    map_options: {
        graphviz: {
            colors: {
                fill: {
                    enddevice: "#fff8ce",
                    coordinator: "#e04e5d",
                    router: "#4ea3e0",
                },
                font: {
                    coordinator: "#ffffff",
                    router: "#ffffff",
                    enddevice: "#000000",
                },
                line: {
                    active: "#009900",
                    inactive: "#994444",
                },
            },
        },
    },
    ota: {
        update_check_interval: 24 * 60,
        disable_automatic_update_check: false,
        image_block_response_delay: 250,
        default_maximum_data_size: 50,
    },
    device_options: {},
    advanced: {
        log_rotation: true,
        log_console_json: false,
        log_symlink_current: false,
        log_output: ["console", "file"],
        log_directory: path.join(data.getPath(), "log", "%TIMESTAMP%"),
        log_file: "log.log",
        log_level: /* v8 ignore next */ process.env.DEBUG ? "debug" : "info",
        log_namespaced_levels: {},
        log_syslog: {},
        log_debug_to_mqtt_frontend: false,
        log_debug_namespace_ignore: "",
        log_directories_to_keep: 10,
        pan_id: 0x1a62,
        ext_pan_id: [0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd],
        channel: 11,
        adapter_concurrent: undefined,
        adapter_delay: undefined,
        cache_state: true,
        cache_state_persistent: true,
        cache_state_send_on_startup: true,
        last_seen: "disable",
        elapsed: false,
        network_key: [1, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 10, 12, 13],
        timestamp_format: "YYYY-MM-DD HH:mm:ss",
        output: "json",
    },
    health: {
        interval: 10,
        reset_on_check: false,
    },
} satisfies RecursivePartial<Settings>;

let _settings: Partial<Settings> | undefined;
let _settingsWithDefaults: Settings | undefined;

function loadSettingsWithDefaults(): void {
    if (!_settings) {
        _settings = read();
    }

    _settingsWithDefaults = objectAssignDeep({}, defaults, getPersistedSettings()) as Settings;

    if (!_settingsWithDefaults.devices) {
        _settingsWithDefaults.devices = {};
    }

    if (!_settingsWithDefaults.groups) {
        _settingsWithDefaults.groups = {};
    }
}

function parseValueRef(text: string): {filename: string; key: string} | null {
    const match = /!(.*) (.*)/g.exec(text);
    if (match) {
        let filename = match[1];
        // This is mainly for backward compatibility.
        if (!filename.endsWith(".yaml") && !filename.endsWith(".yml")) {
            filename += ".yaml";
        }
        return {filename, key: match[2]};
    }

    return null;
}

export function writeMinimalDefaults(): void {
    const minimal = {
        version: CURRENT_VERSION,
        mqtt: {
            base_topic: defaults.mqtt.base_topic,
            server: "mqtt://localhost:1883",
        },
        serial: {},
        advanced: {
            log_level: defaults.advanced.log_level,
            channel: defaults.advanced.channel,
            network_key: "GENERATE",
            pan_id: "GENERATE",
            ext_pan_id: "GENERATE",
        },
        frontend: {
            enabled: defaults.frontend.enabled,
            port: defaults.frontend.port,
        },
        homeassistant: {
            enabled: defaults.homeassistant.enabled,
        },
    } as Partial<Settings>;

    applyEnvironmentVariables(minimal);
    yaml.writeIfChanged(CONFIG_FILE_PATH, minimal);

    _settings = read();

    loadSettingsWithDefaults();
}

export function setOnboarding(value: boolean): void {
    const settings = getPersistedSettings();

    if (value) {
        if (!settings.onboarding) {
            settings.onboarding = value;

            write();
        }
    } else if (settings.onboarding) {
        delete settings.onboarding;

        write();
    }
}

export function write(): void {
    const settings = getPersistedSettings();
    const toWrite: KeyValue = objectAssignDeep({}, settings);

    // Read settings to check if we have to split devices/groups into separate file.
    const actual = yaml.read(CONFIG_FILE_PATH);

    // In case the setting is defined in a separate file (e.g. !secret network_key) update it there.
    for (const [ns, key] of [
        ["mqtt", "server"],
        ["mqtt", "user"],
        ["mqtt", "password"],
        ["advanced", "network_key"],
        ["frontend", "auth_token"],
    ]) {
        if (actual[ns]?.[key]) {
            const ref = parseValueRef(actual[ns][key]);
            if (ref) {
                yaml.updateIfChanged(data.joinPath(ref.filename), ref.key, toWrite[ns][key]);
                toWrite[ns][key] = actual[ns][key];
            }
        }
    }

    // Write devices/groups to separate file if required.
    const writeDevicesOrGroups = (type: "devices" | "groups"): void => {
        if (typeof actual[type] === "string" || (Array.isArray(actual[type]) && actual[type].length > 0)) {
            const fileToWrite = Array.isArray(actual[type]) ? actual[type][0] : actual[type];
            const content = objectAssignDeep({}, settings[type]);

            // If an array, only write to first file and only devices which are not in the other files.
            if (Array.isArray(actual[type])) {
                // skip i==0
                for (let i = 1; i < actual[type].length; i++) {
                    for (const key in yaml.readIfExists(data.joinPath(actual[type][i]))) {
                        delete content[key];
                    }
                }
            }

            yaml.writeIfChanged(data.joinPath(fileToWrite), content);
            toWrite[type] = actual[type];
        }
    };

    writeDevicesOrGroups("devices");
    writeDevicesOrGroups("groups");

    applyEnvironmentVariables(toWrite);

    yaml.writeIfChanged(CONFIG_FILE_PATH, toWrite);

    _settings = read();

    loadSettingsWithDefaults();
}

export function validate(): string[] {
    getPersistedSettings();

    if (!ajvSetting(_settings)) {
        // biome-ignore lint/style/noNonNullAssertion: When `ajvSetting()` return false it always has `errors`
        return ajvSetting.errors!.map((v) => `${v.instancePath.substring(1)} ${v.message}`);
    }

    const errors = [];

    if (_settings.advanced?.network_key && typeof _settings.advanced.network_key === "string" && _settings.advanced.network_key !== "GENERATE") {
        errors.push(`advanced.network_key: should be array or 'GENERATE' (is '${_settings.advanced.network_key}')`);
    }

    if (_settings.advanced?.pan_id && typeof _settings.advanced.pan_id === "string" && _settings.advanced.pan_id !== "GENERATE") {
        errors.push(`advanced.pan_id: should be number or 'GENERATE' (is '${_settings.advanced.pan_id}')`);
    }

    if (_settings.advanced?.ext_pan_id && typeof _settings.advanced.ext_pan_id === "string" && _settings.advanced.ext_pan_id !== "GENERATE") {
        errors.push(`advanced.ext_pan_id: should be array or 'GENERATE' (is '${_settings.advanced.ext_pan_id}')`);
    }

    // Verify that all friendly names are unique
    const names: string[] = [];
    const check = (e: DeviceOptions | GroupOptions): void => {
        if (names.includes(e.friendly_name)) errors.push(`Duplicate friendly_name '${e.friendly_name}' found`);
        errors.push(...utils.validateFriendlyName(e.friendly_name));
        names.push(e.friendly_name);
        if ("icon" in e && e.icon && !e.icon.startsWith("http://") && !e.icon.startsWith("https://") && !e.icon.startsWith("device_icons/")) {
            errors.push(`Device icon of '${e.friendly_name}' should start with 'device_icons/', got '${e.icon}'`);
        }
    };

    const settingsWithDefaults = get();

    for (const key in settingsWithDefaults.devices) {
        check(settingsWithDefaults.devices[key]);
    }

    for (const key in settingsWithDefaults.groups) {
        check(settingsWithDefaults.groups[key]);
    }

    if (settingsWithDefaults.mqtt.version !== 5) {
        for (const device of Object.values(settingsWithDefaults.devices)) {
            if (device.retention) {
                errors.push("MQTT retention requires protocol version 5");
            }
        }
    }

    return errors;
}

export function validateNonRequired(): string[] {
    getPersistedSettings();

    if (!ajvSetting(_settings)) {
        // biome-ignore lint/style/noNonNullAssertion: When `ajvSetting()` return false it always has `errors`
        const errors = ajvSetting.errors!.filter((e) => e.keyword !== "required");

        return errors.map((v) => `${v.instancePath.substring(1)} ${v.message}`);
    }

    return [];
}

function read(): Partial<Settings> {
    const s = yaml.read(CONFIG_FILE_PATH) as Partial<Settings>;

    // Read !secret MQTT username and password if set
    const interpretValue = <T>(value: T): T => {
        if (typeof value === "string") {
            const ref = parseValueRef(value);
            if (ref) {
                return yaml.read(data.joinPath(ref.filename))[ref.key];
            }
        }
        return value;
    };

    if (s.mqtt?.user) {
        s.mqtt.user = interpretValue(s.mqtt.user);
    }

    if (s.mqtt?.password) {
        s.mqtt.password = interpretValue(s.mqtt.password);
    }

    if (s.mqtt?.server) {
        s.mqtt.server = interpretValue(s.mqtt.server);
    }

    if (s.advanced?.network_key) {
        s.advanced.network_key = interpretValue(s.advanced.network_key);
    }

    if (s.frontend?.auth_token) {
        s.frontend.auth_token = interpretValue(s.frontend.auth_token);
    }

    // Read devices/groups configuration from separate file if specified.
    const readDevicesOrGroups = (type: "devices" | "groups"): void => {
        if (typeof s[type] === "string" || (Array.isArray(s[type]) && Array(s[type]).length > 0)) {
            const files: string[] = Array.isArray(s[type]) ? s[type] : [s[type]];
            s[type] = {};
            for (const file of files) {
                const content = yaml.readIfExists(data.joinPath(file));
                // @ts-expect-error noMutate not typed properly
                s[type] = objectAssignDeep.noMutate(s[type], content);
            }
        }
    };

    readDevicesOrGroups("devices");
    readDevicesOrGroups("groups");

    return s;
}

function applyEnvironmentVariables(settings: Partial<Settings>): void {
    const iterate = (obj: KeyValue, path: string[]): void => {
        for (const key in obj) {
            if (key !== "type") {
                if (key !== "properties" && obj[key]) {
                    const type = (obj[key].type || "object").toString();
                    const envPart = path.reduce((acc, val) => `${acc}${val}_`, "");
                    const envVariableName = `ZIGBEE2MQTT_CONFIG_${envPart}${key}`.toUpperCase();
                    const envVariable = process.env[envVariableName];

                    if (envVariable) {
                        const setting = path.reduce((acc, val) => {
                            // @ts-expect-error ignore typing
                            acc[val] = acc[val] || {};
                            // @ts-expect-error ignore typing
                            return acc[val];
                        }, settings);

                        if (type.indexOf("object") >= 0 || type.indexOf("array") >= 0) {
                            try {
                                setting[key as keyof Settings] = JSON.parse(envVariable);
                            } catch {
                                // biome-ignore lint/suspicious/noExplicitAny: auto-parsing
                                setting[key as keyof Settings] = envVariable as any;
                            }
                        } else if (type.indexOf("number") >= 0) {
                            // biome-ignore lint/suspicious/noExplicitAny: auto-parsing
                            setting[key as keyof Settings] = ((envVariable as unknown as number) * 1) as any;
                        } else if (type.indexOf("boolean") >= 0) {
                            // biome-ignore lint/suspicious/noExplicitAny: auto-parsing
                            setting[key as keyof Settings] = (envVariable.toLowerCase() === "true") as any;
                        } else {
                            if (type.indexOf("string") >= 0) {
                                // biome-ignore lint/suspicious/noExplicitAny: auto-parsing
                                setting[key as keyof Settings] = envVariable as any;
                            }
                        }
                    }
                }

                if (typeof obj[key] === "object" && obj[key]) {
                    const newPath = [...path];

                    if (key !== "properties" && key !== "oneOf" && !Number.isInteger(Number(key))) {
                        newPath.push(key);
                    }

                    iterate(obj[key], newPath);
                }
            }
        }
    };

    iterate(schemaJson.properties, []);
}

/**
 * Get the settings actually written in the yaml.
 * Env vars are applied on top.
 * Defaults merged on startup are not included.
 */
export function getPersistedSettings(): Partial<Settings> {
    if (!_settings) {
        _settings = read();
    }

    return _settings;
}

export function get(): Settings {
    if (!_settingsWithDefaults) {
        loadSettingsWithDefaults();
    }

    // biome-ignore lint/style/noNonNullAssertion: just loaded
    return _settingsWithDefaults!;
}

export function set(path: string[], value: string | number | boolean | KeyValue): void {
    // biome-ignore lint/suspicious/noExplicitAny: auto-parsing
    let settings: any = getPersistedSettings();

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

export function apply(settings: Record<string, unknown>, throwOnError = true): boolean {
    getPersistedSettings(); // Ensure _settings is initialized.
    // @ts-expect-error noMutate not typed properly
    const newSettings = objectAssignDeep.noMutate(_settings, settings);

    utils.removeNullPropertiesFromObject(newSettings, NULLABLE_SETTINGS);

    if (!ajvSetting(newSettings) && throwOnError) {
        // biome-ignore lint/style/noNonNullAssertion: When `ajvSetting()` return false it always has `errors`
        const errors = ajvSetting.errors!.filter((e) => e.keyword !== "required");

        if (errors.length) {
            const error = errors[0];
            throw new Error(`${error.instancePath.substring(1)} ${error.message}`);
        }
    }

    _settings = newSettings;
    write();

    ajvRestartRequired(settings);

    const restartRequired = Boolean(ajvRestartRequired.errors && !!ajvRestartRequired.errors.find((e) => e.keyword === "requiresRestart"));

    return restartRequired;
}

export function getGroup(IDorName: string | number): GroupOptions | undefined {
    const settings = get();
    const byID = settings.groups[IDorName];

    if (byID) {
        return {...byID, ID: Number(IDorName)};
    }

    for (const [ID, group] of Object.entries(settings.groups)) {
        if (group.friendly_name === IDorName) {
            return {...group, ID: Number(ID)};
        }
    }

    return undefined;
}

function getGroupThrowIfNotExists(IDorName: string): GroupOptions {
    const group = getGroup(IDorName);

    if (!group) {
        throw new Error(`Group '${IDorName}' does not exist`);
    }

    return group;
}

export function getDevice(IDorName: string): DeviceOptionsWithId | undefined {
    const settings = get();
    const byID = settings.devices[IDorName];

    if (byID) {
        return {...byID, ID: IDorName};
    }

    for (const [ID, device] of Object.entries(settings.devices)) {
        if (device.friendly_name === IDorName) {
            return {...device, ID};
        }
    }

    return undefined;
}

function getDeviceThrowIfNotExists(IDorName: string): DeviceOptionsWithId {
    const device = getDevice(IDorName);
    if (!device) {
        throw new Error(`Device '${IDorName}' does not exist`);
    }

    return device;
}

export function addDevice(id: string): DeviceOptionsWithId {
    if (getDevice(id)) {
        throw new Error(`Device '${id}' already exists`);
    }

    const settings = getPersistedSettings();

    if (!settings.devices) {
        settings.devices = {};
    }

    settings.devices[id] = {friendly_name: id};
    write();

    // biome-ignore lint/style/noNonNullAssertion: valid from creation above
    return getDevice(id)!;
}

export function blockDevice(id: string): void {
    const settings = getPersistedSettings();
    if (!settings.blocklist) {
        settings.blocklist = [];
    }

    settings.blocklist.push(id);
    write();
}

export function removeDevice(IDorName: string): void {
    const device = getDeviceThrowIfNotExists(IDorName);
    const settings = getPersistedSettings();
    delete settings.devices?.[device.ID];
    write();
}

export function addGroup(name: string, id?: string): GroupOptions {
    utils.validateFriendlyName(name, true);

    if (getGroup(name) || getDevice(name)) {
        throw new Error(`friendly_name '${name}' is already in use`);
    }

    const settings = getPersistedSettings();
    if (!settings.groups) {
        settings.groups = {};
    }

    if (id == null || (typeof id === "string" && id.trim() === "")) {
        // look for free ID
        id = "1";

        while (settings.groups[id]) {
            id = (Number.parseInt(id) + 1).toString();
        }
    } else {
        // ensure provided ID is not in use
        id = id.toString();

        if (settings.groups[id]) {
            throw new Error(`Group ID '${id}' is already in use`);
        }
    }

    settings.groups[id] = {friendly_name: name};
    write();

    // biome-ignore lint/style/noNonNullAssertion: valid from creation above
    return getGroup(id)!;
}

export function removeGroup(IDorName: string | number): void {
    const groupID = getGroupThrowIfNotExists(IDorName.toString()).ID;
    const settings = getPersistedSettings();

    // biome-ignore lint/style/noNonNullAssertion: throwing above if not valid
    delete settings.groups![groupID];
    write();
}

export function changeEntityOptions(IDorName: string, newOptions: KeyValue): boolean {
    const settings = getPersistedSettings();
    delete newOptions.friendly_name;
    delete newOptions.devices;
    let validator: ValidateFunction;
    const device = getDevice(IDorName);

    if (device) {
        // biome-ignore lint/style/noNonNullAssertion: valid from above
        const settingsDevice = settings.devices![device.ID];
        objectAssignDeep(settingsDevice, newOptions);
        utils.removeNullPropertiesFromObject(settingsDevice, NULLABLE_SETTINGS);
        validator = ajvRestartRequiredDeviceOptions;
    } else {
        const group = getGroup(IDorName);

        if (group) {
            // biome-ignore lint/style/noNonNullAssertion: valid from above
            const settingsGroup = settings.groups![group.ID];
            objectAssignDeep(settingsGroup, newOptions);
            utils.removeNullPropertiesFromObject(settingsGroup, NULLABLE_SETTINGS);
            validator = ajvRestartRequiredGroupOptions;
        } else {
            throw new Error(`Device or group '${IDorName}' does not exist`);
        }
    }

    write();
    validator(newOptions);

    const restartRequired = Boolean(validator.errors && !!validator.errors.find((e) => e.keyword === "requiresRestart"));

    return restartRequired;
}

export function changeFriendlyName(IDorName: string, newName: string): void {
    utils.validateFriendlyName(newName, true);
    if (getGroup(newName) || getDevice(newName)) {
        throw new Error(`friendly_name '${newName}' is already in use`);
    }

    const settings = getPersistedSettings();
    const device = getDevice(IDorName);

    if (device) {
        // biome-ignore lint/style/noNonNullAssertion: valid from above
        settings.devices![device.ID].friendly_name = newName;
    } else {
        const group = getGroup(IDorName);

        if (group) {
            // biome-ignore lint/style/noNonNullAssertion: valid from above
            settings.groups![group.ID].friendly_name = newName;
        } else {
            throw new Error(`Device or group '${IDorName}' does not exist`);
        }
    }

    write();
}

export function reRead(): void {
    _settings = undefined;
    getPersistedSettings();
    _settingsWithDefaults = undefined;
    get();
}

export const testing = {
    write,
    clear: (): void => {
        _settings = undefined;
        _settingsWithDefaults = undefined;
    },
    defaults,
    CURRENT_VERSION,
};
