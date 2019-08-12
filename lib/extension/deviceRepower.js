const settings = require('../util/settings');

/**
 * This extensions inform about repowered devices (endDeviceAnnce).
 */
class ExtensionDeviceRepower {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
    }

    onZigbeeStarted() {}

    onMQTTConnected() {}

    onZigbeeMessage(message, device, mappedDevice) {
        if (message.type == 'endDeviceAnnce') {
            const settingsDevice = settings.getDevice(device.ieeeAddr);
            this.mqtt.publish('bridge/device_repower', settingsDevice.friendly_name, {retain: false, qos: 2});

            return;
        }
    }

    onMQTTMessage(topic, message) {
        return false;
    }

    stop() {}
}

module.exports = ExtensionDeviceRepower;
