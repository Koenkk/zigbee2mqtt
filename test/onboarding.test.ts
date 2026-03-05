// biome-ignore assist/source/organizeImports: import mocks first
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import * as data from "./mocks/data";

import {readFileSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import type {IncomingMessage, OutgoingHttpHeader, OutgoingHttpHeaders, RequestListener, Server, ServerResponse} from "node:http";
import JSZip from "jszip";
import type {findAllDevices} from "zigbee-herdsman/dist/adapter/adapterDiscovery";
import type {OnboardFailureData, OnboardInitData, OnboardSubmitResponse} from "../lib/types/api";
import {onboard} from "../lib/util/onboarding";
import * as settings from "../lib/util/settings";

const mockHttpOnListen = vi.fn(() => Promise.resolve());
const mockHttpListener = vi.fn<RequestListener<typeof IncomingMessage, typeof ServerResponse>>();
let mockHttpErrorListener: ((error: Error) => void) | undefined;
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
const mockStaticFileServer = vi.fn((_req, res, next) => {
    if (typeof next === "function") {
        next();
    }

    res.end();
});
const mockExpressStaticGzip = vi.fn((_path: unknown, _options: unknown) => mockStaticFileServer);
const mockFinalHandlerNext = vi.fn();
const mockFinalhandler = vi.fn((_req: unknown, _res: unknown) => mockFinalHandlerNext);

vi.mock("node:fs", {spy: true});
vi.mock("node:http", () => ({
    createServer: vi.fn((listener) => {
        if (listener) {
            mockHttpListener.mockImplementation(listener);
        }

        return {
            listen: mockHttpListen,
            close: mockHttpClose,
            on: vi.fn((event: string, cb: (error: Error) => void) => {
                if (event === "error") {
                    mockHttpErrorListener = cb;
                }

                return this;
            }),
        };
    }),
}));
vi.mock("express-static-gzip", () => ({
    default: vi.fn((path, options) => mockExpressStaticGzip(path, options)),
}));
vi.mock("finalhandler", () => ({
    default: vi.fn((req, res) => mockFinalhandler(req, res)),
}));
vi.mock("zigbee-herdsman/dist/adapter/adapterDiscovery", () => ({
    findAllDevices: vi.fn(() => mockFindAllDevices()),
}));
vi.mock("zigbee2mqtt-windfront", () => ({
    default: {
        getOnboardingPath: () => data.mockDir,
    },
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
        mockHttpErrorListener = undefined;
        mockStaticFileServer.mockClear();
        mockExpressStaticGzip.mockClear();
        mockFinalHandlerNext.mockClear();
        mockFinalhandler.mockClear();
        mockStaticFileServer.mockClear();
        settings.reRead();
    });

    afterEach(() => {});

    const runOnboarding = async (
        params: Record<string, unknown>,
        expectWriteMinimal: boolean,
        expectFailure: boolean,
    ): Promise<[getData: OnboardInitData, submitData: OnboardSubmitResponse]> => {
        // biome-ignore lint/suspicious/noExplicitAny: ignore
        const reqDataListener = vi.fn<(chunk: any) => void>();
        const reqEndListener = vi.fn<() => void>();
        let resolveResponse: () => void = () => {};
        const responsePromise = new Promise<void>((resolve) => {
            resolveResponse = resolve;
        });
        // biome-ignore lint/suspicious/noExplicitAny: ignore
        const resEnd = vi.fn<(chunk: any | (() => void), cb?: () => void) => ServerResponse<IncomingMessage>>(
            // @ts-expect-error return not used
            (chunk, cb) => {
                if (typeof chunk === "function") {
                    chunk();
                } else if (cb) {
                    cb();
                }

                resolveResponse();
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
                url: "/data",
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
        expect(resSetHeader).toHaveBeenNthCalledWith(1, "Content-Type", "application/json");
        expect(resWriteHead).toHaveBeenNthCalledWith(1, 200);
        expect(resEnd).toHaveBeenCalledTimes(1);

        mockHttpListener(
            {
                method: "POST",
                url: "/submit",
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

        reqDataListener(JSON.stringify(params));
        reqEndListener();
        await responsePromise;

        if (expectFailure) {
            expect(resSetHeader).toHaveBeenNthCalledWith(2, "Content-Type", "application/json");
            expect(resWriteHead).toHaveBeenNthCalledWith(2, 406);
            expect(resEnd).toHaveBeenCalledTimes(2);
        } else {
            expect(resSetHeader).toHaveBeenNthCalledWith(2, "Content-Type", "application/json");
            expect(resWriteHead).toHaveBeenNthCalledWith(2, 200);
            expect(resEnd).toHaveBeenCalledTimes(2);
        }

        const serverUrl = new URL(process.env.Z2M_ONBOARD_URL ?? "http://0.0.0.0:8080");
        expect(mockHttpListen).toHaveBeenCalledWith(Number.parseInt(serverUrl.port, 10), serverUrl.hostname, expect.any(Function));

        return [JSON.parse(resEnd.mock.calls[0][0]) as OnboardInitData, JSON.parse(resEnd.mock.calls[1][0]) as OnboardSubmitResponse];
    };

    const runFailure = async (): Promise<OnboardFailureData> => {
        let resolveResponse: () => void = () => {};
        const responsePromise = new Promise<void>((resolve) => {
            resolveResponse = resolve;
        });
        // biome-ignore lint/suspicious/noExplicitAny: ignore
        const resEnd = vi.fn<(chunk: any | (() => void), cb?: () => void) => ServerResponse<IncomingMessage>>(
            // @ts-expect-error return not used
            (chunk, cb) => {
                if (typeof chunk === "function") {
                    chunk();
                } else if (cb) {
                    cb();
                }

                resolveResponse();
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
                url: "/data",
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

        expect(resSetHeader).toHaveBeenNthCalledWith(1, "Content-Type", "application/json");
        expect(resWriteHead).toHaveBeenNthCalledWith(1, 200);
        expect(resEnd).toHaveBeenCalledTimes(1);

        mockHttpListener(
            {
                method: "POST",
                url: "/submit",
                // @ts-expect-error return not used
                on: () => {},
            },
            {
                end: resEnd,
                setHeader: resSetHeader,
                writeHead: resWriteHead,
            },
        );
        await responsePromise;

        expect(resEnd).toHaveBeenCalledTimes(2);

        const serverUrl = new URL(process.env.Z2M_ONBOARD_URL ?? "http://0.0.0.0:8080");
        expect(mockHttpListen).toHaveBeenCalledWith(Number.parseInt(serverUrl.port, 10), serverUrl.hostname, expect.any(Function));

        return JSON.parse(resEnd.mock.calls[0][0]) as OnboardFailureData;
    };

    const submitPayload = async (
        payload: Record<string, unknown>,
        fail: boolean,
        reqError: boolean,
        submitEmpty = false,
    ): Promise<OnboardSubmitResponse> => {
        // biome-ignore lint/suspicious/noExplicitAny: ignore
        const reqDataListener = vi.fn<(chunk: any) => void>();
        const reqEndListener = vi.fn<() => void>();
        const reqErrorListener = vi.fn<(error: Error) => void>();
        let resolveResponse: () => void = () => {};
        const responsePromise = new Promise<void>((resolve) => {
            resolveResponse = resolve;
        });
        // biome-ignore lint/suspicious/noExplicitAny: ignore
        const resEnd = vi.fn<(chunk: any | (() => void), cb?: () => void) => ServerResponse<IncomingMessage>>(
            // @ts-expect-error return not used
            (chunk, cb) => {
                if (typeof chunk === "function") {
                    chunk();
                } else if (cb) {
                    cb();
                }

                resolveResponse();
            },
        );
        const resSetHeader = vi.fn<(name: string, value: number | string | readonly string[]) => ServerResponse<IncomingMessage>>();
        const resWriteHead =
            vi.fn<
                (statusCode: number, statusMessage?: string, headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]) => ServerResponse<IncomingMessage>
            >();

        mockHttpListener(
            {
                method: "POST",
                url: "/submit",
                // @ts-expect-error return not used
                on: (event, listener) => {
                    if (event === "data") {
                        reqDataListener.mockImplementation(listener);
                    } else if (event === "end") {
                        // @ts-expect-error typing not narrowed
                        reqEndListener.mockImplementation(listener);
                    } else if (event === "error") {
                        reqErrorListener.mockImplementation(listener);
                    }
                },
            },
            {
                end: resEnd,
                setHeader: resSetHeader,
                writeHead: resWriteHead,
            },
        );

        if (reqError) {
            reqErrorListener(new Error("request error submit"));
        } else {
            reqDataListener(submitEmpty ? "" : JSON.stringify(payload));
            reqEndListener();
        }

        await responsePromise;

        expect(resSetHeader).toHaveBeenNthCalledWith(1, "Content-Type", "application/json");
        expect(resWriteHead).toHaveBeenNthCalledWith(1, fail || reqError ? 406 : 200);

        return JSON.parse(resEnd.mock.calls[0][0]) as OnboardSubmitResponse;
    };

    const submitZipPayload = async (payload: string, fail: boolean, reqError: boolean): Promise<OnboardSubmitResponse> => {
        // biome-ignore lint/suspicious/noExplicitAny: ignore
        const reqDataListener = vi.fn<(chunk: any) => void>();
        const reqEndListener = vi.fn<() => void>();
        const reqErrorListener = vi.fn<(error: Error) => void>();
        let resolveResponse: () => void = () => {};
        const responsePromise = new Promise<void>((resolve) => {
            resolveResponse = resolve;
        });
        // biome-ignore lint/suspicious/noExplicitAny: ignore
        const resEnd = vi.fn<(chunk: any | (() => void), cb?: () => void) => ServerResponse<IncomingMessage>>(
            // @ts-expect-error return not used
            (chunk, cb) => {
                if (typeof chunk === "function") {
                    chunk();
                } else if (cb) {
                    cb();
                }

                resolveResponse();
            },
        );
        const resSetHeader = vi.fn<(name: string, value: number | string | readonly string[]) => ServerResponse<IncomingMessage>>();
        const resWriteHead =
            vi.fn<
                (statusCode: number, statusMessage?: string, headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]) => ServerResponse<IncomingMessage>
            >();

        mockHttpListener(
            {
                method: "POST",
                url: "/submit-zip",
                // @ts-expect-error return not used
                on: (event, listener) => {
                    if (event === "data") {
                        reqDataListener.mockImplementation(listener);
                    } else if (event === "end") {
                        // @ts-expect-error typing not narrowed
                        reqEndListener.mockImplementation(listener);
                    } else if (event === "error") {
                        reqErrorListener.mockImplementation(listener);
                    }
                },
            },
            {
                end: resEnd,
                setHeader: resSetHeader,
                writeHead: resWriteHead,
            },
        );

        if (reqError) {
            reqErrorListener(new Error("request error submit-zip"));
        } else {
            reqDataListener(payload);
            reqEndListener();
        }

        await responsePromise;

        expect(resSetHeader).toHaveBeenNthCalledWith(1, "Content-Type", "application/json");
        expect(resWriteHead).toHaveBeenNthCalledWith(1, fail || reqError ? 406 : 200);

        return JSON.parse(resEnd.mock.calls[0][0]) as OnboardSubmitResponse;
    };

    const requestUnhandledRoute = async (url: string): Promise<void> => {
        let resolveResponse: () => void = () => {};
        const responsePromise = new Promise<void>((resolve) => {
            resolveResponse = resolve;
        });
        const resEnd = vi.fn((chunk?: unknown, cb?: () => void) => {
            if (typeof chunk === "function") {
                chunk();
            } else if (cb) {
                cb();
            }

            resolveResponse();
        });

        mockHttpListener(
            {
                method: "GET",
                url,
                // @ts-expect-error return not used
                on: () => {},
            },
            {
                end: resEnd,
                setHeader: vi.fn(),
                writeHead: vi.fn(),
            },
        );

        await responsePromise;
    };

    const createZipRestore = (): Awaited<ReturnType<typeof JSZip.loadAsync>> => {
        return {
            files: {
                "configuration.yaml": {
                    name: "configuration.yaml",
                    dir: false,
                    // @ts-expect-error minimal mock
                    async: async () => await Promise.resolve(Buffer.from(JSON.stringify(SAMPLE_SETTINGS_SAVE))),
                },
                // @ts-expect-error minimal mock
                "nested/": {
                    name: "nested/",
                    dir: true,
                },
                "nested/notes.txt": {
                    name: "nested/notes.txt",
                    dir: false,
                    // @ts-expect-error minimal mock
                    async: async () => await Promise.resolve(Buffer.from("zip-restore")),
                },
            },
        };
    };

    it("extracts uploaded ZIP files into the data path", async () => {
        data.removeConfiguration();
        const loadAsyncSpy = vi.spyOn(JSZip, "loadAsync").mockResolvedValue(createZipRestore());

        try {
            let p;
            const submitData = await new Promise<OnboardSubmitResponse>((resolve, reject) => {
                mockHttpOnListen.mockImplementationOnce(async () => {
                    try {
                        resolve(await submitZipPayload(Buffer.from("zip").toString("base64"), false, false));
                    } catch (error) {
                        reject(error);
                    }
                });

                p = onboard();
            });

            await expect(p).resolves.toStrictEqual(true);
            expect(data.read()).toStrictEqual(SAMPLE_SETTINGS_SAVE);
            expect(readFileSync(join(data.mockDir, "nested", "notes.txt"), "utf8")).toStrictEqual("zip-restore");
            expect(loadAsyncSpy).toHaveBeenCalledTimes(1);
            expect(submitData).toStrictEqual({success: true, frontendUrl: null});
        } finally {
            loadAsyncSpy.mockRestore();
        }
    });

    it("rejects non-zip upload payloads", async () => {
        data.removeConfiguration();
        const loadAsyncSpy = vi
            .spyOn(JSZip, "loadAsync")
            .mockRejectedValueOnce(new Error("Can't find end of central directory : is this a zip file ?"))
            .mockResolvedValueOnce(createZipRestore());

        try {
            let p;
            const [firstSubmitData, secondSubmitData] = await new Promise<[OnboardSubmitResponse, OnboardSubmitResponse]>((resolve, reject) => {
                mockHttpOnListen.mockImplementationOnce(async () => {
                    try {
                        const failedSubmit = await submitZipPayload(Buffer.from("ignored").toString("base64"), true, false);
                        const successfulSubmit = await submitZipPayload(Buffer.from("zip").toString("base64"), false, false);

                        resolve([failedSubmit, successfulSubmit]);
                    } catch (error) {
                        reject(error);
                    }
                });

                p = onboard();
            });

            await expect(p).resolves.toStrictEqual(true);
            expect(loadAsyncSpy).toHaveBeenCalledTimes(2);
            expect(data.read()).toStrictEqual(SAMPLE_SETTINGS_SAVE);
            expect(readFileSync(join(data.mockDir, "nested", "notes.txt"), "utf8")).toStrictEqual("zip-restore");
            expect(firstSubmitData).toStrictEqual({success: false, error: expect.stringContaining("is this a zip file")});
            expect(secondSubmitData).toStrictEqual({success: true, frontendUrl: null});
        } finally {
            loadAsyncSpy.mockRestore();
        }
    });

    it("rejects ZIP upload payloads with invalid entry paths", async () => {
        data.removeConfiguration();
        const loadAsyncSpy = vi
            .spyOn(JSZip, "loadAsync")
            .mockResolvedValueOnce({
                files: {
                    "/dragons.txt": {
                        name: "/dragons.txt",
                        dir: false,
                        // @ts-expect-error minimal mock
                        async: async () => await Promise.resolve(Buffer.from("dragons")),
                    },
                },
            })
            .mockResolvedValueOnce(createZipRestore());

        try {
            let p;
            const [firstSubmitData, secondSubmitData] = await new Promise<[OnboardSubmitResponse, OnboardSubmitResponse]>((resolve, reject) => {
                mockHttpOnListen.mockImplementationOnce(async () => {
                    try {
                        const failedSubmit = await submitZipPayload(Buffer.from("zip-invalid-path").toString("base64"), true, false);
                        const successfulSubmit = await submitZipPayload(Buffer.from("zip").toString("base64"), false, false);

                        resolve([failedSubmit, successfulSubmit]);
                    } catch (error) {
                        reject(error);
                    }
                });

                p = onboard();
            });

            await expect(p).resolves.toStrictEqual(true);
            expect(firstSubmitData).toStrictEqual({success: false, error: expect.stringContaining("Invalid ZIP entry path")});
            expect(secondSubmitData).toStrictEqual({success: true, frontendUrl: null});
            expect(loadAsyncSpy).toHaveBeenCalledTimes(2);
        } finally {
            loadAsyncSpy.mockRestore();
        }
    });

    it("rejects ZIP upload payloads with unsafe relative entry paths", async () => {
        data.removeConfiguration();
        const loadAsyncSpy = vi
            .spyOn(JSZip, "loadAsync")
            .mockResolvedValueOnce({
                files: {
                    "../dragons.txt": {
                        name: "../dragons.txt",
                        dir: false,
                        // @ts-expect-error minimal mock
                        async: async () => await Promise.resolve(Buffer.from("dragons")),
                    },
                },
            })
            .mockResolvedValueOnce(createZipRestore());

        try {
            let p;
            const [firstSubmitData, secondSubmitData] = await new Promise<[OnboardSubmitResponse, OnboardSubmitResponse]>((resolve, reject) => {
                mockHttpOnListen.mockImplementationOnce(async () => {
                    try {
                        const failedSubmit = await submitZipPayload(Buffer.from("zip-unsafe-path").toString("base64"), true, false);
                        const successfulSubmit = await submitZipPayload(Buffer.from("zip").toString("base64"), false, false);

                        resolve([failedSubmit, successfulSubmit]);
                    } catch (error) {
                        reject(error);
                    }
                });

                p = onboard();
            });

            await expect(p).resolves.toStrictEqual(true);
            expect(firstSubmitData).toStrictEqual({success: false, error: expect.stringContaining("Unsafe ZIP entry path")});
            expect(secondSubmitData).toStrictEqual({success: true, frontendUrl: null});
            expect(loadAsyncSpy).toHaveBeenCalledTimes(2);
        } finally {
            loadAsyncSpy.mockRestore();
        }
    });

    it("handles empty ZIP upload payloads", async () => {
        data.removeConfiguration();
        const loadAsyncSpy = vi.spyOn(JSZip, "loadAsync").mockResolvedValue(createZipRestore());

        try {
            let p;
            const [firstSubmitData, secondSubmitData] = await new Promise<[OnboardSubmitResponse, OnboardSubmitResponse]>((resolve, reject) => {
                mockHttpOnListen.mockImplementationOnce(async () => {
                    try {
                        const failedSubmit = await submitZipPayload("", true, false);
                        const successfulSubmit = await submitZipPayload(Buffer.from("zip").toString("base64"), false, false);

                        resolve([failedSubmit, successfulSubmit]);
                    } catch (error) {
                        reject(error);
                    }
                });

                p = onboard();
            });

            await expect(p).resolves.toStrictEqual(true);
            expect(firstSubmitData).toStrictEqual({success: false, error: "Invalid ZIP payload: missing content"});
            expect(secondSubmitData).toStrictEqual({success: true, frontendUrl: null});
            expect(loadAsyncSpy).toHaveBeenCalledTimes(1);
        } finally {
            loadAsyncSpy.mockRestore();
        }
    });

    it("handles request stream errors for submit endpoint", async () => {
        process.env.Z2M_ONBOARD_FORCE_RUN = "1";

        let p;
        const [firstSubmitData, secondSubmitData] = await new Promise<[OnboardSubmitResponse, OnboardSubmitResponse]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    const failedSubmit = await submitPayload(SAMPLE_SETTINGS_SAVE, false, true);
                    const successfulSubmit = await submitPayload(SAMPLE_SETTINGS_SAVE, false, false);

                    resolve([failedSubmit, successfulSubmit]);
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(firstSubmitData).toStrictEqual({success: false, error: "request error submit"});
        expect(secondSubmitData).toStrictEqual({success: true, frontendUrl: "http://localhost:8080/"});
    });

    it("handles request stream errors for submit-zip endpoint", async () => {
        data.removeConfiguration();
        const loadAsyncSpy = vi.spyOn(JSZip, "loadAsync").mockResolvedValue(createZipRestore());

        try {
            let p;
            const [firstSubmitData, secondSubmitData] = await new Promise<[OnboardSubmitResponse, OnboardSubmitResponse]>((resolve, reject) => {
                mockHttpOnListen.mockImplementationOnce(async () => {
                    try {
                        const failedSubmit = await submitZipPayload("", true, true);
                        const successfulSubmit = await submitZipPayload(Buffer.from("zip").toString("base64"), false, false);

                        resolve([failedSubmit, successfulSubmit]);
                    } catch (error) {
                        reject(error);
                    }
                });

                p = onboard();
            });

            await expect(p).resolves.toStrictEqual(true);
            expect(firstSubmitData).toStrictEqual({success: false, error: "request error submit-zip"});
            expect(secondSubmitData).toStrictEqual({success: true, frontendUrl: null});
            expect(loadAsyncSpy).toHaveBeenCalledTimes(1);
        } finally {
            loadAsyncSpy.mockRestore();
        }
    });

    it("passes unknown onboarding routes to static file server", async () => {
        data.removeConfiguration();

        let p;
        await new Promise<void>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    await requestUnhandledRoute("/unknown");
                    await submitPayload(SAMPLE_SETTINGS_SAVE, false, false);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(mockFinalhandler).toHaveBeenCalled();
        expect(mockStaticFileServer).toHaveBeenCalled();
    });

    it("passes unknown failure-pages routes to static file server", async () => {
        settings.set(["serial"], "/dev/ttyUSB0");

        let p;
        await new Promise<OnboardFailureData>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    await requestUnhandledRoute("/unknown");
                    resolve(await runFailure());
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(false);
        expect(mockFinalhandler).toHaveBeenCalled();
        expect(mockStaticFileServer).toHaveBeenCalled();
    });

    it("returns false when onboarding server emits an error", async () => {
        data.removeConfiguration();

        mockHttpOnListen.mockImplementationOnce(() => {
            mockHttpErrorListener?.(new Error("listen failed"));

            return Promise.resolve();
        });

        const p = onboard();

        await expect(p).resolves.toStrictEqual(false);
    });

    it("handles empty config submit", async () => {
        process.env.Z2M_ONBOARD_FORCE_RUN = "1";

        let p;
        const [getData, firstSubmit, secondSubmit] = await new Promise<[OnboardInitData, OnboardSubmitResponse, OnboardSubmitResponse]>(
            (resolve, reject) => {
                mockHttpOnListen.mockImplementationOnce(async () => {
                    try {
                        const [dataPayload, failedSubmit] = await runOnboarding(
                            Object.assign({}, SAMPLE_SETTINGS_SAVE, {
                                serial: {
                                    adapter: "emberz",
                                },
                            }),
                            false,
                            true,
                        );
                        const successfulSubmit = await submitPayload({}, false, false, true);

                        resolve([dataPayload, failedSubmit, successfulSubmit]);
                    } catch (error) {
                        reject(error);
                    }
                });

                p = onboard();
            },
        );

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(Object.assign({}, SAMPLE_SETTINGS_INIT, {onboarding: true}));
        expect(getData.devices).toStrictEqual([]);
        expect(firstSubmit).toMatchObject({success: false, error: expect.stringContaining("adapter must be equal to one of the allowed values")});
        expect(secondSubmit).toStrictEqual({success: true, frontendUrl: null});
    });

    it("creates config file and sets given settings", async () => {
        data.removeConfiguration();

        let p;
        const [getData, submitData] = await new Promise<[OnboardInitData, OnboardSubmitResponse]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(SAMPLE_SETTINGS_SAVE, true, false));
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(SAMPLE_SETTINGS_SAVE);
        expect(getData.page).toStrictEqual("form");
        expect(getData.devices).toStrictEqual([]);
        expect(getData.settingsSchema).toBeDefined();
        expect(submitData).toStrictEqual({success: true, frontendUrl: "http://localhost:8080/"});
    });

    it("creates config file and sets given unusual settings", async () => {
        data.removeConfiguration();

        process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER = "mqtt://core-mosquitto:1883";

        mockFindAllDevices.mockResolvedValueOnce([
            {name: "My Device", path: "/dev/serial/by-id/my-device-001", adapter: "ember"},
            {name: "My Device 2", path: "/dev/serial/by-id/my-device-002", adapter: undefined},
        ]);

        let p;
        const [getData, submitData] = await new Promise<[OnboardInitData, OnboardSubmitResponse]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(
                        await runOnboarding(
                            Object.assign({}, SAMPLE_SETTINGS_SAVE, {
                                mqtt: {
                                    user: "abcd",
                                    password: "defg",
                                },
                                frontend: {
                                    enabled: false,
                                },
                                advanced: {
                                    network_key: "GENERATE",
                                    pan_id: "GENERATE",
                                    ext_pan_id: "GENERATE",
                                },
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
            Object.assign({}, SETTINGS_MINIMAL_DEFAULTS, {
                advanced: {
                    log_level: SETTINGS_MINIMAL_DEFAULTS.advanced.log_level,
                    channel: SETTINGS_MINIMAL_DEFAULTS.advanced.channel,
                    network_key: "GENERATE",
                    pan_id: "GENERATE",
                    ext_pan_id: "GENERATE",
                },
                serial: {
                    port: SAMPLE_SETTINGS_SAVE.serial.port,
                    adapter: SAMPLE_SETTINGS_SAVE.serial.adapter,
                    baudrate: SAMPLE_SETTINGS_SAVE.serial.baudrate,
                    rtscts: SAMPLE_SETTINGS_SAVE.serial.rtscts,
                },
                frontend: {
                    enabled: false,
                    port: SETTINGS_MINIMAL_DEFAULTS.frontend.port,
                },
                mqtt: {
                    base_topic: SETTINGS_MINIMAL_DEFAULTS.mqtt.base_topic,
                    server: process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER,
                    user: "abcd",
                    password: "defg",
                },
                homeassistant: {
                    enabled: true,
                },
            }),
        );
        expect(getData.devices).toStrictEqual([
            {name: "My Device", path: "/dev/serial/by-id/my-device-001", adapter: "ember"},
            {name: "My Device 2", path: "/dev/serial/by-id/my-device-002"},
        ]);
        expect(getData.settings.mqtt.server).toStrictEqual(process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER);
        expect(submitData).toStrictEqual({success: true, frontendUrl: null});
    });

    it("reruns onboard via ENV and sets given settings", async () => {
        // data.removeConfiguration();

        process.env.Z2M_ONBOARD_FORCE_RUN = "1";

        let p;
        const [getData, submitData] = await new Promise<[OnboardInitData, OnboardSubmitResponse]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(SAMPLE_SETTINGS_SAVE, false, false));
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(SAMPLE_SETTINGS_SAVE);
        expect(getData.devices).toStrictEqual([]);
        expect(getData.settings.serial.port).toStrictEqual(SAMPLE_SETTINGS_INIT.serial.port);
        expect(submitData).toStrictEqual({success: true, frontendUrl: "http://localhost:8080/"});
    });

    it("reruns onboard on failed start", async () => {
        // data.removeConfiguration();
        settings.setOnboarding(true);

        let p;
        const [getData, submitData] = await new Promise<[OnboardInitData, OnboardSubmitResponse]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(SAMPLE_SETTINGS_SAVE, false, false));
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(SAMPLE_SETTINGS_SAVE);
        expect(getData.devices).toStrictEqual([]);
        expect(getData.settings.serial.port).toStrictEqual(SAMPLE_SETTINGS_INIT.serial.port);
        expect(submitData).toStrictEqual({success: true, frontendUrl: "http://localhost:8080/"});
    });

    it("sets given settings - no frontend redirect", async () => {
        data.removeConfiguration();

        vi.spyOn(settings, "writeMinimalDefaults").mockImplementationOnce(() => {
            settings.writeMinimalDefaults();
            settings.set(["frontend", "host"], "/run/zigbee2mqtt/zigbee2mqtt.sock");
        });

        let p;
        const [getData, submitData] = await new Promise<[OnboardInitData, OnboardSubmitResponse]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(SAMPLE_SETTINGS_SAVE, false, false));
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
        expect(getData.devices).toStrictEqual([]);
        expect(submitData).toStrictEqual({success: true, frontendUrl: null});
    });

    it("sets given settings - no frontend redirect via ENV", async () => {
        data.removeConfiguration();

        process.env.Z2M_ONBOARD_NO_REDIRECT = "1";

        let p;
        const [getData, submitData] = await new Promise<[OnboardInitData, OnboardSubmitResponse]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(SAMPLE_SETTINGS_SAVE, false, false));
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(SAMPLE_SETTINGS_SAVE);
        expect(getData.devices).toStrictEqual([]);
        expect(submitData).toStrictEqual({success: true, frontendUrl: null});
    });

    it("sets given settings - frontend SSL redirect", async () => {
        data.removeConfiguration();

        vi.spyOn(settings, "writeMinimalDefaults").mockImplementationOnce(() => {
            settings.writeMinimalDefaults();
            settings.set(["frontend", "ssl_cert"], "dummy");
            settings.set(["frontend", "ssl_key"], "dummy2");
        });

        let p;
        const [getData, submitData] = await new Promise<[OnboardInitData, OnboardSubmitResponse]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(SAMPLE_SETTINGS_SAVE, false, false));
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
        expect(getData.devices).toStrictEqual([]);
        expect(submitData).toStrictEqual({success: true, frontendUrl: "https://localhost:8080/"});
    });

    it("handles saving errors", async () => {
        process.env.Z2M_ONBOARD_FORCE_RUN = "1";

        let p;
        const [getData, firstSubmit, secondSubmit] = await new Promise<[OnboardInitData, OnboardSubmitResponse, OnboardSubmitResponse]>(
            (resolve, reject) => {
                mockHttpOnListen.mockImplementationOnce(async () => {
                    try {
                        const [dataPayload, failedSubmit] = await runOnboarding(
                            Object.assign({}, SAMPLE_SETTINGS_SAVE, {
                                serial: {
                                    adapter: "emberz",
                                },
                            }),
                            false,
                            true,
                        );
                        const successfulSubmit = await submitPayload(SAMPLE_SETTINGS_SAVE, false, false);

                        resolve([dataPayload, failedSubmit, successfulSubmit]);
                    } catch (error) {
                        reject(error);
                    }
                });

                p = onboard();
            },
        );

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(SAMPLE_SETTINGS_SAVE);
        expect(getData.devices).toStrictEqual([]);
        expect(firstSubmit).toMatchObject({success: false, error: expect.stringContaining("adapter must be equal to one of the allowed values")});
        expect(secondSubmit).toStrictEqual({success: true, frontendUrl: "http://localhost:8080/"});
    });

    it("handles configuring onboarding via ENV", async () => {
        data.removeConfiguration();

        process.env.Z2M_ONBOARD_URL = "http://192.168.1.123:8888";
        process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER = "mqtt://core-mosquitto:1883";

        let p;

        await new Promise<[OnboardInitData, OnboardSubmitResponse]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(SAMPLE_SETTINGS_SAVE, true, false));
                } catch (error) {
                    reject(error);
                }
            });

            p = onboard();
        });

        await expect(p).resolves.toStrictEqual(true);
        expect(data.read()).toStrictEqual(
            Object.assign({}, SAMPLE_SETTINGS_SAVE, {
                mqtt: {server: process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER, base_topic: SAMPLE_SETTINGS_SAVE.mqtt.base_topic},
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

        await new Promise<[OnboardInitData, OnboardSubmitResponse]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                const newSettings = {
                    ...SAMPLE_SETTINGS_SAVE,
                    serial: {
                        port: SAMPLE_SETTINGS_SAVE.serial.port,
                        adapter: SAMPLE_SETTINGS_SAVE.serial.adapter,
                        rtscts: SAMPLE_SETTINGS_SAVE.serial.rtscts,
                    },
                    advanced: {
                        log_level: SAMPLE_SETTINGS_SAVE.advanced.log_level,
                    },
                    frontend: {
                        enabled: SAMPLE_SETTINGS_SAVE.frontend.enabled,
                    },
                };

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
        const getData = await new Promise<OnboardFailureData>((resolve, reject) => {
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
        expect(
            getData.errors.some((error) => error.includes("serial") && error.includes("adapter") && error.includes("allowed values")),
        ).toStrictEqual(true);

        reReadSpy.mockRestore();
    });

    it("handles non-required validation failure before applying envs", async () => {
        settings.set(["serial"], "/dev/ttyUSB0");

        let p;
        const getData = await new Promise<OnboardFailureData>((resolve, reject) => {
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
        expect(getData.errors).toContain("serial must be object");
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
        const getData = await new Promise<OnboardFailureData>((resolve, reject) => {
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
        expect(getData.errors.some((error) => error.includes("Your configuration file") && error.includes("is invalid"))).toStrictEqual(true);

        data.removeConfiguration();
    });

    it("handles error while loading yaml file", async () => {
        settings.testing.clear();

        const configFile = join(data.mockDir, "configuration.yaml");

        writeFileSync(configFile, "badfile");

        let p;
        const getData = await new Promise<OnboardFailureData>((resolve, reject) => {
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
        expect(getData.errors.some((error) => error.includes("AssertionError") && error.includes("expected to be an object"))).toStrictEqual(true);

        data.removeConfiguration();
    });

    it("handles creating data path", async () => {
        rmSync(data.mockDir, {force: true, recursive: true});
        settings.testing.clear();

        let p;
        await new Promise<[OnboardInitData, OnboardSubmitResponse]>((resolve, reject) => {
            mockHttpOnListen.mockImplementationOnce(async () => {
                try {
                    resolve(await runOnboarding(SAMPLE_SETTINGS_SAVE, true, false));
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
