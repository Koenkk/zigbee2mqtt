const settings = require('../util/settings');
const logger = require('../util/logger');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');

/**
 * This extensions handles configuration of devices.
 */
class DeviceConfigure {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.configured = [];
    }

    onZigbeeStarted() {
        this.zigbee.getAllClients().forEach((device) => {
            const mappedDevice = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);

            if (mappedDevice) {
                this.configure(device, mappedDevice);
            }
        });
    }

    onZigbeeMessage(message, device, mappedDevice) {
        if (device && mappedDevice) {
            // endDeviceAnnce is typically send when a device comes online after being
            // powered off. In some cases this requires a re-configure of the device.
            // Mark this device as not configured.
            // https://github.com/Koenkk/zigbee2mqtt/issues/966
            if (message.type === 'endDeviceAnnce') {
                this.mark(device.ieeeAddr, false);
            }

            this.configure(device, mappedDevice);
        }
    }

    mark(ieeeAddr, configured) {
        if (configured) {
            if (!this.configured.includes(ieeeAddr)) {
                this.configured.push(ieeeAddr);
            }
        } else {
            const index = this.configured.indexOf(ieeeAddr);
            if (index > -1) {
                this.configured.splice(index, 1);
            }
        }
    }

    configure(device, mappedDevice) {
        const ieeeAddr = device.ieeeAddr;

        if (!this.configured.includes(ieeeAddr) && mappedDevice.configure) {
            const friendlyName = settings.getDevice(ieeeAddr) ? settings.getDevice(ieeeAddr).friendly_name : 'unknown';
            logger.debug(`Configuring ${friendlyName} (${ieeeAddr}) ...`);

            // Call configure function of this device.
            mappedDevice.configure(ieeeAddr, this.zigbee.shepherd, this.zigbee.getCoordinator(), (ok, msg) => {
                if (ok) {
                    logger.info(`Succesfully configured ${friendlyName} (${ieeeAddr})`);
                } else {
                    logger.error(`Failed to configure ${friendlyName} (${ieeeAddr}) ('${msg}')`);
                }
            });

            // Mark as configured
            this.mark(ieeeAddr, true);
        }
    }
}

module.exports = DeviceConfigure;
