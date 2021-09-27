import logger from '../../util/logger';
import * as settings from '../../util/settings';
import * as utils from '../../util/utils';
// @ts-ignore
import zigbeeHerdsmanConverters from 'zigbee-herdsman-converters';
import Extension from '../extension';
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/(.*)/availability`);
import bind from 'bind-decorator';

// Pingable end devices, some end devices should be pinged
// e.g. E11-G13 https://github.com/Koenkk/zigbee2mqtt/issues/775#issuecomment-453683846
const pingableEndDevices = [
    zigbeeHerdsmanConverters.definitions.find((d) => d.model === 'E11-G13'),
    zigbeeHerdsmanConverters.definitions.find((d) => d.model === 'E11-N1EA'),
    zigbeeHerdsmanConverters.definitions.find((d) => d.model === '53170161'),
];

const Hours25 = 1000 * 60 * 60 * 25;
const AvailabilityLagRatio = 0.1;


function timeoutLag(timeout: number, ratio: number): number {
    const lag = timeout * ratio;
    return Math.floor(Math.random() * Math.floor(lag));
}

/**
 * This extensions pings devices to check if they are online.
 */
export default class AvailabilityLegacy extends Extension {
    // eslint-disable-next-line
    private availability_timeout = settings.get().advanced.availability_timeout;
    private timers: KeyValue = {};
    private stateLookup: KeyValue = {};
    private blocklist = settings.get().advanced.availability_blocklist
        .concat(settings.get().advanced.availability_blacklist)
        .map((e) => settings.getDevice(e).ID);
    private passlist = settings.get().advanced.availability_passlist
        .concat(settings.get().advanced.availability_whitelist)
        .map((e) => settings.getDevice(e).ID);

    override async start(): Promise<void> {
        this.eventBus.onDeviceRemoved(this, this.onDeviceRemoved);
        this.eventBus.onDeviceRenamed(this, this.onDeviceRenamed);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onDeviceAnnounce(this, (data) => this.onZigbeeEvent_('deviceAnnounce', data.device));
        this.eventBus.onDeviceMessage(this, (data) => this.onZigbeeEvent_('dummy', data.device));
        this.eventBus.onDeviceJoined(this, (data) => this.onZigbeeEvent_('dummy', data.device));
        /* istanbul ignore next */
        this.eventBus.onDeviceNetworkAddressChanged(this, (data) => this.onZigbeeEvent_('dummy', data.device));

        for (const device of this.zigbee.devices(false)) {
            // Mark all devices as online on start
            const ieeeAddr = device.ieeeAddr;
            this.publishAvailability(device, this.stateLookup.hasOwnProperty(ieeeAddr) ?
                this.stateLookup[ieeeAddr] : true, true);

            if (this.inPasslistOrNotInBlocklist(device)) {
                if (this.isPingable(device)) {
                    this.setTimerPingable(device);
                } else {
                    this.timers[ieeeAddr] = setInterval(() => {
                        this.handleIntervalNotPingable(device);
                    }, utils.seconds(300));
                }
            }
        }
    }

    @bind onDeviceRenamed(data: eventdata.DeviceRenamed): void {
        this.mqtt.publish(`${data.from}/availability`, null, {retain: true, qos: 0});
    }

    /* istanbul ignore next */
    @bind onDeviceRemoved(data: eventdata.DeviceRemoved): void {
        this.mqtt.publish(`${data.name}/availability`, null, {retain: true, qos: 0});
        delete this.stateLookup[data.ieeeAddr];
        clearTimeout(this.timers[data.ieeeAddr]);
    }

    inPasslistOrNotInBlocklist(device: Device): boolean {
        const ieeeAddr = device.ieeeAddr;
        const deviceSettings = settings.getDevice(ieeeAddr);
        const name = deviceSettings && deviceSettings.friendly_name;

        // Passlist is not empty and device is in it, enable availability
        if (this.passlist.length > 0) {
            return this.passlist.includes(ieeeAddr) || (name && this.passlist.includes(name));
        }

        // Device is on blocklist, disable availability
        if (this.blocklist.includes(ieeeAddr) || (name && this.blocklist.includes(name))) {
            return false;
        }

        return true;
    }

    isPingable(device: Device): boolean {
        if (pingableEndDevices.find((d) => d.hasOwnProperty('zigbeeModel') &&
            d.zigbeeModel.includes(device.zh.modelID))) {
            return true;
        }

        // Device is a mains powered router
        return device.zh.type === 'Router' && device.zh.powerSource !== 'Battery';
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        // Clear topics for non-existing devices
        const match = data.topic.match(topicRegex);
        if (match && (!this.zigbee.resolveEntity(match[1]) ||
            this.zigbee.resolveEntity(match[1]).name !== match[1])) {
            this.mqtt.publish(`${match[1]}/availability`, null, {retain: true, qos: 0});
        }
    }

    async handleIntervalPingable(device: Device): Promise<void> {
        // When a device is already unavailable, log the ping failed on 'debug' instead of 'error'.
        /* istanbul ignore next */
        if (!device.zh) {
            logger.debug(`Stop pinging '${device.ieeeAddr}', device is not known anymore`);
            return;
        }

        const level = this.stateLookup.hasOwnProperty(device.ieeeAddr) &&
            !this.stateLookup[device.ieeeAddr] ? 'debug' : 'error';
        try {
            await device.zh.ping();
            this.publishAvailability(device, true);
            logger.debug(`Successfully pinged '${device.name}'`);
        } catch (error) {
            this.publishAvailability(device, false);
            logger[level](`Failed to ping '${device.name}'`);
        } finally {
            this.setTimerPingable(device);
        }
    }

    async handleIntervalNotPingable(device: Device): Promise<void> {
        /* istanbul ignore next */
        if (!device.zh.lastSeen) {
            return;
        }

        const ago = Date.now() - device.zh.lastSeen;
        logger.debug(`Non-pingable device '${device.name}' was last seen '${ago / 1000}' seconds ago.`);

        if (ago > Hours25) {
            this.publishAvailability(device, false);
        }
    }

    setTimerPingable(device: Device): void {
        const timeout = this.availability_timeout + timeoutLag(this.availability_timeout, AvailabilityLagRatio);
        clearTimeout(this.timers[device.ieeeAddr]);
        this.timers[device.ieeeAddr] = setTimeout(async () => {
            await this.handleIntervalPingable(device);
        }, utils.seconds(timeout));
    }

    override async stop(): Promise<void> {
        super.stop();
        for (const timer of Object.values(this.timers)) {
            clearTimeout(timer);
        }

        this.zigbee.devices(false).forEach((device) => this.publishAvailability(device, false));
    }

    async onReconnect(device: Device): Promise<void> {
        if (device.definition) {
            try {
                for (const key of ['state', 'brightness', 'color', 'color_temp']) {
                    const converter = device.definition.toZigbee.find((tz) => tz.key.includes(key));
                    if (converter) {
                        await converter.convertGet(device.zh.endpoints[0], key, {});
                    }
                }
            } catch (error) {
                logger.error(`Failed to read state of '${device.name}' after reconnect`);
            }
        }
    }

    private publishAvailability(device: Device, available: boolean, force=false): void {
        const ieeeAddr = device.ieeeAddr;
        if (this.stateLookup.hasOwnProperty(ieeeAddr) && !this.stateLookup[ieeeAddr] && available) {
            this.onReconnect(device);
        }

        const topic = `${device.name}/availability`;
        const payload = available ? 'online' : 'offline';
        if (this.stateLookup[ieeeAddr] !== available || force) {
            this.stateLookup[ieeeAddr] = available;
            this.mqtt.publish(topic, payload, {retain: true, qos: 0});
        }
    }

    onZigbeeEvent_(type: string, device: Device): Promise<void> {
        /* istanbul ignore next */
        if (!device) {
            return;
        }

        if (this.inPasslistOrNotInBlocklist(device)) {
            this.publishAvailability(device, true);

            if (this.isPingable(device)) {
                // When a zigbee message from a device is received we know the device is still alive.
                // => reset the timer.
                this.setTimerPingable(device);

                const online = this.stateLookup.hasOwnProperty(device.ieeeAddr) && this.stateLookup[device.ieeeAddr];
                if (online && type === 'deviceAnnounce' && !device.isIkeaTradfri()) {
                    /**
                     * In case the device is powered off AND on within the availability timeout,
                     * zigbee2qmtt does not detect the device as offline (device is still marked online).
                     * When a device is turned on again the state could be out of sync.
                     * https://github.com/Koenkk/zigbee2mqtt/issues/1383#issuecomment-489412168
                     * deviceAnnounce is typically send when a device comes online.
                     *
                     * This isn't needed for TRADFRI devices as they already send the state themself.
                     */
                    this.onReconnect(device);
                }
            }
        }
    }
}
