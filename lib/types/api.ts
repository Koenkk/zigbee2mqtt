import type * as zigbeeHerdsman from "zigbee-herdsman/dist";
import type {ZclPayload} from "zigbee-herdsman/dist/adapter/events";
import type {Eui64} from "zigbee-herdsman/dist/zspec/tstypes";
import type {ClusterDefinition, ClusterName, CustomClusters} from "zigbee-herdsman/dist/zspec/zcl/definition/tstype";
import type {GenericZdoResponse, RoutingTableEntry} from "zigbee-herdsman/dist/zspec/zdo/definition/tstypes";
import type * as zigbeeHerdsmanConverter from "zigbee-herdsman-converters";
import type {Base} from "zigbee-herdsman-converters/lib/exposes";

export type * as ZSpec from "zigbee-herdsman/dist/zspec";
export type * as Zcl from "zigbee-herdsman/dist/zspec/zcl";
export type * as Zdo from "zigbee-herdsman/dist/zspec/zdo";

export type Zigbee2MQTTFeatures = {
    base: Base;
    switch: zigbeeHerdsmanConverter.Switch;
    lock: zigbeeHerdsmanConverter.Lock;
    binary: zigbeeHerdsmanConverter.Binary;
    list: zigbeeHerdsmanConverter.List;
    numeric: zigbeeHerdsmanConverter.Numeric;
    enum: zigbeeHerdsmanConverter.Enum;
    text: zigbeeHerdsmanConverter.Text;
    composite: zigbeeHerdsmanConverter.Composite;
    light: zigbeeHerdsmanConverter.Light;
    cover: zigbeeHerdsmanConverter.Cover;
    fan: zigbeeHerdsmanConverter.Fan;
    climate: zigbeeHerdsmanConverter.Climate;
};

import type {UpdatePayload} from "../extension/otaUpdate";
import type {LogLevel, schemaJson} from "../util/settings";

// biome-ignore lint/suspicious/noExplicitAny: API
type KeyValue = Record<string, any>;

export interface Zigbee2MQTTDeviceOptions {
    disabled?: boolean;
    retention?: number;
    availability?:
        | boolean
        | {
              timeout: number;
              max_jitter?: number;
              backoff?: boolean;
              pause_on_backoff_gt?: number;
          };
    optimistic?: boolean;
    debounce?: number;
    debounce_ignore?: string[];
    throttle?: number;
    filtered_attributes?: string[];
    filtered_cache?: string[];
    filtered_optimistic?: string[];
    icon?: string;
    homeassistant?: KeyValue;
    friendly_name: string;
    description?: string;
    qos?: 0 | 1 | 2;
}

export interface Zigbee2MQTTGroupOptions {
    ID: number;
    optimistic?: boolean;
    off_state?: "all_members_off" | "last_member_state";
    filtered_attributes?: string[];
    filtered_cache?: string[];
    filtered_optimistic?: string[];
    homeassistant?: KeyValue;
    friendly_name: string;
    description?: string;
    qos?: 0 | 1 | 2;
}

