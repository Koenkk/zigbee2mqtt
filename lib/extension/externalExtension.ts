import * as settings from '../util/settings';
import utils from '../util/utils';
import fs from 'fs';
import data from './../util/data';
import path from 'path';
import logger from './../util/logger';
import stringify from 'json-stable-stringify-without-jsonify';
import bind from 'bind-decorator';
import Extension from './extension';

const requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/extension/(save|remove)`);

export default class ExternalExtension extends Extension {
    private requestLookup: {[s: string]: (message: KeyValue) => Promise<MQTTResponse>};

    override async start(): Promise<void> {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.requestLookup = {'save': this.saveExtension, 'remove': this.removeExtension};
        this.loadUserDefinedExtensions();
        await this.publishExtensions();
    }

    private getExtensionsBasePath(): string {
        return data.joinPath('extension');
    }

    private getListOfUserDefinedExtensions(): {name: string, code: string}[] {
        const basePath = this.getExtensionsBasePath();
        if (fs.existsSync(basePath)) {
            return fs.readdirSync(basePath).filter((f) => f.endsWith('.js')).map((fileName) => {
                const extensonFilePath = path.join(basePath, fileName);
                return {'name': fileName, 'code': fs.readFileSync(extensonFilePath, 'utf-8')};
            });
        } else {
            return [];
        }
    }

    @bind private async removeExtension(message: KeyValue): Promise<MQTTResponse> {
        const {name} = message;
        const extensions = this.getListOfUserDefinedExtensions();
        const extensionToBeRemoved = extensions.find((e) => e.name === name);

        if (extensionToBeRemoved) {
            await this.enableDisableExtension(false, extensionToBeRemoved.name);
            const basePath = this.getExtensionsBasePath();
            const extensionFilePath = path.join(basePath, path.basename(name));
            fs.unlinkSync(extensionFilePath);
            this.publishExtensions();
            logger.info(`Extension ${name} removed`);
            return utils.getResponse(message, {}, null);
        } else {
            return utils.getResponse(message, {}, `Extension ${name} doesn't exists`);
        }
    }

    @bind private async saveExtension(message: KeyValue): Promise<MQTTResponse> {
        const {name, code} = message;
        const ModuleConstructor = utils.loadModuleFromText(code) as typeof Extension;
        await this.loadExtension(ModuleConstructor);
        const basePath = this.getExtensionsBasePath();
        /* istanbul ignore else */
        if (!fs.existsSync(basePath)) {
            fs.mkdirSync(basePath);
        }
        const extensonFilePath = path.join(basePath, path.basename(name));
        fs.writeFileSync(extensonFilePath, code);
        this.publishExtensions();
        logger.info(`Extension ${name} loaded`);
        return utils.getResponse(message, {}, null);
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const match = data.topic.match(requestRegex);
        if (match && this.requestLookup[match[1].toLowerCase()]) {
            const message = utils.parseJSON(data.message, data.message) as KeyValue;
            try {
                const response = await this.requestLookup[match[1].toLowerCase()](message);
                await this.mqtt.publish(`bridge/response/extension/${match[1]}`, stringify(response));
            } catch (error) {
                logger.error(`Request '${data.topic}' failed with error: '${error.message}'`);
                const response = utils.getResponse(message, {}, error.message);
                await this.mqtt.publish(`bridge/response/extension/${match[1]}`, stringify(response));
            }
        }
    }

    @bind private async loadExtension(ConstructorClass: typeof Extension): Promise<void> {
        await this.enableDisableExtension(false, ConstructorClass.name);
        // @ts-ignore
        await this.addExtension(new ConstructorClass(this.zigbee, this.mqtt, this.state, this.publishEntityState,
            this.eventBus, settings, logger));
    }

    private loadUserDefinedExtensions(): void {
        const extensions = this.getListOfUserDefinedExtensions();
        extensions
            .map(({code}) => utils.loadModuleFromText(code))
            .map(this.loadExtension);
    }

    private async publishExtensions(): Promise<void> {
        const extensions = this.getListOfUserDefinedExtensions();
        await this.mqtt.publish('bridge/extensions', stringify(extensions), {
            retain: true,
            qos: 0,
        }, settings.get().mqtt.base_topic, true);
    }
}
