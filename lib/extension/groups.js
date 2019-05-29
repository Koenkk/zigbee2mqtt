const settings = require('../util/settings');
const logger = require('../util/logger');
const data = require('../util/data');
const utils = require('../util/utils');
const fs = require('fs');
const diff = require('deep-diff');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/.+/(remove|add|remove_all)$`);

class Groups {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
        this.onStateChange = this.onStateChange.bind(this);

        this.groupsCacheFile = data.joinPathStorage('groups_cache.json');
        this.groupsCache = this.readGroupsCache();
    }

    readGroupsCache() {
        return fs.existsSync(this.groupsCacheFile) ? JSON.parse(fs.readFileSync(this.groupsCacheFile, 'utf8')) : {};
    }

    writeGroupsCache() {
        fs.writeFileSync(this.groupsCacheFile, JSON.stringify(this.groupsCache), 'utf8');
    }

    onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/+/remove`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/+/add`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/+/remove_all`);
    }

    apply(from, to) {
        const sortGroups = (obj) => Object.keys(obj).forEach((key) => obj[key] = obj[key].sort());

        sortGroups(from);
        sortGroups(to);

        const differences = diff(from, to);
        if (differences) {
            differences.forEach((diff) => {
                const groupID = diff.path[0];

                if (diff.kind === 'N') {
                    diff.rhs.forEach((ieeeAddr) => this.updateDeviceGroup(ieeeAddr, 'add', groupID));
                } else if (diff.kind === 'A') {
                    if (diff.item.lhs) {
                        this.updateDeviceGroup(diff.item.lhs, 'remove', groupID);
                    } else {
                        this.updateDeviceGroup(diff.item.rhs, 'add', groupID);
                    }
                } else if (diff.kind === 'D') {
                    diff.lhs.forEach((ieeeAddr) => this.updateDeviceGroup(ieeeAddr, 'remove', groupID));
                } else if (diff.kind === 'E') {
                    this.updateDeviceGroup(diff.rhs, 'add', groupID);
                    this.updateDeviceGroup(diff.lhs, 'remove', groupID);
                }
            });
        }
    }

    getGroupsOfDevice(ieeeAddr) {
        return Object.keys(settings.getGroups()).filter((groupID) => {
            return settings.getGroup(groupID).devices.includes(ieeeAddr);
        });
    }

    onStateChange(ieeeAddr, from, to) {
        const properties = ['state', 'brightness', 'color_temp', 'color'];
        const payload = {};

        properties.forEach((prop) => {
            if (to.hasOwnProperty(prop) && (!from || from[prop] != to[prop])) {
                payload[prop] = to[prop];
            }
        });

        if (Object.keys(payload)) {
            const groups = this.getGroupsOfDevice(ieeeAddr);
            groups.forEach((groupID) => {
                this.publishEntityState(groupID, payload);
            });
        }
    }

    onZigbeeStarted() {
        this.state.registerOnStateChangeListener(this.onStateChange);

        const settingsGroups = {};
        Object.keys(settings.getGroups()).forEach((groupID) => {
            settingsGroups[groupID] = settings.getGroup(groupID).devices;
        });

        this.apply(this.groupsCache, settingsGroups);
    }

    parseTopic(topic) {
        if (!topic.match(topicRegex)) {
            return null;
        }

        // Remove base from topic
        topic = topic.replace(`${settings.get().mqtt.base_topic}/bridge/group/`, '');

        // Parse type from topic
        const type = topic.substr(topic.lastIndexOf('/') + 1, topic.length);

        // Remove type from topic
        topic = topic.replace(`/${type}`, '');

        return {friendly_name: topic, type};
    }

    updateDeviceGroup(ieeeAddr, cmd, groupID) {
        let payload = null;
        const orignalCmd = cmd;
        if (cmd === 'add') {
            payload = {groupid: groupID, groupname: ''};
            cmd = 'add';
        } else if (cmd === 'remove') {
            payload = {groupid: groupID};
            cmd = 'remove';
        } else if (cmd === 'remove_all') {
            payload = {};
            cmd = 'removeAll';
        }

        const cb = (error, rsp) => {
            if (error) {
                logger.error(`Failed to ${cmd} ${ieeeAddr} from ${groupID}`);
            } else {
                logger.info(`Successfully ${cmd} ${ieeeAddr} to ${groupID}`);

                // Log to MQTT
                this.mqtt.log({
                    device: settings.getDevice(ieeeAddr).friendly_name,
                    group: groupID,
                    action: orignalCmd,
                });

                // Update group cache
                if (cmd === 'add') {
                    if (!this.groupsCache[groupID]) {
                        this.groupsCache[groupID] = [];
                    }

                    if (!this.groupsCache[groupID].includes(ieeeAddr)) {
                        this.groupsCache[groupID].push(ieeeAddr);
                    }
                } else if (cmd === 'remove') {
                    if (this.groupsCache[groupID]) {
                        this.groupsCache[groupID] = this.groupsCache[groupID].filter((device) => device != ieeeAddr);
                    }
                } else if (cmd === 'removeAll') {
                    Object.keys(this.groupsCache).forEach((groupID_) => {
                        this.groupsCache[groupID_] = this.groupsCache[groupID_].filter((device) => device != ieeeAddr);
                    });
                }

                this.writeGroupsCache();

                // Update settings
                if (cmd === 'add') {
                    settings.addDeviceToGroup(groupID, ieeeAddr);
                } else if (cmd === 'remove') {
                    settings.removeDeviceFromGroup(groupID, ieeeAddr);
                } else if (cmd === 'removeAll') {
                    Object.keys(settings.get().groups).forEach((groupID) => {
                        settings.removeDeviceFromGroup(groupID, ieeeAddr);
                    });
                }
            }
        };

        let ieeeAddrWithoutPostfix = ieeeAddr;
        let endpointID = null;
        const postfix = utils.getPostfixes().find((p) => ieeeAddrWithoutPostfix.endsWith(`/${p}`));
        if (postfix) {
            // Found a postfix, retrieve the endpoint which correspodns to the postfix
            ieeeAddrWithoutPostfix = ieeeAddr.substring(0, ieeeAddr.length - (postfix.length + 1))
            const endpoint = utils.getEndpointByEntityID(this.zigbee, ieeeAddrWithoutPostfix, postfix);

            if (!endpoint) {
                return;
            }

            endpointID = endpoint.epId;
        }

        this.zigbee.publish(
            ieeeAddrWithoutPostfix, 'device', 'genGroups', cmd, 'functional',
            payload, null, endpointID, cb,
        );
    }

    onMQTTMessage(topic, message) {
        topic = this.parseTopic(topic);

        if (!topic) {
            return false;
        }

        // Find ID of this group.
        const groupID = settings.getGroupIDByFriendlyName(topic.friendly_name);
        if (!groupID) {
            logger.error(`Group with friendly_name '${topic.friendly_name}' doesn't exist`);
            return;
        }

        if (groupID === 99) {
            logger.error('Group 99 is reserved, please use a different groupID');
            return;
        }

        // Map message to ieeeAddr and check if device exist.
        message = message.toString();
        const ieeeAddr = settings.getIeeeAddrByFriendlyName(message) || message;
        if (!this.zigbee.getDevice(ieeeAddr)) {
            logger.error(`Failed to find device '${message}'`);
            return;
        }

        // Send command to the device.
        this.updateDeviceGroup(ieeeAddr, topic.type, groupID);

        return true;
    }
}

module.exports = Groups;
