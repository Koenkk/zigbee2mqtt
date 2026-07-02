// biome-ignore assist/source/organizeImports: import mocks first
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import * as data from "../mocks/data";
import {mockLogger} from "../mocks/logger";
import {flushPromises} from "../mocks/utils";
import {devices, events as mockZHEvents, mockController, returnDevices} from "../mocks/zigbeeHerdsman";
import {MetricType, metrics as zhMetrics} from "zigbee-herdsman/dist/utils/metrics";

import type {EventHandler} from "../mocks/utils";
import {Controller} from "../../lib/controller";
import {PrometheusExporter} from "../../lib/extension/prometheusExporter";
import type Device from "../../lib/model/device";
import * as settings from "../../lib/util/settings";

const TEST_PORT = 9143;

type MockRes = {setHeader: ReturnType<typeof vi.fn>; writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>};

let mockOnRequest: EventHandler;
const mockHTTP = {
    listen: vi.fn(),
    close: vi.fn<(cb: (err?: Error) => void) => void>((cb) => cb()),
};

vi.mock("node:http", () => ({
    createServer: vi.fn().mockImplementation((onRequest: EventHandler) => {
        mockOnRequest = onRequest;
        return mockHTTP;
    }),
}));

returnDevices.push(devices.bulb_color.ieeeAddr, devices.coordinator.ieeeAddr);

