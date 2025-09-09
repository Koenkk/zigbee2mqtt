// biome-ignore assist/source/organizeImports: import mocks first
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import * as data from "../mocks/data";
import {mockLogger} from "../mocks/logger";
import {events as mockMQTTEvents, mockMQTTPublishAsync} from "../mocks/mqtt";
import {type EventHandler, flushPromises} from "../mocks/utils";
import {devices, events as mockZHEvents} from "../mocks/zigbeeHerdsman";

import path from "node:path";
import stringify from "json-stable-stringify-without-jsonify";
import type {Mock} from "vitest";
import ws from "ws";
import {Controller} from "../../lib/controller";
import * as settings from "../../lib/util/settings";

let mockHTTPOnRequest: (request: {url: string}, response: number) => void;
const mockHTTPEvents: Record<string, EventHandler> = {};
const mockHTTP = {
    listen: vi.fn(),
    on: (event: string, handler: EventHandler): void => {
        mockHTTPEvents[event] = handler;
    },
    close: vi.fn<(cb: (err?: Error) => void) => void>((cb) => cb()),
};

const mockHTTPSEvents: Record<string, EventHandler> = {};
const mockHTTPS = {
    listen: vi.fn(),
    on: (event: string, handler: EventHandler): void => {
        mockHTTPSEvents[event] = handler;
    },
    close: vi.fn<(cb: (err?: Error) => void) => void>((cb) => cb()),
};

const mockWSocket = {
    close: vi.fn<(cb: (err?: Error) => void) => void>(),
};

const mockWSClientEvents: Record<string, EventHandler> = {};
const mockWSClient = {
    on: (event: string, handler: EventHandler): void => {
        mockWSClientEvents[event] = handler;
    },
    send: vi.fn<(data: string) => void>(),
    terminate: vi.fn<() => void>(),
    readyState: "close",
};
const mockWSEvents: Record<string, EventHandler> = {};
const mockWSClients: (typeof mockWSClient)[] = [];
const mockWS = {
    clients: mockWSClients,
    on: (event: string, handler: EventHandler): void => {
        mockWSEvents[event] = handler;
    },
    handleUpgrade: vi.fn().mockImplementation((_request, _socket, _head, cb) => {
        cb(mockWSocket);
    }),
    // biome-ignore lint/suspicious/noExplicitAny: ignore
    emit: vi.fn<(eventName: string, ...args: any[]) => void>(),
    close: vi.fn<(code?: number, data?: string | Buffer) => void>(),
};

const frontendPath = "frontend-path";
const deviceIconsPath = path.join(data.mockDir, "device_icons");
let mockNodeStatic: {[s: string]: Mock} = {};

const mockFinalHandler = vi.fn();

vi.mock("node:http", () => ({
    createServer: vi.fn().mockImplementation((onRequest) => {
        mockHTTPOnRequest = onRequest;
        return mockHTTP;
    }),
    Agent: vi.fn(),
}));

vi.mock("node:https", () => ({
    createServer: vi.fn().mockImplementation(() => mockHTTPS),
    Agent: vi.fn(),
}));

vi.mock("express-static-gzip", () => ({
    default: vi.fn().mockImplementation((path: string) => {
        mockNodeStatic[path] = vi.fn();
        return mockNodeStatic[path];
    }),
}));

vi.mock("zigbee2mqtt-windfront", () => ({
    default: {
        getPath: (): string => frontendPath,
    },
}));

vi.mock("ws", () => ({
    default: {
        OPEN: "open",
        Server: vi.fn().mockImplementation(() => {
            return mockWS;
        }),
    },
}));

vi.mock("finalhandler", () => ({
    default: vi.fn().mockImplementation(() => {
        return mockFinalHandler;
    }),
}));

const mocksClear = [
    mockHTTP.close,
    mockHTTP.listen,
    mockHTTPS.close,
    mockHTTPS.listen,
    mockWSocket.close,
    mockWS.close,
    mockWS.handleUpgrade,
    mockWS.emit,
    mockWSClient.send,
    mockWSClient.terminate,
    mockFinalHandler,
    mockMQTTPublishAsync,
    mockLogger.error,
];

