const settings = require('../util/settings');
const Extension = require('./extension');
const utils = require('../util/utils');
const fs = require('fs');
const data = require('./../util/data');
const path = require('path');
const logger = require('./../util/logger');
const stringify = require('json-stable-stringify-without-jsonify');
const requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/extension/request/(.*)`);

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
        };
        this.loadUserDefinedExtensions();
    }
    getExtensionsBasePath() {
        return data.joinPath(this.extensionsBaseDir);
    }

    getListOfUserDefinedExtensions() {
        const basePath = this.getExtensionsBasePath();
        if (fs.existsSync(basePath)) {
            return fs.readdirSync(basePath).filter((f) => f.endsWith('.js')).reduce((result, fileName) => {
                const extensonFilePath = path.join(basePath, fileName);
                result[fileName] = fs.readFileSync(extensonFilePath, 'utf-8');
                return result;
            }, {});
        } else {
            return {};
        }
    }
    saveExtension({name, code}) {
        const ModuleConstructor = utils.loadModuleFromText(code);
        this.loadExtension(ModuleConstructor);
        const basePath = this.getExtensionsBasePath();
        /* istanbul ignore else */
        if (!fs.existsSync(basePath)) {
            fs.mkdirSync(basePath);
        }
        const extensonFilePath = path.join(basePath, name);
        fs.writeFileSync(extensonFilePath, code);
        this.publishExtensions();
        return utils.getResponse(`Extension ${name} loaded`, {}, null);
    }


    async onMQTTMessage(topic, message) {
        const match = topic.match(requestRegex);
        if (match && this.requestLookup[match[1].toLowerCase()]) {
            message = utils.parseJSON(message, message);
            try {
                const response = await this.requestLookup[match[1].toLowerCase()](message);
                await this.mqtt.publish(`bridge/extension/response/${match[1]}`, stringify(response));
            } catch (error) {
                logger.error(`Request '${topic}' failed with error: '${error.message}'`);
                const response = utils.getResponse(message, {}, error.message);
                await this.mqtt.publish(`bridge/extension/response/${match[1]}`, stringify(response));
            }
        }
    }

    loadExtension(ConstructorClass) {
        this.enableDisableExtension(false, ConstructorClass.name);
        this.addExtension(new ConstructorClass(...this.args, settings, logger));
    }

    loadUserDefinedExtensions() {
        const extensions = this.getListOfUserDefinedExtensions();
        Object.values(extensions)
            .map(utils.loadModuleFromText)
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