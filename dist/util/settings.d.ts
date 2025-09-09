import schemaJson from "./settings.schema.json";
export { schemaJson };
export declare const CURRENT_VERSION = 4;
/** NOTE: by order of priority, lower index is lower level (more important) */
export declare const LOG_LEVELS: readonly string[];
export type LogLevel = "error" | "warning" | "info" | "debug";
export declare const defaults: {
    homeassistant: {
        enabled: false;
        discovery_topic: string;
        status_topic: string;
        legacy_action_sensor: false;
        experimental_event_entities: false;
    };
    availability: {
        enabled: false;
        active: {
            timeout: number;
            max_jitter: number;
            backoff: true;
            pause_on_backoff_gt: number;
        };
        passive: {
            timeout: number;
        };
    };
    frontend: {
        enabled: false;
        package: "zigbee2mqtt-windfront";
        port: number;
        base_url: string;
    };
    mqtt: {
        base_topic: string;
        include_device_information: false;
        force_disable_retain: false;
        maximum_packet_size: number;
        keepalive: number;
        reject_unauthorized: true;
        version: 4;
    };
    serial: {
        disable_led: false;
    };
    passlist: never[];
    blocklist: never[];
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
        disable_automatic_update_check: false;
        image_block_response_delay: number;
        default_maximum_data_size: number;
    };
    device_options: {};
    advanced: {
        log_rotation: true;
        log_console_json: false;
        log_symlink_current: false;
        log_output: ("file" | "console")[];
        log_directory: string;
        log_file: string;
        log_level: "info" | "debug";
        log_namespaced_levels: {};
        log_syslog: {};
        log_debug_to_mqtt_frontend: false;
        log_debug_namespace_ignore: string;
        log_directories_to_keep: number;
        pan_id: number;
        ext_pan_id: number[];
        channel: number;
        adapter_concurrent: undefined;
        adapter_delay: undefined;
        cache_state: true;
        cache_state_persistent: true;
        cache_state_send_on_startup: true;
        last_seen: "disable";
        elapsed: false;
        network_key: number[];
        timestamp_format: string;
        output: "json";
    };
    health: {
        interval: number;
        reset_on_check: false;
    };
};
export declare function writeMinimalDefaults(): void;
export declare function setOnboarding(value: boolean): void;
export declare function write(): void;
export declare function validate(): string[];
export declare function validateNonRequired(): string[];
/**
 * Get the settings actually written in the yaml.
 * Env vars are applied on top.
 * Defaults merged on startup are not included.
 */
export declare function getPersistedSettings(): Partial<Settings>;
export declare function get(): Settings;
export declare function set(path: string[], value: string | number | boolean | KeyValue): void;
export declare function apply(settings: Record<string, unknown>, throwOnError?: boolean): boolean;
export declare function getGroup(IDorName: string | number): GroupOptions | undefined;
export declare function getDevice(IDorName: string): DeviceOptionsWithId | undefined;
export declare function addDevice(id: string): DeviceOptionsWithId;
export declare function blockDevice(id: string): void;
export declare function removeDevice(IDorName: string): void;
export declare function addGroup(name: string, id?: string): GroupOptions;
export declare function removeGroup(IDorName: string | number): void;
export declare function changeEntityOptions(IDorName: string, newOptions: KeyValue): boolean;
export declare function changeFriendlyName(IDorName: string, newName: string): void;
export declare function reRead(): void;
export declare const testing: {
    write: typeof write;
    clear: () => void;
    defaults: {
        homeassistant: {
            enabled: false;
            discovery_topic: string;
            status_topic: string;
            legacy_action_sensor: false;
            experimental_event_entities: false;
        };
        availability: {
            enabled: false;
            active: {
                timeout: number;
                max_jitter: number;
                backoff: true;
                pause_on_backoff_gt: number;
            };
            passive: {
                timeout: number;
            };
        };
        frontend: {
            enabled: false;
            package: "zigbee2mqtt-windfront";
            port: number;
            base_url: string;
        };
        mqtt: {
            base_topic: string;
            include_device_information: false;
            force_disable_retain: false;
            maximum_packet_size: number;
            keepalive: number;
            reject_unauthorized: true;
            version: 4;
        };
        serial: {
            disable_led: false;
        };
        passlist: never[];
        blocklist: never[];
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
            disable_automatic_update_check: false;
            image_block_response_delay: number;
            default_maximum_data_size: number;
        };
        device_options: {};
        advanced: {
            log_rotation: true;
            log_console_json: false;
            log_symlink_current: false;
            log_output: ("file" | "console")[];
            log_directory: string;
            log_file: string;
            log_level: "info" | "debug";
            log_namespaced_levels: {};
            log_syslog: {};
            log_debug_to_mqtt_frontend: false;
            log_debug_namespace_ignore: string;
            log_directories_to_keep: number;
            pan_id: number;
            ext_pan_id: number[];
            channel: number;
            adapter_concurrent: undefined;
            adapter_delay: undefined;
            cache_state: true;
            cache_state_persistent: true;
            cache_state_send_on_startup: true;
            last_seen: "disable";
            elapsed: false;
            network_key: number[];
            timestamp_format: string;
            output: "json";
        };
        health: {
            interval: number;
            reset_on_check: false;
        };
    };
    CURRENT_VERSION: number;
};
//# sourceMappingURL=settings.d.ts.map