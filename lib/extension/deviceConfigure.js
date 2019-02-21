const settings = require('../util/settings');
const logger = require('../util/logger');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const Queue = require('queue');

/**
 * This extensions handles configuration of devices.
 */
class DeviceConfigure {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.configured = [];
        this.attempts = {};

        this.queue = new Queue();
        this.queue.concurrency = 1;
        this.queue.autostart = true;
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

    configure(device, mappedDevice) {
        const ieeeAddr = device.ieeeAddr;

        if (!this.attempts.hasOwnProperty(ieeeAddr)) {
            this.attempts[ieeeAddr] = 0;
        }

        if (!this.configured.includes(ieeeAddr) && mappedDevice.configure) {
            const friendlyName = settings.getDevice(ieeeAddr) ? settings.getDevice(ieeeAddr).friendly_name : 'unknown';
            logger.debug(`Configuring ${friendlyName} (${ieeeAddr}) ...`);

            // Call configure function of this device.
            mappedDevice.configure(ieeeAddr, this.zigbee.shepherd, this.zigbee.getCoordinator(), (ok, msg) => {
                if (ok) {
                    logger.info(`Successfully configured ${friendlyName} (${ieeeAddr})`);
                } else {
                    logger.error(`Failed to configure ${friendlyName} (${ieeeAddr}) ('${msg}')`);
                }
            });

            this.queue.push((queueCallback) => {
                logger.debug(`Configuring ${friendlyName} (${ieeeAddr}) ...`);

                // Call configure function of this device.
                mappedDevice.configure(ieeeAddr, this.zigbee.shepherd, this.zigbee.getCoordinator(), (ok, msg) => {
                    if (ok) {
                        logger.info(`Succesfully configured ${friendlyName} (${ieeeAddr})`);
                        this.configured.push(ieeeAddr);
                    } else {
                        // If a device is not joined in the network the configure command may fail
                        // (especially, immediately after zigbee start)
                        // also, this command may fail if the network is busy or lost data packets
                        if (this.attempts[ieeeAddr] > 1) {
                            // Give up after 3 attempts.
                            this.configured.push(ieeeAddr);
                        }

                        logger.warn(
                            `Failed to configure ${friendlyName} (${ieeeAddr}) ('${msg}')` +
                            ` (attempt #${this.attempts[ieeeAddr] + 1})`
                        );

                        logger.warn(`This can be ignored if the device is working properly`);

                        this.attempts[ieeeAddr] += 1;
                    }

                    queueCallback();
                });
            });
        }
    }
}

module.exports = DeviceConfigure;
