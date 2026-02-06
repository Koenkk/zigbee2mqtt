import assert from "node:assert";
import {exec} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import equals from "fast-deep-equal/es6";
import humanizeDuration from "humanize-duration";
import type * as zhc from "zigbee-herdsman-converters";
import type {CommandResponseError, Zigbee2MQTTAPI, Zigbee2MQTTResponse, Zigbee2MQTTResponseEndpoints, Zigbee2MQTTScene} from "../types/api";

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

/**
 * Known ZCL status names to their numeric codes.
 *
 * Reference: Zigbee Cluster Library Specification 07-5123, Revision 7+
 * Status Enumerations defined in Chapter 2, Table 2-10
 * Source: zigbee-herdsman/dist/zspec/zcl/definition/status.js
 *
 * Status codes are stable across ZCL versions (core codes 0-149 unchanged since ZCL6).
 */
const ZCL_STATUS_MAP: Record<string, number> = {
    UNSUPPORTED_ATTRIBUTE: 134,
    INVALID_VALUE: 135,
    READ_ONLY: 136,
    INSUFFICIENT_SPACE: 137,
    DUPLICATE_EXISTS: 138,
    NOT_FOUND: 139,
    UNREPORTABLE_ATTRIBUTE: 140,
    INVALID_DATA_TYPE: 141,
    INVALID_SELECTOR: 142,
    WRITE_ONLY: 143,
    INCONSISTENT_STARTUP_STATE: 144,
    DEFINED_OUT_OF_BAND: 145,
    INCONSISTENT: 146,
    ACTION_DENIED: 147,
    TIMEOUT: 148,
    ABORT: 149,
    INVALID_IMAGE: 150,
    WAIT_FOR_DATA: 151,
    NO_IMAGE_AVAILABLE: 152,
    REQUIRE_MORE_IMAGE: 153,
    NOTIFICATION_PENDING: 154,
    HARDWARE_FAILURE: 192,
    SOFTWARE_FAILURE: 193,
    CALIBRATION_ERROR: 194,
    UNSUPPORTED_CLUSTER: 195,
    LIMIT_REACHED: 196,
};

/**
 * Check if error message indicates a timeout.
 *
 * Performance consideration for large deployments (1000s of devices on Raspberry Pi):
 * - Runs only on command failures (errors are minority of traffic)
 * - ~10us per call; even 100 simultaneous failures = ~1ms total
 * - Zigbee radio throughput is the bottleneck, not this string processing
 * - toLowerCase() required due to inconsistent casing in zigbee-herdsman errors
 */
function isTimeoutError(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    // Check common timeout patterns
    if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
        return true;
    }
    // Check ZCL/ZDO timeout status codes (148 for ZCL, 133 for ZDO)
    if (message.includes("status 148") || message.includes("status=148") || message.includes("status: 148")) {
        return true;
    }
    if (message.includes("status 133") || message.includes("status=133") || message.includes("status: 133")) {
        return true;
    }
    return false;
}

/**
 * Check if error message indicates no route / delivery failure.
 *
 * Performance: Same considerations as isTimeoutError - see above.
 */
function isNoRouteError(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    // Various no-route patterns
    if (lowerMessage.includes("no route") || lowerMessage.includes("no_route") || lowerMessage.includes("nwk_no_route")) {
        return true;
    }
    // Delivery failures
    if (lowerMessage.includes("delivery failed") || lowerMessage.includes("delivery_failed")) {
        return true;
    }
    // MAC/APS/NWK layer acknowledgment failures
    if (lowerMessage.includes("mac_no_ack") || lowerMessage.includes("mac no ack")) {
        return true;
    }
    if (lowerMessage.includes("aps_no_ack") || lowerMessage.includes("nwk_no_ack")) {
        return true;
    }
    // Network route errors
    if (lowerMessage.includes("no network route")) {
        return true;
    }
    return false;
}

/**
 * Check if error is a ZCL error and extract status code if possible.
 *
 * Performance consideration for large deployments (1000s of devices on Raspberry Pi):
 * - Runs only on command failures (errors are minority of traffic)
 * - Constructor name check is O(1); regex fallback ~20us per call
 * - Even 100 simultaneous ZCL errors = ~2ms total processing
 * - Zigbee radio throughput is the bottleneck, not this string processing
 *
 * zigbee-herdsman error format inconsistencies (why we need multiple patterns):
 * - ZclStatusError.toString(): "Status 'UNSUPPORTED_ATTRIBUTE'"
 * - Some adapters: "status=134" or "status: 134"
 * - Ember adapter: "Status '0x86'" (hex format)
 * - Z-Stack adapter: "Data request failed with status: 205"
 *
 * The flexible regex patterns accommodate these variations.
 */
function detectZclError(error: Error | string, message: string): {isZcl: boolean; zclStatus?: number} {
    // Check if it's a ZclStatusError by constructor name
    if (typeof error === "object" && error.constructor?.name === "ZclStatusError") {
        const zclError = error as Error & {code?: number};
        return {isZcl: true, zclStatus: zclError.code};
    }

    // Check for known ZCL status name patterns like "Status 'UNSUPPORTED_ATTRIBUTE'"
    const statusNameMatch = message.match(/Status\s*'(\w+)'/i);
    if (statusNameMatch) {
        const statusName = statusNameMatch[1].toUpperCase();
        const zclStatus = ZCL_STATUS_MAP[statusName];
        if (zclStatus !== undefined) {
            return {isZcl: true, zclStatus};
        }
        // It's a status error but we don't have the numeric code
        return {isZcl: true};
    }

    // Check for numeric status patterns like "status=134" or "status: 134" or "status 134"
    const statusNumMatch = message.match(/status[=:\s]+(\d+)/i);
    if (statusNumMatch) {
        const zclStatus = Number.parseInt(statusNumMatch[1], 10);
        return {isZcl: true, zclStatus};
    }

    return {isZcl: false};
}

/**
 * Normalize zigbee-herdsman errors into structured error codes.
 *
 * Maps raw error messages to the SetResponseError format with:
 * - code: TIMEOUT, NO_ROUTE, ZCL_ERROR, or UNKNOWN
 * - message: Original error message preserved verbatim
 * - zcl_status: Numeric ZCL status code when applicable
 *
 * @param error - Error object or string message from zigbee-herdsman
 * @returns Structured error object for automation parsing
 */
function normalizeHerdsmanError(error: Error | string): CommandResponseError {
    // Extract message from Error object or use string directly
    const message = typeof error === "string" ? error : error.message;

    // Check for timeout first (most common)
    if (isTimeoutError(message)) {
        return {code: "TIMEOUT", message};
    }

    // Check for no route / delivery failures
    if (isNoRouteError(message)) {
        return {code: "NO_ROUTE", message};
    }

    // Check for ZCL errors
    const zclResult = detectZclError(error, message);
    if (zclResult.isZcl) {
        const result: CommandResponseError = {code: "ZCL_ERROR", message};
        if (zclResult.zclStatus !== undefined) {
            result.zcl_status = zclResult.zclStatus;
        }
        return result;
    }

    // Default to UNKNOWN
    return {code: "UNKNOWN", message};
}

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
    normalizeHerdsmanError,
};
