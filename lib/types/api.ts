import type * as zhc from 'zigbee-herdsman-converters';
import type {ClusterDefinition, ClusterName, CustomClusters} from 'zigbee-herdsman/dist/zspec/zcl/definition/tstype';

import type {LogLevel, schemaJson} from '../util/settings';

export interface Zigbee2MQTTScene {
    id: number;
    name: string;
}

interface Zigbee2MQTTDeviceEndpoint {
    bindings: Zigbee2MQTTDeviceEndpointBinding[];
    configured_reportings: Zigbee2MQTTDeviceEndpointConfiguredReporting[];
    clusters: {input: string[]; output: string[]};
    scenes: Zigbee2MQTTScene[];
}

interface Zigbee2MQTTDeviceEndpointBinding {
    cluster: string;
    target: Zigbee2MQTTDeviceEndpointBindingTarget;
}

interface Zigbee2MQTTDeviceEndpointBindingTarget {
    type: string;
    endpoint?: number;
    ieee_address?: string;
    id?: number;
}

interface Zigbee2MQTTDeviceEndpointConfiguredReporting {
    cluster: string;
    attribute: string | number;
    minimum_report_interval: number;
    maximum_report_interval: number;
    reportable_change: number;
}

interface Zigbee2MQTTDeviceDefinition {
    model: string;
    vendor: string;
    description: string;
    exposes: zhc.Expose[];
    supports_ota: boolean;
    options: zhc.Option[];
    icon: string;
}

export interface Zigbee2MQTTDevice {
    ieee_address: zh.Device['ieeeAddr'];
    type: zh.Device['type'];
    network_address: zh.Device['networkAddress'];
    supported: boolean;
    friendly_name: string;
    disabled: boolean;
    description: string | undefined;
    definition: Zigbee2MQTTDeviceDefinition | undefined;
    power_source: zh.Device['powerSource'];
    software_build_id: zh.Device['softwareBuildID'];
    date_code: zh.Device['dateCode'];
    model_id: zh.Device['modelID'];
    interviewing: zh.Device['interviewing'];
    interview_completed: zh.Device['interviewCompleted'];
    manufacturer: zh.Device['manufacturerName'];
    endpoints: Record<number, Zigbee2MQTTDeviceEndpoint>;
}

export interface Zigbee2MQTTGroupMember {
    ieee_address: zh.Device['ieeeAddr'];
    endpoint: number;
}

export interface Zigbee2MQTTGroup {
    id: number;
    friendly_name: 'default_bind_group' | string;
    description: string | undefined;
    scenes: Zigbee2MQTTScene[];
    members: Zigbee2MQTTGroupMember[];
}

export interface Zigbee2MQTTNetworkMap {
    nodes: {
        ieeeAddr: string;
        friendlyName: string;
        type: string;
        networkAddress: number;
        manufacturerName: string | undefined;
        modelID: string | undefined;
        failed: string[];
        lastSeen: number | undefined;
        definition?: {model: string; vendor: string; supports: string; description: string};
    }[];
    links: {
        source: {ieeeAddr: string; networkAddress: number};
        target: {ieeeAddr: string; networkAddress: number};
        linkquality: number;
        depth: number;
        routes: {
            destinationAddress: number;
            status: string;
            nextHop: number;
        }[];
        sourceIeeeAddr: string;
        targetIeeeAddr: string;
        sourceNwkAddr: number;
        lqi: number;
        relationship: number;
    }[];
}

/**
 * Zigbee2MQTT state/request/response API endpoints
 */
export interface Zigbee2MQTTAPI {
    'bridge/logging': {
        message: string;
        level: LogLevel;
        namespace: string;
    };

    'bridge/state': {
        state: 'online' | 'offline';
    };

    'bridge/definition': {
        clusters: Readonly<Record<ClusterName, Readonly<ClusterDefinition>>>;
        custom_clusters: Record<string, CustomClusters>;
    };

