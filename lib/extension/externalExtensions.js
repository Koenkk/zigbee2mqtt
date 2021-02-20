const settings = require('../util/settings');
const Extension = require('./extension');
const utils = require('../util/utils');
const fs = require('fs');
const data = require('./../util/data');
const path = require('path');
const logger = require('./../util/logger');
const stringify = require('json-stable-stringify-without-jsonify');
const requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/extension/request/(.*)`);

class ExternalExtensions extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, addExtension, enableDisableExtension) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.args = [zigbee, mqtt, state, publishEntityState, eventBus];
        this.addExtension = addExtension;
        this.enableDisableExtension = enableDisableExtension;
        this.extensionsBaseDir = 'extension';
        this.requestLookup = {
            'save': this.saveExtension.bind(this),
            'read': this.readExtensionCode.bind(this),
        };
        this.loadUserDefinedExtensions();
    }
    getExtensonsBasePath() {
        return data.joinPath(this.extensionsBaseDir);
    }

    getListOfUserDefinedExtensions() {
        const basePath = this.getExtensonsBasePath();
        if (fs.existsSync(basePath)) {
            return fs.readdirSync(basePath).filter((f) => f.endsWith('.js'));
        } else {
            return [];
        }
    }
    saveExtension({name, content}) {
        const ModuleConstructor = utils.loadModuleFromText(content);
        const extensonFilePath = path.join(this.getExtensonsBasePath(), name);
        fs.writeFileSync(extensonFilePath, content);
        this.loadExtension(ModuleConstructor);
    }
    readExtensionCode({name}) {
        const extensonFilePath = path.join(this.getExtensonsBasePath(), name);
        return ({name, content: fs.readFileSync(extensonFilePath, 'utf-8')});
    }

    async onMQTTMessage(topic, message) {
        const match = topic.match(requestRegex);
        if (match && this.requestLookup[match[1].toLowerCase()]) {
            message = utils.parseJSON(message, message);
            try {
                const response = await this.requestLookup[match[1].toLowerCase()](message);
                await this.mqtt.publish(`extension/response/${match[1]}`, stringify(response));
            } catch (error) {
                logger.error(`Request '${topic}' failed with error: '${error.message}'`);
                const response = utils.getResponse(message, {}, error.message);
                await this.mqtt.publish(`extension/response/${match[1]}`, stringify(response));
            }
        }
    }

    loadExtension(ConstructorClass) {
        this.enableDisableExtension(false, ConstructorClass.name);
        this.addExtension((new ConstructorClass(...this.args, settings, logger)));
    }

    loadUserDefinedExtensions() {
        const extensions = this.getListOfUserDefinedExtensions();

        const extensionPath = this.getExtensonsBasePath();
        // TODO: this on this, in case if data folder located outside of z2m sources folder (ZIGBEE2MQTT_DATA)
        const basePath = path.join(path.dirname(require.main.filename), 'data', this.extensionsBaseDir);
        for (const extension of extensions) {
            const Extension = utils.loadModuleFromFile(path.join(extensionPath, extension), basePath);
            this.loadExtension(Extension);
        }
    }
    async onMQTTConnected() {
        this.publishExtensions();
    }

    async publishExtensions() {
        const extensions = this.getListOfUserDefinedExtensions();
        await this.mqtt.publish('extensions/list', stringify(extensions), {
            retain: true,
            qos: 0,
        }, settings.get().mqtt.base_topic, true);
    }
}

module.exports = ExternalExtensions;
