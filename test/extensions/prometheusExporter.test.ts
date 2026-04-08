// biome-ignore assist/source/organizeImports: import mocks first
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import * as data from "../mocks/data";
import {mockLogger} from "../mocks/logger";
import {flushPromises} from "../mocks/utils";
import {devices, events as mockZHEvents, returnDevices} from "../mocks/zigbeeHerdsman";

import type {EventHandler} from "../mocks/utils";
import {Controller} from "../../lib/controller";
import {PrometheusExporter} from "../../lib/extension/prometheusExporter";
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

        expect(metrics).toMatch(
            new RegExp(`zigbee2mqtt_device_info\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} 1`),
        );
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
            new RegExp(
                `zigbee2mqtt_device_messages_received_total\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} 1`,
            ),
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
        expect(metrics).toMatch(
            new RegExp(
                `zigbee2mqtt_device_link_quality\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} 200`,
            ),
        );
    });

    it("increments join counter on device joined", async () => {
        await mockZHEvents.deviceJoined({device: devices.bulb_color});
        await flushPromises();

        const metrics = await getMetrics();
        expect(metrics).toMatch(
            new RegExp(
                `zigbee2mqtt_device_joins_total\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} 1`,
            ),
        );
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
        expect(metrics).toMatch(
            new RegExp(
                `zigbee2mqtt_device_announces_total\\{[^}]*ieee_address="${devices.bulb_color.ieeeAddr}"[^}]*\\} 1`,
            ),
        );
    });
});
