import {existsSync, mkdirSync} from "node:fs";
import {createServer} from "node:http";
import {parse} from "node:querystring";
import {findAllDevices} from "zigbee-herdsman/dist/adapter/adapterDiscovery";
import data from "./data";
import * as settings from "./settings";
import {YAMLFileException} from "./yaml";

type OnboardSettings = {
    mqtt_base_topic?: string;
    mqtt_server?: string;
    mqtt_user?: string;
    mqtt_password?: string;
    serial_port?: string;
    serial_adapter?: Settings["serial"]["adapter"];
    serial_baudrate?: string;
    serial_rtscts?: "on";
    network_channel?: string;
    network_key?: string;
    network_pan_id?: string;
    network_ext_pan_id?: string;
    frontend_enabled?: "on";
    frontend_port?: string;
    homeassistant_enabled?: "on";
    log_level?: Settings["advanced"]["log_level"];
};

function escapeHtml(s: string): string {
    return s.replace(/[^0-9A-Za-z \-_.]/g, (c) => `&#${c.charCodeAt(0)};`);
}

function generateHtmlDone(frontendUrl: string | undefined): string {
    return `
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Zigbee2MQTT Onboarding</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.classless.min.css">
</head>
<body>
    <main>
        <h1>Zigbee2MQTT Onboarding</h1>
        <p>Settings saved.</p>
        <p>Zigbee2MQTT is now starting...</p>
        <small>${frontendUrl ? `Redirecting to Zigbee2MQTT frontend at <a href="${frontendUrl}">${frontendUrl}</a> in 30 seconds.` : "You can close this page."}</small>
    </main>
    ${frontendUrl ? `<script>setTimeout(() => { window.location.replace("${frontendUrl}"); }, 30000);</script>` : ""}
</body>
</html>
`;
}