describe("Extension: Frontend", () => {
    let controller: Controller;

    beforeAll(() => {
        vi.useFakeTimers();
    });

    beforeEach(() => {
        mockNodeStatic = {};
        mockWS.clients = [];
        data.writeDefaultConfiguration();
        data.writeDefaultState();
        settings.reRead();
        settings.set(["frontend"], {enabled: true, port: 8081, host: "127.0.0.1"});
        settings.set(["homeassistant"], {enabled: true});
        devices.bulb.linkquality = 10;
        for (const mock of mocksClear) mock.mockClear();
        mockWSClient.readyState = "close";
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    afterEach(async () => {
        delete devices.bulb.linkquality;
        await controller?.stop();
        await flushPromises();
    });

    it("Start/stop with defaults", async () => {
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        expect(Object.keys(mockNodeStatic)).toStrictEqual([frontendPath, deviceIconsPath]);
        expect(mockHTTP.listen).toHaveBeenCalledWith(8081, "127.0.0.1");
        mockWS.clients.push(mockWSClient);
        await controller.stop();
        expect(mockWSClient.terminate).toHaveBeenCalledTimes(1);
        expect(mockHTTP.close).toHaveBeenCalledTimes(1);
        expect(mockWS.close).toHaveBeenCalledTimes(1);
    });

    it("Start/stop without host", async () => {
        settings.set(["frontend"], {enabled: true, port: 8081});
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        expect(Object.keys(mockNodeStatic)).toStrictEqual([frontendPath, deviceIconsPath]);
        expect(mockHTTP.listen).toHaveBeenCalledWith(8081);
        mockWS.clients.push(mockWSClient);
        await controller.stop();
        expect(mockWSClient.terminate).toHaveBeenCalledTimes(1);
        expect(mockHTTP.close).toHaveBeenCalledTimes(1);
        expect(mockWS.close).toHaveBeenCalledTimes(1);
    });

    it("Start/stop unix socket", async () => {
        settings.set(["frontend", "host"], "/tmp/zigbee2mqtt.sock");
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        expect(Object.keys(mockNodeStatic)).toStrictEqual([frontendPath, deviceIconsPath]);
        expect(mockHTTP.listen).toHaveBeenCalledWith("/tmp/zigbee2mqtt.sock");
        mockWS.clients.push(mockWSClient);
        await controller.stop();
        expect(mockWSClient.terminate).toHaveBeenCalledTimes(1);
        expect(mockHTTP.close).toHaveBeenCalledTimes(1);
        expect(mockWS.close).toHaveBeenCalledTimes(1);
    });

    it("Start/stop HTTPS valid", async () => {
        settings.set(["frontend", "ssl_cert"], path.join(__dirname, "..", "assets", "certs", "dummy.crt"));
        settings.set(["frontend", "ssl_key"], path.join(__dirname, "..", "assets", "certs", "dummy.key"));
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        expect(mockHTTP.listen).not.toHaveBeenCalledWith(8081, "127.0.0.1");
        expect(mockHTTPS.listen).toHaveBeenCalledWith(8081, "127.0.0.1");
        await controller.stop();
    });

    it("Start/stop HTTPS invalid : missing config", async () => {
        settings.set(["frontend", "ssl_cert"], path.join(__dirname, "..", "assets", "certs", "dummy.crt"));
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        expect(mockHTTP.listen).toHaveBeenCalledWith(8081, "127.0.0.1");
        expect(mockHTTPS.listen).not.toHaveBeenCalledWith(8081, "127.0.0.1");
        await controller.stop();
    });

    it("Start/stop HTTPS invalid : missing file", async () => {
        settings.set(["frontend", "ssl_cert"], "filesNotExists.crt");
        settings.set(["frontend", "ssl_key"], path.join(__dirname, "..", "assets", "certs", "dummy.key"));
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        expect(mockHTTP.listen).toHaveBeenCalledWith(8081, "127.0.0.1");
        expect(mockHTTPS.listen).not.toHaveBeenCalledWith(8081, "127.0.0.1");
        await controller.stop();
    });

    it("Websocket interaction", async () => {
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        mockWSClient.readyState = "open";
        mockWS.clients.push(mockWSClient);
        await mockWSEvents.connection(mockWSClient);
        devices.bulb_color.linkquality = 20;

        const allTopics = mockWSClient.send.mock.calls.map(([m]) => JSON.parse(m).topic);
        expect(allTopics).toContain("bridge/devices");
        expect(allTopics).toContain("bridge/info");
        expect(mockWSClient.send).toHaveBeenCalledWith(stringify({topic: "bridge/state", payload: {state: "online"}}));
        expect(mockWSClient.send).toHaveBeenCalledWith(stringify({topic: "remote", payload: {brightness: 255}}));

        // Message
        mockMQTTPublishAsync.mockClear();
        mockWSClient.send.mockClear();
        mockWSClientEvents.message(stringify({topic: "bulb_color/set", payload: {state: "ON"}}), false);
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb_color",
            stringify({
                state: "ON",
                effect: null,
                power_on_behavior: null,
                linkquality: 20,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: false, qos: 0},
        );
        mockWSClientEvents.message(undefined, false);
        mockWSClientEvents.message("", false);
        mockWSClientEvents.message(null, false);
        await flushPromises();

        // Error
        mockWSClientEvents.error(new Error("This is an error"));
        expect(mockLogger.error).toHaveBeenCalledWith("WebSocket error: This is an error");

        // Received message on socket
        expect(mockWSClient.send).toHaveBeenCalledTimes(1);
        expect(mockWSClient.send).toHaveBeenCalledWith(
            stringify({
                topic: "bulb_color",
                payload: {
                    state: "ON",
                    power_on_behavior: null,
                    effect: null,
                    linkquality: 20,
                    update: {state: null, installed_version: -1, latest_version: -1},
                },
            }),
        );

        // Should publish bridge messages
        await mockZHEvents.deviceJoined({device: devices.bulb});
        await flushPromises();
        expect(mockWSClient.send).toHaveBeenCalledWith(
            stringify({payload: {data: {friendly_name: "bulb", ieee_address: "0x000b57fffec6a5b2"}, type: "device_joined"}, topic: "bridge/event"}),
        );

        // Should send JSON state event when `output: attribute`
        mockWSClient.send.mockClear();
        settings.set(["advanced", "output"], "attribute");
        await mockMQTTEvents.message("zigbee2mqtt/bulb_color/set", stringify({brightness: 90}));
        await flushPromises();
        expect(mockWSClient.send).toHaveBeenCalledTimes(1);
        expect(mockWSClient.send).toHaveBeenCalledWith(
            stringify({
                topic: "bulb_color",
                payload: {
                    state: "ON",
                    brightness: 90,
                    power_on_behavior: null,
                    effect: null,
                    linkquality: 20,
                    update: {state: null, installed_version: -1, latest_version: -1},
                },
            }),
        );

        // Shouldnt set when not ready
        mockWSClient.send.mockClear();
        mockWSClient.readyState = "close";
        mockWSClientEvents.message(stringify({topic: "bulb_color/set", payload: {state: "ON"}}), false);
        expect(mockWSClient.send).toHaveBeenCalledTimes(0);

        // Send last seen on connect
        mockWSClient.send.mockClear();
        mockWSClient.readyState = "open";
        settings.set(["advanced"], {last_seen: "ISO_8601"});
        mockWS.clients.push(mockWSClient);
        await mockWSEvents.connection(mockWSClient);
        expect(mockWSClient.send).toHaveBeenCalledWith(
            stringify({topic: "remote", payload: {brightness: 255, last_seen: "1970-01-01T00:00:01.000Z"}}),
        );
    });

    it("onRequest/onUpgrade", async () => {
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();

        const mockSocket = {destroy: vi.fn()};
        mockHTTPEvents.upgrade({url: "http://localhost:8080/api"}, mockSocket, 3);
        expect(mockWS.handleUpgrade).toHaveBeenCalledTimes(1);
        expect(mockSocket.destroy).toHaveBeenCalledTimes(0);
        expect(mockWS.handleUpgrade).toHaveBeenCalledWith({url: "http://localhost:8080/api"}, mockSocket, 3, expect.any(Function));
        mockWS.handleUpgrade.mock.calls[0][3](99);
        expect(mockWS.emit).toHaveBeenCalledWith("connection", 99, {url: "http://localhost:8080/api"});

        mockHTTPOnRequest({url: "/file.txt"}, 2);
        expect(mockNodeStatic[deviceIconsPath]).toHaveBeenCalledTimes(0);
        expect(mockNodeStatic[frontendPath]).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic[frontendPath]).toHaveBeenCalledWith(
            {originalUrl: "/file.txt", path: "/file.txt", url: "/file.txt"},
            2,
            expect.any(Function),
        );
    });

    it("Should serve device icons", async () => {
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();

        mockHTTPOnRequest({url: "/device_icons/my_device.png"}, 2);
        expect(mockNodeStatic[frontendPath]).toHaveBeenCalledTimes(0);
        expect(mockNodeStatic[deviceIconsPath]).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic[deviceIconsPath]).toHaveBeenCalledWith(
            {originalUrl: "/device_icons/my_device.png", path: "/my_device.png", url: "/my_device.png"},
            2,
            expect.any(Function),
        );
    });

    it("Static server", async () => {
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();

        expect(mockHTTP.listen).toHaveBeenCalledWith(8081, "127.0.0.1");
    });

    it("Authentication", async () => {
        const authToken = "sample-secure-token";
        settings.set(["frontend", "auth_token"], authToken);
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();

        const mockSocket = {destroy: vi.fn()};
        mockHTTPEvents.upgrade({url: "/api"}, mockSocket, mockWSocket);
        expect(mockWS.handleUpgrade).toHaveBeenCalledTimes(1);
        expect(mockSocket.destroy).toHaveBeenCalledTimes(0);
        expect(mockWS.handleUpgrade).toHaveBeenCalledWith({url: "/api"}, mockSocket, mockWSocket, expect.any(Function));
        expect(mockWSocket.close).toHaveBeenCalledWith(4401, "Unauthorized");

        mockWSocket.close.mockClear();
        mockWS.emit.mockClear();

        const url = `/api?token=${authToken}`;
        mockWS.handleUpgrade.mockClear();
        mockHTTPEvents.upgrade({url: url}, mockSocket, 3);
        expect(mockWS.handleUpgrade).toHaveBeenCalledTimes(1);
        expect(mockSocket.destroy).toHaveBeenCalledTimes(0);
        expect(mockWS.handleUpgrade).toHaveBeenCalledWith({url}, mockSocket, 3, expect.any(Function));
        expect(mockWSocket.close).toHaveBeenCalledTimes(0);
        mockWS.handleUpgrade.mock.calls[0][3](mockWSocket);
        expect(mockWS.emit).toHaveBeenCalledWith("connection", mockWSocket, {url});
    });

    it.each(["/z2m/", "/z2m"])("Works with non-default base url %s", async (baseUrl) => {
        settings.set(["frontend", "base_url"], baseUrl);
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();

        expect(ws.Server).toHaveBeenCalledWith({noServer: true, path: "/z2m/api"});

        mockHTTPOnRequest({url: "/z2m"}, 2);
        expect(mockNodeStatic[frontendPath]).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic[frontendPath]).toHaveBeenCalledWith({originalUrl: "/z2m", path: "/", url: "/"}, 2, expect.any(Function));
        expect(mockFinalHandler).not.toHaveBeenCalledWith();

        mockNodeStatic[frontendPath].mockReset();
        expect(mockFinalHandler).not.toHaveBeenCalledWith();
        mockHTTPOnRequest({url: "/z2m/file.txt"}, 2);
        expect(mockNodeStatic[frontendPath]).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic[frontendPath]).toHaveBeenCalledWith(
            {originalUrl: "/z2m/file.txt", path: "/file.txt", url: "/file.txt"},
            2,
            expect.any(Function),
        );
        expect(mockFinalHandler).not.toHaveBeenCalledWith();

        mockNodeStatic[frontendPath].mockReset();
        mockHTTPOnRequest({url: "/z/file.txt"}, 2);
        expect(mockNodeStatic[frontendPath]).not.toHaveBeenCalled();
        expect(mockFinalHandler).toHaveBeenCalled();

        mockHTTPOnRequest({url: "/z2m/device_icons/my-device.png"}, 2);
        expect(mockNodeStatic[deviceIconsPath]).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic[deviceIconsPath]).toHaveBeenCalledWith(
            {originalUrl: "/z2m/device_icons/my-device.png", path: "/my-device.png", url: "/my-device.png"},
            2,
            expect.any(Function),
        );
    });

    it("Works with non-default complex base url", async () => {
        const baseUrl = "/z2m-more++/c0mplex.url/";
        settings.set(["frontend", "base_url"], baseUrl);
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();

        expect(ws.Server).toHaveBeenCalledWith({noServer: true, path: "/z2m-more++/c0mplex.url/api"});

        mockHTTPOnRequest({url: "/z2m-more++/c0mplex.url"}, 2);
        expect(mockNodeStatic[frontendPath]).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic[frontendPath]).toHaveBeenCalledWith(
            {originalUrl: "/z2m-more++/c0mplex.url", path: "/", url: "/"},
            2,
            expect.any(Function),
        );
        expect(mockFinalHandler).not.toHaveBeenCalledWith();

        mockNodeStatic[frontendPath].mockReset();
        expect(mockFinalHandler).not.toHaveBeenCalledWith();
        mockHTTPOnRequest({url: "/z2m-more++/c0mplex.url/file.txt"}, 2);
        expect(mockNodeStatic[frontendPath]).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic[frontendPath]).toHaveBeenCalledWith(
            {originalUrl: "/z2m-more++/c0mplex.url/file.txt", path: "/file.txt", url: "/file.txt"},
            2,
            expect.any(Function),
        );
        expect(mockFinalHandler).not.toHaveBeenCalledWith();

        mockNodeStatic[frontendPath].mockReset();
        mockHTTPOnRequest({url: "/z/file.txt"}, 2);
        expect(mockNodeStatic[frontendPath]).not.toHaveBeenCalled();
        expect(mockFinalHandler).toHaveBeenCalled();
    });

    it("prevents mismatching setting/extension state", async () => {
        settings.set(["frontend", "enabled"], false);

        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();

        await expect(async () => {
            await controller.enableDisableExtension(true, "Frontend");
        }).rejects.toThrow("Tried to enable Frontend extension disabled in settings");

        settings.set(["frontend", "enabled"], true);

        await expect(async () => {
            await controller.enableDisableExtension(false, "Frontend");
        }).rejects.toThrow("Tried to disable Frontend extension enabled in settings");

        await controller.enableDisableExtension(true, "Frontend");

        await expect(async () => {
            await controller.enableDisableExtension(true, "Frontend");
        }).rejects.toThrow("Extension with name Frontend already present");

        settings.set(["frontend", "enabled"], false);
        await controller.enableDisableExtension(false, "Frontend");

        await vi.waitFor(() => controller.getExtension("Frontend") === undefined);
    });

    it("disables serving", async () => {
        settings.set(["frontend", "disable_ui_serving"], true);
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();

        expect(mockHTTP.listen).toHaveBeenCalledTimes(0);
        mockWS.clients.push(mockWSClient);
        await controller.stop();
        expect(mockWSClient.terminate).toHaveBeenCalledTimes(1);
        expect(mockHTTP.close).toHaveBeenCalledTimes(0);
        expect(mockWS.close).toHaveBeenCalledTimes(1);
    });
});
