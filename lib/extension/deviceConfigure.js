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
        this.retry = {};
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
                    // if a device is not joined our network yet the configure command may fail
                    // (espacially, immediately after zigbee start)
                    // also, this command may fail if the network is busy or lost data packets
                    if (this.retry[ieeeAddr] < 3) {
                        const idx = this.configured.indexOf(ieeeAddr);
                        if (idx >= 0) {
                            this.configured = this.configured.splice(idx, 1);
                        }
                    }
                }
            });

            // Mark as configured
            this.mark(ieeeAddr, true);
            this.retry[ieeeAddr] += 1;
        }
    }
}

module.exports = DeviceConfigure;
