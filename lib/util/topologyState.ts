import type {Zigbee2MQTTNetworkMap} from "../types/api";

interface DeviceTopology {
    applyLatencyMs: number | undefined;
    depth: number | undefined;
    failures: number;
    lastHeardAt: number | undefined;
    lastHopLqi: number | undefined;
    pathLqi: number | undefined;
}

const DEFAULT_TOPOLOGY: DeviceTopology = {
    applyLatencyMs: undefined,
    depth: undefined,
    failures: 0,
    lastHeardAt: undefined,
    lastHopLqi: undefined,
    pathLqi: undefined,
};

class TopologyState {
    #devices = new Map<string, DeviceTopology>();
    #networkMapValid = false;

    public clear(): void {
        this.#devices.clear();
        this.#networkMapValid = false;
    }

    public invalidateNetworkMap(): void {
        this.#networkMapValid = false;

        for (const topology of this.#devices.values()) {
            topology.depth = undefined;
            topology.pathLqi = undefined;
        }
    }

    public updateFromNetworkMap(topology: Zigbee2MQTTNetworkMap): void {
        const next = new Map<string, DeviceTopology>();

        for (const node of topology.nodes) {
            const existing = this.#get(node.ieeeAddr);
            next.set(node.ieeeAddr, {
                ...existing,
                depth: node.type === "Coordinator" ? 0 : undefined,
                pathLqi: undefined,
            });
        }

        for (const link of topology.links) {
            const current = next.get(link.source.ieeeAddr) ?? this.#get(link.source.ieeeAddr);

            next.set(link.source.ieeeAddr, {
                ...current,
                depth: current.depth === undefined ? link.depth : Math.max(current.depth, link.depth),
                pathLqi: current.pathLqi === undefined ? link.lqi : Math.min(current.pathLqi, link.lqi),
            });
        }

        for (const [ieeeAddr, existing] of this.#devices) {
            if (!next.has(ieeeAddr)) {
                next.set(ieeeAddr, {...existing, depth: undefined, pathLqi: undefined});
            }
        }

        this.#devices = next;
        this.#networkMapValid = true;
    }

    public observeMessage(ieeeAddr: string, linkquality: number, now = Date.now()): void {
        const topology = this.#get(ieeeAddr);
        topology.lastHeardAt = now;
        topology.lastHopLqi = linkquality;
        this.#devices.set(ieeeAddr, topology);
    }

    public observeDesiredStateApplied(ieeeAddr: string, latencyMs: number): void {
        const topology = this.#get(ieeeAddr);
        topology.applyLatencyMs = topology.applyLatencyMs === undefined ? latencyMs : Math.round((topology.applyLatencyMs + latencyMs) / 2);
        topology.failures = Math.max(0, topology.failures - 1);
        this.#devices.set(ieeeAddr, topology);
    }

    public observeDesiredStateFailure(ieeeAddr: string): void {
        const topology = this.#get(ieeeAddr);
        topology.failures += 1;
        this.#devices.set(ieeeAddr, topology);
    }

    public orderHint(ieeeAddr: string): number {
        const topology = this.#devices.get(ieeeAddr);

        if (!topology) {
            return 0;
        }

        // Keep the score deterministic and monotonic. Depth from a fresh network
        // map represents topology distance. Passive message LQI is last-hop only
        // on Ember, so it is not used as distance.
        const depth = this.#networkMapValid && topology.depth !== undefined ? topology.depth : 0;
        const applyLatency = topology.applyLatencyMs ?? 0;
        const pathWeakness = this.#networkMapValid && topology.pathLqi !== undefined ? 255 - topology.pathLqi : 0;

        return depth * 1_000_000_000 + topology.failures * 1_000_000 + applyLatency * 1_000 + pathWeakness;
    }

    #get(ieeeAddr: string): DeviceTopology {
        return {...DEFAULT_TOPOLOGY, ...this.#devices.get(ieeeAddr)};
    }
}

export default new TopologyState();