export interface Zigbee2MQTTSettings {
    version?: number;
    /** only used internally during startup, removed on successful Z2M start */
    onboarding?: true;
    homeassistant: {
        enabled: boolean;
        discovery_topic: string;
        status_topic: string;
        experimental_event_entities: boolean;
        legacy_action_sensor: boolean;
    };
    availability: {
        enabled: boolean;
        active: {
            timeout: number;
            max_jitter: number;
            backoff: boolean;
            pause_on_backoff_gt: number;
        };
        passive: {timeout: number};
    };
    mqtt: {
        base_topic: string;
        include_device_information: boolean;
        force_disable_retain: boolean;
        version?: 3 | 4 | 5;
        user?: string;
        password?: string;
        server: string;
        ca?: string;
        keepalive?: number;
        key?: string;
        cert?: string;
        client_id?: string;
        reject_unauthorized?: boolean;
        maximum_packet_size: number;
    };
    serial: {
        disable_led: boolean;
        port?: string;
        adapter?: "deconz" | "zstack" | "ezsp" | "zigate" | "ember" | "zboss" | "zoh";
        baudrate?: number;
        rtscts?: boolean;
    };
    passlist: string[];
    blocklist: string[];
    map_options: {
        graphviz: {
            colors: {
                fill: {
                    enddevice: string;
                    coordinator: string;
                    router: string;
                };
                font: {
                    coordinator: string;
                    router: string;
                    enddevice: string;
                };
                line: {
                    active: string;
                    inactive: string;
                };
            };
        };
    };
    ota: {
        update_check_interval: number;
        disable_automatic_update_check: boolean;
        zigbee_ota_override_index_location?: string;
        image_block_response_delay?: number;
        default_maximum_data_size?: number;
    };
    frontend: {
        enabled: boolean;
        package: "zigbee2mqtt-frontend" | "zigbee2mqtt-windfront";
        auth_token?: string;
        host?: string;
        port: number;
        base_url: string;
        url?: string;
        ssl_cert?: string;
        ssl_key?: string;
        notification_filter?: string[];
        disable_ui_serving?: boolean;
    };
    devices: {[s: string]: Zigbee2MQTTDeviceOptions};
    groups: {[s: string]: Omit<Zigbee2MQTTGroupOptions, "ID">};
    device_options: KeyValue;
    advanced: {
        log_rotation: boolean;
        log_console_json: boolean;
        log_symlink_current: boolean;
        log_output: ("console" | "file" | "syslog")[];
        log_directory: string;
        log_file: string;
        log_level: LogLevel;
        log_namespaced_levels: Record<string, LogLevel>;
        log_syslog: KeyValue;
        log_debug_to_mqtt_frontend: boolean;
        log_debug_namespace_ignore: string;
        log_directories_to_keep: number;
        pan_id: number | "GENERATE";
        ext_pan_id: number[] | "GENERATE";
        channel: number;
        adapter_concurrent?: number;
        adapter_delay?: number;
        cache_state: boolean;
        cache_state_persistent: boolean;
        cache_state_send_on_startup: boolean;
        last_seen: "disable" | "ISO_8601" | "ISO_8601_local" | "epoch";
        elapsed: boolean;
        network_key: number[] | "GENERATE";
        timestamp_format: string;
        output: "json" | "attribute" | "attribute_and_json";
        transmit_power?: number;
    };
    health: {
        /** in minutes */
        interval: number;
        reset_on_check: boolean;
    };
}

export interface Zigbee2MQTTScene {
    id: number;
    name: string;
}

export interface Zigbee2MQTTDeviceEndpoint {
    name?: string;
    bindings: Zigbee2MQTTDeviceEndpointBinding[];
    configured_reportings: Zigbee2MQTTDeviceEndpointConfiguredReporting[];
    clusters: {input: string[]; output: string[]};
    scenes: Zigbee2MQTTScene[];
}

export interface Zigbee2MQTTDeviceEndpointBinding {
    cluster: string;
    target: Zigbee2MQTTDeviceEndpointBindingTarget;
}

export type Zigbee2MQTTDeviceEndpointBindingTarget = {type: "endpoint"; ieee_address: string; endpoint: number} | {type: "group"; id: number};

export interface Zigbee2MQTTDeviceEndpointConfiguredReporting {
    cluster: string;
    attribute: string | number;
    minimum_report_interval: number;
    maximum_report_interval: number;
    reportable_change: number;
}

export interface Zigbee2MQTTDeviceDefinition {
    source: "native" | "generated" | "external";
    model: string;
    vendor: string;
    description: string;
    exposes: zigbeeHerdsmanConverter.Expose[];
    supports_ota: boolean;
    options: zigbeeHerdsmanConverter.Option[];
    icon: string;
}

