declare module 'zigbee-herdsman-converters' {
    export function findByDevice(device: zh.Device): zhc.Definition;
    export function getConfigureKey(definition: zhc.Definition): string | number;
    export const toZigbeeConverters: {[s: string]: zhc.ToZigbeeConverter};
    export const definitions: zhc.Definition[];
    export function addDeviceDefinition(definition: zhc.Definition): Promise<void>;
    export function onEvent(type: string, data: KeyValue, device: zh.Device, settings: KeyValue,
        state: KeyValue): Promise<void>;
}

declare module 'zigbee-herdsman-converters/lib/ota/tradfri' {
    export function useTestURL(): void;
}

declare module 'zigbee-herdsman-converters/lib/ota/zigbeeOTA' {
    export function useIndexOverride(indexFileName: string): void;
    export function setDataDir(dataDir: string): void;
}
