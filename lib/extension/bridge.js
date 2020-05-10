/* istanbul ignore file newApi */

const logger = require('../util/logger');
const utils = require('../util/utils');
const Extension = require('./extension');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const settings = require('../util/settings');

const requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/(.*)`);

class BridgeLegacy extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);


        this.requestLookup = {
            'permitjoin': this.requestPermitJoin.bind(this),
            'device/remove': this.deviceRemove.bind(this),
            'device/forceremove': this.deviceForceRemove.bind(this),
            'device/ban': this.deviceBan.bind(this),
            'group/remove': this.groupRemove.bind(this),
        };
    }

    async onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/request/+`);
        await this.publishInfo();
        await this.publishDevices();
        await this.publishGroups();
    }

    async onMQTTMessage(topic, message) {
        const match = topic.match(requestRegex);
        if (match && this.requestLookup[match[1].toLowerCase()]) {
            message = JSON.parse(message);
            try {
                const response = await this.requestLookup[match[1].toLowerCase()](message);
                await this.mqtt.publish(`bridge/response/${match[1]}`, JSON.stringify(response));
            } catch (error) {
                logger.error(`Request '${topic}' failed with error: '${error.message}'`);
                const response = utils.getResponse(message, {}, error.message);
                await this.mqtt.publish(`bridge/response/${match[1]}`, JSON.stringify(response));
            }
        }
    }

    async onZigbeeEvent(type, data, resolvedEntity) {
        if (['deviceJoined', 'deviceLeave', 'deviceInterview'].includes(type)) {
            let payload;
            const ieeeAddress = data.device ? data.device.ieeeAddr : data.ieeeAddr;
            if (type === 'deviceJoined') payload = {friendlyName: resolvedEntity.settings.friendlyName, ieeeAddress};
            else if (type === 'deviceInterview') {
                payload = {friendlyName: resolvedEntity.settings.friendlyName, status: data.status, ieeeAddress};
                if (data.status === 'successful') {
                    payload.supported = !!resolvedEntity.definition;
                    payload.definition = resolvedEntity.definition ? {
                        model: resolvedEntity.definition.model,
                        vendor: resolvedEntity.definition.vendor,
                        description: resolvedEntity.definition.description,
                        supports: resolvedEntity.definition.supports,
                    } : null;
                }
            } else payload = {ieeeAddress}; // deviceLeave

            await this.mqtt.publish('bridge/event', JSON.stringify({type, data: payload}), {retain: false, qos: 0});
        }

        if ('deviceLeave' === type || ('deviceInterview' === type && data.status !== 'started')) {
            await this.publishDevices();
        }
    }

    /**
     * Requests
     */

    async deviceRemove(message) {
        return this.removeForceRemoveOrBanEntity('remove', 'device', message);
    }

    async deviceForceRemove(message) {
        return this.removeForceRemoveOrBanEntity('force_remove', 'device', message);
    }

    async deviceBan(message) {
        return this.removeForceRemoveOrBanEntity('ban', 'device', message);
    }

    async groupRemove(message) {
        return this.removeForceRemoveOrBanEntity('remove', 'group', message);
    }

    async requestPermitJoin(message) {
        const value = typeof message === 'object' ? message.value : message;
        await this.zigbee.permitJoin(value);
        await this.publishInfo();
        return utils.getResponse(message, {value: value}, null);
    }

    /**
     * Utils
     */

    async removeForceRemoveOrBanEntity(action, entityType, message) {
        const ID = typeof message === 'object' ? message.ID : message.trim();
        const entity = this.zigbee.resolveEntity(ID);
        if (!entity || entity.type !== entityType) {
            throw new Error(`${ID} is not a ${entityType}`);
        }

        const lookup = {
            ban: ['banned', 'Banning', 'ban'],
            force_remove: ['force_removed', 'Force removing', 'force remove'],
            remove: ['removed', 'Removing', 'remove'],
        };

        try {
            logger.info(`${lookup[action][1]} '${entity.settings.friendlyName}'`);
            if (entity.type === 'device') {
                if (action === 'ban') {
                    settings.banDevice(entity.settings.ID);
                }

                action === 'force_remove' ?
                    await entity.device.removeFromDatabase() : await entity.device.removeFromNetwork();
            } else {
                await entity.group.removeFromDatabase();
            }

            // Fire event
            if (entity.type === 'device') {
                this.eventBus.emit('deviceRemoved', {device: entity.device});
            }

            // Remove from configuration.yaml
            entity.type === 'device' ?
                settings.removeDevice(entity.settings.ID) : settings.removeGroup(entity.settings.ID);

            // Remove from state
            this.state.remove(entity.settings.ID);

            logger.info(`Successfully ${lookup[action][0]} ${entity.settings.friendlyName}`);
            entity.type === 'device' ? this.publishDevices() : this.publishGroups();
            return utils.getResponse(message, {ID}, null);
        } catch (error) {
            throw new Error(`Failed to ${lookup[action][2]} ${entity.settings.friendlyName} (${error})`);
        }
    }

    async publishInfo() {
        const info = await utils.getZigbee2mqttVersion();
        const coordinator = await this.zigbee.getCoordinatorVersion();
        const payload = {
            version: info.version,
            commit: info.commitHash,
            coordinator,
            logLevel: logger.getLevel(),
            permitJoin: await this.zigbee.getPermitJoin(),
        };

        await this.mqtt.publish('bridge/info', JSON.stringify(payload), {retain: true, qos: 0});
    }

    async publishDevices(topic, message) {
        const devices = this.zigbee.getClients().map((device) => {
            const definition = zigbeeHerdsmanConverters.findByDevice(device);
            const resolved = this.zigbee.resolveEntity(device);
            const definitionPayload = definition ? {
                model: definition.model,
                vendor: definition.vendor,
                description: definition.description,
                supports: definition.supports,
            } : null;

            return {
                ieeeAddress: device.ieeeAddr,
                type: device.type,
                networkAddress: device.networkAddress,
                supported: !!definition,
                friendlyName: resolved.settings.friendlyName,
                definition: definitionPayload,
                powerSource: device.powerSource,
                softwareBuildID: device.softwareBuildID,
                dateCode: device.dateCode,
                interviewing: device.interviewing,
                interviewCompleted: device.interviewCompleted,
            };
        });

        await this.mqtt.publish('bridge/devices', JSON.stringify(devices), {retain: true, qos: 0});
    }

    async publishGroups(topic, message) {
        const groups = this.zigbee.getGroups().map((group) => {
            const resolved = this.zigbee.resolveEntity(group);
            return {
                ID: group.groupID,
                friendlyName: resolved.settings.friendlyName,
                members: group.members.map((m) => {
                    return {
                        ieeeAddress: m.deviceIeeeAddress,
                        endpoint: m.ID,
                    };
                }),
            };
        });

        await this.mqtt.publish('bridge/groups', JSON.stringify(groups), {retain: true, qos: 0});
    }
}

module.exports = BridgeLegacy;