export interface Zigbee2MQTTDevice {
    ieee_address: zigbeeHerdsman.Models.Device["ieeeAddr"];
    type: zigbeeHerdsman.Models.Device["type"];
    network_address: zigbeeHerdsman.Models.Device["networkAddress"];
    supported: boolean;
    friendly_name: string;
    disabled: boolean;
    description?: string;
    definition?: Zigbee2MQTTDeviceDefinition;
    power_source: zigbeeHerdsman.Models.Device["powerSource"];
    software_build_id: zigbeeHerdsman.Models.Device["softwareBuildID"];
    date_code: zigbeeHerdsman.Models.Device["dateCode"];
    model_id: zigbeeHerdsman.Models.Device["modelID"];
    interviewing: boolean;
    interview_completed: boolean;
    interview_state: zigbeeHerdsman.Models.Device["interviewState"];
    manufacturer: zigbeeHerdsman.Models.Device["manufacturerName"];
    endpoints: Record<number, Zigbee2MQTTDeviceEndpoint>;
}

export interface Zigbee2MQTTGroupMember {
    ieee_address: zigbeeHerdsman.Models.Device["ieeeAddr"];
    endpoint: number;
}

export interface Zigbee2MQTTGroup {
    id: number;
    friendly_name: "default_bind_group" | string;
    description?: string;
    scenes: Zigbee2MQTTScene[];
    members: Zigbee2MQTTGroupMember[];
}

export interface Zigbee2MQTTNetworkMap {
    nodes: {
        ieeeAddr: string;
        friendlyName: string;
        type: string;
        networkAddress: number;
        manufacturerName?: string;
        modelID?: string;
        failed?: string[];
        lastSeen?: number;
        definition?: {model: string; vendor: string; supports: string; description: string};
    }[];
    links: {
        source: {ieeeAddr: string; networkAddress: number};
        target: {ieeeAddr: string; networkAddress: number};
        deviceType: number;
        rxOnWhenIdle: number;
        relationship: number;
        permitJoining: number;
        depth: number;
        lqi: number;
        routes: RoutingTableEntry[];
        /** @deprecated 3.0 */
        linkquality: number;
        /** @deprecated 3.0 */
        sourceIeeeAddr: string;
        /** @deprecated 3.0 */
        targetIeeeAddr: string;
        /** @deprecated 3.0 */
        sourceNwkAddr: number;
    }[];
}

/**
 * Zigbee2MQTT state/request/response API endpoints
 */
export interface Zigbee2MQTTAPI {
    "bridge/logging": {
        message: string;
        level: LogLevel;
        namespace: string;
    };

    "bridge/state": {
        state: "online" | "offline";
    };

    "bridge/definitions": {
        clusters: Readonly<Record<ClusterName, Readonly<ClusterDefinition>>>;
        custom_clusters: Record<string, CustomClusters>;
        actions: string[];
    };

    "bridge/event":
        | {
              type: "device_leave" | "device_joined" | "device_announce";
              data: {
                  friendly_name: string;
                  ieee_address: string;
              };
          }
        | {
              type: "device_interview";
              data:
                  | {
                        friendly_name: string;
                        ieee_address: string;
                        status: "started" | "failed";
                    }
                  | {
                        friendly_name: string;
                        ieee_address: string;
                        status: "successful";
                        supported: boolean;
                        definition: Zigbee2MQTTDeviceDefinition | undefined;
                    };
          };

    "bridge/info": {
        os: {
            version: string;
            node_version: string;
            cpus: string;
            memory_mb: number;
        };
        mqtt: {
            version: number | undefined;
            server: string;
        };
        version: string;
        commit: string | undefined;
        zigbee_herdsman_converters: {version: string};
        zigbee_herdsman: {version: string};
        coordinator: {
            ieee_address: string;
            type: string;
            meta: {
                [s: string]: number | string;
            };
        };
        network: {
            pan_id: number;
            /** `0x${string}` 8-len */
            extended_pan_id: string;
            channel: number;
        };
        log_level: "debug" | "info" | "warning" | "error";
        permit_join: boolean;
        permit_join_end: number | undefined;
        restart_required: boolean;
        config: Zigbee2MQTTSettings;
        config_schema: typeof schemaJson;
    };