    'bridge/event':
        | {
              type: 'device_leave' | 'device_joined' | 'device_announce';
              data: {
                  friendly_name: string;
                  ieee_address: string;
              };
          }
        | {
              type: 'device_interview';
              data:
                  | {
                        friendly_name: string;
                        ieee_address: string;
                        status: 'started' | 'failed';
                    }
                  | {
                        friendly_name: string;
                        ieee_address: string;
                        status: 'successful';
                        supported: boolean;
                        definition: Zigbee2MQTTDeviceDefinition | undefined;
                    };
          };

    'bridge/info': {
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
        log_level: 'debug' | 'info' | 'warning' | 'error';
        permit_join: boolean;
        permit_join_end: number | undefined;
        restart_required: boolean;
        config: Settings;
        config_schema: typeof schemaJson;
    };

    'bridge/devices': Zigbee2MQTTDevice[];

    'bridge/groups': Zigbee2MQTTGroup[];

    'bridge/request/permit_join':
        | {
              /** [0-254], 0 meaning disable */
              time: number;
              device?: string;
          }
        | `${number}`;

    'bridge/response/permit_join': {
        /** [0-254], 0 meaning disable */
        time: number;
        device?: string;
    };

    'bridge/request/health_check': '';

    'bridge/response/health_check': {
        /** XXX: currently always returns true */
        healthy: boolean;
    };

    'bridge/request/coordinator_check': '';

    'bridge/response/coordinator_check': {
        missing_routers: {
            ieee_address: string;
            friendly_name: string;
        }[];
    };

    'bridge/request/restart': '';

    'bridge/response/restart': Record<string, never>;

    'bridge/request/networkmap':
        | {
              type: 'raw' | 'graphviz' | 'plantuml';
              routes: boolean;
          }
        | 'raw'
        | 'graphviz'
        | 'plantuml';

    'bridge/response/networkmap':
        | {
              type: 'raw';
              routes: boolean;
              value: Zigbee2MQTTNetworkMap;
          }
        | {
              type: 'graphviz' | 'plantuml';
              routes: boolean;
              value: string;
          };

    'bridge/request/extension/save': {
        name: string;
        code: string;
    };

    'bridge/response/extension/save': Record<string, never>;

    'bridge/request/extension/remove': {
        name: string;
    };

    'bridge/response/extension/remove': Record<string, never>;

    'bridge/request/converter/save': {
        name: string;
        code: string;
    };

    'bridge/response/converter/save': Record<string, never>;

    'bridge/request/converter/remove': {
        name: string;
    };

    'bridge/response/converter/remove': Record<string, never>;

    'bridge/request/backup': '';

    'bridge/response/backup': {
        /** base64 encoded ZIP archive */
        zip: string;
    };

    'bridge/request/install_code/add': {
        value: string;
    };

    'bridge/response/install_code/add': {
        value: string;
    };

    /**
     * Applied on-the-fly:
     * - newSettings.homeassistant
     * - newSettings.advanced?.log_level
     * - newSettings.advanced?.log_namespaced_levels
     * - newSettings.advanced?.log_debug_namespace_ignore
     */
    'bridge/request/options': {
        options: Record<string, unknown>;
    };

    'bridge/response/options': {
        restart_required: boolean;
    };

    'bridge/request/device/bind': {
        from: string;
        from_endpoint: string | number | 'default';
        to: string;
        to_endpoint?: string | number;
        clusters?: string[];
        skip_disable_reporting?: boolean;
    };

    'bridge/response/device/bind': {
        from: string;
        from_endpoint: string | number;
        to: string;
        to_endpoint: string | number | undefined;
        clusters: string[];
        failed: string[];
    };

    'bridge/request/device/unbind': {
        from: string;
        from_endpoint: string | number | 'default';
        to: string;
        to_endpoint?: string | number;
        clusters?: string[];
        skip_disable_reporting?: boolean;
    };

    'bridge/response/device/unbind': {
        from: string;
        from_endpoint: string | number;
        to: string;
        to_endpoint: string | number | undefined;
        clusters: string[];
        failed: string[];
    };

    'bridge/request/device/configure':
        | {
              id: string | number;
          }
        | string;

    'bridge/response/device/configure': {
        id: string | number;
    };

    'bridge/request/device/remove': {
        id: string;
        block?: boolean;
        force?: boolean;
    };

