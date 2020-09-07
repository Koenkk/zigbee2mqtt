const settings = require('../util/settings');
const logger = require('../util/logger');
const Extension = require('./extension');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');

const sceneConverter = {
    'add': zigbeeHerdsmanConverters.toZigbeeConverters.scene_add,
    'view': zigbeeHerdsmanConverters.toZigbeeConverters.scene_view,
    'remove': zigbeeHerdsmanConverters.toZigbeeConverters.scene_remove,
    'remove_all': zigbeeHerdsmanConverters.toZigbeeConverters.scene_remove_all,
    'recall': zigbeeHerdsmanConverters.toZigbeeConverters.scene_recall,
    'store': zigbeeHerdsmanConverters.toZigbeeConverters.scene_store,
};


/**
 * This extension handles scenes
 */
class Scenes extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);

        this.topicRegExp = new RegExp(
            `^${settings.get().mqtt.base_topic}/bridge/request/scenes/(.+)/(${Object.keys(sceneConverter).join('|')})$`,
        );
    }

    onMQTTConnected() {
        for (let step = 1; step < 20; step++) {
            const topic = `${settings.get().mqtt.base_topic}/bridge/request/scenes/${'+/'.repeat(step)}`;
            for (const command of Object.keys(sceneConverter)) {
                this.mqtt.subscribe(`${topic}${command}`);
            }
        }
    }

    async onMQTTMessage(topic, message) {
        let nameEntity = null;
        let resolvedEntity = null;
        let command = null;
        let type = null;

        const topicRegexMatch = topic.match(this.topicRegExp);
        if (topicRegexMatch) {
            command = topicRegexMatch[2];
            if (!(command in sceneConverter)) {
                logger.error(`Command '${command} not in converter set (${Object.keys(sceneConverter).join(', ')})`);
                return {};
            }
            nameEntity = topicRegexMatch[1];
            resolvedEntity = this.zigbee.resolveEntity(nameEntity);
        } else {
            return {};
        }

        if (resolvedEntity) {
            if ((resolvedEntity.type == 'group') || (resolvedEntity.type == 'device')) {
                type = resolvedEntity.type;
            } else {
                logger.error(`'${nameEntity}' not a group or device`);
                return {};
            }
        } else {
            logger.error(`Group or device '${nameEntity}' does not exist`);
            return {};
        }

        let json = null;
        try {
            json = JSON.parse(message);
        } catch (e) {
            logger.error(`Invalid JSON '${message}', skipping...`);
            return {};
        }


        const options = resolvedEntity.settings;
        let device = null;
        const state = this.state.get(resolvedEntity.settings.ID) || {};
        let mapped = null;
        let target = null;
        if (type == 'device') {
            device = resolvedEntity.device;
            mapped = resolvedEntity.definition;
            target = resolvedEntity.endpoint;
        } else if (type == 'group') {
            device = null;
            mapped = resolvedEntity.group.members
                .map((e) => zigbeeHerdsmanConverters.findByDevice(e.getDevice())).filter((d) => d);
            target = resolvedEntity.group;
        }

        const meta = {
            endpoint_name: '???', // Todo
            options: options,
            message: json,
            logger,
            device: device,
            state: state,
            mapped: mapped,
        };


        let result = null;

        try {
            result = await sceneConverter[command].convertSet(target, '', json, meta);
        } catch (e) {
            logger.error(`Failed to call scene_${command} for ${resolvedEntity}`);
            return {};
        }

        if (result && result.state) {
            const msg = result.state;
            this.publishEntityState(resolvedEntity.settings.ID, msg);
        }
    }
}
module.exports = Scenes;
