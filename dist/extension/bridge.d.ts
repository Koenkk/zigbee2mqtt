import Device from "../model/device";
import type Group from "../model/group";
import type { Zigbee2MQTTDevice, Zigbee2MQTTResponse } from "../types/api";
import Extension from "./extension";
export default class Bridge extends Extension {
    #private;
    private zigbee2mqttVersion;
    private zigbeeHerdsmanVersion;
    private zigbeeHerdsmanConvertersVersion;
    private coordinatorVersion;
    private restartRequired;
    private lastJoinedDeviceIeeeAddr?;
    private lastBridgeLoggingPayload?;
    private logTransport;
    private requestLookup;
    start(): Promise<void>;
    stop(): Promise<void>;
    onMQTTMessage(data: eventdata.MQTTMessage): Promise<void>;
    /**
     * Requests
     */
    deviceOptions(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/device/options">>;
    groupOptions(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/group/options">>;
    bridgeOptions(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/options">>;
    deviceRemove(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/device/remove">>;
    groupRemove(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/group/remove">>;
    healthCheck(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/health_check">>;
    coordinatorCheck(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/coordinator_check">>;
    groupAdd(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/group/add">>;
    deviceRename(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/device/rename">>;
    groupRename(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/group/rename">>;
    restart(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/restart">>;
    backup(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/backup">>;
    installCodeAdd(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/install_code/add">>;
    permitJoin(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/permit_join">>;
    touchlinkIdentify(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/touchlink/identify">>;
    touchlinkFactoryReset(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/touchlink/factory_reset">>;
    touchlinkScan(message: KeyValue | string): Promise<Zigbee2MQTTResponse<"bridge/response/touchlink/scan">>;
    /**
     * Utils
     */
    changeEntityOptions<T extends "device" | "group">(entityType: T, message: KeyValue | string): Promise<Zigbee2MQTTResponse<T extends "device" ? "bridge/response/device/options" : "bridge/response/group/options">>;
    deviceConfigureReporting(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/device/configure_reporting">>;
    deviceInterview(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/device/interview">>;
    deviceGenerateExternalDefinition(message: string | KeyValue): Promise<Zigbee2MQTTResponse<"bridge/response/device/generate_external_definition">>;
    renameEntity<T extends "device" | "group">(entityType: T, message: string | KeyValue): Promise<Zigbee2MQTTResponse<T extends "device" ? "bridge/response/device/rename" : "bridge/response/group/rename">>;
    removeEntity<T extends "device" | "group">(entityType: T, message: string | KeyValue): Promise<Zigbee2MQTTResponse<T extends "device" ? "bridge/response/device/remove" : "bridge/response/group/remove">>;
    getEntity(type: "group", id: string): Group;
    getEntity(type: "device", id: string): Device;
    getEntity(type: "group" | "device", id: string): Device | Group;
    publishInfo(): Promise<void>;
    publishDevices(): Promise<void>;
    publishGroups(): Promise<void>;
    publishDefinitions(): Promise<void>;
    getDefinitionPayload(device: Device): Zigbee2MQTTDevice["definition"] | undefined;
}
//# sourceMappingURL=bridge.d.ts.map