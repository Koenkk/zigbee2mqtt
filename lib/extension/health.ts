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

export default class Health extends Extension {
    #checkTimer: NodeJS.Timeout | undefined;

    override async start(): Promise<void> {
        await super.start();

        this.#checkTimer = setInterval(this.#checkHealth.bind(this), utils.minutes(settings.get().health.interval));
    }

    override async stop(): Promise<void> {
        clearInterval(this.#checkTimer);
        await super.stop();
    }

    clearStats(): void {
        this.eventBus.stats.devices.clear();
        this.eventBus.stats.mqtt.published = 0;
        this.eventBus.stats.mqtt.received = 0;
    }

    async #checkHealth(): Promise<void> {
        const sysMemTotalKb = os.totalmem() / 1024;
        const sysMemFreeKb = os.freemem() / 1024;
        const sysMemUsedKb = sysMemTotalKb - sysMemFreeKb;
        const procMemUsedKb = process.memoryUsage().rss / 1024;
        const healthcheck: Zigbee2MQTTAPI["bridge/health"] = {
            response_time: Date.now(),
            os: {
                load_average: os.loadavg(), // will be [0,0,0] on Windows (not supported)
                memory_used_mb: round2(sysMemUsedKb / 1024),
                memory_percent: round4((sysMemUsedKb / sysMemTotalKb) * 100.0),
            },
            process: {
                uptime_sec: Math.floor(process.uptime()),
                memory_used_mb: round2(procMemUsedKb / 1024),
                memory_percent: round4((procMemUsedKb / sysMemTotalKb) * 100.0),
            },
            mqtt: {...this.mqtt.stats, ...this.eventBus.stats.mqtt},
            devices: {},
        };

        for (const [ieeeAddr, device] of this.eventBus.stats.devices) {
            let messages = 0;
            let mps = 0;

            if (device.lastSeenChanges) {
                const timeDiff = Date.now() - device.lastSeenChanges.first;
                messages = device.lastSeenChanges.messages;
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
            this.clearStats();
        }

        await this.mqtt.publish("bridge/health", JSON.stringify(healthcheck), {clientOptions: {retain: true, qos: 1}});
    }
}