function generateHtmlForm(currentSettings: RecursivePartial<Settings>, devices: Awaited<ReturnType<typeof findAllDevices>>): string {
    let devicesSelect = "";

    if (devices.length > 0) {
        devicesSelect += '<select id="found_device" onchange="setFoundDevice(this)">';
        devicesSelect += '<option value="">Select a device</option>';

        for (const device of devices) {
            // just in case name has commas, remove them to not mess with `split` logic
            const deviceStr = `${device.name.replaceAll(",", "")}, ${device.path}, ${device.adapter ?? "unknown"}`;

            devicesSelect += `<option value="${deviceStr}">${deviceStr}</option>`;
        }

        devicesSelect += "</select>";
        devicesSelect += "<small>Optionally allows to configure coordinator port and type (if known) automatically.</small>";
    } else {
        devicesSelect = "<small>No device found</small>";
    }

    let generateCheckbox = "";

    if (
        Array.isArray(currentSettings.advanced?.network_key) ||
        typeof currentSettings.advanced?.pan_id === "number" ||
        Array.isArray(currentSettings.advanced?.ext_pan_id)
    ) {
        generateCheckbox = `
<label for="generate_network">
    <input
        type="checkbox"
        id="generate_network"
        onclick="setGenerate(this)"
        ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_NETWORK_KEY || process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_PAN_ID || process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_EXT_PAN_ID ? "disabled" : ""}>
    Generate network?
</label>
`;
    }

    /* v8 ignore start */
    return `
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Zigbee2MQTT Onboarding</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.classless.min.css">
</head>
<body>
    <main>
        <h1>Zigbee2MQTT Onboarding</h1>
        <p>Set the base configuration to start Zigbee2MQTT.</p>
        <p>Optional fields will either be ignored or fallback to defaults if not set (see appropriate documentation page for more details).</p>
        <p>If a field is disabled, it means <a href="https://www.zigbee2mqtt.io/guide/configuration/#environment-variables" target="_blank">environment variables</a> are being used to override specific values (for example, through the Home Assistant add-on configuration page).</p>
        <hr>
        <form method="post">
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_SERIAL || process.env.ZIGBEE2MQTT_CONFIG_SERIAL_PORT || process.env.ZIGBEE2MQTT_CONFIG_SERIAL_ADAPTER ? "disabled" : ""}>
                <label for="found_device">Found Devices</label>
                ${devicesSelect}
            </fieldset>
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_SERIAL ? "disabled" : ""}>
                <label for="serial_port">Coordinator/Adapter Port/Path</label>
                <input
                    type="text"
                    id="serial_port"
                    name="serial_port"
                    value="${currentSettings.serial?.port ?? ""}"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_SERIAL_PORT ? "disabled" : ""}>
                <label for="serial_adapter">Coordinator/Adapter Type/Stack/Driver</label>
                <select id="serial_adapter" name="serial_adapter" required ${process.env.ZIGBEE2MQTT_CONFIG_SERIAL_ADAPTER ? "disabled" : ""}>
                    <option value="zstack" ${currentSettings.serial?.adapter === "zstack" ? "selected" : ""}>zstack</option>
                    <option value="ember" ${currentSettings.serial?.adapter === "ember" ? "selected" : ""}>ember</option>
                    <option value="deconz" ${currentSettings.serial?.adapter === "deconz" ? "selected" : ""}>deconz</option>
                    <option value="zigate" ${currentSettings.serial?.adapter === "zigate" ? "selected" : ""}>zigate</option>
                    <option value="zboss" ${currentSettings.serial?.adapter === "zboss" ? "selected" : ""}>zboss</option>
                </select>
                <label for="serial_baudrate">Coordinator/Adapter Baudrate</label>
                <select id="serial_baudrate" name="serial_baudrate" ${process.env.ZIGBEE2MQTT_CONFIG_SERIAL_BAUDRATE ? "disabled" : ""}>
                    <option value="38400" ${currentSettings.serial?.baudrate === 38400 ? "selected" : ""}>38400</option>
                    <option value="57600" ${currentSettings.serial?.baudrate === 57600 ? "selected" : ""}>57600</option>
                    <option value="115200" ${!currentSettings.serial?.baudrate || currentSettings.serial?.baudrate === 115200 ? "selected" : ""}>115200</option>
                    <option value="230400" ${currentSettings.serial?.baudrate === 230400 ? "selected" : ""}>230400</option>
                    <option value="460800" ${currentSettings.serial?.baudrate === 460800 ? "selected" : ""}>460800</option>
                    <option value="921600" ${currentSettings.serial?.baudrate === 921600 ? "selected" : ""}>921600</option>
                </select>
                <small>Can be ignored for networked coordinators (TCP).</small>
                <label for="serial_rtscts">Coordinator/Adapter Hardware Flow Control ("rtscts: true")</label>
                <input
                    type="checkbox"
                    id="serial_rtscts"
                    name="serial_rtscts"
                    ${currentSettings.serial?.rtscts ? "checked" : ""}
                    ${process.env.ZIGBEE2MQTT_CONFIG_SERIAL_RTSCTS ? "disabled" : ""}
                    style="margin-bottom: 1rem;">
                <small>Can be ignored for networked coordinators (TCP).</small>
            </fieldset>
            <small>
                <a href="https://www.zigbee2mqtt.io/guide/configuration/adapter-settings.html" target="_blank">https://www.zigbee2mqtt.io/guide/configuration/adapter-settings.html</a>
            </small>
            <hr>
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED ? "disabled" : ""}>
                <label for="closest_wifi_channel">Closest WiFi Channel</label>
                <input
                    type="number"
                    min="0"
                    max="14"
                    id="closest_wifi_channel"
                    value="0"
                    onclick="setBestZigbeeChannel(this)"
                    ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_CHANNEL ? "disabled" : ""}>
                <small>Optionally set to your closest WiFi channel to pick the best value for "Network channel" below.</small>
                <label for="network_channel">Network Channel</label>
                <input
                    type="number"
                    min="11"
                    max="26"
                    id="network_channel"
                    name="network_channel"
                    value="${currentSettings.advanced?.channel ?? "25"}"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_CHANNEL ? "disabled" : ""}>
            </fieldset>
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED ? "disabled" : ""}>
                ${generateCheckbox}
                <label for="network_key">Network Key</label>
                <input
                    type="text"
                    id="network_key"
                    name="network_key"
                    value="${currentSettings.advanced?.network_key ?? "GENERATE"}"
                    pattern="^([0-9]+(,[0-9]+){15})|GENERATE$"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_NETWORK_KEY ? "disabled" : ""}>
                <label for="network_pan_id">Network PAN ID</label>
                <input
                    type="text"
                    id="network_pan_id"
                    name="network_pan_id"
                    value="${currentSettings.advanced?.pan_id ?? "GENERATE"}"
                    pattern="^([0-9]{1,5})|GENERATE$"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_PAN_ID ? "disabled" : ""}>
                <label for="network_ext_pan_id">Network Extended PAN ID</label>
                <input
                    type="text"
                    id="network_ext_pan_id"
                    name="network_ext_pan_id"
                    value="${currentSettings.advanced?.ext_pan_id ?? "GENERATE"}"
                    pattern="^([0-9]+(,[0-9]+){7})|GENERATE$"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_EXT_PAN_ID ? "disabled" : ""}>
            </fieldset>
            <small>
                <a href="https://www.zigbee2mqtt.io/guide/configuration/zigbee-network.html" target="_blank">https://www.zigbee2mqtt.io/guide/configuration/zigbee-network.html</a>
            </small>
            <hr>
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_MQTT ? "disabled" : ""}>
                <label for="mqtt_base_topic">MQTT Base Topic</label>
                <input
                    type="text"
                    id="mqtt_base_topic"
                    name="mqtt_base_topic"
                    value="${currentSettings.mqtt?.base_topic ?? "zigbee2mqtt"}"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_MQTT_BASE_TOPIC ? "disabled" : ""}>
                <label for="mqtt_server">MQTT Server</label>
                <input
                    type="text"
                    id="mqtt_server"
                    name="mqtt_server"
                    value="${currentSettings.mqtt?.server ?? "mqtt://localhost:1883"}"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER ? "disabled" : ""}>
                <label for="mqtt_user">MQTT User</label>
                <input
                    type="text"
                    id="mqtt_user"
                    name="mqtt_user"
                    value="${currentSettings.mqtt?.user ?? ""}"
                    ${process.env.ZIGBEE2MQTT_CONFIG_MQTT_USER ? "disabled" : ""}>
                <small>Optional. Set only if using authentication.</small>
                <label for="mqtt_password">MQTT Password</label>
                <input
                    type="password"
                    id="mqtt_password"
                    name="mqtt_password"
                    value="${currentSettings.mqtt?.password ?? ""}"
                    ${process.env.ZIGBEE2MQTT_CONFIG_MQTT_PASSWORD ? "disabled" : ""}>
                <small>Optional. Set only if using authentication.</small>
            </fieldset>
            <small>
                <a href="https://www.zigbee2mqtt.io/guide/configuration/mqtt.html" target="_blank">https://www.zigbee2mqtt.io/guide/configuration/mqtt.html</a>
            </small>
            <hr>
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_FRONTEND ? "disabled" : ""}>
                <label for="frontend_enabled">
                    <input
                        type="checkbox"
                        id="frontend_enabled"
                        name="frontend_enabled"
                        ${currentSettings.frontend?.enabled ? "checked" : ""}
                        ${process.env.ZIGBEE2MQTT_CONFIG_FRONTEND_ENABLED ? "disabled" : ""}>
                    Frontend enabled?
                </label>
                <label for="frontend_port">Frontend Port</label>
                <input
                    type="number"
                    min="0"
                    max="65535"
                    id="frontend_port"
                    name="frontend_port"
                    value="${currentSettings.frontend?.port ?? "8080"}"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_FRONTEND_PORT ? "disabled" : ""}>
            </fieldset>
            <small>
                <a href="https://www.zigbee2mqtt.io/guide/configuration/frontend.html" target="_blank">https://www.zigbee2mqtt.io/guide/configuration/frontend.html</a>
            </small>
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_HOMEASSISTANT ? "disabled" : ""}>
                <label for="homeassistant_enabled">
                    <input
                        type="checkbox"
                        id="homeassistant_enabled"
                        name="homeassistant_enabled"
                        ${currentSettings.homeassistant?.enabled ? "checked" : ""}
                        ${process.env.ZIGBEE2MQTT_CONFIG_HOMEASSISTANT_ENABLED ? "disabled" : ""}>
                    Home Assistant enabled?
                </label>
            </fieldset>
            <small>
                <a href="https://www.zigbee2mqtt.io/guide/configuration/homeassistant.html" target="_blank">https://www.zigbee2mqtt.io/guide/configuration/homeassistant.html</a>
            </small>
            <hr>
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED ? "disabled" : ""}>
                <label for="log_level">Log Level</label>
                <select id="log_level" name="log_level" ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_LOG_LEVEL ? "disabled" : ""}>
                    <option value="error" ${currentSettings.advanced?.log_level === "error" ? "selected" : ""}>error</option>
                    <option value="warning" ${currentSettings.advanced?.log_level === "warning" ? "selected" : ""}>warning</option>
                    <option value="info" ${!currentSettings.advanced?.log_level || currentSettings.advanced?.log_level === "info" ? "selected" : ""}>info</option>
                    <option value="debug" ${currentSettings.advanced?.log_level === "debug" ? "selected" : ""}>debug</option>
                </select>
            </fieldset>
            <small>
                <a href="https://www.zigbee2mqtt.io/guide/configuration/logging.html" target="_blank">https://www.zigbee2mqtt.io/guide/configuration/logging.html</a>
            </small>
            <hr>
            <input type="submit" value="Submit">
        </form>
    </main>
    <script>
        function setFoundDevice(e) {
            if (!e.value) {
                return;
            }

            const [, path, adapter] = e.value.split(", ");
            const serialPortEl = document.querySelector("#serial_port");
            serialPortEl.value = path;
            const serialAdapterEl = document.querySelector("#serial_adapter");

            if (['zstack', 'ember', 'deconz', 'zigate', 'zboss'].includes(adapter)) {
                serialAdapterEl.value = adapter;
            } else {
                serialAdapterEl.value = '';
            }
        }

        function setBestZigbeeChannel(e) {
            const wifiChannel = parseInt(e.value, 10);
            const networkChannelEl = document.querySelector("#network_channel");

            if (wifiChannel >= 11) {
                // WiFi 11-14
                networkChannelEl.value = 15;
            } else if (wifiChannel >= 6) {
                // WiFi 6-10
                networkChannelEl.value = 11;
            } else {
                // WiFi 1-5
                networkChannelEl.value = 25;
            }
        }

        function setGenerate(e) {
            document.querySelector("#network_key").value = e.checked ? "GENERATE" : "${currentSettings.advanced?.network_key ?? "GENERATE"}";
            document.querySelector("#network_pan_id").value = e.checked ? "GENERATE" : "${currentSettings.advanced?.pan_id ?? "GENERATE"}";
            document.querySelector("#network_ext_pan_id").value = e.checked ? "GENERATE" : "${currentSettings.advanced?.ext_pan_id ?? "GENERATE"}";
        }
    </script>
</body>
</html>
`;
    /* v8 ignore stop */
}