describe("Extension: PrometheusExporter", () => {
    let controller: Controller;

    const getExtension = (): PrometheusExporter => controller.getExtension("PrometheusExporter") as PrometheusExporter;

    const resetExtension = async (): Promise<void> => {
        await controller.removeExtension(getExtension());
        await controller.addExtension(new PrometheusExporter(...controller.extensionArgs));
    };

    const makeRes = (): MockRes => ({
        setHeader: vi.fn(),
        writeHead: vi.fn(),
        end: vi.fn(),
    });

    const getMetrics = async (): Promise<string> => {
        const res = makeRes();
        await mockOnRequest({url: "/metrics"}, res);
        return res.end.mock.calls[0][0] as string;
    };

    beforeAll(async () => {
        vi.useFakeTimers();
        data.writeDefaultConfiguration();
        settings.reRead();
        settings.set(["prometheus_exporter"], {enabled: true, port: TEST_PORT});

        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        await flushPromises();
    });

    beforeEach(async () => {
        mockLogger.info.mockClear();
        mockHTTP.listen.mockClear();
        await resetExtension();
        await flushPromises();
    });

    afterAll(async () => {
        await controller?.stop();
        await flushPromises();
        vi.useRealTimers();
    });

    it("starts and listens on configured port", () => {
        expect(mockHTTP.listen).toHaveBeenCalledWith(TEST_PORT);
        expect(mockLogger.info).toHaveBeenCalledWith(`Prometheus exporter listening on port ${TEST_PORT}`);
    });

    it("responds to /metrics with Prometheus content type", async () => {
        const res = makeRes();
        await mockOnRequest({url: "/metrics"}, res);

        expect(res.setHeader).toHaveBeenCalledWith("Content-Type", expect.stringContaining("text/plain"));
        expect(res.end).toHaveBeenCalledTimes(1);
    });

    it("responds to other paths with welcome text", async () => {
        const res = makeRes();
        await mockOnRequest({url: "/"}, res);

        expect(res.writeHead).toHaveBeenCalledWith(200);
        expect(res.end).toHaveBeenCalledWith("zigbee2mqtt prometheus exporter");
    });

    it("pre-populates device_info gauge for known devices", async () => {
        const metrics = await getMetrics();

        expect(metrics).toMatch(new RegExp(`zigbee2mqtt_device_info\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} 1`));
    });

    it("increments device message counter on Zigbee message", async () => {
        await mockZHEvents.message({
            device: devices.bulb_color,
            endpoint: devices.bulb_color.getEndpoint(1),
            type: "attributeReport",
            linkquality: 100,
            cluster: "genOnOff",
            data: {onOff: 1},
        });
        await flushPromises();

        const metrics = await getMetrics();
        expect(metrics).toMatch(
            new RegExp(`zigbee2mqtt_device_messages_received_total\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} 1`),
        );
    });

    it("sets link quality gauge on Zigbee message", async () => {
        await mockZHEvents.message({
            device: devices.bulb_color,
            endpoint: devices.bulb_color.getEndpoint(1),
            type: "attributeReport",
            linkquality: 200,
            cluster: "genOnOff",
            data: {onOff: 1},
        });
        await flushPromises();

        const metrics = await getMetrics();
        expect(metrics).toMatch(new RegExp(`zigbee2mqtt_device_link_quality\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} 200`));
    });

    it("increments join counter on device joined", async () => {
        await mockZHEvents.deviceJoined({device: devices.bulb_color});
        await flushPromises();

        const metrics = await getMetrics();
        expect(metrics).toMatch(new RegExp(`zigbee2mqtt_device_joins_total\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} 1`));
    });

    it("increments leave counter on device leave", async () => {
        await mockZHEvents.deviceLeave({ieeeAddr: devices.bulb_color.ieeeAddr});
        await flushPromises();

        const metrics = await getMetrics();
        expect(metrics).toMatch(/zigbee2mqtt_device_leaves_total\{[^}]*\} 1/);
    });

    it("increments announce counter on device announce", async () => {
        await mockZHEvents.deviceAnnounce({device: devices.bulb_color});
        await flushPromises();

        const metrics = await getMetrics();
        expect(metrics).toMatch(new RegExp(`zigbee2mqtt_device_announces_total\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} 1`));
    });

    it("increments failed message counter with no_converter reason", async () => {
        const device = controller.zigbee.resolveEntity(devices.bulb_color.ieeeAddr) as Device;
        controller.eventBus.emitDeviceMessageFailed({device, reason: "no_converter"});
        await flushPromises();

        const metrics = await getMetrics();
        expect(metrics).toMatch(
            new RegExp(
                `zigbee2mqtt_device_messages_failed_total\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*reason="no_converter"[^}]*\\} 1`,
            ),
        );
    });

    it("increments failed message counter with converter_error reason", async () => {
        const device = controller.zigbee.resolveEntity(devices.bulb_color.ieeeAddr) as Device;
        controller.eventBus.emitDeviceMessageFailed({device, reason: "converter_error"});
        await flushPromises();

        const metrics = await getMetrics();
        expect(metrics).toMatch(
            new RegExp(
                `zigbee2mqtt_device_messages_failed_total\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*reason="converter_error"[^}]*\\} 1`,
            ),
        );
    });

    it("increments network address change counter on device network address changed", async () => {
        const device = controller.zigbee.resolveEntity(devices.bulb_color.ieeeAddr) as Device;
        controller.eventBus.emitDeviceNetworkAddressChanged({device});
        await flushPromises();

        const metrics = await getMetrics();
        expect(metrics).toMatch(
            new RegExp(`zigbee2mqtt_device_network_address_changes_total\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} 1`),
        );
    });

    it("removes device metrics on entity removed", async () => {
        const device = controller.zigbee.resolveEntity(devices.bulb_color.ieeeAddr) as Device;
        controller.eventBus.emitEntityRemoved({entity: device, name: device.name});
        await flushPromises();

        // Mirror a real removal: the device also leaves the herdsman device list, so the
        // scrape-time collect() gauges (last_seen, availability) stop emitting it as well.
        const restoreIndex = returnDevices.indexOf(devices.bulb_color.ieeeAddr);
        returnDevices.splice(restoreIndex, 1);

        try {
            const metrics = await getMetrics();
            expect(metrics).not.toMatch(new RegExp(`ieee_address="${devices.bulb_color.ieeeAddr}"`));
        } finally {
            returnDevices.splice(restoreIndex, 0, devices.bulb_color.ieeeAddr);
        }
    });

    it("starts and listens on configured host and port when host is set", async () => {
        settings.set(["prometheus_exporter"], {enabled: true, port: TEST_PORT, host: "127.0.0.1"});
        await resetExtension();

        expect(mockHTTP.listen).toHaveBeenCalledWith(TEST_PORT, "127.0.0.1");
        expect(mockLogger.info).toHaveBeenCalledWith(`Prometheus exporter listening on 127.0.0.1:${TEST_PORT}`);

        settings.set(["prometheus_exporter"], {enabled: true, port: TEST_PORT});
    });

    it("increments mqtt published counter on MQTT message published", async () => {
        controller.eventBus.emitMQTTMessagePublished({topic: "test", payload: "test", options: {qos: 0, retain: false}});
        await flushPromises();

        const metrics = await getMetrics();
        expect(metrics).toMatch(/zigbee2mqtt_mqtt_messages_published_total \d+/);
    });

    it("increments mqtt received counter on MQTT message received", async () => {
        controller.eventBus.emitMQTTMessage({topic: "test", message: "test"});
        await flushPromises();

        const metrics = await getMetrics();
        expect(metrics).toMatch(/zigbee2mqtt_mqtt_messages_received_total \d+/);
    });

    it("ignores entity removed event for non-device entities", async () => {
        const group = controller.zigbee.resolveEntity("group_1")!;
        controller.eventBus.emitEntityRemoved({entity: group, name: "group_1"});
        await flushPromises();

        const metrics = await getMetrics();
        expect(metrics).toBeDefined();
    });

    it("observes adapter send zcl unicast duration via adapter metrics callback", async () => {
        zhMetrics.emit("metric", {
            type: MetricType.AdapterSendZclUnicast,
            ieeeAddr: devices.bulb_color.ieeeAddr,
            status: "success",
            durationSeconds: 0.1,
        });

        const metrics = await getMetrics();
        expect(metrics).toMatch(/zigbee2mqtt_adapter_send_duration_seconds_bucket\{[^}]*type="zcl_unicast"[^}]*\}/);
    });

    it("observes adapter send zdo duration via adapter metrics callback", async () => {
        zhMetrics.emit("metric", {
            type: MetricType.AdapterSendZdo,
            ieeeAddr: devices.bulb_color.ieeeAddr,
            clusterId: 0x0013,
            status: "success",
            durationSeconds: 0.05,
        });

        const metrics = await getMetrics();
        expect(metrics).toMatch(/zigbee2mqtt_adapter_send_duration_seconds_bucket\{[^}]*type="zdo"[^}]*\}/);
    });

    it("observes adapter send zcl group duration via adapter metrics callback", async () => {
        zhMetrics.emit("metric", {type: MetricType.AdapterSendZclGroup, groupId: 1, status: "failure", durationSeconds: 0.2});

        const metrics = await getMetrics();
        expect(metrics).toMatch(/zigbee2mqtt_adapter_send_duration_seconds_bucket\{[^}]*type="zcl_group"[^}]*\}/);
    });

    it("sets request queue length gauge via adapter metrics callback", async () => {
        zhMetrics.emit("metric", {type: MetricType.RequestQueueLength, ieeeAddr: devices.bulb_color.ieeeAddr, endpointId: 1, length: 7});

        const metrics = await getMetrics();
        expect(metrics).toMatch(/zigbee2mqtt_request_queue_length\{[^}]*ieee_address="[^"]*"[^}]*\} 7/);
    });

    it("observes adapter send zcl broadcast duration via adapter metrics callback", async () => {
        zhMetrics.emit("metric", {type: MetricType.AdapterSendZclBroadcast, status: "success", durationSeconds: 0.1});

        const metrics = await getMetrics();
        expect(metrics).toMatch(/zigbee2mqtt_adapter_send_duration_seconds_bucket\{[^}]*type="zcl_broadcast"[^}]*\}/);
    });

    it("increments adapter retries counter via adapter metrics callback", async () => {
        zhMetrics.emit("metric", {type: MetricType.AdapterRetry, adapterType: "ember", ieeeAddr: undefined, reason: "timeout"});

        const metrics = await getMetrics();
        expect(metrics).toMatch(/zigbee2mqtt_adapter_retries_total\{[^}]*adapter_type="ember"[^}]*reason="timeout"[^}]*\} 1/);
    });

    it("increments adapter receive zcl payload counter via adapter metrics event", async () => {
        zhMetrics.emit("metric", {
            type: MetricType.AdapterReceiveZclPayload,
            ieeeAddr: devices.bulb_color.ieeeAddr,
            clusterID: 6,
            wasBroadcast: false,
        });

        const metrics = await getMetrics();
        expect(metrics).toMatch(/zigbee2mqtt_adapter_receive_zcl_payload_total\{[^}]*cluster_id="6"[^}]*was_broadcast="false"[^}]*\} 1/);
    });

    it("increments adapter receive zdo response counter via adapter metrics event", async () => {
        zhMetrics.emit("metric", {type: MetricType.AdapterReceiveZdoResponse, clusterId: 0x0013});

        const metrics = await getMetrics();
        expect(metrics).toMatch(/zigbee2mqtt_adapter_receive_zdo_response_total\{[^}]*cluster_id="19"[^}]*\} 1/);
    });

    it("increments device messages sent counter on adapter send zcl unicast", async () => {
        zhMetrics.emit("metric", {
            type: MetricType.AdapterSendZclUnicast,
            ieeeAddr: devices.bulb_color.ieeeAddr,
            status: "success",
            durationSeconds: 0.1,
        });

        const metrics = await getMetrics();
        expect(metrics).toMatch(new RegExp(`zigbee2mqtt_device_messages_sent_total\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} 1`));
    });

    it("increments device messages sent counter on adapter send zdo", async () => {
        zhMetrics.emit("metric", {
            type: MetricType.AdapterSendZdo,
            ieeeAddr: devices.bulb_color.ieeeAddr,
            clusterId: 0x0013,
            status: "success",
            durationSeconds: 0.05,
        });

        const metrics = await getMetrics();
        expect(metrics).toMatch(new RegExp(`zigbee2mqtt_device_messages_sent_total\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} 1`));
    });

    it("labels sent messages with the ieee address for unresolved devices", async () => {
        const unknownIeee = "0xffffffffffffffff";
        zhMetrics.emit("metric", {type: MetricType.AdapterSendZclUnicast, ieeeAddr: unknownIeee, status: "success", durationSeconds: 0.1});
        zhMetrics.emit("metric", {
            type: MetricType.AdapterSendZdo,
            ieeeAddr: unknownIeee,
            clusterId: 0x0013,
            status: "success",
            durationSeconds: 0.05,
        });

        const metrics = await getMetrics();
        expect(metrics).toMatch(new RegExp(`zigbee2mqtt_device_messages_sent_total\\{[^}]*ieee_address="${unknownIeee}"[^}]*\\} 2`));
    });

    it("exposes device last seen timestamp gauge", async () => {
        const metrics = await getMetrics();
        expect(metrics).toMatch(
            new RegExp(`zigbee2mqtt_device_last_seen_timestamp_seconds\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} \\d`),
        );
    });

    it("exposes device availability gauge, reflecting the configured timeout", async () => {
        // Stale device -> offline
        const staleMetrics = await getMetrics();
        expect(staleMetrics).toMatch(new RegExp(`zigbee2mqtt_device_availability\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} 0`));

        // Just seen -> online
        const originalLastSeen = devices.bulb_color.lastSeen;
        devices.bulb_color.lastSeen = Date.now();

        try {
            const freshMetrics = await getMetrics();
            expect(freshMetrics).toMatch(
                new RegExp(`zigbee2mqtt_device_availability\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} 1`),
            );
        } finally {
            devices.bulb_color.lastSeen = originalLastSeen;
        }
    });

    it("computes availability across power sources, per-device timeout override and missing last seen", async () => {
        const thermostat = devices.TS0601_thermostat.ieeeAddr; // active: EndDevice on mains
        const battery = devices.WSDCGQ11LM.ieeeAddr; // passive: EndDevice on battery

        // Non-router device with no power source and no last seen -> passive, exercises the undefined branches.
        const noPowerDevice = devices.TS0601_switch;
        const originalPowerSource = noPowerDevice.powerSource;
        const originalNoPowerLastSeen = noPowerDevice.lastSeen;
        noPowerDevice.powerSource = undefined;
        noPowerDevice.lastSeen = undefined;

        // Device with a per-device availability timeout override.
        const overrideIeee = devices.bulb_2.ieeeAddr;
        const overrideSettings = settings.get().devices[overrideIeee];
        const originalAvailability = overrideSettings?.availability;
        settings.set(["devices", overrideIeee, "availability"], {timeout: 10});

        returnDevices.push(thermostat, battery, noPowerDevice.ieeeAddr, overrideIeee);

        try {
            const metrics = await getMetrics();
            expect(metrics).toMatch(new RegExp(`zigbee2mqtt_device_availability\\{[^}]*ieee_address="${thermostat}"[^}]*\\} [01]`));
            expect(metrics).toMatch(new RegExp(`zigbee2mqtt_device_availability\\{[^}]*ieee_address="${battery}"[^}]*\\} 0`));
            expect(metrics).toMatch(new RegExp(`zigbee2mqtt_device_availability\\{[^}]*ieee_address="${noPowerDevice.ieeeAddr}"[^}]*\\} 0`));
            expect(metrics).toMatch(new RegExp(`zigbee2mqtt_device_availability\\{[^}]*ieee_address="${overrideIeee}"[^}]*\\} 0`));
        } finally {
            noPowerDevice.powerSource = originalPowerSource;
            noPowerDevice.lastSeen = originalNoPowerLastSeen;
            for (const ieee of [thermostat, battery, noPowerDevice.ieeeAddr, overrideIeee]) {
                returnDevices.splice(returnDevices.indexOf(ieee), 1);
            }
            if (originalAvailability === undefined) {
                delete settings.get().devices[overrideIeee].availability;
            } else {
                settings.get().devices[overrideIeee].availability = originalAvailability;
            }
        }
    });

    it("exposes mqtt connected gauge reflecting connection state", async () => {
        const disconnected = await getMetrics();
        expect(disconnected).toMatch(/zigbee2mqtt_mqtt_connected 0/);

        const spy = vi.spyOn(controller.mqtt, "isConnected").mockReturnValue(true);
        try {
            const connected = await getMetrics();
            expect(connected).toMatch(/zigbee2mqtt_mqtt_connected 1/);
        } finally {
            spy.mockRestore();
        }
    });

    it("exposes permit join gauge reflecting permit state", async () => {
        const closed = await getMetrics();
        expect(closed).toMatch(/zigbee2mqtt_permit_join 0/);

        const spy = vi.spyOn(controller.zigbee, "getPermitJoin").mockReturnValue(true);
        try {
            const open = await getMetrics();
            expect(open).toMatch(/zigbee2mqtt_permit_join 1/);
        } finally {
            spy.mockRestore();
        }
    });

    it("exposes coordinator info gauge set once at start", async () => {
        const metrics = await getMetrics();
        expect(metrics).toMatch(
            /zigbee2mqtt_coordinator_info\{[^}]*channel="15"[^}]*pan_id="5674"[^}]*coordinator_type="z-Stack"[^}]*revision="20190425"[^}]*\} 1/,
        );
    });

    it("exposes empty revision in coordinator info when the adapter does not report one", async () => {
        mockController.getCoordinatorVersion.mockResolvedValueOnce({type: "z-Stack", meta: {}});
        await resetExtension();

        const metrics = await getMetrics();
        expect(metrics).toMatch(/zigbee2mqtt_coordinator_info\{[^}]*revision=""[^}]*\} 1/);
    });
});
