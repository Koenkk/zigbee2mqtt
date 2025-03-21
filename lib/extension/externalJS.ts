import type {Zigbee2MQTTAPI, Zigbee2MQTTResponse} from '../types/api';

import fs from 'node:fs';
import path from 'node:path';

import bind from 'bind-decorator';
import stringify from 'json-stable-stringify-without-jsonify';

import data from '../util/data';
import logger from '../util/logger';
import * as settings from '../util/settings';
import utils from '../util/utils';
import Extension from './extension';

const SUPPORTED_OPERATIONS = ['save', 'remove'];

export default abstract class ExternalJSExtension<M> extends Extension {
    protected folderName: string;
    protected mqttTopic: string;
    protected requestRegex: RegExp;
    protected basePath: string;
    protected srcBasePath: string;

    constructor(
        zigbee: Zigbee,
        mqtt: MQTT,
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
        // 1-up from this file
        this.srcBasePath = path.join(
            __dirname,
            '..',
            // prevent race in vitest with files being manipulated from same location
            process.env.VITEST_WORKER_ID ? /* v8 ignore next */ `${folderName}_${Math.floor(Math.random() * 10000)}` : folderName,
        );
    }

    override async start(): Promise<void> {
        await super.start();
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        await this.loadFiles();
        await this.publishExternalJS();
    }

    override async stop(): Promise<void> {
        // remove src base path on stop to ensure always back to default
        fs.rmSync(this.srcBasePath, {force: true, recursive: true});
        await super.stop();
    }

    private getFilePath(name: string, mkBasePath = false, inSource = false): string {
        const basePath = inSource ? this.srcBasePath : this.basePath;

        if (mkBasePath && !fs.existsSync(basePath)) {
            fs.mkdirSync(basePath, {recursive: true});
        }

        return path.join(basePath, name);
    }

    protected getFileCode(name: string): string {
        return fs.readFileSync(this.getFilePath(name), 'utf8');
    }

    protected *getFiles(inSource = false): Generator<{name: string; code: string}> {
        const basePath = inSource ? this.srcBasePath : this.basePath;

        if (!fs.existsSync(basePath)) {
            return;
        }

        for (const fileName of fs.readdirSync(basePath)) {
            if (fileName.endsWith('.js') || fileName.endsWith('.cjs') || fileName.endsWith('.mjs')) {
                yield {name: fileName, code: this.getFileCode(fileName)};
            }
        }
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const match = data.topic.match(this.requestRegex);

        if (match && SUPPORTED_OPERATIONS.includes(match[1].toLowerCase())) {
            const message = utils.parseJSON(data.message, data.message);

            try {
                let response;

                if (match[1].toLowerCase() === 'save') {
                    response = await this.save(
                        message as Zigbee2MQTTAPI['bridge/request/converter/save'] | Zigbee2MQTTAPI['bridge/request/extension/save'],
                    );
                } else {
                    response = await this.remove(
                        message as Zigbee2MQTTAPI['bridge/request/converter/remove'] | Zigbee2MQTTAPI['bridge/request/extension/remove'],
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
        message: Zigbee2MQTTAPI['bridge/request/converter/remove'] | Zigbee2MQTTAPI['bridge/request/extension/remove'],
    ): Promise<Zigbee2MQTTResponse<'bridge/response/converter/remove' | 'bridge/response/extension/remove'>> {
        if (!message.name) {
            return utils.getResponse(message, {}, `Invalid payload`);
        }

        const {name} = message;
        const srcToBeRemoved = this.getFilePath(name, false, true);
        const toBeRemoved = this.getFilePath(name);

        if (fs.existsSync(srcToBeRemoved)) {
            const mod = await import(this.getImportPath(srcToBeRemoved));

            await this.removeJS(name, mod.default);
            fs.rmSync(srcToBeRemoved, {force: true});
            fs.rmSync(toBeRemoved, {force: true});
            logger.info(`${name} (${toBeRemoved}) removed.`);
            await this.publishExternalJS();

            return utils.getResponse(message, {});
        } else {
            return utils.getResponse(message, {}, `${name} (${srcToBeRemoved}) doesn't exists`);
        }
    }

    @bind private async save(
        message: Zigbee2MQTTAPI['bridge/request/converter/save'] | Zigbee2MQTTAPI['bridge/request/extension/save'],
    ): Promise<Zigbee2MQTTResponse<'bridge/response/converter/save' | 'bridge/response/extension/save'>> {
        if (!message.name || !message.code) {
            return utils.getResponse(message, {}, `Invalid payload`);
        }

        const {name, code} = message;
        const srcFilePath = this.getFilePath(name, true, true);
        let newName = name;

        if (fs.existsSync(srcFilePath)) {
            // if file already exist, version it to bypass node module caching
            const versionMatch = name.match(/\.(\d+)\.(c|m)?js$/);

            if (versionMatch) {
                const version = parseInt(versionMatch[1], 10);
                newName = name.replace(`.${version}.`, `.${version + 1}.`);
            } else {
                const ext = path.extname(name);
                newName = name.replace(ext, `.1${ext}`);
            }

            // remove previous version
            fs.rmSync(srcFilePath, {force: true});
            fs.rmSync(this.getFilePath(name, true, false), {force: true});
        }

        const newSrcFilePath = this.getFilePath(newName, false /* already created above if needed */, true);

        try {
            fs.writeFileSync(newSrcFilePath, code, 'utf8');

            const mod = await import(this.getImportPath(newSrcFilePath));

            await this.loadJS(name, mod.default, newName);
            logger.info(`${newName} loaded. Contents written to '${newSrcFilePath}'.`);
            // keep original in data folder synced
            fs.writeFileSync(this.getFilePath(newName, true, false), code, 'utf8');
            await this.publishExternalJS();

            return utils.getResponse(message, {});
        } catch (error) {
            fs.rmSync(newSrcFilePath, {force: true});
            // NOTE: original in data folder doesn't get written if invalid

            return utils.getResponse(message, {}, `${newName} contains invalid code: ${(error as Error).message}`);
        }
    }

    private async loadFiles(): Promise<void> {
        for (const extension of this.getFiles()) {
            const srcFilePath = this.getFilePath(extension.name, true, true);
            const filePath = this.getFilePath(extension.name);

            try {
                fs.copyFileSync(filePath, srcFilePath);

                const mod = await import(this.getImportPath(srcFilePath));

                await this.loadJS(extension.name, mod.default);
            } catch (error) {
                // change ext so Z2M doesn't try to load it again and again
                fs.renameSync(filePath, `${filePath}.invalid`);
                fs.rmSync(srcFilePath, {force: true});

                logger.error(
                    `Invalid external ${this.mqttTopic} '${extension.name}' was ignored and renamed to prevent interference with Zigbee2MQTT.`,
                );
                logger.debug((error as Error).stack!);
            }
        }
    }

    private async publishExternalJS(): Promise<void> {
        await this.mqtt.publish(
            `bridge/${this.mqttTopic}s`,
            stringify(Array.from(this.getFiles(true))),
            {
                retain: true,
                qos: 0,
            },
            settings.get().mqtt.base_topic,
            true,
        );
    }

    private getImportPath(filePath: string): string {
        // prevent issues on Windows
        return path.relative(__dirname, filePath).replaceAll('\\', '/');
    }
}