function generateHtmlError(errors: string): string {
    return `
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Zigbee2MQTT Onboarding</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.classless.min.css">
</head>
<body>
    <main>
        <h1>Zigbee2MQTT configuration is not valid</h1>
        <p style="color: #F00;">Found the following errors:</p>
        ${errors}
        <hr>
        <p>If you don't know how to solve this, read <a href="https://www.zigbee2mqtt.io/guide/configuration" target="_blank">https://www.zigbee2mqtt.io/guide/configuration</a></p>
        <form method="post" action="/">
            <input type="submit" value="Close">
        </form>
    </main>
</body>
</html>
`;
}

function getServerUrl(): URL {
    return new URL(process.env.Z2M_ONBOARD_URL ?? "http://0.0.0.0:8080");
}

async function startOnboardingServer(): Promise<boolean> {
    const currentSettings = settings.get();
    const serverUrl = getServerUrl();
    let server: ReturnType<typeof createServer> | undefined;
    let failed = false;

    const success = await new Promise<boolean>((resolve) => {
        server = createServer(async (req, res) => {
            if (req.method === "POST") {
                if (failed) {
                    res.end(() => {
                        resolve(false);
                    });
                } else {
                    let body = "";

                    req.on("data", (chunk) => {
                        body += chunk;
                    });

                    req.on("end", () => {
                        const result = parse(body) as unknown as OnboardSettings;
                        const frontendEnabled = result.frontend_enabled === "on";
                        const updatedSettings: RecursivePartial<Settings> = {
                            mqtt: {
                                base_topic: result.mqtt_base_topic,
                                server: result.mqtt_server,
                                user: result.mqtt_user || undefined, // empty string => removed
                                password: result.mqtt_password || undefined, // empty string => removed
                            },
                            serial: {
                                port: result.serial_port,
                                adapter: result.serial_adapter,
                                baudrate: result.serial_baudrate ? Number.parseInt(result.serial_baudrate, 10) : undefined,
                                rtscts: result.serial_rtscts === "on",
                            },
                            advanced: {
                                log_level: result.log_level,
                                channel: result.network_channel ? Number.parseInt(result.network_channel, 10) : undefined,
                                network_key: result.network_key
                                    ? result.network_key === "GENERATE"
                                        ? result.network_key
                                        : result.network_key.split(",").map((v) => Number.parseInt(v, 10))
                                    : undefined,
                                pan_id: result.network_pan_id
                                    ? result.network_pan_id === "GENERATE"
                                        ? result.network_pan_id
                                        : Number.parseInt(result.network_pan_id, 10)
                                    : undefined,
                                ext_pan_id: result.network_ext_pan_id
                                    ? result.network_ext_pan_id === "GENERATE"
                                        ? result.network_ext_pan_id
                                        : result.network_ext_pan_id.split(",").map((v) => Number.parseInt(v, 10))
                                    : undefined,
                            },
                            frontend: {
                                enabled: frontendEnabled,
                                port: result.frontend_port ? Number.parseInt(result.frontend_port, 10) : undefined,
                            },
                            homeassistant: {
                                enabled: result.homeassistant_enabled === "on",
                            },
                        };

                        try {
                            settings.apply(updatedSettings);

                            // to redirect, make sure frontend "will be" enabled, and host isn't socket
                            const redirect =
                                !process.env.Z2M_ONBOARD_NO_REDIRECT &&
                                frontendEnabled &&
                                (!currentSettings.frontend?.host || !currentSettings.frontend.host.startsWith("/"));
                            const protocol = currentSettings.frontend?.ssl_cert && currentSettings.frontend.ssl_key ? "https" : "http";

                            res.setHeader("Content-Type", "text/html");
                            res.writeHead(200);
                            res.end(
                                generateHtmlDone(
                                    redirect
                                        ? /* v8 ignore next */ `${protocol}://${currentSettings.frontend?.host ?? "localhost"}:${currentSettings.frontend?.port ?? "8080"}${currentSettings.frontend?.base_url ?? "/"}`
                                        : undefined,
                                ),
                                () => {
                                    resolve(true);
                                },
                            );
                        } catch (error) {
                            console.error(`Failed to apply configuration: ${(error as Error).message}`);
                            failed = true;

                            if (process.env.Z2M_ONBOARD_NO_FAILURE_PAGE) {
                                res.end(() => {
                                    resolve(false);
                                });
                            } else {
                                res.setHeader("Content-Type", "text/html");
                                res.writeHead(406);
                                res.end(generateHtmlError(`<p>${escapeHtml((error as Error).message)}</p>`));
                            }
                        }
                    });
                }
            } else {
                res.setHeader("Content-Type", "text/html");
                res.writeHead(200);
                res.end(generateHtmlForm(currentSettings, await findAllDevices()));
            }
        });

        server.listen(Number.parseInt(serverUrl.port, 10), serverUrl.hostname, () => {
            console.log(`Onboarding page is available at ${serverUrl.href}`);
        });
    });

    await new Promise((resolve) => server?.close(resolve));

    return success;
}

