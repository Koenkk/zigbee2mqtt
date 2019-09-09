const settings = require('../util/settings');
const logger = require('../util/logger');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');

class DeviceConfigure {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.configuring = new Set();
        this.attempts = {};
    }

    shouldConfigure(device, mappedDevice) {
        if (!device) {
            return false;
        }

        if (device.meta.hasOwnProperty('configured') && device.meta.configured === mappedDevice.meta.configureKey) {
            return false;
        }

        if (!mappedDevice || !mappedDevice.configure) {
            return false;
        }

        if (device.interviewing || !device.interviewCompleted) {
            return false;
        }

        return true;
    }

    async onZigbeeStarted() {
        this.coordinatorEndpoint = (await this.zigbee.getDevice({type: 'Coordinator'})).endpoints[0];

        const devices = await this.zigbee.getClients();
        for (const device of devices) {
            const mappedDevice = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
            const settingsDevice = settings.getDevice(device.ieeeAddr);
            if (this.shouldConfigure(device, mappedDevice)) {
                await this.configure(device, mappedDevice, settingsDevice);
            }
        }
    }

    onZigbeeEvent(type, data, mappedDevice, settingsDevice) {
        const device = data.device;
        if (this.shouldConfigure(device, mappedDevice)) {
            this.configure(device, mappedDevice, settingsDevice);
        }
    }

    async configure(device, mappedDevice, settingsDevice) {
        if (this.configuring.has(device.ieeeAddr) || this.attempts[device.ieeeAddr] >= 3) {
            return false;
        }

        this.configuring.add(device.ieeeAddr);

        if (!this.attempts.hasOwnProperty(device.ieeeAddr)) {
            this.attempts[device.ieeeAddr] = 0;
        }

        logger.info(`Configuring '${settingsDevice.friendlyName}'`);
        try {
            await mappedDevice.configure(device, this.coordinatorEndpoint);
            logger.info(`Succesfully configured '${settingsDevice.friendlyName}'`);
            // eslint-disable-next-line
            device.meta.configured = mappedDevice.meta.configureKey;
            await device.save();
        } catch (error) {
            logger.error(
                `Failed to configure '${settingsDevice.friendlyName}', ` +
                `attempt ${this.attempts[device.ieeeAddr] + 1} (${error})`
            );
            this.attempts[device.ieeeAddr]++;
        }

        this.configuring.delete(device.ieeeAddr);
    }
}

module.exports = DeviceConfigure;
