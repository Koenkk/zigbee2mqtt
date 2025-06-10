import * as os from "node:os";
import * as process from "node:process";
import type {Zigbee2MQTTAPI} from "../types/api";
import * as settings from "../util/settings";
import utils from "../util/utils";
import Extension from "./extension";

/** Round with 2 decimals */
const round2 = (n: number): number => Math.round(n * 100.0) / 100.0;
/** Round with 4 decimals */
const round4 = (n: number): number => Math.round(n * 10000.0) / 10000.0;

type DeviceHealth = {
    lastSeenUpdates?: {messages: number; first: number; last: number};
    leaveCounts: number;
    networkAddressChanges: number;
};

export class Health extends Extension {
    /** Mapped by IEEE address */
    readonly #devices = new Map<string, DeviceHealth>();

    #checkTimer: NodeJS.Timeout | undefined;

    override async start(): Promise<void> {
        await super.start();

        this.eventBus.onLastSeenChanged(this, this.#onLastSeenChanged.bind(this));
        this.eventBus.onDeviceLeave(this, this.#onDeviceLeave.bind(this));
        this.eventBus.onDeviceNetworkAddressChanged(this, this.#onDeviceNetworkAddressChanged.bind(this));

        this.#checkTimer = setInterval(this.#checkHealth.bind(this), utils.minutes(settings.get().health.interval));
    }

    override async stop(): Promise<void> {
        clearInterval(this.#checkTimer);
        await super.stop();
    }

    #includeDevice(device?: Device): boolean {
        return device?.options.health != null ? device.options.health : settings.get().health.include_devices;
    }

    async #checkHealth(): Promise<void> {
        const sysMemTotalKb = os.totalmem() / 1024;
        const sysMemFreeKb = os.freemem() / 1024;
        const procMemUsedKb = process.memoryUsage().rss / 1024;
        const healthcheck: Zigbee2MQTTAPI["bridge/health"] = {
            response_time: `0x${process.hrtime.bigint().toString(16)}`, // can be passed back to BigInt ctor on other end to diff
            os: {
                load_average: os.loadavg(), // will be [0,0,0] on Windows (not supported)
                memory_used_mb: round2((sysMemTotalKb - sysMemFreeKb) / 1024),
                memory_percent: round4((sysMemFreeKb / sysMemTotalKb) * 100.0),
            },
            process: {
                uptime_sec: Math.floor(process.uptime()),
                memory_used_mb: round2(procMemUsedKb / 1024),
                memory_percent: round4((procMemUsedKb / sysMemTotalKb) * 100.0),
            },
            mqtt: this.mqtt.stats,
        };

        if (this.#devices.size > 0) {
            healthcheck.devices = {};

            for (const [ieeeAddr, device] of this.#devices) {
                let messages = 0;
                let mps = 0;

                if (device.lastSeenUpdates) {
                    const timeDiff = device.lastSeenUpdates.last - device.lastSeenUpdates.first;
                    messages = device.lastSeenUpdates.messages;
                    mps = timeDiff > 0 ? round4(messages / (timeDiff / 1000.0)) : 0;
                }

                healthcheck.devices[ieeeAddr] = {
                    messages,
                    messages_per_sec: mps,
                    leave_count: device.leaveCounts,
                    network_address_changes: device.networkAddressChanges,
                };
            }

            if (settings.get().health.reset_on_check) {
                this.#devices.clear();
            }
        }

        await this.mqtt.publish("bridge/health", JSON.stringify(healthcheck), {clientOptions: {retain: true, qos: 1}});
    }

    #onLastSeenChanged(data: eventdata.LastSeenChanged): void {
        if (!this.#includeDevice(data.device)) {
            return;
        }

        const device = this.#devices.get(data.device.ieeeAddr);

        if (device?.lastSeenUpdates) {
            device.lastSeenUpdates.messages += 1;
            device.lastSeenUpdates.last = Date.now();
        } else {
            const now = Date.now();

            this.#devices.set(data.device.ieeeAddr, {
                lastSeenUpdates: {messages: 1, first: now, last: now},
                leaveCounts: 0,
                networkAddressChanges: 0,
            });
        }
    }

    #onDeviceLeave(data: eventdata.DeviceLeave): void {
        if (!this.#includeDevice(data.device)) {
            return;
        }

        const device = this.#devices.get(data.ieeeAddr);

        if (device) {
            device.leaveCounts += 1;
        } else {
            this.#devices.set(data.ieeeAddr, {leaveCounts: 1, networkAddressChanges: 0});
        }
    }

    #onDeviceNetworkAddressChanged(data: eventdata.DeviceNetworkAddressChanged): void {
        if (!this.#includeDevice(data.device)) {
            return;
        }

        const device = this.#devices.get(data.device.ieeeAddr);

        if (device) {
            device.networkAddressChanges += 1;
        } else {
            this.#devices.set(data.device.ieeeAddr, {leaveCounts: 0, networkAddressChanges: 1});
        }
    }
}
