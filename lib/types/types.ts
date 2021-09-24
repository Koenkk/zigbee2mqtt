import type {
    Device as ZZHDevice,
    Group as ZZHGroup,
    Endpoint as ZZHEndpoint,
} from 'zigbee-herdsman/dist/controller/model';

import {
    NetworkParameters as ZHNetworkParameters,
    CoordinatorVersion as ZHCoordinatorVersion,
    LQI as ZHLQI,
    RoutingTable as ZHRoutingTable,
    RoutingTableEntry as ZHRoutingTableEntry,
} from 'zigbee-herdsman/dist/adapter/tstype';

import {
    Cluster as ZHCluster,
} from 'zigbee-herdsman/dist/zcl/tstype';

import * as D from 'lib/model/device';
import * as G from 'lib/model/group';
import * as Z from 'lib/zigbee';
import * as E from 'lib/eventBus';
import * as M from 'lib/mqtt';

// TODO: check all

declare global {
    type RecursivePartial<T> = {
        [P in keyof T]?: RecursivePartial<T[P]>;
    };

    type EventBus = E.default;

    type MQTT = M.default;

    type Zigbee = Z.default;

    type Device = D.default;
    type Group = G.default;

    type ZHEndpoint = ZZHEndpoint;

    type ZHDevice = ZZHDevice;
    type LQI = ZHLQI;
    type RoutingTable = ZHRoutingTable;
    type RoutingTableEntry = ZHRoutingTableEntry;

    type ZHGroup = ZZHGroup;

    type CoordinatorVersion = ZHCoordinatorVersion;

    type NetworkParameters = ZHNetworkParameters;

    type ZigbeeEventType = 'deviceLeave' | 'deviceAnnounce';

    interface ZigbeeEventData {
        ieeeAddr: string;
    }

    /* eslint-disable */
    // Controller
    interface KeyValue {
        [s: string]: any,
    }

    interface ZHBind {
        cluster: ZHCluster;
        target: ZHEndpoint | ZHGroup;
    }

    interface Settings {
        homeassistant?: boolean,
        devices?: {[s: string]: {friendly_name: string, retention?: number}},
        groups?: {[s: string]: {friendly_name: string, devices?: string[]}},
        passlist: string[],
        blocklist: string[],
        whitelist: string[],
        ban: string[],
        availability?: boolean | {
            active?: {timeout?: number},
            passive?: {timeout?: number}
        },
        permit_join: boolean,
        frontend?: {
            auth_token?: string,
            host?: string,
            port?: number,
        },
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
            disable_led?: boolean,
            port?: string,
            adapter?: 'deconz' | 'zstack' | 'ezsp' | 'zigate'
        },
        device_options: {[s: string]: unknown},
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
        experimental: {
            output: 'json' | 'attribute' | 'attribute_and_json',
            availability_new?: boolean,
            transmit_power?: number,
        },
        advanced: {
            legacy_api: boolean,
            log_rotation: boolean,
            log_symlink_current: boolean,
            log_output: ('console' | 'file')[],
            log_directory: string,
            log_file: string,
            log_level: 'debug' | 'info' | 'error' | 'warn',
            log_syslog: {},
            soft_reset_timeout: number,
            pan_id: number | 'GENERATE',
            ext_pan_id: number[],
            channel: number,
            adapter_concurrent: number | null,
            adapter_delay: number | null,
            availability_timeout: number,
            availability_blocklist: string[],
            availability_passlist: string[],
            availability_blacklist: string[],
            availability_whitelist: string[],
            cache_state: boolean,
            cache_state_persistent: boolean,
            cache_state_send_on_startup: boolean,
            last_seen: 'disable' | 'ISO_8601' | 'ISO_8601_local' |  'epoch',
            elapsed: boolean,
            network_key: number[] | 'GENERATE',
            report: boolean,
            homeassistant_discovery_topic: string,
            homeassistant_status_topic: string,
            homeassistant_legacy_entity_attributes: boolean,
            homeassistant_legacy_triggers: boolean,
            timestamp_format: string,
            baudrate?: number,
            rtscts?: boolean,
            ikea_ota_use_test_url?: boolean,
        },
        ota: {
            update_check_interval: number,
            disable_automatic_update_check: boolean
        },
        external_converters: string[],
    }

    interface DeviceSettings {
        friendlyName: string,
        ID: string,
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
    }

    interface GroupSettings {
        friendlyName: string,
        devices: string[],
        ID: number,
        optimistic?: boolean,
        filtered_optimistic?: string[],
        retrieve_state?: boolean,
        homeassistant?: KeyValue,
    }

    type EntitySettings = {
        type: 'device' | 'group'
        ID: number | string,
        friendlyName: string,
    }

    interface ResolvedEntity {
        type: 'device' | 'group',
        device: ZHDevice,
        name: string,
    }

    interface ToZigbeeConverterGetMeta {message?: {}, mapped?: Definition | Definition[]}

    interface ToZigbeeConverterResult {state: KeyValue, membersState: {[s: string]: KeyValue}, readAfterWriteTime?: number}

    interface ToZigbeeConverter {
        key: string[],
        convertGet?: (entity: ZHEndpoint | ZHGroup, key: string, meta: ToZigbeeConverterGetMeta) => Promise<void>
        convertSet?: (entity: ZHEndpoint | ZHGroup, key: string, value: any, meta: {state: KeyValue}) => Promise<ToZigbeeConverterResult>
    }

    // interface Logger {
    //     error: (message: string) => void;
    //     warn: (message: string) => void;
    //     debug: (message: string) => void;
    //     info: (message: string) => void;
    // }

    interface FromZigbeeConverter {
        cluster: string,
        type: string[] | string,
        convert: (model: Definition, msg: KeyValue, publish: (payload: KeyValue) => void, options: KeyValue,
            meta: {state: KeyValue, logger: any, device: ZHDevice}) => KeyValue,
    }

    interface DefinitionExposeFeature {name: string, endpoint?: string, property: string, value_max?: number, value_min?: number, value_off?: string, value_on?: string, value_step?: number, values: string[], access: number}

    interface DefinitionExpose {type: string, name?: string, features?: DefinitionExposeFeature[], endpoint?: string, values?: string[], value_off?: string, value_on?: string, access: number, property: string, unit?: string, value_min?: number, value_max?: number}

    interface Definition  {
        model: string
        endpoint?: (device: ZHDevice) => {[s: string]: number}
        toZigbee: ToZigbeeConverter[]
        fromZigbee: FromZigbeeConverter[]
        icon?: string
        description: string
        vendor: string
        exposes: DefinitionExpose[] // TODO
        configure?: (device: ZHDevice, coordinatorEndpoint: ZZHEndpoint, logger: unknown) => Promise<void>;
        onEvent?: (type: string, data: KeyValue, device: ZHDevice, settings: KeyValue) => Promise<void>;
        ota?: {
            isUpdateAvailable: (device: ZHDevice, logger: unknown, data?: KeyValue) => Promise<boolean>;
            updateToLatest: (device: ZHDevice, logger: unknown, onProgress: (progress: number, remaining: number) => void) => Promise<void>;
        }
    }

    interface ResolvedDevice {
        type: 'device',
        definition?: Definition,
        name: string,
        endpoint: ZHEndpoint,
        device: ZHDevice,
        settings: {
            friendlyName: string,
            availability?: {timeout?: number} | boolean,
        }
    }

    interface TempMQTT {
        publish: (topic: string, payload: string, options: {}, base?: string, skipLog?: boolean, skipReceive?: boolean) => Promise<void>;
    }

    interface TempState {
        get: (ID: string | number) => KeyValue | null;
        remove: (ID: string | number) => void;
        removeKey: (ID: string, keys: string[]) => void;
        exists: (ID: string) => boolean;
    }

    interface ExternalConverterClass {
        new(zigbee: Zigbee, mqtt: MQTT, state: TempState, publishEntityState: PublishEntityState,
            eventBus: EventBus, settings: unknown, logger: unknown): ExternalConverterClass;
    }

    interface MQTTResponse {data: KeyValue, status: string, error?: string, transaction?: string}

    type PublishEntityState = (ID: string | number, payload: KeyValue, stateChangeReason?: 'publishDebounce' | 'group_optimistic') => Promise<void>;
}