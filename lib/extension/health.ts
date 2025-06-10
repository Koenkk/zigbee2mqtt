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

export class Health extends Extension {
    /** Mapped by IEEE address */
    readonly #lastSeenUpdates = new Map<string, {messages: number; first: number; last: number}>();
    /** Mapped by IEEE address */
    readonly #leaveCounts = new Map<string, number>();
    /** Mapped by IEEE address */
    readonly #nwkAddressChanges = new Map<string, number>();

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

        if (this.#lastSeenUpdates.size > 0 || this.#leaveCounts.size > 0 || this.#nwkAddressChanges.size > 0) {
            healthcheck.devices = {};

            for (const device of this.zigbee.devicesIterator(
                (zhDevice) => this.#lastSeenUpdates.has(zhDevice.ieeeAddr) || this.#leaveCounts.has(zhDevice.ieeeAddr),
            )) {
                const lastSeenUpdate = this.#lastSeenUpdates.get(device.ieeeAddr);
                let messages = 0;
                let mps = 0;

                if (lastSeenUpdate) {
                    const timeDiff = lastSeenUpdate.last - lastSeenUpdate.first;
                    messages = lastSeenUpdate.messages;
                    mps = timeDiff > 0 ? round4(messages / (timeDiff / 1000.0)) : 0;
                }

                healthcheck.devices[device.name] = {
                    messages,
                    messages_per_sec: mps,
                    leave_count: this.#leaveCounts.get(device.ieeeAddr) ?? 0,
                    network_address_changes: this.#nwkAddressChanges.get(device.ieeeAddr) ?? 0,
                };
            }

            if (settings.get().health.reset_on_check) {
                this.#lastSeenUpdates.clear();
                this.#leaveCounts.clear();
                this.#nwkAddressChanges.clear();
            }
        }

        await this.mqtt.publish("bridge/health", JSON.stringify(healthcheck), {clientOptions: {retain: true, qos: 1}});
    }

    #onLastSeenChanged(data: eventdata.LastSeenChanged): void {
        if (!this.#includeDevice(data.device)) {
            return;
        }

        const lastSeenUpdate = this.#lastSeenUpdates.get(data.device.ieeeAddr);

        if (lastSeenUpdate) {
            lastSeenUpdate.messages += 1;
            lastSeenUpdate.last = Date.now();
        } else {
            const now = Date.now();

            this.#lastSeenUpdates.set(data.device.ieeeAddr, {messages: 1, first: now, last: now});
        }
    }

    #onDeviceLeave(data: eventdata.DeviceLeave): void {
        if (!this.#includeDevice(data.device)) {
            return;
        }

        this.#leaveCounts.set(data.ieeeAddr, (this.#leaveCounts.get(data.ieeeAddr) ?? 0) + 1);
    }

    #onDeviceNetworkAddressChanged(data: eventdata.DeviceNetworkAddressChanged): void {
        if (!this.#includeDevice(data.device)) {
            return;
        }

        this.#nwkAddressChanges.set(data.device.ieeeAddr, (this.#nwkAddressChanges.get(data.device.ieeeAddr) ?? 0) + 1);
    }
}