    "bridge/health": {
        /** time of message, msec from epoch, UTC */
        response_time: number;
        os: {
            load_average: number[];
            memory_used_mb: number;
            memory_percent: number;
        };
        process: {
            uptime_sec: number;
            memory_used_mb: number;
            memory_percent: number;
        };
        mqtt: {
            connected: boolean;
            queued: number;
            received: number;
            published: number;
        };
        devices: Record<
            string /* ieee */,
            {
                messages: number;
                messages_per_sec: number;
                leave_count: number;
                network_address_changes: number;
            }
        >;
    };

    "bridge/devices": Zigbee2MQTTDevice[];

    "bridge/groups": Zigbee2MQTTGroup[];

    "bridge/converters": {name: string; code: string}[];

    "bridge/extensions": {name: string; code: string}[];

    "bridge/request/permit_join":
        | {
              /** [0-254], 0 meaning disable */
              time: number;
              device?: string;
          }
        | `${number}`;

    "bridge/response/permit_join": {
        /** [0-254], 0 meaning disable */
        time: number;
        device?: string;
    };

    "bridge/request/health_check": "";

    "bridge/response/health_check": {
        /** XXX: currently always returns true */
        healthy: boolean;
    };

    "bridge/request/coordinator_check": "";

    "bridge/response/coordinator_check": {
        missing_routers: {
            ieee_address: string;
            friendly_name: string;
        }[];
    };

    "bridge/request/restart": "";

    "bridge/response/restart": Record<string, never>;

    "bridge/request/networkmap":
        | {
              type: "raw" | "graphviz" | "plantuml";
              routes: boolean;
          }
        | "raw"
        | "graphviz"
        | "plantuml";

    "bridge/response/networkmap":
        | {
              type: "raw";
              routes: boolean;
              value: Zigbee2MQTTNetworkMap;
          }
        | {
              type: "graphviz" | "plantuml";
              routes: boolean;
              value: string;
          };

    "bridge/request/extension/save": {
        name: string;
        code: string;
    };

    "bridge/response/extension/save": Record<string, never>;

    "bridge/request/extension/remove": {
        name: string;
    };

    "bridge/response/extension/remove": Record<string, never>;

    "bridge/request/converter/save": {
        name: string;
        code: string;
    };

    "bridge/response/converter/save": Record<string, never>;

    "bridge/request/converter/remove": {
        name: string;
    };

    "bridge/response/converter/remove": Record<string, never>;

    "bridge/request/backup": "";

    "bridge/response/backup": {
        /** base64 encoded ZIP archive */
        zip: string;
    };

    "bridge/request/install_code/add": {
        value: string;
    };

    "bridge/response/install_code/add": {
        value: string;
    };

    /**
     * Applied on-the-fly:
     * - newSettings.homeassistant
     * - newSettings.advanced?.log_level
     * - newSettings.advanced?.log_namespaced_levels
     * - newSettings.advanced?.log_debug_namespace_ignore
     */
    "bridge/request/options": {
        options: Record<string, unknown>;
    };

    "bridge/response/options": {
        restart_required: boolean;
    };

    "bridge/request/device/bind": {
        from: string;
        from_endpoint: string | number | "default";
        to: string | number;
        to_endpoint?: string | number;
        clusters?: string[];
        skip_disable_reporting?: boolean;
    };

    "bridge/response/device/bind": {
        from: string;
        from_endpoint: string | number;
        to: string | number;
        to_endpoint: string | number | undefined;
        clusters: string[];
        failed: string[];
    };

    "bridge/request/device/unbind": {
        from: string;
        from_endpoint: string | number | "default";
        to: string | number;
        to_endpoint?: string | number;
        clusters?: string[];
        skip_disable_reporting?: boolean;
    };

    "bridge/response/device/unbind": {
        from: string;
        from_endpoint: string | number;
        to: string | number;
        to_endpoint: string | number | undefined;
        clusters: string[];
        failed: string[];
    };

    "bridge/request/device/binds/clear": {
        target: string;
        ieee_list?: Eui64[];
    };