async function startFailureServer(errors: string): Promise<void> {
    const serverUrl = getServerUrl();
    let server: ReturnType<typeof createServer> | undefined;

    await new Promise<void>((resolve) => {
        server = createServer((req, res) => {
            if (req.method === "POST") {
                res.end(() => {
                    resolve();
                });
            } else {
                res.setHeader("Content-Type", "text/html");
                res.writeHead(406);
                res.end(generateHtmlError(errors));
            }
        });

        server.listen(Number.parseInt(serverUrl.port, 10), serverUrl.hostname, () => {
            console.error(`Failure page is available at ${serverUrl.href}`);
        });
    });

    await new Promise((resolve) => server?.close(resolve));
}

async function onSettingsErrors(errors: string[]): Promise<void> {
    let pErrors = "";

    console.error("\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("            READ THIS CAREFULLY\n");
    console.error("Refusing to start because configuration is not valid, found the following errors:");

    for (const error of errors) {
        console.error(`- ${error}`);

        pErrors += `<p>- ${escapeHtml(error)}</p>`;
    }

    console.error("\nIf you don't know how to solve this, read https://www.zigbee2mqtt.io/guide/configuration");
    console.error("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n\n");

    if (!process.env.Z2M_ONBOARD_NO_SERVER && !process.env.Z2M_ONBOARD_NO_FAILURE_PAGE) {
        await startFailureServer(pErrors);
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
