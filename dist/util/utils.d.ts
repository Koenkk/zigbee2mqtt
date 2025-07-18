import type * as zhc from "zigbee-herdsman-converters";
import type { Zigbee2MQTTAPI, Zigbee2MQTTResponse, Zigbee2MQTTResponseEndpoints, Zigbee2MQTTScene } from "../types/api";
export declare const DEFAULT_BIND_GROUP_ID = 901;
declare function capitalize(s: string): string;
export declare function getZigbee2MQTTVersion(includeCommitHash?: boolean): Promise<{
    commitHash?: string;
    version: string;
}>;
declare function getDependencyVersion(depend: string): Promise<{
    version: string;
}>;
declare function formatDate(time: number, type: "ISO_8601" | "ISO_8601_local" | "epoch" | "relative"): string | number;
declare function objectIsEmpty(object: object): boolean;
declare function objectHasProperties(object: {
    [s: string]: unknown;
}, properties: string[]): boolean;
declare function equalsPartial(object: KeyValue, expected: KeyValue): boolean;
declare function getObjectProperty<T>(object: KeyValue, key: string, defaultValue: NoInfer<T>): T;
declare function getResponse<T extends Zigbee2MQTTResponseEndpoints>(request: KeyValue | string, data: Zigbee2MQTTAPI[T], error?: string): Zigbee2MQTTResponse<T>;
declare function parseJSON(value: string, fallback: string): KeyValue | string;
/**
 * Delete all keys from passed object that have null/undefined values.
 *
 * @param {KeyValue} obj Object to process (in-place)
 * @param {string[]} [ignoreKeys] Recursively ignore these keys in the object (keep null/undefined values).
 */
declare function removeNullPropertiesFromObject(obj: KeyValue, ignoreKeys?: string[]): void;
declare function toNetworkAddressHex(value: number): string;
declare function getAllFiles(path_: string): string[];
declare function validateFriendlyName(name: string, throwFirstError?: boolean): string[];
declare function sleep(seconds: number): Promise<void>;
declare function sanitizeImageParameter(parameter: string): string;
declare function isAvailabilityEnabledForEntity(entity: Device | Group, settings: Settings): boolean;
declare function isZHEndpoint(obj: unknown): obj is zh.Endpoint;
declare function flatten<Type>(arr: Type[][]): Type[];
declare function arrayUnique<Type>(arr: Type[]): Type[];
declare function isZHGroup(obj: unknown): obj is zh.Group;
export declare const hours: (hours: number) => number;
export declare const minutes: (minutes: number) => number;
export declare const seconds: (seconds: number) => number;
declare function publishLastSeen(data: eventdata.LastSeenChanged, settings: Settings, allowMessageEmitted: boolean, publishEntityState: PublishEntityState): Promise<void>;
declare function filterProperties(filter: string[] | undefined, data: KeyValue): void;
export declare function isNumericExpose(expose: zhc.Expose): expose is zhc.Numeric;
export declare function assertEnumExpose(expose: zhc.Expose): asserts expose is zhc.Enum;
export declare function assertNumericExpose(expose: zhc.Expose): asserts expose is zhc.Numeric;
export declare function assertBinaryExpose(expose: zhc.Expose): asserts expose is zhc.Binary;
export declare function isEnumExpose(expose: zhc.Expose): expose is zhc.Enum;
export declare function isBinaryExpose(expose: zhc.Expose): expose is zhc.Binary;
export declare function isLightExpose(expose: zhc.Expose): expose is zhc.Light;
export declare function assertString(value: unknown, property: string): asserts value is string;
declare function getScenes(entity: zh.Endpoint | zh.Group): Zigbee2MQTTScene[];
declare function deviceNotCoordinator(device: zh.Device): boolean;
declare function matchBase64File(value: string | undefined): {
    extension: string;
    data: string;
} | false;
declare function saveBase64DeviceIcon(base64Match: {
    extension: string;
    data: string;
}): string;
declare const _default: {
    matchBase64File: typeof matchBase64File;
    saveBase64DeviceIcon: typeof saveBase64DeviceIcon;
    capitalize: typeof capitalize;
    getZigbee2MQTTVersion: typeof getZigbee2MQTTVersion;
    getDependencyVersion: typeof getDependencyVersion;
    formatDate: typeof formatDate;
    objectIsEmpty: typeof objectIsEmpty;
    objectHasProperties: typeof objectHasProperties;
    equalsPartial: typeof equalsPartial;
    getObjectProperty: typeof getObjectProperty;
    getResponse: typeof getResponse;
    parseJSON: typeof parseJSON;
    removeNullPropertiesFromObject: typeof removeNullPropertiesFromObject;
    toNetworkAddressHex: typeof toNetworkAddressHex;
    isZHEndpoint: typeof isZHEndpoint;
    isZHGroup: typeof isZHGroup;
    hours: (hours: number) => number;
    minutes: (minutes: number) => number;
    seconds: (seconds: number) => number;
    validateFriendlyName: typeof validateFriendlyName;
    sleep: typeof sleep;
    sanitizeImageParameter: typeof sanitizeImageParameter;
    isAvailabilityEnabledForEntity: typeof isAvailabilityEnabledForEntity;
    publishLastSeen: typeof publishLastSeen;
    getAllFiles: typeof getAllFiles;
    filterProperties: typeof filterProperties;
    flatten: typeof flatten;
    arrayUnique: typeof arrayUnique;
    getScenes: typeof getScenes;
    deviceNotCoordinator: typeof deviceNotCoordinator;
    noop: () => void;
};
export default _default;
//# sourceMappingURL=utils.d.ts.map