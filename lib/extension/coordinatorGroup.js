const zigbeeShepherdConvertersDevices = require('zigbee-shepherd-converters').devices;
const settings = require('../util/settings');
const logger = require('../util/logger');

// IKEA TRADFRI remote control
const E1524 = zigbeeShepherdConvertersDevices.find((d) => d.model === 'E1524');
const MLI_404011 = zigbeeShepherdConvertersDevices.find((d) => d.model === 'MLI-404011');

const devices = [E1524, MLI_404011];

/**
 * This extensions adds the coordinator to a group which is required for some devices to work properly.
 */
class CoordinatorGroup {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
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
                ` Please see https://www.zigbee2mqtt.io/getting_started/pairing_devices.html`
            );
            return;
        }

        // Add the coordinator to the group, first check if it's already in the group.
        this.zigbee.addCoordinatorToGroup(deviceSettings.coordinator_group, (error) => {
            if (!error) {
                logger.info(`Successfully applied coordinator group for ${deviceLog}`);
            } else {
                logger.error(`Failed to apply coordinator group for ${deviceLog}`);
            }
        });
    }
}

module.exports = CoordinatorGroup;
