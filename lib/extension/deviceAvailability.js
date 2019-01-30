const logger = require('../util/logger');
const settings = require('../util/settings');
const utils = require('../util/utils');
const Queue = require('queue');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');

// Some EndDevices should be pinged
// e.g. E11-G13 https://github.com/Koenkk/zigbee2mqtt/issues/775#issuecomment-453683846
const pingableDevices = [
    zigbeeShepherdConverters.devices.find((d) => d.model === 'E11-G13'),
];

/**
 * This extensions set availability based on optionally polling router devices
 * and optionally check device publish with attribute reporting
 */
class DeviceAvailabilityHandler {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.availability_timeout = settings.get().advanced.availability_timeout;
        this.timers = {};
        this.pending = [];

        /**
         * Setup command queue.
         * The command queue ensures that only 1 command is executed at a time.
         * This is to avoid DDoSiNg of the coordinator.
         */
        this.queue = new Queue();
        this.queue.concurrency = 1;
        this.queue.autostart = true;
    }

    isPingable(device) {
        if (pingableDevices.find((d) => d.zigbeeModel.includes(device.modelId))) {
            return true;
        }

        return device.type === 'Router' && (device.powerSource && device.powerSource !== 'Battery');
    }

    getAllPingableDevices() {
        return this.zigbee.getAllClients().filter((d) => this.isPingable(d));
    }

    onMQTTConnected() {
        // As some devices are not checked for availability (e.g. battery powered devices)
        // we mark all device as online by default.
        this.zigbee.getDevices()
            .filter((d) => d.type !== 'Coordinator')
            .forEach((device) => this.publishAvailability(device.ieeeAddr, true));

        // Start timers for all devices
        this.getAllPingableDevices().forEach((device) => this.setTimer(device.ieeeAddr));
    }

    handleInterval(ieeeAddr) {
        // Check if a job is already pending.
        // This avoids overflowing of the queue in case the queue is not able to catch-up with the jobs being added.
        if (this.pending.includes(ieeeAddr)) {
            logger.debug(`Skipping ping for ${ieeeAddr} becuase job is already in queue`);
            return;
        }

        this.pending.push(ieeeAddr);

        this.queue.push((queueCallback) => {
            this.zigbee.ping(ieeeAddr, (error) => {
                if (error) {
                    logger.debug(`Failed to ping ${ieeeAddr}`);
                } else {
                    logger.debug(`Successfully pinged ${ieeeAddr}`);
                }

                this.publishAvailability(ieeeAddr, !error);

                // Remove from pending jobs.
                const index = this.pending.indexOf(ieeeAddr);
                if (index !== -1) {
                    this.pending.splice(index, 1);
                }

                this.setTimer(ieeeAddr);
                queueCallback();
            });
        });
    }

    setTimer(ieeeAddr) {
        if (this.timers[ieeeAddr]) {
            clearTimeout(this.timers[ieeeAddr]);
        }

        this.timers[ieeeAddr] = setTimeout(() => {
            this.handleInterval(ieeeAddr);
        }, utils.secondsToMilliseconds(this.availability_timeout));
    }

    stop() {
        this.queue.stop();

        this.zigbee.getDevices()
            .filter((d) => d.type !== 'Coordinator')
            .forEach((device) => this.publishAvailability(device.ieeeAddr, false));
    }

    publishAvailability(ieeeAddr, available) {
        const deviceSettings = settings.getDevice(ieeeAddr);
        const name = deviceSettings ? deviceSettings.friendly_name : ieeeAddr;
        const topic = `${name}/availability`;
        const payload = available ? 'online' : 'offline';
        this.mqtt.publish(topic, payload, {retain: true, qos: 0});
    }

    configure(device, mappedDevice) {
        const ieeeAddr = device.ieeeAddr;
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
    }

    onZigbeeMessage(message, device, mappedDevice) {
        // When a zigbee message from a device is received we know the device is still alive.
        // => reset the timer.
        if (device && this.isPingable(this.zigbee.getDevice(device.ieeeAddr))) {
            this.setTimer(device.ieeeAddr);
        }

       	if (message.type == 'devIncoming' || message.type == 'endDeviceAnnce') {
            logger.info('Announcement: Device incoming...');
            //check device for post announce handler
            if(device && mappedDevice && mappedDevice.configure) {
                //logger.info('Announcement: need to re-configure');
                this.configure(device,mappedDevice);
            }
	}
    }
}

module.exports = DeviceAvailabilityHandler;
