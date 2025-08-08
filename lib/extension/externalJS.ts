import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bind from "bind-decorator";
import stringify from "json-stable-stringify-without-jsonify";
import type {Zigbee2MQTTAPI, Zigbee2MQTTResponse} from "../types/api";

import data from "../util/data";
import logger from "../util/logger";
import * as settings from "../util/settings";
import utils from "../util/utils";
import Extension from "./extension";

const SUPPORTED_OPERATIONS = ["save", "remove"];
const TMP_PREFIX = ".tmp-ed42d4f2-";

export default abstract class ExternalJSExtension<M> extends Extension {
    protected folderName: string;
    protected mqttTopic: string;
    protected requestRegex: RegExp;
    protected basePath: string;
    protected nodeModulesSymlinked = false;

    constructor(
        zigbee: Zigbee,
        mqtt: Mqtt,
        state: State,
        publishEntityState: PublishEntityState,
        eventBus: EventBus,
        enableDisableExtension: (enable: boolean, name: string) => Promise<void>,
        restartCallback: () => Promise<void>,
        addExtension: (extension: Extension) => Promise<void>,
        mqttTopic: string,
        folderName: string,
    ) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);

        this.folderName = folderName;
        this.mqttTopic = mqttTopic;
        this.requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/${mqttTopic}/(save|remove)`);
        this.basePath = data.joinPath(folderName);
    }

    /**
     * In case the external JS is not in the Z2M install dir (e.g. when `ZIGBEE2MQTT_DATA` is used), the external
     * JS cannot import from `node_modules`.
     * To workaround this create a symlink to `node_modules` in the external JS dir.
     * https://nodejs.org/api/esm.html#no-node_path
     */
    private symlinkNodeModulesIfNecessary() {
        if (!this.nodeModulesSymlinked) {
            this.nodeModulesSymlinked = true;
            const nodeModulesPath = path.join(__dirname, "..", "..", "node_modules");
            const z2mDirNormalized = `${path.resolve(path.join(nodeModulesPath, ".."))}${path.sep}`;
            const basePathNormalized = `${path.resolve(this.basePath)}${path.sep}`;
            const basePathInZ2mDir = basePathNormalized.startsWith(z2mDirNormalized);
            if (!basePathInZ2mDir) {
                logger.debug(`External JS folder '${this.folderName}' is outside the Z2M install dir, creating a symlink to 'node_modules'`);
                const nodeModulesSymlink = path.join(this.basePath, "node_modules");
                /* v8 ignore start */
                if (fs.existsSync(nodeModulesSymlink)) {
                    fs.unlinkSync(nodeModulesSymlink);
                }
                /* v8 ignore stop */

                // Type `junction` is required on Windows.
                // https://github.com/nodejs/node/issues/18518#issuecomment-513866491
                fs.symlinkSync(nodeModulesPath, nodeModulesSymlink, /* v8 ignore next */ os.platform() === "win32" ? "junction" : "dir");
            }
        }
    }

    override async start(): Promise<void> {
        await super.start();
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        await this.loadFiles();
        await this.publishExternalJS();
    }

    override async stop(): Promise<void> {
        await super.stop();

        // ensure "node_modules" is never followed & included in 3rd-party backup systems
        const nodeModulesSymlink = path.join(this.basePath, "node_modules");

        if (fs.existsSync(nodeModulesSymlink)) {
            fs.unlinkSync(nodeModulesSymlink);
        }
    }

    private getFilePath(name: string, mkBasePath = false): string {
        if (mkBasePath && !fs.existsSync(this.basePath)) {
            fs.mkdirSync(this.basePath, {recursive: true});
        }

        return path.join(this.basePath, name);
    }

    protected getFileCode(name: string): string {
        return fs.readFileSync(this.getFilePath(name), "utf8");
    }

    protected *getFiles(): Generator<{name: string; code: string}> {
        if (fs.existsSync(this.basePath)) {
            for (const fileName of fs.readdirSync(this.basePath)) {
                if (!fileName.startsWith(TMP_PREFIX) && (fileName.endsWith(".js") || fileName.endsWith(".cjs") || fileName.endsWith(".mjs"))) {
                    yield {name: fileName, code: this.getFileCode(fileName)};
                }
            }
        }
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const match = data.topic.match(this.requestRegex);

        if (match && SUPPORTED_OPERATIONS.includes(match[1].toLowerCase())) {
            const message = utils.parseJSON(data.message, data.message);

            try {
                let response: Awaited<ReturnType<typeof this.save | typeof this.remove>>;

                if (match[1].toLowerCase() === "save") {
                    response = await this.save(
                        message as Zigbee2MQTTAPI["bridge/request/converter/save"] | Zigbee2MQTTAPI["bridge/request/extension/save"],
                    );
                } else {
                    response = await this.remove(
                        message as Zigbee2MQTTAPI["bridge/request/converter/remove"] | Zigbee2MQTTAPI["bridge/request/extension/remove"],
                    );
                }

                await this.mqtt.publish(`bridge/response/${this.mqttTopic}/${match[1]}`, stringify(response));
            } catch (error) {
                logger.error(`Request '${data.topic}' failed with error: '${(error as Error).message}'`);

                const response = utils.getResponse(message, {}, `${(error as Error).message}`);

                await this.mqtt.publish(`bridge/response/${this.mqttTopic}/${match[1]}`, stringify(response));
            }
        }
    }

    protected abstract removeJS(name: string, mod: M): Promise<void>;

    protected abstract loadJS(name: string, mod: M, newName?: string): Promise<void>;

    @bind private async remove(
        message: Zigbee2MQTTAPI["bridge/request/converter/remove"] | Zigbee2MQTTAPI["bridge/request/extension/remove"],
    ): Promise<Zigbee2MQTTResponse<"bridge/response/converter/remove" | "bridge/response/extension/remove">> {
        if (!message.name) {
            return utils.getResponse(message, {}, "Invalid payload");
        }

        const {name} = message;
        const toBeRemoved = this.getFilePath(name);

        if (fs.existsSync(toBeRemoved)) {
            const mod = await this.importFile(toBeRemoved);

            await this.removeJS(name, mod.default);
            fs.rmSync(toBeRemoved, {force: true});
            logger.info(`${name} (${toBeRemoved}) removed.`);
            await this.publishExternalJS();

            return utils.getResponse(message, {});
        }

        return utils.getResponse(message, {}, `${name} (${toBeRemoved}) doesn't exists`);
    }

    @bind private async save(
        message: Zigbee2MQTTAPI["bridge/request/converter/save"] | Zigbee2MQTTAPI["bridge/request/extension/save"],
    ): Promise<Zigbee2MQTTResponse<"bridge/response/converter/save" | "bridge/response/extension/save">> {
        if (!message.name || !message.code) {
            return utils.getResponse(message, {}, "Invalid payload");
        }

        const {name, code} = message;
        const filePath = this.getFilePath(name, true);
        try {
            fs.writeFileSync(filePath, code, "utf8");
            this.symlinkNodeModulesIfNecessary();

            const mod = await this.importFile(filePath);

            await this.loadJS(name, mod.default, name);
            logger.info(`${name} loaded. Contents written to '${filePath}'.`);
            await this.publishExternalJS();

            return utils.getResponse(message, {});
        } catch (error) {
            return utils.getResponse(message, {}, `${name} contains invalid code: ${(error as Error).message}`);
        }
    }

    private async loadFiles(): Promise<void> {
        for (const extension of this.getFiles()) {
            this.symlinkNodeModulesIfNecessary();
            const filePath = this.getFilePath(extension.name);

            try {
                const mod = await this.importFile(filePath);
                await this.loadJS(extension.name, mod.default);
            } catch (error) {
                // change ext so Z2M doesn't try to load it again and again
                fs.renameSync(filePath, `${filePath}.invalid`);

                logger.error(
                    `Invalid external ${this.mqttTopic} '${extension.name}' was ignored and renamed to prevent interference with Zigbee2MQTT. (${(error as Error).message})`,
                );
                // biome-ignore lint/style/noNonNullAssertion: always Error
                logger.debug((error as Error).stack!);
            }
        }
    }

    private async publishExternalJS(): Promise<void> {
        await this.mqtt.publish(`bridge/${this.mqttTopic}s`, stringify(Array.from(this.getFiles())), {
            clientOptions: {retain: true},
            skipLog: true,
        });
    }

    // biome-ignore lint/suspicious/noExplicitAny: dynamic module
    private async importFile(file: string): Promise<any> {
        const ext = path.extname(file);
        // Create the file in a temp path to bypass node module cache when importing multiple times.
        const tmpFile = path.join(this.basePath, `${TMP_PREFIX}${path.basename(file, ext)}-${crypto.randomUUID()}${ext}`);
        fs.copyFileSync(file, tmpFile);
        try {
            // Do `replaceAll("\\", "/")` to prevent issues on Windows
            /* v8 ignore next */
            const mod = await import(os.platform() === "win32" ? `file:///${tmpFile.replaceAll("\\", "/")}` : tmpFile);
            return mod;
        } finally {
            fs.rmSync(tmpFile);
        }
    }
}
