import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import type {ServerResponse} from "node:http";
import {createServer} from "node:http";
import path from "node:path";
import expressStaticGzip from "express-static-gzip";
import finalhandler from "finalhandler";
import stringify from "json-stable-stringify-without-jsonify";
import JSZip from "jszip";
import {findAllDevices} from "zigbee-herdsman/dist/adapter/adapterDiscovery";
import type {OnboardData, OnboardFailureData, OnboardSubmitResponse, Zigbee2MQTTSettings} from "../types/api";
import data from "./data";
import * as settings from "./settings";
import {YAMLFileException} from "./yaml";

/** same as extension/frontend */
const FILE_SERVER_OPTIONS: expressStaticGzip.ExpressStaticGzipOptions = {
    enableBrotli: true,
    serveStatic: {
        /* v8 ignore start */
        setHeaders: (res: ServerResponse, path: string): void => {
            if (path.endsWith("index.html")) {
                res.setHeader("Cache-Control", "no-store");
            }
        },
        /* v8 ignore stop */
    },
};

function getServerUrl(): URL {
    return new URL(process.env.Z2M_ONBOARD_URL ?? "http://0.0.0.0:8080");
}

function getZipEntryTargetPath(entryName: string): string {
    const normalizedEntry = entryName.replace(/\\/g, "/");

    if (!normalizedEntry || normalizedEntry.startsWith("/") || normalizedEntry.includes("\0")) {
        throw new Error(`Invalid ZIP entry path '${entryName}'`);
    }

    const basePath = path.resolve(data.getPath());
    const targetPath = path.resolve(basePath, normalizedEntry);
    const relativePath = path.relative(basePath, targetPath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        throw new Error(`Unsafe ZIP entry path '${entryName}'`);
    }

    return targetPath;
}

async function extractZipDataToDataPath(zipContent: Buffer): Promise<void> {
    const zip = await JSZip.loadAsync(zipContent);

    for (const key in zip.files) {
        const entry = zip.files[key];
        const targetPath = getZipEntryTargetPath(entry.name);

        if (entry.dir) {
            mkdirSync(targetPath, {recursive: true});

            continue;
        }

        mkdirSync(path.dirname(targetPath), {recursive: true});
        writeFileSync(targetPath, await entry.async("nodebuffer"));
    }
}

async function startOnboardingServer(): Promise<boolean> {
    const currentSettings = settings.get();
    const serverUrl = getServerUrl();
    let server: ReturnType<typeof createServer> | undefined;
    const fileServer = expressStaticGzip(
        // TODO: tempfix: windfront<>z2m typing dep
        ((await import("zigbee2mqtt-windfront")).default as unknown as {getOnboardingPath: () => string}).getOnboardingPath(),
        FILE_SERVER_OPTIONS,
    );

    const success = await new Promise<boolean>((resolve) => {
        server = createServer(async (req, res) => {
            const pathname = new URL(req.url /* v8 ignore next */ ?? "/", serverUrl).pathname;

            if (req.method === "GET" && pathname === "/data") {
                const payload: OnboardData = {
                    page: "form",
                    settings: currentSettings,
                    settingsSchema: settings.schemaJson,
                    devices: await findAllDevices(),
                };

                res.setHeader("Content-Type", "application/json");
                res.writeHead(200);
                res.end(stringify(payload));

                return;
            }

            if (req.method === "POST") {
                if (pathname === "/submit") {
                    let body = "";

                    req.on("data", (chunk) => {
                        body += chunk;
                    });

                    req.on("end", () => {
                        try {
                            const result = (body ? JSON.parse(body) : {}) as RecursivePartial<Zigbee2MQTTSettings>;

                            settings.apply(result);

                            const appliedSettings = settings.get();
                            const redirect =
                                !process.env.Z2M_ONBOARD_NO_REDIRECT &&
                                appliedSettings.frontend.enabled &&
                                (!appliedSettings.frontend.host || !appliedSettings.frontend.host.startsWith("/"));
                            const protocol = appliedSettings.frontend.ssl_cert && appliedSettings.frontend.ssl_key ? "https" : "http";
                            const frontendUrl = redirect
                                ? `${protocol}://${appliedSettings.frontend.host ?? "localhost"}:${appliedSettings.frontend.port}${appliedSettings.frontend.base_url}`
                                : null;
                            const payload: OnboardSubmitResponse = {success: true, frontendUrl};

                            res.setHeader("Content-Type", "application/json");
                            res.writeHead(200);
                            res.end(stringify(payload), () => {
                                resolve(true);
                            });
                        } catch (error) {
                            console.error(`Failed to apply configuration: ${(error as Error).message}`);

                            const payload: OnboardSubmitResponse = {success: false, error: (error as Error).message};

                            res.setHeader("Content-Type", "application/json");
                            res.writeHead(406);
                            res.end(stringify(payload));
                        }
                    });

                    req.on("error", (error: Error) => {
                        console.error(`Failed to parse request body: ${error.message}`);

                        const payload: OnboardSubmitResponse = {success: false, error: error.message};

                        res.setHeader("Content-Type", "application/json");
                        res.writeHead(406);
                        res.end(stringify(payload));
                    });

                    return;
                }

                if (pathname === "/submit-zip") {
                    let body = "";

                    req.on("data", (chunk) => {
                        body += chunk;
                    });

                    req.on("end", async () => {
                        try {
                            if (!body) {
                                throw new Error("Invalid ZIP payload: missing content");
                            }

                            const zipContent = Buffer.from(body, "base64");

                            await extractZipDataToDataPath(zipContent);

                            const payload: OnboardSubmitResponse = {success: true, frontendUrl: null};

                            res.setHeader("Content-Type", "application/json");
                            res.writeHead(200);
                            res.end(stringify(payload), () => {
                                resolve(true);
                            });
                        } catch (error) {
                            console.error(`Failed to apply ZIP data: ${(error as Error).message}`);

                            const payload: OnboardSubmitResponse = {success: false, error: (error as Error).message};

                            res.setHeader("Content-Type", "application/json");
                            res.writeHead(406);
                            res.end(stringify(payload));
                        }
                    });

                    req.on("error", (error: Error) => {
                        console.error(`Failed to parse ZIP request body: ${error.message}`);

                        const payload: OnboardSubmitResponse = {success: false, error: error.message};

                        res.setHeader("Content-Type", "application/json");
                        res.writeHead(406);
                        res.end(stringify(payload));
                    });

                    return;
                }
            }

            const next = finalhandler(req, res);

            fileServer(req, res, next);
        });

        server.on("error", (error: Error) => {
            console.error("Failed to start onboarding server", error);
            resolve(false);
        });

        server.listen(Number.parseInt(serverUrl.port, 10), serverUrl.hostname, () => {
            console.log(`Onboarding page is available at ${serverUrl.href}`);
        });
    });

    await new Promise((resolve) => server?.close(resolve));

    return success;
}

