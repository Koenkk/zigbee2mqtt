import fs from 'fs';
import path from 'path';

import bind from 'bind-decorator';
import stringify from 'json-stable-stringify-without-jsonify';

import * as settings from '../util/settings';
import utils from '../util/utils';
import data from './../util/data';
import logger from './../util/logger';
import Extension from './extension';

const requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/extension/(save|remove)`);

export default class ExternalExtension extends Extension {
    private requestLookup: {[s: string]: (message: KeyValue) => Promise<MQTTResponse>} = {
        save: this.saveExtension,
        remove: this.removeExtension,
    };

    override async start(): Promise<void> {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        await this.loadUserDefinedExtensions();
        await this.publishExtensions();
    }

    private getExtensionsBasePath(): string {
        return data.joinPath('extension');
    }

    private getListOfUserDefinedExtensions(): {name: string; code: string}[] {
        const basePath = this.getExtensionsBasePath();
        if (fs.existsSync(basePath)) {
            return fs
                .readdirSync(basePath)
                .filter((f) => f.endsWith('.js'))
                .map((fileName) => {
                    const extensionFilePath = path.join(basePath, fileName);
                    return {name: fileName, code: fs.readFileSync(extensionFilePath, 'utf-8')};
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
            await this.publishExtensions();
            logger.info(`Extension ${name} removed`);
            return utils.getResponse(message, {});
        } else {
            return utils.getResponse(message, {}, `Extension ${name} doesn't exists`);
        }
    }

    @bind private async saveExtension(message: KeyValue): Promise<MQTTResponse> {
        const {name, code} = message;
        const ModuleConstructor = utils.loadModuleFromText(code, name) as typeof Extension;
        await this.loadExtension(ModuleConstructor);
        const basePath = this.getExtensionsBasePath();
        /* istanbul ignore else */
        if (!fs.existsSync(basePath)) {
            fs.mkdirSync(basePath);
        }
        const extensionFilePath = path.join(basePath, path.basename(name));
        fs.writeFileSync(extensionFilePath, code);
        await this.publishExtensions();
        logger.info(`Extension ${name} loaded`);
        return utils.getResponse(message, {});
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const match = data.topic.match(requestRegex);
        if (match && this.requestLookup[match[1].toLowerCase()]) {
            const message = utils.parseJSON(data.message, data.message) as KeyValue;
            try {
                const response = await this.requestLookup[match[1].toLowerCase()](message);
                await this.mqtt.publish(`bridge/response/extension/${match[1]}`, stringify(response));
            } catch (error) {
                logger.error(`Request '${data.topic}' failed with error: '${(error as Error).message}'`);
                const response = utils.getResponse(message, {}, `${(error as Error).message}`);
                await this.mqtt.publish(`bridge/response/extension/${match[1]}`, stringify(response));
            }
        }
    }

    @bind private async loadExtension(ConstructorClass: typeof Extension): Promise<void> {
        await this.enableDisableExtension(false, ConstructorClass.name);
        // @ts-expect-error `ConstructorClass` is the interface, not the actual passed class
        await this.addExtension(new ConstructorClass(this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus, settings, logger));
    }

    private async loadUserDefinedExtensions(): Promise<void> {
        for (const extension of this.getListOfUserDefinedExtensions()) {
            await this.loadExtension(utils.loadModuleFromText(extension.code, extension.name) as typeof Extension);
        }
    }

    private async publishExtensions(): Promise<void> {
        const extensions = this.getListOfUserDefinedExtensions();
        await this.mqtt.publish(
            'bridge/extensions',
            stringify(extensions),
            {
                retain: true,
                qos: 0,
            },
            settings.get().mqtt.base_topic,
            true,
        );
    }
}
