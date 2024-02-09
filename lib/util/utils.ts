import equals from 'fast-deep-equal/es6';
import humanizeDuration from 'humanize-duration';
import data from './data';
import vm from 'vm';
import fs from 'fs';
import path from 'path';
import {detailedDiff} from 'deep-object-diff';
import objectAssignDeep from 'object-assign-deep';
import type * as zhc from 'zigbee-herdsman-converters';

// construct a local ISO8601 string (instead of UTC-based)
// Example:
//  - ISO8601 (UTC) = 2019-03-01T15:32:45.941+0000
//  - ISO8601 (local) = 2019-03-01T16:32:45.941+0100 (for timezone GMT+1)
function toLocalISOString(date: Date): string {
    const tzOffset = -date.getTimezoneOffset();
    const plusOrMinus = tzOffset >= 0 ? '+' : '-';
    const pad = (num: number): string => {
        const norm = Math.floor(Math.abs(num));
        return (norm < 10 ? '0' : '') + norm;
    };

    return date.getFullYear() +
        '-' + pad(date.getMonth() + 1) +
        '-' + pad(date.getDate()) +
        'T' + pad(date.getHours()) +
        ':' + pad(date.getMinutes()) +
        ':' + pad(date.getSeconds()) +
        plusOrMinus + pad(tzOffset / 60) +
        ':' + pad(tzOffset % 60);
}

function capitalize(s: string): string {
    return s[0].toUpperCase() + s.slice(1);
}

async function getZigbee2MQTTVersion(includeCommitHash=true): Promise<{commitHash: string, version: string}> {
    const git = await import('git-last-commit');
    const packageJSON = await import('../..' + '/package.json');

    if (!includeCommitHash) {
        return {version: packageJSON.version, commitHash: null};
    }

    return new Promise((resolve) => {
        const version = packageJSON.version;

        git.getLastCommit((err: Error, commit: {shortHash: string}) => {
            let commitHash = null;

            if (err) {
                try {
                    commitHash = fs.readFileSync(path.join(__dirname, '..', '..', 'dist', '.hash'), 'utf-8');
                } catch (error) {
                    /* istanbul ignore next */
                    commitHash = 'unknown';
                }
            } else {
                commitHash = commit.shortHash;
            }

            commitHash = commitHash.trim();
            resolve({commitHash, version});
        });
    });
}

async function getDependencyVersion(depend: string): Promise<{version: string}> {
    const modulePath = path.dirname(require.resolve(depend));
    const packageJSONPath = path.join(modulePath.slice(0, modulePath.indexOf(depend) + depend.length), 'package.json');
    const packageJSON = await import(packageJSONPath);
    const version = packageJSON.version;
    return {version};
}

function formatDate(time: number, type: 'ISO_8601' | 'ISO_8601_local' | 'epoch' | 'relative'): string | number {
    if (type === 'ISO_8601') return new Date(time).toISOString();
    else if (type === 'ISO_8601_local') return toLocalISOString(new Date(time));
    else if (type === 'epoch') return time;
    else { // relative
        return humanizeDuration(Date.now() - time, {language: 'en', largest: 2, round: true}) + ' ago';
    }
}

function objectHasProperties(object: {[s: string]: unknown}, properties: string[]): boolean {
    for (const property of properties) {
        if (!object.hasOwnProperty(property)) {
            return false;
        }
    }

    return true;
}

function equalsPartial(object: KeyValue, expected: KeyValue): boolean {
    for (const [key, value] of Object.entries(expected)) {
        if (!equals(object[key], value)) {
            return false;
        }
    }

    return true;
}

function getObjectProperty(object: KeyValue, key: string, defaultValue: unknown): unknown {
    return object && object.hasOwnProperty(key) ? object[key] : defaultValue;
}

function getResponse(request: KeyValue | string, data: KeyValue, error: string): MQTTResponse {
    const response: MQTTResponse = {data, status: error ? 'error' : 'ok'};
    if (error) response.error = error;
    if (typeof request === 'object' && request.hasOwnProperty('transaction')) {
        response.transaction = request.transaction;
    }
    return response;
}

function parseJSON(value: string, fallback: string): KeyValue | string {
    try {
        return JSON.parse(value);
    } catch (e) {
        return fallback;
    }
}

function loadModuleFromText(moduleCode: string, name?: string): unknown {
    const moduleFakePath = path.join(__dirname, '..', '..', 'data', 'extension', name || 'externally-loaded.js');
    const sandbox = {
        require: require,
        module: {},
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        setImmediate,
        clearImmediate,
    };
    vm.runInNewContext(moduleCode, sandbox, moduleFakePath);
    /* eslint-disable-line */ // @ts-ignore
    return sandbox.module.exports;
}

