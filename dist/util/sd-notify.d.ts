/**
 * Handle sd_notify protocol, @see https://www.freedesktop.org/software/systemd/man/latest/sd_notify.html
 * No-op if running on unsupported platforms or without Type=notify
 * Soft-fails if improperly setup (this is not necessary for Zigbee2MQTT to function properly)
 */
export declare function initSdNotify(): Promise<{
    notifyStopping: () => void;
    stop: () => void;
} | undefined>;
//# sourceMappingURL=sd-notify.d.ts.map