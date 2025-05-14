import type {Zigbee2MQTTAPI, Zigbee2MQTTResponse} from "../types/api";

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import bind from "bind-decorator";
import stringify from "json-stable-stringify-without-jsonify";

import data from "../util/data";
import logger from "../util/logger";
import * as settings from "../util/settings";
import utils from "../util/utils";
import Extension from "./extension";

const SUPPORTED_OPERATIONS = ["save", "remove"];

export default abstract class ExternalJSExtension<M> extends Extension {
    protected folderName: string;
    protected mqttTopic: string;
    protected requestRegex: RegExp;
    protected basePath: string;
    protected nodeModulesSymlinkChecked = false;

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
    private createNodeModulesSymlinkIfNecessary() {
        if (!this.nodeModulesSymlinkChecked) {
            this.nodeModulesSymlinkChecked = true;
            const nodeModulesPath = path.join(__dirname, "..", "..", "node_modules");
            const z2mDirNormalized = `${path.resolve(path.join(nodeModulesPath, ".."))}${path.sep}`;
            const basePathNormalized = `${path.resolve(this.basePath)}${path.sep}`;
            const basePathInZ2mDir = basePathNormalized.startsWith(z2mDirNormalized);
            if (!basePathInZ2mDir) {
                logger.debug(`External JS folder '${this.folderName}' is outside the Z2M install dir, creating a symlink to 'node_modules'`);
                const nodeModulesSymlink = path.join(this.basePath, "node_modules");
                if (fs.existsSync(nodeModulesSymlink)) {
                    fs.unlinkSync(nodeModulesSymlink);
                }
                // Type `junction` is required on Windows.
                // https://github.com/nodejs/node/issues/18518#issuecomment-513866491
                /* v8 ignore next */
                fs.symlinkSync(nodeModulesPath, nodeModulesSymlink, os.platform() === "win32" ? "junction" : "dir");
            }
        }
    }

    override async start(): Promise<void> {
        await super.start();
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        await this.loadFiles();
        await this.publishExternalJS();
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
                if (fileName.endsWith(".js") || fileName.endsWith(".cjs") || fileName.endsWith(".mjs")) {
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
            const mod = await import(this.getImportPath(toBeRemoved));

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
            this.createNodeModulesSymlinkIfNecessary();

            const mod = await import(this.getImportPath(filePath));

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
            this.createNodeModulesSymlinkIfNecessary();
            const filePath = this.getFilePath(extension.name);

            try {
                const mod = await import(this.getImportPath(filePath));
                await this.loadJS(extension.name, mod.default);
            } catch (error) {
                // change ext so Z2M doesn't try to load it again and again
                fs.renameSync(filePath, `${filePath}.invalid`);

                logger.error(
                    `Invalid external ${this.mqttTopic} '${extension.name}' was ignored and renamed to prevent interference with Zigbee2MQTT.`,
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

    private getImportPath(filePath: string): string {
        // prevent issues on Windows, add a uuid to bypass Node cache.
        return `${path.relative(__dirname, filePath).replaceAll("\\", "/")}?${crypto.randomUUID()}`;
    }
}