function loadModuleFromFile(modulePath: string): unknown {
    const moduleCode = fs.readFileSync(modulePath, {encoding: 'utf8'});
    return loadModuleFromText(moduleCode);
}

export function* loadExternalConverter(moduleName: string): Generator<ExternalDefinition> {
    let converter;

    if (moduleName.endsWith('.js')) {
        converter = loadModuleFromFile(data.joinPath(moduleName));
    } else {
        converter = require(moduleName);
    }

    if (Array.isArray(converter)) {
        for (const item of converter) {
            yield item;
        }
    } else {
        yield converter;
    }
}

function removeNullPropertiesFromObject(obj: KeyValue): void {
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (value == null) {
            delete obj[key];
        } else if (typeof value === 'object') {
            removeNullPropertiesFromObject(value);
        }
    }
}

function toNetworkAddressHex(value: number): string {
    const hex = value.toString(16);
    return `0x${'0'.repeat(4 - hex.length)}${hex}`;
}

// eslint-disable-next-line
function toSnakeCase(value: string | KeyValue): any {
    if (typeof value === 'object') {
        value = {...value};
        for (const key of Object.keys(value)) {
            const keySnakeCase = toSnakeCase(key);
            if (key !== keySnakeCase) {
                value[keySnakeCase] = value[key];
                delete value[key];
            }
        }
        return value;
    } else {
        return value.replace(/\.?([A-Z])/g, (x, y) => '_' + y.toLowerCase()).replace(/^_/, '').replace('_i_d', '_id');
    }
}

function charRange(start: string, stop: string): number[] {
    const result = [];
    for (let idx=start.charCodeAt(0), end=stop.charCodeAt(0); idx <=end; ++idx) {
        result.push(idx);
    }
    return result;
}

const controlCharacters = [
    ...charRange('\u0000', '\u001F'),
    ...charRange('\u007f', '\u009F'),
    ...charRange('\ufdd0', '\ufdef'),
];

function containsControlCharacter(str: string): boolean {
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        if (controlCharacters.includes(ch) || [0xFFFE, 0xFFFF].includes(ch & 0xFFFF)) {
            return true;
        }
    }
    return false;
}

function getAllFiles(path_: string): string[] {
    const result = [];
    for (let item of fs.readdirSync(path_)) {
        item = path.join(path_, item);
        if (fs.lstatSync(item).isFile()) {
            result.push(item);
        } else {
            result.push(...getAllFiles(item));
        }
    }
    return result;
}

function validateFriendlyName(name: string, throwFirstError=false): string[] {
    const errors = [];

    if (name.length === 0) errors.push(`friendly_name must be at least 1 char long`);
    if (name.endsWith('/') || name.startsWith('/')) errors.push(`friendly_name is not allowed to end or start with /`);
    if (containsControlCharacter(name)) errors.push(`friendly_name is not allowed to contain control char`);
    if (name.match(/.*\/\d*$/)) errors.push(`Friendly name cannot end with a "/DIGIT" ('${name}')`);
    if (name.includes('#') || name.includes('+')) {
        errors.push(`MQTT wildcard (+ and #) not allowed in friendly_name ('${name}')`);
    }

    if (throwFirstError && errors.length) {
        throw new Error(errors[0]);
    }

    return errors;
}

function sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function sanitizeImageParameter(parameter: string): string {
    const replaceByDash = [/\?/g, /&/g, /[^a-z\d\- _./:]/gi];
    let sanitized = parameter;
    replaceByDash.forEach((r) => sanitized = sanitized.replace(r, '-'));
    return sanitized;
}

function isAvailabilityEnabledForEntity(entity: Device | Group, settings: Settings): boolean {
    if (entity.isGroup()) {
        return !entity.membersDevices().map((d) => isAvailabilityEnabledForEntity(d, settings)).includes(false);
    }

    if (entity.options.hasOwnProperty('availability')) {
        return !!entity.options.availability;
    }

    // availability_timeout = deprecated
    const enabledGlobal = settings.advanced.availability_timeout || settings.availability;
    if (!enabledGlobal) return false;

    if (entity.isDevice() && entity.options.disabled) return false;

    const passlist = settings.advanced.availability_passlist.concat(settings.advanced.availability_whitelist);
    if (passlist.length > 0) {
        return passlist.includes(entity.name) || passlist.includes(entity.ieeeAddr);
    }

    const blocklist = settings.advanced.availability_blacklist.concat(settings.advanced.availability_blocklist);
    return !blocklist.includes(entity.name) && !blocklist.includes(entity.ieeeAddr);
}

function isEndpoint(obj: unknown): obj is zh.Endpoint {
    return obj.constructor.name.toLowerCase() === 'endpoint';
}

function flatten<Type>(arr: Type[][]): Type[] {
    return [].concat(...arr);
}

function arrayUnique<Type>(arr: Type[]): Type[] {
    return [...new Set(arr)];
}

