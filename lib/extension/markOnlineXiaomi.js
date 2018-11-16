const utils = require('../util/utils');

/**
 * This extensions marks Xiaomi devices as online.
 */
class MarkOnlineXiaomi {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
    }

    onZigbeeStarted() {
        // Set all Xiaomi devices to be online, so shepherd won't try
        // to query info from devices (which would fail because they go to sleep).
        const devices = this.zigbee.getAllClients();
        devices.forEach((d) => {
            if (utils.isXiaomiDevice(d)) {
                const device = this.zigbee.shepherd.find(d.ieeeAddr, 1);
                if (device) {
                    device.getDevice().update({
                        status: 'online',
                        joinTime: Math.floor(Date.now() / 1000),
                    });
                }
            }
        });
    }
}

module.exports = MarkOnlineXiaomi;