    "bridge/response/device/binds/clear": {
        target: string;
        ieee_list?: Eui64[];
    };

    "bridge/request/device/configure":
        | {
              id: string | number;
          }
        | string;

    "bridge/response/device/configure": {
        id: string | number;
    };

    "bridge/request/device/remove": {
        id: string;
        block?: boolean;
        force?: boolean;
    };

    "bridge/response/device/remove": {
        id: string;
        block: boolean;
        force: boolean;
    };

    "bridge/request/device/ota_update/check": {
        id: string;
    };

    "bridge/request/device/ota_update/check/downgrade": {
        id: string;
    };

    "bridge/response/device/ota_update/check": {
        id: string;
        update_available: boolean;
    };

    "bridge/request/device/ota_update/update": {
        id: string;
    };

    "bridge/request/device/ota_update/update/downgrade": {
        id: string;
    };

    "bridge/response/device/ota_update/update": {
        id: string;
        from:
            | {
                  software_build_id: string;
                  date_code: string;
              }
            | undefined;
        to:
            | {
                  software_build_id: string;
                  date_code: string;
              }
            | undefined;
    };

    "bridge/request/device/ota_update/schedule": {
        id: string;
    };

    "bridge/request/device/ota_update/schedule/downgrade": {
        id: string;
    };

    "bridge/response/device/ota_update/schedule": {
        id: string;
    };

    "bridge/request/device/ota_update/unschedule": {
        id: string;
    };

    "bridge/response/device/ota_update/unschedule": {
        id: string;
    };

    "bridge/request/device/interview": {
        id: string | number;
    };

    "bridge/response/device/interview": {
        id: string | number;
    };

    "bridge/request/device/generate_external_definition": {
        id: string | number;
    };

    "bridge/response/device/generate_external_definition": {
        id: string | number;
        source: string;
    };

    "bridge/request/device/options": {
        id: string;
        options: Record<string, unknown>;
    };

    "bridge/response/device/options": {
        id: string;
        from: Record<string, unknown>;
        to: Record<string, unknown>;
        restart_required: boolean;
    };

    "bridge/request/device/rename":
        | {
              last: true;
              from?: string;
              to: string;
              homeassistant_rename?: boolean;
          }
        | {
              last: false | undefined;
              from: string;
              to: string;
              homeassistant_rename?: boolean;
          };

    "bridge/response/device/rename": {
        from: string;
        to: string;
        homeassistant_rename: boolean;
    };

    "bridge/request/device/reporting/configure": {
        id: string;
        endpoint: string | number;
        cluster: string | number;
        attribute: string | number | {ID: number; type: number};
        minimum_report_interval: number;
        maximum_report_interval: number;
        reportable_change?: number;
        option: Record<string, unknown>;
    };

    "bridge/response/device/reporting/configure": {
        id: string;
        endpoint: string | number;
        cluster: string | number;
        attribute: string | number | {ID: number; type: number};
        minimum_report_interval: number;
        maximum_report_interval: number;
        reportable_change?: number;
    };

    "bridge/request/device/reporting/read": {
        id: string;
        endpoint: string | number;
        cluster: string | number;
        configs: {direction?: number; attribute: string | number | {ID: number; type: number}}[];
        manufacturer_code?: number;
    };

    "bridge/response/device/reporting/read": {
        id: string;
        endpoint: string | number;
        cluster: string | number;
        configs: zigbeeHerdsman.Zcl.ClustersTypes.TFoundation["readReportConfigRsp"];
        manufacturer_code?: number;
    };

    "bridge/request/group/remove": {
        id: string;
        force?: boolean;
    };

    "bridge/response/group/remove": {
        id: string;
        force: boolean;
    };

    "bridge/request/group/add": {
        friendly_name: string;
        id?: string;
    };

    "bridge/response/group/add": {
        friendly_name: string;
        id: number;
    };

    "bridge/request/group/rename": {
        from: string;
        to: string;
        homeassistant_rename?: boolean;
    };

    "bridge/response/group/rename": {
        from: string;
        to: string;
        homeassistant_rename: boolean;
    };