function isZHGroup(obj: unknown): obj is zh.Group {
    return obj.constructor.name.toLowerCase() === 'group';
}

function availabilityPayload(state: 'online' | 'offline', settings: Settings): string {
    return settings.advanced.legacy_availability_payload ? state : JSON.stringify({state});
}

const hours = (hours: number): number => 1000 * 60 * 60 * hours;
const minutes = (minutes: number): number => 1000 * 60 * minutes;
const seconds = (seconds: number): number => 1000 * seconds;

function publishLastSeen(data: eventdata.LastSeenChanged, settings: Settings, allowMessageEmitted: boolean,
    publishEntityState: PublishEntityState): void {
    /**
     * Prevent 2 MQTT publishes when 1 message event is received;
     * - In case reason == messageEmitted, receive.ts will only call this when it did not publish a
     *      message based on the received zigbee message. In this case allowMessageEmitted has to be true.
     * - In case reason !== messageEmitted, controller.ts will call this based on the zigbee-herdsman
     *      lastSeenChanged event.
     */
    const allow = data.reason !== 'messageEmitted' || (data.reason === 'messageEmitted' && allowMessageEmitted);
    if (settings.advanced.last_seen && settings.advanced.last_seen !== 'disable' && allow) {
        publishEntityState(data.device, {}, 'lastSeenChanged');
    }
}

function filterProperties(filter: string[], data: KeyValue): void {
    if (filter) {
        for (const property of Object.keys(data)) {
            if (filter.find((p) => property.match(`^${p}$`))) {
                delete data[property];
            }
        }
    }
}

function clone(obj: KeyValue): KeyValue {
    return JSON.parse(JSON.stringify(obj));
}

export function isNumericExposeFeature(feature: zhc.Feature): feature is zhc.Numeric {
    return feature?.type === 'numeric';
}

export function isEnumExposeFeature(feature: zhc.Feature): feature is zhc.Enum {
    return feature?.type === 'enum';
}

export function isBinaryExposeFeature(feature: zhc.Feature): feature is zhc.Binary {
    return feature?.type === 'binary';
}

function computeSettingsToChange(current: KeyValue, new_: KeyValue): KeyValue {
    const diff: KeyValue = detailedDiff(current, new_);

    // Remove any settings that are in the deleted.diff but not in the passed options
    const cleanupDeleted = (options: KeyValue, deleted: KeyValue): void => {
        for (const key of Object.keys(deleted)) {
            if (!(key in options)) {
                delete deleted[key];
            } else if (!Array.isArray(options[key])) {
                cleanupDeleted(options[key], deleted[key]);
            }
        }
    };
    cleanupDeleted(new_, diff.deleted);

    // objectAssignDeep requires object prototype which is missing from detailedDiff, therefore clone
    const newSettings = objectAssignDeep({}, clone(diff.added), clone(diff.updated), clone(diff.deleted));

    // deep-object-diff converts arrays to objects, set original array back here
    const convertBackArray = (before: KeyValue, after: KeyValue): void => {
        for (const [key, afterValue] of Object.entries(after)) {
            const beforeValue = before[key];
            if (Array.isArray(beforeValue)) {
                after[key] = beforeValue;
            } else if (afterValue && typeof beforeValue === 'object') {
                convertBackArray(beforeValue, afterValue);
            }
        }
    };
    convertBackArray(new_, newSettings);
    return newSettings;
}

function getScenes(entity: zh.Endpoint | zh.Group): Scene[] {
    const scenes: {[id: number]: Scene} = {};
    const endpoints = isEndpoint(entity) ? [entity] : entity.members;
    const groupID = isEndpoint(entity) ? 0 : entity.groupID;

    for (const endpoint of endpoints) {
        for (const [key, data] of Object.entries(endpoint.meta?.scenes || {})) {
            const split = key.split('_');
            const sceneID = parseInt(split[0], 10);
            const sceneGroupID = parseInt(split[1], 10);
            if (sceneGroupID === groupID) {
                scenes[sceneID] = {id: sceneID, name: (data as KeyValue).name || `Scene ${sceneID}`};
            }
        }
    }

    return Object.values(scenes);
}

export default {
    capitalize, getZigbee2MQTTVersion, getDependencyVersion, formatDate, objectHasProperties,
    equalsPartial, getObjectProperty, getResponse, parseJSON, loadModuleFromText, loadModuleFromFile,
    removeNullPropertiesFromObject, toNetworkAddressHex, toSnakeCase,
    isEndpoint, isZHGroup, hours, minutes, seconds, validateFriendlyName, sleep,
    sanitizeImageParameter, isAvailabilityEnabledForEntity, publishLastSeen, availabilityPayload,
    getAllFiles, filterProperties, flatten, arrayUnique, clone, computeSettingsToChange, getScenes,
};
