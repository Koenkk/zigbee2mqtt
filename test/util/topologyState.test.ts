import {afterEach, describe, expect, it, vi} from "vitest";
import type {Zigbee2MQTTNetworkMap} from "../../lib/types/api";
import topologyState from "../../lib/util/topologyState";

const topology = (links: Zigbee2MQTTNetworkMap["links"]): Zigbee2MQTTNetworkMap => ({
    nodes: [
        {
            ieeeAddr: "0x0000000000000000",
            friendlyName: "Coordinator",
            type: "Coordinator",
            networkAddress: 0,
            manufacturerName: undefined,
            modelID: undefined,
            lastSeen: undefined,
            definition: undefined,
        },
        {
            ieeeAddr: "0x1111111111111111",
            friendlyName: "near",
            type: "Router",
            networkAddress: 1,
            manufacturerName: undefined,
            modelID: undefined,
            lastSeen: undefined,
            definition: undefined,
        },
        {
            ieeeAddr: "0x2222222222222222",
            friendlyName: "far",
            type: "EndDevice",
            networkAddress: 2,
            manufacturerName: undefined,
            modelID: undefined,
            lastSeen: undefined,
            definition: undefined,
        },
    ],
    links,
});

describe("TopologyState", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        topologyState.clear();
    });

    it("Should order deeper devices before nearer devices", () => {
        topologyState.updateFromNetworkMap(
            topology([
                {
                    source: {ieeeAddr: "0x1111111111111111", networkAddress: 1},
                    target: {ieeeAddr: "0x0000000000000000", networkAddress: 0},
                    sourceIeeeAddr: "0x1111111111111111",
                    targetIeeeAddr: "0x0000000000000000",
                    sourceNwkAddr: 1,
                    deviceType: 0,
                    rxOnWhenIdle: 0,
                    relationship: 2,
                    permitJoining: 0,
                    depth: 1,
                    lqi: 200,
                    linkquality: 200,
                    routes: [],
                },
                {
                    source: {ieeeAddr: "0x2222222222222222", networkAddress: 2},
                    target: {ieeeAddr: "0x1111111111111111", networkAddress: 1},
                    sourceIeeeAddr: "0x2222222222222222",
                    targetIeeeAddr: "0x1111111111111111",
                    sourceNwkAddr: 2,
                    deviceType: 0,
                    rxOnWhenIdle: 0,
                    relationship: 1,
                    permitJoining: 0,
                    depth: 2,
                    lqi: 180,
                    linkquality: 180,
                    routes: [],
                },
            ]),
        );

        expect(topologyState.orderHint("0x2222222222222222")).toBeGreaterThan(topologyState.orderHint("0x1111111111111111"));
    });

    it("Should fall back to neutral ordering when topology is unknown or invalidated", () => {
        topologyState.updateFromNetworkMap(topology([]));
        topologyState.observeMessage("0x2222222222222222", 1);
        topologyState.invalidateNetworkMap();

        expect(topologyState.orderHint("0x1111111111111111")).toStrictEqual(0);
        expect(topologyState.orderHint("0x2222222222222222")).toStrictEqual(0);
    });

    it("Should keep passive observations when a network map no longer contains the device", () => {
        topologyState.observeDesiredStateApplied("0x2222222222222222", 42);
        topologyState.updateFromNetworkMap({nodes: [], links: []});

        expect(topologyState.orderHint("0x2222222222222222")).toStrictEqual(42000);
    });

    it("Should use observed apply latency without treating last-hop LQI as distance", () => {
        vi.spyOn(Date, "now").mockReturnValue(1000);
        topologyState.observeMessage("0x2222222222222222", 1);
        topologyState.observeDesiredStateApplied("0x2222222222222222", 42);

        expect(topologyState.orderHint("0x2222222222222222")).toStrictEqual(42000);
    });
});
