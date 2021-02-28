const settings = require('../util/settings');
const Extension = require('./extension');
const utils = require('../util/utils');
const fs = require('fs');
const data = require('./../util/data');
const path = require('path');
const logger = require('./../util/logger');
const stringify = require('json-stable-stringify-without-jsonify');
const requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/extension/(save|remove)`);

class ExternalExtension extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, addExtension, enableDisableExtension) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.args = [zigbee, mqtt, state, publishEntityState, eventBus];
        this.addExtension = addExtension;
        this.enableDisableExtension = enableDisableExtension;
        this.extensionsBaseDir = 'extension';
        this.loadExtension = this.loadExtension.bind(this);
        this.requestLookup = {
            'save': this.saveExtension.bind(this),
            'remove': this.removeExtension.bind(this),
        };
        this.loadUserDefinedExtensions();
    }
    getExtensionsBasePath() {
        return data.joinPath(this.extensionsBaseDir);
    }

    getListOfUserDefinedExtensions() {
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
    removeExtension(message) {
        const {name} = message;
        const extensions = this.getListOfUserDefinedExtensions();
        const extensionToBeRemoved = extensions.find((e) => e.name === name);

        if (extensionToBeRemoved) {
            this.enableDisableExtension(false, extensionToBeRemoved.name);
            const basePath = this.getExtensionsBasePath();
            const extensonFilePath = path.join(basePath, path.basename(name));
            fs.unlinkSync(extensonFilePath);
            this.publishExtensions();
            logger.info(`Extension ${name} removed`);
            return utils.getResponse(message, {}, null);
        } else {
            return utils.getResponse(message, {}, `Extension ${name} doesn't exists`);
        }
    }
    saveExtension(message) {
        const {name, code} = message;
        const ModuleConstructor = utils.loadModuleFromText(code);
        this.loadExtension(ModuleConstructor);
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


    async onMQTTMessage(topic, message) {
        const match = topic.match(requestRegex);
        if (match && this.requestLookup[match[1].toLowerCase()]) {
            message = utils.parseJSON(message, message);
            try {
                const response = await this.requestLookup[match[1].toLowerCase()](message);
                await this.mqtt.publish(`bridge/response/extension/${match[1]}`, stringify(response));
            } catch (error) {
                logger.error(`Request '${topic}' failed with error: '${error.message}'`);
                const response = utils.getResponse(message, {}, error.message);
                await this.mqtt.publish(`bridge/response/extension/${match[1]}`, stringify(response));
            }
        }
    }

    loadExtension(ConstructorClass) {
        this.enableDisableExtension(false, ConstructorClass.name);
        this.addExtension(new ConstructorClass(...this.args, settings, logger));
    }

    loadUserDefinedExtensions() {
        const extensions = this.getListOfUserDefinedExtensions();
        extensions
            .map(({code}) => utils.loadModuleFromText(code))
            .map(this.loadExtension);
    }
    async onMQTTConnected() {
        this.publishExtensions();
    }

    async publishExtensions() {
        const extensions = this.getListOfUserDefinedExtensions();
        await this.mqtt.publish('bridge/extensions', stringify(extensions), {
            retain: true,
            qos: 0,
        }, settings.get().mqtt.base_topic, true);
    }
}

module.exports = ExternalExtension;
