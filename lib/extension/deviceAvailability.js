const logger = require('../util/logger');
const settings = require('../util/settings');
const utils = require('../util/utils');
const Queue = require('queue');

/**
 * This extensions set availability based on optionally polling router devices
 * and optionally check device publish with attribute reporting
 */
class DeviceAvailabilityHandler {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.availability_timeout = settings.get().experimental.availability_timeout;
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

    getAllPingableDevices() {
        return this.zigbee.getAllClients()
            .filter((d) => d.type === 'Router' && (d.powerSource && d.powerSource !== 'Battery'));
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
                    logger.debug(`Sucesfully pinged ${ieeeAddr}`);
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

    onZigbeeMessage(message, device, mappedDevice) {
        // When a zigbee message from a device is received we know the device is still alive.
        // => reset the timer.
        if (device) {
            this.setTimer(device.ieeeAddr);
        }
    }
}

module.exports = DeviceAvailabilityHandler;