    "bridge/request/group/options": {
        id: string;
        options: Record<string, unknown>;
    };

    "bridge/response/group/options": {
        id: string;
        from: Record<string, unknown>;
        to: Record<string, unknown>;
        restart_required: boolean;
    };

    "bridge/request/group/members/add": {
        device: string;
        group: string;
        endpoint: string | number | "default";
        skip_disable_reporting?: boolean;
    };

    "bridge/response/group/members/add": {
        device: string;
        group: string;
        endpoint: string | number | "default";
    };

    "bridge/request/group/members/remove": {
        device: string;
        group: string;
        endpoint: string | number | "default";
        skip_disable_reporting?: boolean;
    };

    "bridge/response/group/members/remove": {
        device: string;
        group: string;
        endpoint: string | number | "default";
    };

    "bridge/request/group/members/remove_all": {
        device: string;
        endpoint: string | number | "default";
        skip_disable_reporting?: boolean;
    };

    "bridge/response/group/members/remove_all": {
        device: string;
        endpoint: string | number | "default";
    };

    "bridge/request/touchlink/factory_reset":
        | {
              ieee_address: string;
              channel: number;
          }
        | "";

    "bridge/response/touchlink/factory_reset":
        | {
              ieee_address: string;
              channel: number;
          }
        | Record<string, never>;

    "bridge/request/touchlink/scan": "";

    "bridge/response/touchlink/scan": {
        found: {
            ieee_address: string;
            channel: number;
        }[];
    };

    "bridge/request/touchlink/identify": {
        ieee_address: string;
        channel: number;
    };

    "bridge/response/touchlink/identify": {
        ieee_address: string;
        channel: number;
    };

    "bridge/request/action": {action: string; params?: Record<string, unknown>};

    "bridge/response/action": GenericZdoResponse | ZclPayload | undefined;

    /**
     * entity state response
     */
    "{friendlyName}": {
        [key: string]: unknown;
        update?: UpdatePayload["update"];
    };

    "{friendlyName}/availability": {
        state: "online" | "offline";
    };

    /** entity set request (tries to match endpoint to definition, else uses "default") */
    "{friendlyNameOrId}/set": {
        [attribute: string]: {[key: string]: unknown} | string | boolean;
    };
    /** entity set request (tries to match endpoint to definition, else uses "default") */
    "{friendlyNameOrId}/set/{attribute}": {
        [key: string]: unknown;
    };
    /** entity set request */
    "{friendlyNameOrId}/{endpoint}/set": {
        [attribute: string]: {[key: string]: unknown} | string | boolean;
    };
    /** entity set request */
    "{friendlyNameOrId}/{endpoint}/set/{attribute}": {
        [key: string]: unknown;
    };

    /** entity get request (tries to match endpoint to definition, else uses "default") */
    "{friendlyNameOrId}/get": {
        [attribute: string]: {[key: string]: unknown} | string | boolean;
    };
    /** entity get request (tries to match endpoint to definition, else uses "default") */
    "{friendlyNameOrId}/get/{attribute}": {
        [key: string]: unknown;
    };
    /** entity get request */
    "{friendlyNameOrId}/{endpoint}/get": {
        [attribute: string]: {[key: string]: unknown} | string | boolean;
    };
    /** entity get request */
    "{friendlyNameOrId}/{endpoint}/get/{attribute}": {
        [key: string]: unknown;
    };
}

