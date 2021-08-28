import type {Device as ZHDevice, Endpoint} from 'zigbee-herdsman/dist/controller/model';

declare global {
    type Device = ZHDevice;

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
            include_device_information: boolean,
            force_disable_retain: boolean
            version?: number,
            user?: string,
            password?: string,
        },
        serial: {
            disable_led: boolean,
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
            pan_id: number,
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
            network_key: number[],
            report: boolean,
            homeassistant_discovery_topic: string,
            homeassistant_status_topic: string,
            homeassistant_legacy_entity_attributes: boolean,
            homeassistant_legacy_triggers: boolean,
            timestamp_format: string,
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
        toZigbee: {key: string[], convertGet?: (entity: Endpoint, key: string, meta: {message: {}, mapped: Definition}) => Promise<void>}[]
    }

    interface ResolvedDevice {
        type: 'device',
        definition?: Definition,
        name: string,
        endpoint: Endpoint,
        device: Device,
        settings: {
            friendlyName: string,
            availability?: {timeout?: number} | boolean,
        }
    }

    type lastSeenChangedHandler = (data: {device: Device}) => void;

    interface TempZigbee {
        getClients: () => Device[];
        on: (event: 'lastSeenChanged', handler: lastSeenChangedHandler) => void;
        removeListener: (event: 'lastSeenChanged', handler: lastSeenChangedHandler) => void;
        resolveEntity: (device: Device) => ResolvedEntity;
    }

    interface TempMQTT {
        publish: (topic: string, payload: string, options: {}, base?: string, skipLog?: boolean, skipReceive?: boolean) => Promise<void>;
    }

    interface TempState {
        get: (ID: string) => {} | null;
    }

    interface TempEventBus {
        removeListenersExtension: (extension: string) => void;
    }

    type TempPublishEntityState = () => void;
}