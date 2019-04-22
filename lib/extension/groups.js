const settings = require('../util/settings');
const logger = require('../util/logger');
const data = require('../util/data');
const fs = require('fs');
const diff = require('deep-diff');

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/.+/(remove|add|remove_all)$`);

class Groups {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
        this.onStateChange = this.onStateChange.bind(this);

        this.groupsFile = data.joinPathStorage('groups.json');
        this.groupsCache = {};
        if (fs.existsSync(this.groupsFile)) {
            this.groupsCache = JSON.parse(fs.readFileSync(this.groupsFile, 'utf8'));
        }
    }

    onMQTTConnected() {
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/+/remove`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/+/add`);
        this.mqtt.subscribe(`${settings.get().mqtt.base_topic}/bridge/group/+/remove_all`);
    }

    sortGroups(obj) {
        Object.keys(obj).forEach((key) => {
            obj[key] = obj[key].sort();
        });
    }

    applyGroups(from, to) {
        this.sortGroups(from);
        this.sortGroups(to);

        const differences = diff(from, to);
        if (differences) {
            differences.forEach((diff) => {
                const groupID = diff.path[0];

                if (diff.kind === 'N') {
                    diff.rhs.forEach((ieeeAddr) => this.updateGroup(ieeeAddr, 'add', groupID));
                } else if (diff.kind === 'A') {
                    if (diff.item.lhs) {
                        this.updateGroup(diff.item.lhs, 'remove', groupID);
                    } else {
                        this.updateGroup(diff.item.rhs, 'add', groupID);
                    }
                } else if (diff.kind === 'D') {
                    diff.lhs.forEach((ieeeAddr) => this.updateGroup(ieeeAddr, 'remove', groupID));
                } else if (diff.kind === 'E') {
                    this.updateGroup(diff.rhs, 'add', groupID);
                    this.updateGroup(diff.lhs, 'remove', groupID);
                }
            });
        }
    }

    getGroupOfDevice(ieeeAddr) {
        const settingsGroups = settings.get().groups || {};
        return Object.keys(settingsGroups).filter((groupID) => {
            const devices = settingsGroups[groupID].devices || [];
            return devices.includes(ieeeAddr);
        });
    }

    onStateChange(ieeeAddr, from, to) {
        const groups = this.getGroupOfDevice(ieeeAddr);

        if (from.state != to.state) {
            groups.forEach((groupID) => {
                this.publishEntityState(groupID, {state: to.state});
            });
        }
    }

    onZigbeeStarted() {
        this.state.registerOnStateChangeListener(this.onStateChange);

        const settingsGroups = settings.get().groups || {};
        Object.keys(settingsGroups).forEach((groupID) => {
            settingsGroups[groupID] = settingsGroups[groupID].devices || [];
        });

        this.applyGroups(this.groupsCache, settingsGroups);
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

    updateGroupCache(ieeeAddr, cmd, groupID) {
        if (cmd === 'add') {
            if (!this.groupsCache[groupID]) {
                this.groupsCache[groupID] = [];
            }

            this.groupsCache[groupID].push(ieeeAddr);
        } else if (cmd === 'remove') {
            if (this.groupsCache[groupID]) {
                this.groupsCache[groupID] = this.groupsCache[groupID].filter((device) => device != ieeeAddr);
            }
        } else if (cmd === 'remove_all') {
            Object.keys(this.groupsCache).forEach((groupID_) => {
                this.groupsCache[groupID_] = this.groupsCache[groupID_].filter((device) => device != ieeeAddr);
            });
        }

        fs.writeFileSync(this.groupsFile, JSON.stringify(this.groupsCache), 'utf8');
    }

    updateGroup(ieeeAddr, cmd, groupID, callback) {
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

                this.updateGroupCache(ieeeAddr, cmd, groupID);
            }

            if (callback) {
                callback(error);
            }
        };

        this.zigbee.publish(
            ieeeAddr, 'device', 'genGroups', cmd, 'functional',
            payload, null, null, cb,
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

        const callback = (error) => {
            if (!error) {
                if (topic.type === 'add') {
                    settings.addDeviceToGroup(groupID, ieeeAddr);
                } else if (topic.type === 'remove') {
                    settings.removeDeviceFromGroup(groupID, ieeeAddr);
                } else if (topic.type === 'remove_all') {
                    Object.keys(settings.get().groups).forEach((groupID) => {
                        const devices = settings.get().groups.devices;
                        if (devices && devices.includes(ieeeAddr)) {
                            settings.removeDeviceFromGroup(groupID, ieeeAddr);
                        }
                    });
                }
            }
        };

        // Send command to the device.
        this.updateGroup(ieeeAddr, topic.type, groupID, callback);

        return true;
    }
}

module.exports = Groups;