async function startFailureServer(errors: string[]): Promise<void> {
    const serverUrl = getServerUrl();
    let server: ReturnType<typeof createServer> | undefined;
    const fileServer = expressStaticGzip(
        // TODO: tempfix: windfront<>z2m typing dep
        ((await import("zigbee2mqtt-windfront")).default as unknown as {getOnboardingPath: () => string}).getOnboardingPath(),
        FILE_SERVER_OPTIONS,
    );

    await new Promise<void>((resolve) => {
        server = createServer((req, res) => {
            const pathname = new URL(req.url /* v8 ignore next */ ?? "/", serverUrl).pathname;

            if (req.method === "GET" && pathname === "/data") {
                const payload: OnboardFailureData = {page: "failure", errors};

                res.setHeader("Content-Type", "application/json");
                res.writeHead(200);
                res.end(stringify(payload));

                return;
            }

            if (req.method === "POST" && pathname === "/submit") {
                res.writeHead(200);
                res.end(() => {
                    resolve();
                });

                return;
            }

            const next = finalhandler(req, res);

            fileServer(req, res, next);
        });

        server.listen(Number.parseInt(serverUrl.port, 10), serverUrl.hostname, () => {
            console.error(`Failure page is available at ${serverUrl.href}`);
        });
    });

    await new Promise((resolve) => server?.close(resolve));
}

async function onSettingsErrors(errors: string[]): Promise<void> {
    console.error("\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("            READ THIS CAREFULLY\n");
    console.error("Refusing to start because configuration is not valid, found the following errors:");

    for (const error of errors) {
        console.error(`- ${error}`);
    }

    console.error("\nIf you don't know how to solve this, read https://www.zigbee2mqtt.io/guide/configuration");
    console.error("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n\n");

    if (!process.env.Z2M_ONBOARD_NO_SERVER && !process.env.Z2M_ONBOARD_NO_FAILURE_PAGE) {
        await startFailureServer(errors);
    }
}

export async function onboard(): Promise<boolean> {
    if (!existsSync(data.getPath())) {
        mkdirSync(data.getPath(), {recursive: true});
    }

    const confExists = existsSync(data.joinPath("configuration.yaml"));

    if (confExists) {
        // initial caching, ensure file is valid yaml first
        try {
            settings.getPersistedSettings();
        } catch (error) {
            await onSettingsErrors(
                error instanceof YAMLFileException
                    ? [`Your configuration file: '${error.file}' is invalid (use https://jsonformatter.org/yaml-validator to find and fix the issue)`]
                    : [`${error}`],
            );

            return false;
        }

        // migrate first
        const {migrateIfNecessary} = await import("./settingsMigration.js");

        migrateIfNecessary();

        // make sure existing settings are valid before applying envs
        const errors = settings.validateNonRequired();

        if (errors.length > 0) {
            await onSettingsErrors(errors);

            return false;
        }

        // trigger initial writing of `ZIGBEE2MQTT_CONFIG_*` ENVs
        settings.write();
    } else {
        settings.writeMinimalDefaults();
    }

    // use `configuration.yaml` file to detect "brand new install"
    // env allows to re-run onboard even with existing install
    if (!process.env.Z2M_ONBOARD_NO_SERVER && (process.env.Z2M_ONBOARD_FORCE_RUN || !confExists || settings.get().onboarding)) {
        settings.setOnboarding(true);

        const success = await startOnboardingServer();

        if (!success) {
            return false;
        }
    }

    settings.reRead();

    const errors = settings.validate();

    if (errors.length > 0) {
        await onSettingsErrors(errors);

        return false;
    }

    return true;
}