export type Zigbee2MQTTRequestEndpoints =
    | "bridge/request/permit_join"
    | "bridge/request/health_check"
    | "bridge/request/coordinator_check"
    | "bridge/request/restart"
    | "bridge/request/networkmap"
    | "bridge/request/extension/save"
    | "bridge/request/extension/remove"
    | "bridge/request/converter/save"
    | "bridge/request/converter/remove"
    | "bridge/request/backup"
    | "bridge/request/install_code/add"
    | "bridge/request/options"
    | "bridge/request/device/bind"
    | "bridge/request/device/unbind"
    | "bridge/request/device/binds/clear"
    | "bridge/request/device/configure"
    | "bridge/request/device/remove"
    | "bridge/request/device/ota_update/check"
    | "bridge/request/device/ota_update/check/downgrade"
    | "bridge/request/device/ota_update/update"
    | "bridge/request/device/ota_update/update/downgrade"
    | "bridge/request/device/ota_update/schedule"
    | "bridge/request/device/ota_update/schedule/downgrade"
    | "bridge/request/device/ota_update/unschedule"
    | "bridge/request/device/interview"
    | "bridge/request/device/generate_external_definition"
    | "bridge/request/device/options"
    | "bridge/request/device/rename"
    | "bridge/request/device/reporting/configure"
    | "bridge/request/device/reporting/read"
    | "bridge/request/group/remove"
    | "bridge/request/group/add"
    | "bridge/request/group/rename"
    | "bridge/request/group/options"
    | "bridge/request/group/members/add"
    | "bridge/request/group/members/remove"
    | "bridge/request/group/members/remove_all"
    | "bridge/request/touchlink/factory_reset"
    | "bridge/request/touchlink/scan"
    | "bridge/request/touchlink/identify"
    | "bridge/request/action"
    | "{friendlyNameOrId}/set"
    | "{friendlyNameOrId}/set/{attribute}"
    | "{friendlyNameOrId}/{endpoint}/set"
    | "{friendlyNameOrId}/{endpoint}/set/{attribute}"
    | "{friendlyNameOrId}/get"
    | "{friendlyNameOrId}/get/{attribute}"
    | "{friendlyNameOrId}/{endpoint}/get"
    | "{friendlyNameOrId}/{endpoint}/get/{attribute}";

export type Zigbee2MQTTResponseEndpoints =
    | "bridge/response/permit_join"
    | "bridge/response/health_check"
    | "bridge/response/coordinator_check"
    | "bridge/response/restart"
    | "bridge/response/networkmap"
    | "bridge/response/extension/save"
    | "bridge/response/extension/remove"
    | "bridge/response/converter/save"
    | "bridge/response/converter/remove"
    | "bridge/response/backup"
    | "bridge/response/install_code/add"
    | "bridge/response/options"
    | "bridge/response/device/bind"
    | "bridge/response/device/unbind"
    | "bridge/response/device/binds/clear"
    | "bridge/response/device/configure"
    | "bridge/response/device/remove"
    | "bridge/response/device/ota_update/check"
    | "bridge/response/device/ota_update/update"
    | "bridge/response/device/ota_update/schedule"
    | "bridge/response/device/ota_update/unschedule"
    | "bridge/response/device/interview"
    | "bridge/response/device/generate_external_definition"
    | "bridge/response/device/options"
    | "bridge/response/device/rename"
    | "bridge/response/device/reporting/configure"
    | "bridge/response/device/reporting/read"
    | "bridge/response/group/remove"
    | "bridge/response/group/add"
    | "bridge/response/group/rename"
    | "bridge/response/group/options"
    | "bridge/response/group/members/add"
    | "bridge/response/group/members/remove"
    | "bridge/response/group/members/remove_all"
    | "bridge/response/touchlink/factory_reset"
    | "bridge/response/touchlink/scan"
    | "bridge/response/touchlink/identify"
    | "bridge/response/action";

export type Zigbee2MQTTRequest<T extends Zigbee2MQTTRequestEndpoints> = {
    transaction?: string;
} & Zigbee2MQTTAPI[T];

export type Zigbee2MQTTResponseOK<T extends Zigbee2MQTTResponseEndpoints> = {
    status: "ok";
    data: Zigbee2MQTTAPI[T];
    transaction?: string;
};

export type Zigbee2MQTTResponseError = {
    status: "error";
    data: Record<string, never>;
    error: string;
    transaction?: string;
};

export type Zigbee2MQTTResponse<T extends Zigbee2MQTTResponseEndpoints> = Zigbee2MQTTResponseOK<T> | Zigbee2MQTTResponseError;
