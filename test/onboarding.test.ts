// biome-ignore assist/source/organizeImports: import mocks first
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import * as data from "./mocks/data";

import {rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import type {IncomingMessage, OutgoingHttpHeader, OutgoingHttpHeaders, RequestListener, Server, ServerResponse} from "node:http";
import type {findAllDevices} from "zigbee-herdsman/dist/adapter/adapterDiscovery";
import {onboard} from "../lib/util/onboarding";
import * as settings from "../lib/util/settings";

const mockHttpOnListen = vi.fn(() => Promise.resolve());
const mockHttpListener = vi.fn<RequestListener<typeof IncomingMessage, typeof ServerResponse>>();
const mockHttpListen = vi.fn<Server["listen"]>(
    // @ts-expect-error mocked for used definition
    async (_port, _host, listeningListener) => {
        if (typeof listeningListener === "function") {
            listeningListener();
        }

        await mockHttpOnListen();
    },
);
const mockHttpClose = vi.fn<Server["close"]>(
    // @ts-expect-error minimal mock
    (cb) => {
        cb?.();
    },
);
const mockFindAllDevices = vi.fn<typeof findAllDevices>(async () => []);

vi.mock("node:fs", {spy: true});
vi.mock("node:http", () => ({
    createServer: vi.fn((listener) => {
        if (listener) {
            mockHttpListener.mockImplementation(listener);
        }

        return {
            listen: mockHttpListen,
            close: mockHttpClose,
        };
    }),
}));
vi.mock("zigbee-herdsman/dist/adapter/adapterDiscovery", () => ({
    findAllDevices: vi.fn(() => mockFindAllDevices()),
}));

const SETTINGS_MINIMAL_DEFAULTS = {
    version: settings.CURRENT_VERSION,
    mqtt: {
        base_topic: settings.defaults.mqtt!.base_topic,
        server: "mqtt://localhost:1883",
    },
    serial: {},
    advanced: {
        log_level: settings.defaults.advanced!.log_level,
        channel: settings.defaults.advanced!.channel,
        network_key: "GENERATE",
        pan_id: "GENERATE",
        ext_pan_id: "GENERATE",
    },
    frontend: {
        enabled: settings.defaults.frontend!.enabled,
        port: settings.defaults.frontend!.port,
    },
    homeassistant: {
        enabled: settings.defaults.homeassistant!.enabled,
    },
    onboarding: true,
};

const SAMPLE_SETTINGS_INIT = {
    version: settings.CURRENT_VERSION,
    mqtt: {
        base_topic: "zigbee2mqtt",
        server: "mqtt://localhost:1883",
    },
    serial: {
        port: "/dev/ttyUSB0",
        adapter: "zstack",
        baudrate: 115200,
        rtscts: false,
    },
    advanced: {
        log_level: "info",
        channel: 15,
        network_key: [13, 53, 58, 7, 93, 131, 113, 215, 40, 32, 4, 26, 8, 110, 142, 213],
        pan_id: 54321,
        ext_pan_id: [0xee, 0xdd, 0xcc, 0xdd, 0xaa, 0xdd, 0x11, 0xdd],
    },
    frontend: {
        enabled: false,
        port: 8080,
    },
    homeassistant: {
        enabled: false,
    },
};

const SAMPLE_SETTINGS_SAVE = {
    version: settings.CURRENT_VERSION,
    mqtt: {
        base_topic: "zigbee2mqtt2",
        server: "mqtt://192.168.1.200:1883",
    },
    serial: {
        port: "COM3",
        adapter: "ember",
        baudrate: 230400,
        rtscts: true,
    },
    advanced: {
        log_level: "debug",
        channel: 25,
        network_key: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
        pan_id: 12345,
        ext_pan_id: [8, 7, 6, 5, 4, 3, 2, 1],
    },
    frontend: {
        enabled: true,
        port: 8080,
    },
    homeassistant: {
        enabled: true,
    },
    onboarding: true,
};

const SAMPLE_SETTINGS_SAVE_PARAMS = {
    mqtt_base_topic: "zigbee2mqtt2",
    mqtt_server: "mqtt://192.168.1.200:1883",
    mqtt_user: "",
    mqtt_password: "",
    serial_port: "COM3",
    serial_adapter: "ember",
    serial_baudrate: "230400",
    serial_rtscts: "on",
    log_level: "debug",
    network_channel: "25",
    network_key: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16",
    network_pan_id: "12345",
    network_ext_pan_id: "8,7,6,5,4,3,2,1",
    frontend_enabled: "on",
    frontend_port: "8080",
    homeassistant_enabled: "on",
};

describe("Onboarding", () => {
    beforeAll(() => {
        vi.useFakeTimers();
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    beforeEach(() => {
        delete process.env.Z2M_ONBOARD_NO_SERVER;
        delete process.env.Z2M_ONBOARD_FORCE_RUN;
        delete process.env.Z2M_ONBOARD_URL;
        delete process.env.Z2M_ONBOARD_NO_FAILURE_PAGE;
        delete process.env.Z2M_ONBOARD_NO_REDIRECT;
        delete process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER;
        delete process.env.ZIGBEE2MQTT_CONFIG_SERIAL_BAUDRATE;
        delete process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_CHANNEL;
        delete process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_NETWORK_KEY;
        delete process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_PAN_ID;
        delete process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_EXT_PAN_ID;
        delete process.env.ZIGBEE2MQTT_CONFIG_FRONTEND_PORT;
        delete process.env.ZIGBEE2MQTT_CONFIG_FRONTEND;
        delete process.env.ZIGBEE2MQTT_CONFIG_HOMEASSISTANT_ENABLED;

        data.writeDefaultConfiguration(SAMPLE_SETTINGS_INIT);
        data.removeState();
        data.removeDatabase();
        mockHttpListener.mockClear();
        mockHttpListen.mockClear();
        mockHttpClose.mockClear();
        mockFindAllDevices.mockClear();
        settings.reRead();
    });

    afterEach(() => {});

    const runOnboarding = async (
        params: Record<string, string>,
        expectWriteMinimal: boolean,
        expectFailure: boolean,
    ): Promise<[getHtml: string, postHtml: string]> => {
        // biome-ignore lint/suspicious/noExplicitAny: ignore
        const reqDataListener = vi.fn<(chunk: any) => void>();
        const reqEndListener = vi.fn<() => void>();
        // biome-ignore lint/suspicious/noExplicitAny: ignore
        const resEnd = vi.fn<(chunk: any | (() => void), cb?: () => void) => ServerResponse<IncomingMessage>>(
            // @ts-expect-error return not used
            (chunk, cb) => {
                if (typeof chunk === "function") {
                    chunk();
                } else if (cb) {
                    cb();
                }
            },
        );
        const resSetHeader = vi.fn<(name: string, value: number | string | readonly string[]) => ServerResponse<IncomingMessage>>();
        const resWriteHead =
            vi.fn<
                (statusCode: number, statusMessage?: string, headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]) => ServerResponse<IncomingMessage>
            >();

        mockHttpListener(
            {
                method: "GET",
                // @ts-expect-error return not used
                on: () => {},
            },
            {
                end: resEnd,
                setHeader: resSetHeader,
                writeHead: resWriteHead,
            },
        );
        await vi.advanceTimersByTimeAsync(100); // flush

        if (expectWriteMinimal) {
            const minimal = process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER
                ? Object.assign({}, SETTINGS_MINIMAL_DEFAULTS, {
                      mqtt: {server: process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER, base_topic: SETTINGS_MINIMAL_DEFAULTS.mqtt.base_topic},
                  })
                : SETTINGS_MINIMAL_DEFAULTS;

            expect(data.read()).toStrictEqual(minimal);
        }

        expect(mockFindAllDevices).toHaveBeenCalledTimes(1);
        expect(resSetHeader).toHaveBeenNthCalledWith(1, "Content-Type", "text/html");
        expect(resWriteHead).toHaveBeenNthCalledWith(1, 200);
        expect(resEnd).toHaveBeenCalledTimes(1);

        mockHttpListener(
            {
                method: "POST",
                // @ts-expect-error return not used
                on: (event, listener) => {
                    if (event === "data") {
                        reqDataListener.mockImplementation(listener);
                    } else if (event === "end") {
                        // @ts-expect-error typing not narrowed
                        reqEndListener.mockImplementation(listener);
                    }
                },
            },
            {
                end: resEnd,
                setHeader: resSetHeader,
                writeHead: resWriteHead,
            },
        );

        for (const k in params) {
            reqDataListener(`${k}=${params[k as keyof typeof params]}&`);
        }

        reqEndListener();
        await vi.advanceTimersByTimeAsync(100); // flush

        if (expectFailure) {
            if (process.env.Z2M_ONBOARD_NO_FAILURE_PAGE) {
                expect(resEnd).toHaveBeenCalledTimes(2);
            } else {
                mockHttpListener(
                    {
                        method: "POST",
                        // @ts-expect-error return not used
                        on: () => {},
                    },
                    {
                        end: resEnd,
                        setHeader: resSetHeader,
                        writeHead: resWriteHead,
                    },
                );
                await vi.advanceTimersByTimeAsync(100); // flush

                expect(resSetHeader).toHaveBeenNthCalledWith(2, "Content-Type", "text/html");
                expect(resWriteHead).toHaveBeenNthCalledWith(2, 406);
                expect(resEnd).toHaveBeenCalledTimes(3);
            }
        } else {
            expect(resSetHeader).toHaveBeenNthCalledWith(2, "Content-Type", "text/html");
            expect(resWriteHead).toHaveBeenNthCalledWith(2, 200);
            expect(resEnd).toHaveBeenCalledTimes(2);
        }

        const serverUrl = new URL(process.env.Z2M_ONBOARD_URL ?? "http://0.0.0.0:8080");
        expect(mockHttpListen).toHaveBeenCalledWith(Number.parseInt(serverUrl.port, 10), serverUrl.hostname, expect.any(Function));

        return [resEnd.mock.calls[0][0], resEnd.mock.calls[1][0]];
    };

    const runFailure = async (): Promise<string> => {
        // biome-ignore lint/suspicious/noExplicitAny: ignore
        const resEnd = vi.fn<(chunk: any | (() => void), cb?: () => void) => ServerResponse<IncomingMessage>>(
            // @ts-expect-error return not used
            (chunk, cb) => {
                if (typeof chunk === "function") {
                    chunk();
                } else if (cb) {
                    cb();
                }
            },
        );
        const resSetHeader = vi.fn<(name: string, value: number | string | readonly string[]) => ServerResponse<IncomingMessage>>();
        const resWriteHead =
            vi.fn<
                (statusCode: number, statusMessage?: string, headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]) => ServerResponse<IncomingMessage>
            >();

        mockHttpListener(
            {
                method: "GET",
                // @ts-expect-error return not used
                on: () => {},
            },
            {
                end: resEnd,
                setHeader: resSetHeader,
                writeHead: resWriteHead,
            },
        );
        await vi.advanceTimersByTimeAsync(100); // flush

        expect(resSetHeader).toHaveBeenNthCalledWith(1, "Content-Type", "text/html");
        expect(resWriteHead).toHaveBeenNthCalledWith(1, 406);
        expect(resEnd).toHaveBeenCalledTimes(1);

        mockHttpListener(
            {
                method: "POST",
                // @ts-expect-error return not used
                on: () => {},
            },
            {
                end: resEnd,
                setHeader: resSetHeader,
                writeHead: resWriteHead,
            },
        );
        await vi.advanceTimersByTimeAsync(100); // flush

        expect(resEnd).toHaveBeenCalledTimes(2);

        const serverUrl = new URL(process.env.Z2M_ONBOARD_URL ?? "http://0.0.0.0:8080");
        expect(mockHttpListen).toHaveBeenCalledWith(Number.parseInt(serverUrl.port, 10), serverUrl.hostname, expect.any(Function));

        return resEnd.mock.calls[0][0];
    };

    it("creates config file and sets given settings", async () => {
        data.removeConfiguration();

        let p;
        const [getHtml, postHtml] = await new Promise<[string, string]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(SAMPLE_SETTINGS_SAVE_PARAMS, true, false));
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(SAMPLE_SETTINGS_SAVE);
        expect(getHtml).toContain("No device found");
        expect(getHtml).not.toContain("generate_network");
        expect(postHtml).toContain('<a href="http://localhost:8080/">');
    });

    it("creates config file and sets given unusual settings", async () => {
        data.removeConfiguration();

        process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER = "mqtt://core-mosquitto:1883";

        mockFindAllDevices.mockResolvedValueOnce([
            {name: "My Device", path: "/dev/serial/by-id/my-device-001", adapter: "ember"},
            {name: "My Device 2", path: "/dev/serial/by-id/my-device-002", adapter: undefined},
        ]);

        let p;
        const [getHtml, postHtml] = await new Promise<[string, string]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(
                        await runOnboarding(
                            Object.assign({}, SAMPLE_SETTINGS_SAVE_PARAMS, {
                                mqtt_user: "abcd",
                                mqtt_password: "defg",
                                frontend_enabled: undefined,
                                network_key: "GENERATE",
                                network_pan_id: "GENERATE",
                                network_ext_pan_id: "GENERATE",
                            }),
                            true,
                            false,
                        ),
                    );
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(
            Object.assign({}, SAMPLE_SETTINGS_SAVE, {
                advanced: {
                    log_level: SAMPLE_SETTINGS_SAVE.advanced.log_level,
                    channel: SAMPLE_SETTINGS_SAVE.advanced.channel,
                    network_key: "GENERATE",
                    pan_id: "GENERATE",
                    ext_pan_id: "GENERATE",
                },
                frontend: {
                    enabled: false,
                    port: SAMPLE_SETTINGS_SAVE.frontend.port,
                },
                mqtt: {
                    base_topic: SAMPLE_SETTINGS_SAVE.mqtt.base_topic,
                    server: process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER,
                    user: "abcd",
                    password: "defg",
                },
            }),
        );
        expect(getHtml).toContain(`<option value="My Device, /dev/serial/by-id/my-device-001, ember">`);
        expect(getHtml).toContain(`<option value="My Device 2, /dev/serial/by-id/my-device-002, unknown">`);
        expect(getHtml).toContain(process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER);
        expect(postHtml).toContain("You can close this page");
    });

    it("reruns onboard via ENV and sets given settings", async () => {
        // data.removeConfiguration();

        process.env.Z2M_ONBOARD_FORCE_RUN = "1";

        let p;
        const [getHtml, postHtml] = await new Promise<[string, string]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(SAMPLE_SETTINGS_SAVE_PARAMS, false, false));
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(SAMPLE_SETTINGS_SAVE);
        expect(getHtml).toContain("No device found");
        expect(getHtml).toContain("generate_network");
        expect(postHtml).toContain('<a href="http://localhost:8080/">');
    });

    it("reruns onboard on failed start", async () => {
        // data.removeConfiguration();
        settings.setOnboarding(true);

        let p;
        const [getHtml, postHtml] = await new Promise<[string, string]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(SAMPLE_SETTINGS_SAVE_PARAMS, false, false));
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(SAMPLE_SETTINGS_SAVE);
        expect(getHtml).toContain("No device found");
        expect(getHtml).toContain("generate_network");
        expect(postHtml).toContain('<a href="http://localhost:8080/">');
    });

    it("sets given settings - no frontend redirect", async () => {
        data.removeConfiguration();

        vi.spyOn(settings, "writeMinimalDefaults").mockImplementationOnce(() => {
            settings.writeMinimalDefaults();
            settings.set(["frontend", "host"], "/run/zigbee2mqtt/zigbee2mqtt.sock");
        });

        let p;
        const [getHtml, postHtml] = await new Promise<[string, string]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(SAMPLE_SETTINGS_SAVE_PARAMS, false, false));
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(
            Object.assign({}, SAMPLE_SETTINGS_SAVE, {
                frontend: {
                    enabled: SAMPLE_SETTINGS_SAVE.frontend.enabled,
                    port: SAMPLE_SETTINGS_SAVE.frontend.port,
                    host: "/run/zigbee2mqtt/zigbee2mqtt.sock",
                },
            }),
        );
        expect(getHtml).toContain("No device found");
        expect(postHtml).toContain("You can close this page");
    });

    it("sets given settings - no frontend redirect via ENV", async () => {
        data.removeConfiguration();

        process.env.Z2M_ONBOARD_NO_REDIRECT = "1";

        let p;
        const [getHtml, postHtml] = await new Promise<[string, string]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(SAMPLE_SETTINGS_SAVE_PARAMS, false, false));
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(SAMPLE_SETTINGS_SAVE);
        expect(getHtml).toContain("No device found");
        expect(postHtml).toContain("You can close this page");
    });

    it("sets given settings - frontend SSL redirect", async () => {
        data.removeConfiguration();

        vi.spyOn(settings, "writeMinimalDefaults").mockImplementationOnce(() => {
            settings.writeMinimalDefaults();
            settings.set(["frontend", "ssl_cert"], "dummy");
            settings.set(["frontend", "ssl_key"], "dummy2");
        });

        let p;
        const [getHtml, postHtml] = await new Promise<[string, string]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(SAMPLE_SETTINGS_SAVE_PARAMS, false, false));
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(
            Object.assign({}, SAMPLE_SETTINGS_SAVE, {
                frontend: {
                    enabled: SAMPLE_SETTINGS_SAVE.frontend.enabled,
                    port: SAMPLE_SETTINGS_SAVE.frontend.port,
                    ssl_cert: "dummy",
                    ssl_key: "dummy2",
                },
            }),
        );
        expect(getHtml).toContain("No device found");
        expect(postHtml).toContain('<a href="https://localhost:8080/">');
    });

    it("handles saving errors", async () => {
        process.env.Z2M_ONBOARD_FORCE_RUN = "1";

        let p;
        const [getHtml, postHtml] = await new Promise<[string, string]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(Object.assign({}, SAMPLE_SETTINGS_SAVE_PARAMS, {serial_adapter: "emberz"}), false, true));
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(false);
        expect(data.read()).toStrictEqual(Object.assign({}, SAMPLE_SETTINGS_INIT, {onboarding: true}));
        expect(getHtml).toContain("No device found");
        expect(postHtml).toContain("adapter must be equal to one of the allowed values");
    });

    it("handles configuring onboarding via ENV", async () => {
        data.removeConfiguration();

        process.env.Z2M_ONBOARD_URL = "http://192.168.1.123:8888";
        process.env.Z2M_ONBOARD_NO_FAILURE_PAGE = "1";
        process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER = "mqtt://core-mosquitto:1883";

        let p;

        await new Promise<[string, string]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(Object.assign({}, SAMPLE_SETTINGS_SAVE_PARAMS, {serial_adapter: "emberz"}), true, true));
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(false);
        expect(data.read()).toStrictEqual(
            Object.assign({}, SETTINGS_MINIMAL_DEFAULTS, {
                mqtt: {server: process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER, base_topic: SETTINGS_MINIMAL_DEFAULTS.mqtt.base_topic},
            }),
        );
    });

    it("handles disabling onboarding server via ENV", async () => {
        data.removeConfiguration();

        process.env.Z2M_ONBOARD_NO_SERVER = "1";
        process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER = "mqtt://core-mosquitto:1883";

        const p = onboard();

        await expect(p).resolves.toStrictEqual(true);

        const expected = Object.assign({}, SETTINGS_MINIMAL_DEFAULTS, {
            mqtt: {server: process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER, base_topic: SETTINGS_MINIMAL_DEFAULTS.mqtt.base_topic},
        });
        // @ts-expect-error mock
        delete expected.onboarding;

        expect(data.read()).toStrictEqual(expected);
    });

    it("handles configuring onboarding with config ENV overrides", async () => {
        process.env.Z2M_ONBOARD_FORCE_RUN = "1";
        process.env.ZIGBEE2MQTT_CONFIG_SERIAL_BAUDRATE = "230400";
        process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_CHANNEL = "20";
        process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_NETWORK_KEY = "[11,22,33,44,55,66,77,88,99,10,11,12,13,14,15,16]";
        process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_PAN_ID = "1";
        process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_EXT_PAN_ID = "[11,22,33,44,55,66,15,16]";
        process.env.ZIGBEE2MQTT_CONFIG_FRONTEND_PORT = "8282";

        let p;

        await new Promise<[string, string]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                const newSettings = Object.assign({}, SAMPLE_SETTINGS_SAVE_PARAMS);
                // @ts-expect-error mock disabled field
                delete newSettings.serial_baudrate;
                // @ts-expect-error mock disabled field
                delete newSettings.network_channel;
                // @ts-expect-error mock disabled field
                delete newSettings.network_key;
                // @ts-expect-error mock disabled field
                delete newSettings.network_pan_id;
                // @ts-expect-error mock disabled field
                delete newSettings.network_ext_pan_id;
                // @ts-expect-error mock disabled field
                delete newSettings.frontend_port;

                try {
                    resolve(await runOnboarding(newSettings, false, false));
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(
            Object.assign({}, SAMPLE_SETTINGS_SAVE, {
                serial: {
                    port: SAMPLE_SETTINGS_SAVE.serial.port,
                    adapter: SAMPLE_SETTINGS_SAVE.serial.adapter,
                    baudrate: 230400,
                    rtscts: SAMPLE_SETTINGS_SAVE.serial.rtscts,
                },
                advanced: {
                    log_level: SAMPLE_SETTINGS_SAVE.advanced.log_level,
                    channel: 20,
                    network_key: [11, 22, 33, 44, 55, 66, 77, 88, 99, 10, 11, 12, 13, 14, 15, 16],
                    pan_id: 1,
                    ext_pan_id: [11, 22, 33, 44, 55, 66, 15, 16],
                },
                frontend: {
                    enabled: SAMPLE_SETTINGS_SAVE.frontend.enabled,
                    port: 8282,
                },
            }),
        );
    });

    it("runs migrations", async () => {
        settings.set(["version"], settings.CURRENT_VERSION - 1);

        const p = onboard();

        await expect(p).resolves.toStrictEqual(true);
        expect(settings.get().version).toStrictEqual(settings.CURRENT_VERSION);
    });

    it("runs 1.x.x conflict migrations", async () => {
        data.writeDefaultConfiguration({
            mqtt: {
                server: "mqtt://core-mosquitto:1883",
            },
            homeassistant: true,
            advanced: {
                network_key: "GENERATE",
                pan_id: "GENERATE",
                ext_pan_id: "GENERATE",
            },
        });
        settings.reRead();
        process.env.ZIGBEE2MQTT_CONFIG_FRONTEND = '{"enabled":true,"port": 8099}';
        process.env.ZIGBEE2MQTT_CONFIG_HOMEASSISTANT_ENABLED = "true";

        const p = onboard();

        await expect(p).resolves.toStrictEqual(true);
        expect(settings.get().version).toStrictEqual(settings.CURRENT_VERSION);
        expect(settings.get().homeassistant).toMatchObject({enabled: true});
        expect(settings.get().frontend).toMatchObject({enabled: true, port: 8099});
    });

    it("handles validation failure", async () => {
        const reReadSpy = vi.spyOn(settings, "reRead");

        // set after onboarding server is done to reach bottom code path
        reReadSpy.mockImplementationOnce(() => {
            settings.set(["serial", "adapter"], "emberz");
            settings.reRead();
        });

        let p;
        const getHtml = await new Promise<string>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runFailure());
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(false);
        expect(getHtml).toContain("adapter must be equal to one of the allowed values");

        reReadSpy.mockRestore();
    });

    it("handles non-required validation failure before applying envs", async () => {
        settings.set(["serial"], "/dev/ttyUSB0");

        let p;
        const getHtml = await new Promise<string>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runFailure());
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(false);
        expect(getHtml).toContain("serial must be object");
    });

    it("handles invalid yaml file", async () => {
        settings.testing.clear();

        const configFile = join(data.mockDir, "configuration.yaml");

        writeFileSync(
            configFile,
            `
                good: 9
                \t wrong
        `,
        );

        let p;
        const getHtml = await new Promise<string>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runFailure());
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(false);
        expect(getHtml).toContain("Your configuration file");
        expect(getHtml).toContain("is invalid");

        data.removeConfiguration();
    });

    it("handles error while loading yaml file", async () => {
        settings.testing.clear();

        const configFile = join(data.mockDir, "configuration.yaml");

        writeFileSync(configFile, "badfile");

        let p;
        const getHtml = await new Promise<string>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runFailure());
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(false);
        expect(getHtml).toContain("AssertionError");
        expect(getHtml).toContain("expected to be an object");

        data.removeConfiguration();
    });

    it("handles creating data path", async () => {
        rmSync(data.mockDir, {force: true, recursive: true});
        settings.testing.clear();

        let p;
        await new Promise<[string, string]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(SAMPLE_SETTINGS_SAVE_PARAMS, true, false));
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(SAMPLE_SETTINGS_SAVE);
    });
});
