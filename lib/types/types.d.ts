/* eslint-disable camelcase */
import type {
    Device as ZHDevice,
    Group as ZHGroup,
    Endpoint as ZHEndpoint,
} from 'zigbee-herdsman/dist/controller/model';

import type {
    NetworkParameters as ZHNetworkParameters,
    CoordinatorVersion as ZHCoordinatorVersion,
    LQI as ZHLQI,
    RoutingTable as ZHRoutingTable,
    RoutingTableEntry as ZHRoutingTableEntry,
} from 'zigbee-herdsman/dist/adapter/tstype';

import type {
    Cluster as ZHCluster,
} from 'zigbee-herdsman/dist/zcl/tstype';

import type * as ZHEvents from 'zigbee-herdsman/dist/controller/events';

import type TypeEventBus from 'lib/eventBus';
import type TypeMQTT from 'lib/mqtt';
import type TypeState from 'lib/state';
import type TypeZigbee from 'lib/zigbee';
import type TypeDevice from 'lib/model/device';
import type TypeGroup from 'lib/model/group';
import type TypeExtension from 'lib/extension/extension';

import type mqtt from 'mqtt';

declare global {
    // Define some class types as global
    type EventBus = TypeEventBus;
    type MQTT = TypeMQTT;
    type Zigbee = TypeZigbee;
    type Group = TypeGroup;
    type Device = TypeDevice;
    type State = TypeState;
    type Extension = TypeExtension;

    // Types
    interface MQTTResponse {data: KeyValue, status: 'error' | 'ok', error?: string, transaction?: string}
    interface MQTTOptions {qos?: mqtt.QoS, retain?: boolean, properties?: {messageExpiryInterval: number}}
    type StateChangeReason = 'publishDebounce' | 'groupOptimistic' | 'lastSeenChanged';
    type PublishEntityState = (entity: Device | Group, payload: KeyValue,
        stateChangeReason?: StateChangeReason) => Promise<void>;
    type RecursivePartial<T> = {[P in keyof T]?: RecursivePartial<T[P]>;};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    interface KeyValue {[s: string]: any}

    // zigbee-herdsman
    namespace zh {
        type Endpoint = ZHEndpoint;
        type Device = ZHDevice;
        type Group = ZHGroup;
        type LQI = ZHLQI;
        type RoutingTable = ZHRoutingTable;
        type RoutingTableEntry = ZHRoutingTableEntry;
        type CoordinatorVersion = ZHCoordinatorVersion;
        type NetworkParameters = ZHNetworkParameters;
        type Cluster = ZHCluster;
        interface Bind {
            cluster: zh.Cluster;
            target: zh.Endpoint | zh.Group;
        }
    }

    // zigbee-herdsman-converters
    namespace zhc {
        interface Logger {
            info: (message: string) => void;
            warn: (message: string) => void;
            error: (message: string) => void;
            debug: (message: string) => void;
        }

        interface ToZigbeeConverterGetMeta {message?: KeyValue, mapped?: Definition | Definition[]}

        interface ToZigbeeConverterResult {state: KeyValue,
            membersState: {[s: string]: KeyValue}, readAfterWriteTime?: number}

        interface ToZigbeeConverter {
            key: string[],
            convertGet?: (entity: zh.Endpoint | zh.Group, key: string, meta: ToZigbeeConverterGetMeta) => Promise<void>
            convertSet?: (entity: zh.Endpoint | zh.Group, key: string, value: KeyValue | string | number,
                meta: {state: KeyValue}) => Promise<ToZigbeeConverterResult>
        }

        interface FromZigbeeConverter {
            cluster: string,
            type: string[] | string,
            convert: (model: Definition, msg: KeyValue, publish: (payload: KeyValue) => void, options: KeyValue,
                meta: {state: KeyValue, logger: Logger, device: zh.Device}) => Promise<KeyValue>,
        }

        interface DefinitionExposeFeature {name: string, endpoint?: string,
            property: string, value_max?: number, value_min?: number, unit?: string,
            value_off?: string, value_on?: string, value_step?: number, values: string[], access: number}

        interface DefinitionExpose {
            type: string, name?: string, features?: DefinitionExposeFeature[],
            endpoint?: string, values?: string[], value_off?: string, value_on?: string,
            access: number, property: string, unit?: string,
            value_min?: number, value_max?: number}

        interface Definition {
            model: string,
            zigbeeModel: string[],
            endpoint?: (device: zh.Device) => {[s: string]: number}
            toZigbee: ToZigbeeConverter[]
            fromZigbee: FromZigbeeConverter[]
            icon?: string
            description: string
            options: zhc.DefinitionExpose[],
            vendor: string
            exposes: DefinitionExpose[] | ((device: zh.Device, options: KeyValue) => DefinitionExpose[])
            configure?: (device: zh.Device, coordinatorEndpoint: zh.Endpoint, logger: Logger,
                options?: DeviceOptions) => Promise<void>;
            onEvent?: (type: string, data: KeyValue, device: zh.Device,
                settings: KeyValue, state: KeyValue) => Promise<void>;
            ota?: {
                isUpdateAvailable: (device: zh.Device, logger: Logger, data?: KeyValue) => Promise<boolean>;
                updateToLatest: (device: zh.Device, logger: Logger,
                    onProgress: (progress: number, remaining: number) => void) => Promise<void>;
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type ExternalDefinition = Definition & {homeassistant: any};
    }

    namespace eventdata {
        type EntityRenamed = { entity: Device | Group, homeAssisantRename: boolean, from: string, to: string };
        type DeviceRemoved = { ieeeAddr: string, name: string };
        type MQTTMessage = { topic: string, message: string };
        type MQTTMessagePublished = { topic: string, payload: string, options: {retain: boolean, qos: number} };
        type StateChange = {
            entity: Device | Group, from: KeyValue, to: KeyValue, reason: string | null, update: KeyValue };
        type PermitJoinChanged = ZHEvents.PermitJoinChangedPayload;
        type LastSeenChanged = { device: Device,
            reason: 'deviceAnnounce' | 'networkAddress' | 'deviceJoined' | 'messageEmitted' | 'messageNonEmitted'; };
        type DeviceNetworkAddressChanged = { device: Device };
        type DeviceAnnounce = { device: Device };
        type DeviceInterview = { device: Device, status: 'started' | 'successful' | 'failed' };
        type DeviceJoined = { device: Device };
        type EntityOptionsChanged = { entity: Device | Group, from: KeyValue, to: KeyValue };
        type Reconfigure = { device: Device };
        type DeviceLeave = { ieeeAddr: string, name: string };
        type GroupMembersChanged = {group: Group, action: 'remove' | 'add' | 'remove_all',
            endpoint: zh.Endpoint, skipDisableReporting: boolean };
        type PublishEntityState = {entity: Group | Device, message: KeyValue, stateChangeReason: StateChangeReason,
                payload: KeyValue};
        type DeviceMessage = {
            type: ZHEvents.MessagePayloadType;
            device: Device;
            endpoint: zh.Endpoint;
            linkquality: number;
            groupID: number;
            cluster: string | number;
            data: KeyValue | Array<string | number>;
            meta: {zclTransactionSequenceNumber?: number;};
        };
    }

    // Settings
    // eslint-disable camelcase
    interface Settings {
        homeassistant?: {
            discovery_topic: string,
            status_topic: string,
            legacy_entity_attributes: boolean,
            legacy_triggers: boolean,
        },
        permit_join?: boolean,
        availability?: {
            active: {timeout: number},
            passive: {timeout: number}
        },
        external_converters: string[],
        mqtt: {
            base_topic: string,
            include_device_information: boolean,
            force_disable_retain: boolean
            version?: number,
            user?: string,
            password?: string,
            server: string,
            ca?: string,
            keepalive?: number,
            key?: string,
            cert?: string,
            client_id?: string,
            reject_unauthorized?: boolean,
        },
        serial: {
            disable_led: boolean,
            port?: string,
            adapter?: 'deconz' | 'zstack' | 'ezsp' | 'zigate',
            baudrate?: number,
            rtscts?: boolean,
        },
        passlist: string[],
        blocklist: string[],
        map_options: {
            graphviz: {
                colors: {
                    fill: {
                        enddevice: string,
                        coordinator: string,
                        router: string,
                    },
                    font: {
                        coordinator: string,
                        router: string,
                        enddevice: string,
                    },
                    line: {
                        active: string,
                        inactive: string,
                    },
                },
            },
        },
        ota: {
            update_check_interval: number,
            disable_automatic_update_check: boolean,
            zigbee_ota_override_index_location?: string,
            ikea_ota_use_test_url?: boolean,
        },
        frontend?: {
            auth_token?: string,
            host?: string,
            port?: number,
            url?: string,
        },
        devices?: {[s: string]: DeviceOptions},
        groups?: {[s: string]: GroupOptions},
        device_options: KeyValue,
        advanced: {
            legacy_api: boolean,
            legacy_availability_payload: boolean,
            log_rotation: boolean,
            log_symlink_current: boolean,
            log_output: ('console' | 'file' | 'syslog')[],
            log_directory: string,
            log_file: string,
            log_level: 'debug' | 'info' | 'error' | 'warn',
            log_syslog: KeyValue,
            pan_id: number | 'GENERATE',
            ext_pan_id: number[],
            channel: number,
            adapter_concurrent: number | null,
            adapter_delay: number | null,
            cache_state: boolean,
            cache_state_persistent: boolean,
            cache_state_send_on_startup: boolean,
            last_seen: 'disable' | 'ISO_8601' | 'ISO_8601_local' | 'epoch',
            elapsed: boolean,
            network_key: number[] | 'GENERATE',
            timestamp_format: string,
            output: 'json' | 'attribute' | 'attribute_and_json',
            transmit_power?: number,
            // Everything below is deprecated
            availability_timeout?: number,
            availability_blocklist?: string[],
            availability_passlist?: string[],
            availability_blacklist?: string[],
            availability_whitelist?: string[],
            soft_reset_timeout: number,
            report: boolean,
        },
    }

    interface DeviceOptions {
        ID?: string,
        retention?: number,
        availability?: boolean | {timeout: number},
        optimistic?: boolean,
        retrieve_state?: boolean,
        debounce?: number,
        debounce_ignore?: string[],
        filtered_optimistic?: string[],
        icon?: string,
        homeassistant?: KeyValue,
        legacy?: boolean,
        filtered_attributes?: string[],
        friendly_name: string,
        description?: string,
        qos?: 0 | 1 | 2,
    }

    interface GroupOptions {
        devices?: string[],
        ID?: number,
        optimistic?: boolean,
        filtered_optimistic?: string[],
        retrieve_state?: boolean,
        homeassistant?: KeyValue,
        filtered_attributes?: string[],
        friendly_name: string,
        description?: string,
        qos?: 0 | 1 | 2,
    }
}