    'bridge/response/device/remove': {
        id: string;
        block: boolean;
        force: boolean;
    };

    'bridge/request/device/ota_update/check': {
        id: string;
    };

    'bridge/request/device/ota_update/check/downgrade': {
        id: string;
    };

    'bridge/response/device/ota_update/check': {
        id: string;
        update_available: boolean;
    };

    'bridge/request/device/ota_update/update': {
        id: string;
    };

    'bridge/request/device/ota_update/update/downgrade': {
        id: string;
    };

    'bridge/response/device/ota_update/update': {
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

    'bridge/request/device/interview': {
        id: string | number;
    };

    'bridge/response/device/interview': {
        id: string | number;
    };

    'bridge/request/device/generate_external_definition': {
        id: string | number;
    };

    'bridge/response/device/generate_external_definition': {
        id: string | number;
        source: string;
    };

    'bridge/request/device/options': {
        id: string;
        options: Record<string, unknown>;
    };

    'bridge/response/device/options': {
        id: string;
        from: Record<string, unknown>;
        to: Record<string, unknown>;
        restart_required: boolean;
    };

    'bridge/request/device/rename':
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

    'bridge/response/device/rename': {
        from: string;
        to: string;
        homeassistant_rename: boolean;
    };

    'bridge/request/device/configure_reporting': {
        id: string;
        endpoint: string | number;
        cluster: string | number;
        attribute: string | number | {ID: number; type: number};
        minimum_report_interval: number;
        maximum_report_interval: number;
        reportable_change: number;
        option: Record<string, unknown>;
    };

    'bridge/response/device/configure_reporting': {
        id: string;
        endpoint: string | number;
        cluster: string | number;
        attribute: string | number | {ID: number; type: number};
        minimum_report_interval: number;
        maximum_report_interval: number;
        reportable_change: number;
    };

    'bridge/request/group/remove': {
        id: string;
        force?: boolean;
    };

    'bridge/response/group/remove': {
        id: string;
        force: boolean;
    };

    'bridge/request/group/add': {
        friendly_name: string;
        id: string;
    };

    'bridge/response/group/add': {
        friendly_name: string;
        id: number;
    };

    'bridge/request/group/rename': {
        from: string;
        to: string;
        homeassistant_rename?: boolean;
    };

    'bridge/response/group/rename': {
        from: string;
        to: string;
        homeassistant_rename: boolean;
    };

    'bridge/request/group/options': {
        id: string;
        options: Record<string, unknown>;
    };

    'bridge/response/group/options': {
        id: string;
        from: Record<string, unknown>;
        to: Record<string, unknown>;
        restart_required: boolean;
    };

    'bridge/request/group/members/add': {
        device: string;
        group: string;
        endpoint: string | number | 'default';
        skip_disable_reporting?: boolean;
    };

    'bridge/response/group/members/add': {
        device: string;
        group: string;
        endpoint: string | number | 'default';
    };

    'bridge/request/group/members/remove': {
        device: string;
        group: string;
        endpoint: string | number | 'default';
        skip_disable_reporting?: boolean;
    };

    'bridge/response/group/members/remove': {
        device: string;
        group: string;
        endpoint: string | number | 'default';
    };

    'bridge/request/group/members/remove_all': {
        device: string;
        endpoint: string | number | 'default';
        skip_disable_reporting?: boolean;
    };

    'bridge/response/group/members/remove_all': {
        device: string;
        endpoint: string | number | 'default';
    };

    'bridge/request/touchlink/factory_reset':
        | {
              ieee_address: string;
              channel: number;
          }
        | '';

    'bridge/response/touchlink/factory_reset':
        | {
              ieee_address: string;
              channel: number;
          }
        | Record<string, never>;

    'bridge/request/touchlink/scan': '';

    'bridge/response/touchlink/scan': {
        found: {
            ieee_address: string;
            channel: number;
        }[];
    };

    'bridge/request/touchlink/identify': {
        ieee_address: string;
        channel: number;
    };

    'bridge/response/touchlink/identify': {
        ieee_address: string;
        channel: number;
    };

    /**
     * entity state response
     */
    '{friendlyName}': {
        [key: string]: unknown;
    };

    '{friendlyName}/availability': {
        state: 'online' | 'offline';
    };

    /** entity set request */
    '{friendlyName}/set': {
        [key: string]: unknown;
    };

    /** entity get request */
    '{friendlyName}/get': {
        [key: string]: unknown;
    };
}

export type Zigbee2MQTTRequestEndpoints =
    | 'bridge/request/permit_join'
    | 'bridge/request/health_check'
    | 'bridge/request/coordinator_check'
    | 'bridge/request/restart'
    | 'bridge/request/networkmap'
    | 'bridge/request/extension/save'
    | 'bridge/request/extension/remove'
    | 'bridge/request/converter/save'
    | 'bridge/request/converter/remove'
    | 'bridge/request/backup'
    | 'bridge/request/install_code/add'
    | 'bridge/request/options'
    | 'bridge/request/device/bind'
    | 'bridge/request/device/unbind'
    | 'bridge/request/device/configure'
    | 'bridge/request/device/remove'
    | 'bridge/request/device/ota_update/check'
    | 'bridge/request/device/ota_update/check/downgrade'
    | 'bridge/request/device/ota_update/update'
    | 'bridge/request/device/ota_update/update/downgrade'
    | 'bridge/request/device/interview'
    | 'bridge/request/device/generate_external_definition'
    | 'bridge/request/device/options'
    | 'bridge/request/device/rename'
    | 'bridge/request/device/configure_reporting'
    | 'bridge/request/group/remove'
    | 'bridge/request/group/add'
    | 'bridge/request/group/rename'
    | 'bridge/request/group/options'
    | 'bridge/request/group/members/add'
    | 'bridge/request/group/members/remove'
    | 'bridge/request/group/members/remove_all'
    | 'bridge/request/touchlink/factory_reset'
    | 'bridge/request/touchlink/scan'
    | 'bridge/request/touchlink/identify';

export type Zigbee2MQTTResponseEndpoints =
    | 'bridge/response/permit_join'
    | 'bridge/response/health_check'
    | 'bridge/response/coordinator_check'
    | 'bridge/response/restart'
    | 'bridge/response/networkmap'
    | 'bridge/response/extension/save'
    | 'bridge/response/extension/remove'
    | 'bridge/response/converter/save'
    | 'bridge/response/converter/remove'
    | 'bridge/response/backup'
    | 'bridge/response/install_code/add'
    | 'bridge/response/options'
    | 'bridge/response/device/bind'
    | 'bridge/response/device/unbind'
    | 'bridge/response/device/configure'
    | 'bridge/response/device/remove'
    | 'bridge/response/device/ota_update/check'
    | 'bridge/response/device/ota_update/check'
    | 'bridge/response/device/ota_update/update'
    | 'bridge/response/device/ota_update/update'
    | 'bridge/response/device/interview'
    | 'bridge/response/device/generate_external_definition'
    | 'bridge/response/device/options'
    | 'bridge/response/device/rename'
    | 'bridge/response/device/configure_reporting'
    | 'bridge/response/group/remove'
    | 'bridge/response/group/add'
    | 'bridge/response/group/rename'
    | 'bridge/response/group/options'
    | 'bridge/response/group/members/add'
    | 'bridge/response/group/members/remove'
    | 'bridge/response/group/members/remove_all'
    | 'bridge/response/touchlink/factory_reset'
    | 'bridge/response/touchlink/scan'
    | 'bridge/response/touchlink/identify';

export type Zigbee2MQTTRequest<T extends Zigbee2MQTTRequestEndpoints> = {
    transaction?: string;
} & Zigbee2MQTTAPI[T];

export type Zigbee2MQTTResponseOK<T extends Zigbee2MQTTResponseEndpoints> = {
    status: 'ok';
    data: Zigbee2MQTTAPI[T];
    transaction?: string;
};

export type Zigbee2MQTTResponseError = {
    status: 'error';
    data: Record<string, never>;
    error: string;
    transaction?: string;
};

export type Zigbee2MQTTResponse<T extends Zigbee2MQTTResponseEndpoints> = Zigbee2MQTTResponseOK<T> | Zigbee2MQTTResponseError;
