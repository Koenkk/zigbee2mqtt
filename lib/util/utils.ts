import assert from "node:assert";
import {exec} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import equals from "fast-deep-equal/es6";
import humanizeDuration from "humanize-duration";
import type * as zhc from "zigbee-herdsman-converters";
import type {Zigbee2MQTTAPI, Zigbee2MQTTResponse, Zigbee2MQTTResponseEndpoints, Zigbee2MQTTScene} from "../types/api";

import data from "./data";

const BASE64_IMAGE_REGEX = /data:image\/(?<extension>.+);base64,(?<data>.+)/;

export const DEFAULT_BIND_GROUP_ID = 901;

function pad(num: number): string {
    const norm = Math.floor(Math.abs(num));
    return (norm < 10 ? "0" : "") + norm;
}

// construct a local ISO8601 string (instead of UTC-based)
// Example:
//  - ISO8601 (UTC) = 2019-03-01T15:32:45.941+0000
//  - ISO8601 (local) = 2019-03-01T16:32:45.941+0100 (for timezone GMT+1)
function toLocalISOString(date: Date): string {
    const tzOffset = -date.getTimezoneOffset();
    const plusOrMinus = tzOffset >= 0 ? "+" : "-";

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${plusOrMinus}${pad(tzOffset / 60)}:${pad(tzOffset % 60)}`;
}

function capitalize(s: string): string {
    return s[0].toUpperCase() + s.slice(1);
}

export async function getZigbee2MQTTVersion(includeCommitHash = true): Promise<{commitHash?: string; version: string}> {
    const packageJSON = (await import("../../package.json", {with: {type: "json"}})).default;
    const version = packageJSON.version;
    let commitHash: string | undefined;

    if (!includeCommitHash) {
        return {version, commitHash};
    }

    return await new Promise((resolve) => {
        exec("git rev-parse --short=8 HEAD", (error, stdout) => {
            commitHash = stdout.trim();

            if (error || commitHash === "") {
                try {
                    commitHash = fs.readFileSync(path.join(__dirname, "..", "..", "dist", ".hash"), "utf-8");
                } catch {
                    commitHash = "unknown";
                }
            }

            resolve({commitHash, version});
        });
    });
}

async function getDependencyVersion(depend: string): Promise<{version: string}> {
    const packageJSON = (await import(`${depend}/package.json`, {with: {type: "json"}})).default;
    return {version: packageJSON.version};
}

function formatDate(time: number, type: "ISO_8601" | "ISO_8601_local" | "epoch" | "relative"): string | number {
    switch (type) {
        case "ISO_8601":
            // ISO8601 (UTC) = 2019-03-01T15:32:45.941Z
            return new Date(time).toISOString();

        case "ISO_8601_local":
            // ISO8601 (local) = 2019-03-01T16:32:45.941+01:00 (for timezone GMT+1)
            return toLocalISOString(new Date(time));

        case "epoch":
            return time;

        default:
            // relative
            return `${humanizeDuration(Date.now() - time, {language: "en", largest: 2, round: true})} ago`;
    }
}

function objectIsEmpty(object: object): boolean {
    // much faster than checking `Object.keys(object).length`
    for (const _k in object) return false;
    return true;
}

function objectHasProperties(object: {[s: string]: unknown}, properties: string[]): boolean {
    for (const property of properties) {
        if (object[property] === undefined) {
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

function getObjectProperty<T>(object: KeyValue, key: string, defaultValue: NoInfer<T>): T {
    return object && object[key] !== undefined ? object[key] : defaultValue;
}

function getResponse<T extends Zigbee2MQTTResponseEndpoints>(
    request: KeyValue | string,
    data: Zigbee2MQTTAPI[T],
    error?: string,
): Zigbee2MQTTResponse<T> {
    if (error !== undefined) {
        const response: Zigbee2MQTTResponse<T> = {
            data: {}, // always return an empty `data` payload on error
            status: "error",
            error: error,
        };

        if (typeof request === "object" && request.transaction !== undefined) {
            response.transaction = request.transaction;
        }

        return response;
    }

    const response: Zigbee2MQTTResponse<T> = {
        data, // valid from error check
        status: "ok",
    };

    if (typeof request === "object" && request.transaction !== undefined) {
        response.transaction = request.transaction;
    }

    return response;
}

function parseJSON(value: string, fallback: string): KeyValue | string {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

/**
 * Delete all keys from passed object that have null/undefined values.
 *
 * @param {KeyValue} obj Object to process (in-place)
 * @param {string[]} [ignoreKeys] Recursively ignore these keys in the object (keep null/undefined values).
 */
function removeNullPropertiesFromObject(obj: KeyValue, ignoreKeys: string[] = []): void {
    for (const key of Object.keys(obj)) {
        if (ignoreKeys.includes(key)) {
            continue;
        }

        const value = obj[key];

        if (value == null) {
            delete obj[key];
        } else if (typeof value === "object") {
            removeNullPropertiesFromObject(value, ignoreKeys);
        }
    }
}

function toNetworkAddressHex(value: number): string {
    const hex = value.toString(16);
    return `0x${"0".repeat(4 - hex.length)}${hex}`;
}

function charRange(start: string, stop: string): number[] {
    const result = [];
    for (let idx = start.charCodeAt(0), end = stop.charCodeAt(0); idx <= end; ++idx) {
        result.push(idx);
    }
    return result;
}

const controlCharacters = [...charRange("\u0000", "\u001F"), ...charRange("\u007f", "\u009F"), ...charRange("\ufdd0", "\ufdef")];

function containsControlCharacter(str: string): boolean {
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        if (controlCharacters.includes(ch) || [0xfffe, 0xffff].includes(ch & 0xffff)) {
            return true;
        }
    }
    return false;
}

function getAllFiles(path_: string): string[] {
    const result = [];

    for (const item of fs.readdirSync(path_, {withFileTypes: true})) {
        if (item.isSymbolicLink()) {
            continue;
        }

        const fileName = path.join(path_, item.name);

        if (fs.lstatSync(fileName).isFile()) {
            result.push(fileName);
        } else {
            result.push(...getAllFiles(fileName));
        }
    }

    return result;
}

function validateFriendlyName(name: string, throwFirstError = false): string[] {
    const errors = [];

    if (name.length === 0) errors.push("friendly_name must be at least 1 char long");
    if (name.endsWith("/") || name.startsWith("/")) errors.push("friendly_name is not allowed to end or start with /");
    if (containsControlCharacter(name)) errors.push("friendly_name is not allowed to contain control char");
    if (name.match(/.*\/\d*$/)) errors.push(`Friendly name cannot end with a "/DIGIT" ('${name}')`);
    if (name.includes("#") || name.includes("+")) {
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
    return parameter.replace(/\?|&|[^a-z\d\- _./:]/gi, "-");
}

function isAvailabilityEnabledForEntity(entity: Device | Group, settings: Settings): boolean {
    if (entity.isDevice() && entity.options.disabled) {
        return false;
    }

    if (entity.isGroup()) {
        for (const memberDevice of entity.membersDevices()) {
            if (!isAvailabilityEnabledForEntity(memberDevice, settings)) {
                return false;
            }
        }

        return true;
    }

    if (entity.options.availability != null) {
        return !!entity.options.availability;
    }

    return settings.availability.enabled;
}

function isZHEndpoint(obj: unknown): obj is zh.Endpoint {
    return obj?.constructor.name.toLowerCase() === "endpoint";
}

function flatten<Type>(arr: Type[][]): Type[] {
    return ([] as Type[]).concat(...arr);
}

function arrayUnique<Type>(arr: Type[]): Type[] {
    return [...new Set(arr)];
}

function isZHGroup(obj: unknown): obj is zh.Group {
    return obj?.constructor.name.toLowerCase() === "group";
}

export const hours = (hours: number): number => 1000 * 60 * 60 * hours;
export const minutes = (minutes: number): number => 1000 * 60 * minutes;
export const seconds = (seconds: number): number => 1000 * seconds;

async function publishLastSeen(
    data: eventdata.LastSeenChanged,
    settings: Settings,
    allowMessageEmitted: boolean,
    publishEntityState: PublishEntityState,
): Promise<void> {
    /**
     * Prevent 2 MQTT publishes when 1 message event is received;
     * - In case reason == messageEmitted, receive.ts will only call this when it did not publish a
     *      message based on the received zigbee message. In this case allowMessageEmitted has to be true.
     * - In case reason !== messageEmitted, controller.ts will call this based on the zigbee-herdsman
     *      lastSeenChanged event.
     */
    const allow = data.reason !== "messageEmitted" || (data.reason === "messageEmitted" && allowMessageEmitted);
    if (settings.advanced.last_seen && settings.advanced.last_seen !== "disable" && allow) {
        await publishEntityState(data.device, {}, "lastSeenChanged");
    }
}

function filterProperties(filter: string[] | undefined, data: KeyValue): void {
    if (filter) {
        for (const property of Object.keys(data)) {
            if (filter.find((p) => property.match(`^${p}$`))) {
                delete data[property];
            }
        }
    }
}

export function isNumericExpose(expose: zhc.Expose): expose is zhc.Numeric {
    return expose?.type === "numeric";
}

export function assertEnumExpose(expose: zhc.Expose): asserts expose is zhc.Enum {
    assert(expose?.type === "enum");
}

export function assertNumericExpose(expose: zhc.Expose): asserts expose is zhc.Numeric {
    assert(expose?.type === "numeric");
}

export function assertBinaryExpose(expose: zhc.Expose): asserts expose is zhc.Binary {
    assert(expose?.type === "binary");
}

export function isEnumExpose(expose: zhc.Expose): expose is zhc.Enum {
    return expose?.type === "enum";
}

export function isBinaryExpose(expose: zhc.Expose): expose is zhc.Binary {
    return expose?.type === "binary";
}

export function isLightExpose(expose: zhc.Expose): expose is zhc.Light {
    return expose.type === "light";
}

export function assertString(value: unknown, property: string): asserts value is string {
    if (typeof value !== "string") {
        throw new Error(`${property} is not a string, got ${typeof value} (${value})`);
    }
}

export function formatTimestamp(date: Date, format: string): string {
    // Previously moment (https://www.npmjs.com/package/moment) was used for formatting timestamps.
    // To reduce dependencies and size (moment=4.35mb), this was replaced with a simple implementation.
    return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => {
        switch (token) {
            case "YYYY":
                return date.getFullYear().toString();
            case "MM":
                return (date.getMonth() + 1).toString().padStart(2, "0");
            case "DD":
                return date.getDate().toString().padStart(2, "0");
            case "HH":
                return date.getHours().toString().padStart(2, "0");
            case "mm":
                return date.getMinutes().toString().padStart(2, "0");
            case "ss":
                return date.getSeconds().toString().padStart(2, "0");
            default:
                return token;
        }
    });
}

function getScenes(entity: zh.Endpoint | zh.Group): Zigbee2MQTTScene[] {
    const scenes: {[id: number]: Zigbee2MQTTScene} = {};
    const endpoints = isZHEndpoint(entity) ? [entity] : entity.members;
    const groupID = isZHEndpoint(entity) ? 0 : entity.groupID;

    for (const endpoint of endpoints) {
        for (const [key, data] of Object.entries(endpoint.meta?.scenes || {})) {
            const split = key.split("_");
            const sceneID = Number.parseInt(split[0], 10);
            const sceneGroupID = Number.parseInt(split[1], 10);
            if (sceneGroupID === groupID) {
                scenes[sceneID] = {id: sceneID, name: (data as KeyValue).name || `Scene ${sceneID}`};
            }
        }
    }

    return Object.values(scenes);
}

function deviceNotCoordinator(device: zh.Device): boolean {
    return device.type !== "Coordinator";
}

function matchBase64File(value: string | undefined): {extension: string; data: string} | false {
    if (value !== undefined) {
        const match = value.match(BASE64_IMAGE_REGEX);
        if (match) {
            assert(match.groups?.extension && match.groups?.data);
            return {extension: match.groups.extension, data: match.groups.data};
        }
    }
    return false;
}

function saveBase64DeviceIcon(base64Match: {extension: string; data: string}): string {
    const md5Hash = crypto.createHash("md5").update(base64Match.data).digest("hex");
    const fileSettings = `device_icons/${md5Hash}.${base64Match.extension}`;
    const file = path.join(data.getPath(), fileSettings);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, base64Match.data, {encoding: "base64"});
    return fileSettings;
}

/* v8 ignore next */
const noop = (): void => {};

export default {
    matchBase64File,
    saveBase64DeviceIcon,
    capitalize,
    getZigbee2MQTTVersion,
    getDependencyVersion,
    formatDate,
    objectIsEmpty,
    objectHasProperties,
    equalsPartial,
    getObjectProperty,
    getResponse,
    parseJSON,
    removeNullPropertiesFromObject,
    toNetworkAddressHex,
    isZHEndpoint,
    isZHGroup,
    hours,
    minutes,
    seconds,
    validateFriendlyName,
    sleep,
    sanitizeImageParameter,
    isAvailabilityEnabledForEntity,
    publishLastSeen,
    getAllFiles,
    filterProperties,
    flatten,
    arrayUnique,
    getScenes,
    deviceNotCoordinator,
    noop,
};
