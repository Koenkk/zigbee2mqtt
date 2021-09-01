import type {
    Device as ZZHDevice,
    Group as ZZHGroup,
    Endpoint as ZHEndpoint,
} from 'zigbee-herdsman/dist/controller/model';

import {
    NetworkParameters as ZHNetworkParameters,
    CoordinatorVersion as ZHCoordinatorVersion,
} from 'zigbee-herdsman/dist/adapter/tstype';

import * as D from 'lib/model/device';
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

    type Endpoint = ZHEndpoint;

    type ZHDevice = ZZHDevice;

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

    interface Settings {
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
    }

    interface GroupSettings {
        friendlyName: string,
        devices: string[],
        ID: number,
    }

    type EntitySettings = {
        type: 'device' | 'group'
        ID: number | string,
        friendlyName: string,
    }

    interface ResolvedEntity {
        type: 'device' | 'group',
    }

    interface Definition  {
        model: string
        endpoint?: (device: ZHDevice) => {[s: string]: number}
        toZigbee: {key: string[], convertGet?: (entity: Endpoint, key: string, meta: {message: {}, mapped: Definition}) => Promise<void>}[]
    }

    interface ResolvedDevice {
        type: 'device',
        definition?: Definition,
        name: string,
        endpoint: Endpoint,
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
        get: (ID: string) => {} | null;
    }

    type PublishEntityState = () => void;
}