import fs from 'fs';
import path from 'path';
import {Context, runInNewContext} from 'vm';

import bind from 'bind-decorator';
import stringify from 'json-stable-stringify-without-jsonify';

import data from '../util/data';
import logger from '../util/logger';
import * as settings from '../util/settings';
import utils from '../util/utils';
import Extension from './extension';

export default abstract class ExternalJSExtension<M> extends Extension {
    private requestLookup: {[s: string]: (message: KeyValue) => Promise<MQTTResponse>} = {
        save: this.save,
        remove: this.remove,
    };

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

    private getFilePath(name: string, mkBasePath: boolean = false): string {
        if (mkBasePath && !fs.existsSync(this.basePath)) {
            fs.mkdirSync(this.basePath, {recursive: true});
        }

        return path.join(this.basePath, name);
    }

    protected getFileCode(name: string): string {
        return fs.readFileSync(path.join(this.basePath, name), 'utf8');
    }

    protected *getFiles(): Generator<{name: string; code: string}> {
        for (const fileName of fs.readdirSync(this.basePath)) {
            if (fileName.endsWith('.js')) {
                yield {name: fileName, code: this.getFileCode(fileName)};
            }
        }
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const match = data.topic.match(this.requestRegex);

        if (match && this.requestLookup[match[1].toLowerCase()]) {
            const message = utils.parseJSON(data.message, data.message) as KeyValue;

            try {
                const response = await this.requestLookup[match[1].toLowerCase()](message);

                await this.mqtt.publish(`bridge/response/${this.mqttTopic}/${match[1]}`, stringify(response));
            } catch (error) {
                logger.error(`Request '${data.topic}' failed with error: '${(error as Error).message}'`);

                const response = utils.getResponse(message, {}, `${(error as Error).message}`);

                await this.mqtt.publish(`bridge/response/${this.mqttTopic}/${match[1]}`, stringify(response));
            }
        }
    }

    protected abstract removeJS(name: string, module: M): Promise<void>;

    protected abstract loadJS(name: string, module: M): Promise<void>;

    @bind private async remove(message: KeyValue): Promise<MQTTResponse> {
        const {name} = message;
        const toBeRemoved = this.getFilePath(name);

        if (fs.existsSync(toBeRemoved)) {
            await this.removeJS(name, this.loadModuleFromText(this.getFileCode(name), name));

            fs.rmSync(toBeRemoved, {force: true});
            logger.info(`${name} (${toBeRemoved}) removed.`);
            await this.publishExternalJS();

            return utils.getResponse(message, {});
        } else {
            return utils.getResponse(message, {}, `${name} (${toBeRemoved}) doesn't exists`);
        }
    }

    @bind private async save(message: KeyValue): Promise<MQTTResponse> {
        const {name, code} = message;

        try {
            await this.loadJS(name, this.loadModuleFromText(code, name));

            const filePath = this.getFilePath(name, true);

            fs.writeFileSync(filePath, code, 'utf8');
            logger.info(`${name} loaded. Contents written to '${filePath}'.`);
            await this.publishExternalJS();

            return utils.getResponse(message, {});
        } catch (error) {
            return utils.getResponse(message, {}, `${name} contains invalid code: ${(error as Error).message}`);
        }
    }

    private async loadFiles(): Promise<void> {
        for (const extension of this.getFiles()) {
            await this.loadJS(extension.name, this.loadModuleFromText(extension.code, extension.name));
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

    private loadModuleFromText(moduleCode: string, name?: string): M {
        const moduleFakePath = path.join(__dirname, '..', '..', 'data', 'extension', name || 'externally-loaded.js');
        const sandbox: Context = {
            require: require,
            module: {},
            console,
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
            setImmediate,
            clearImmediate,
        };

        runInNewContext(moduleCode, sandbox, moduleFakePath);

        return sandbox.module.exports;
    }
}