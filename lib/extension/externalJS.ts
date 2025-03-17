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
const BACKUP_DIR = 'old';

export default abstract class ExternalJSExtension<M> extends Extension {
    protected mqttTopic: string;
    protected requestRegex: RegExp;
    protected basePath: string;

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

        this.mqttTopic = mqttTopic;
        this.requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/${mqttTopic}/(save|remove)`);
        this.basePath = data.joinPath(folderName);
    }

    override async start(): Promise<void> {
        await super.start();
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        await this.loadFiles();
        await this.publishExternalJS();
    }

    private getFilePath(name: string, mkBasePath: boolean = false, backup: boolean = false): string {
        if (mkBasePath && !fs.existsSync(backup ? path.join(this.basePath, BACKUP_DIR) : this.basePath)) {
            fs.mkdirSync(backup ? path.join(this.basePath, BACKUP_DIR) : this.basePath, {recursive: true});
        }

        return backup ? path.join(this.basePath, BACKUP_DIR, name) : path.join(this.basePath, name);
    }

    protected getFileCode(name: string): string {
        return fs.readFileSync(path.join(this.basePath, name), 'utf8');
    }

    protected *getFiles(): Generator<{name: string; code: string}> {
        if (!fs.existsSync(this.basePath)) {
            return;
        }

        for (const fileName of fs.readdirSync(this.basePath)) {
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
        const toBeRemoved = this.getFilePath(name);

        if (fs.existsSync(toBeRemoved)) {
            const mod = await import(toBeRemoved);

            await this.removeJS(name, mod.default);
            fs.rmSync(toBeRemoved, {force: true});
            logger.info(`${name} (${toBeRemoved}) removed.`);
            await this.publishExternalJS();

            return utils.getResponse(message, {});
        } else {
            return utils.getResponse(message, {}, `${name} (${toBeRemoved}) doesn't exists`);
        }
    }

    @bind private async save(
        message: Zigbee2MQTTAPI['bridge/request/converter/save'] | Zigbee2MQTTAPI['bridge/request/extension/save'],
    ): Promise<Zigbee2MQTTResponse<'bridge/response/converter/save' | 'bridge/response/extension/save'>> {
        if (!message.name || !message.code) {
            return utils.getResponse(message, {}, `Invalid payload`);
        }

        const {name, code} = message;
        const filePath = this.getFilePath(name, true);
        let newFilePath = filePath;
        let newName = name;

        if (fs.existsSync(filePath)) {
            // if file already exist, version it to bypass node module caching
            const versionMatch = name.match(/\.(\d+)\.(c|m)?js$/);

            if (versionMatch) {
                const version = parseInt(versionMatch[1], 10);
                newName = name.replace(`.${version}.`, `.${version + 1}.`);
            } else {
                const ext = path.extname(name);
                newName = name.replace(ext, `.1${ext}`);
            }

            newFilePath = this.getFilePath(newName, true);

            // move previous version to backup dir
            fs.renameSync(filePath, this.getFilePath(name, true, true));
        }

        try {
            fs.writeFileSync(newFilePath, code, 'utf8');

            const mod = await import(newFilePath);

            await this.loadJS(name, mod.default, newName);
            logger.info(`${newName} loaded. Contents written to '${newFilePath}'.`);
            await this.publishExternalJS();

            return utils.getResponse(message, {});
        } catch (error) {
            fs.rmSync(newFilePath, {force: true});

            return utils.getResponse(message, {}, `${newName} contains invalid code: ${(error as Error).message}`);
        }
    }

    private async loadFiles(): Promise<void> {
        for (const extension of this.getFiles()) {
            try {
                const mod = await import(path.join(this.basePath, extension.name));

                await this.loadJS(extension.name, mod.default);
            } catch (error) {
                const destPath = this.getFilePath(extension.name, true, true);

                fs.renameSync(this.getFilePath(extension.name), destPath);

                logger.error(
                    `Invalid external ${this.mqttTopic} '${extension.name}' was moved to '${destPath}' to prevent interference with Zigbee2MQTT.`,
                );
                logger.debug((error as Error).stack!);
            }
        }
    }

    private async publishExternalJS(): Promise<void> {
        await this.mqtt.publish(
            `bridge/${this.mqttTopic}s`,
            stringify(Array.from(this.getFiles())),
            {
                retain: true,
                qos: 0,
            },
            settings.get().mqtt.base_topic,
            true,
        );
    }
}
