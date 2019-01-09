const zigbeeShepherdConvertersDevices = require('zigbee-shepherd-converters').devices;
const settings = require('../util/settings');
const logger = require('../util/logger');

// IKEA TRADFRI remote control
const E1524 = zigbeeShepherdConvertersDevices.find((d) => d.model === 'E1524');

const devices = [E1524];

/**
 * This extensions adds the coordinator to a group which is required for some devices to work properly.
 */
class CoordinatorGroup {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishDeviceState = publishDeviceState;
    }

    onZigbeeStarted() {
        this.zigbee.getAllClients().forEach((device) => {
            devices.forEach((mappedDevice) => {
                if (mappedDevice.zigbeeModel.includes(device.modelId)) {
                    this.setup(mappedDevice, device);
                }
            });
        });
    }

    setup(mappedDevice, device) {
        const deviceLog = `${mappedDevice.vendor} ${mappedDevice.description} (${device.ieeeAddr})`;

        // Check if there is a coordinator_group defined for this device.
        const deviceSettings = settings.getDevice(device.ieeeAddr);
        if (!deviceSettings || !deviceSettings.coordinator_group) {
            logger.error(
                `Device ${deviceLog} requires extra configuration!` +
                ` Please see https://github.com/Koenkk/zigbee2mqtt/blob/dev/docs/getting_started/pairing_devices.md`
            );
            return;
        }

        // Add the coordinator to the group, first check if it's already in the group.
        const findPayload = {endpoint: 1, groupid: deviceSettings.coordinator_group};
        this.zigbee.shepherd.controller.request('ZDO', 'extFindGroup', findPayload, (error, data) => {
            if (error) {
                const addPayload = {endpoint: 1, groupid: deviceSettings.coordinator_group, namelen: 0, groupname: ''};
                this.zigbee.shepherd.controller.request('ZDO', 'extAddGroup', addPayload, (error, data) => {
                    if (!error) {
                        logger.info(`Sucesfully applied coordinator group for ${deviceLog}`);
                    } else {
                        logger.error(`Failed to apply coordinator group for ${deviceLog}`);
                    }
                });
            }

            logger.info(`Sucesfully applied coordinator group for ${deviceLog}`);
        });
    }
}

module.exports = CoordinatorGroup;
