import * as settings from '../util/settings';
import * as utils from '../util/utils';
import logger from '../util/logger';
// @ts-ignore
import stringify from 'json-stable-stringify-without-jsonify';
// @ts-ignore
import zhc from 'zigbee-herdsman-converters';
import ExtensionTS from './extensionts';
import bind from 'bind-decorator';
import Device from '../model/device';

/**
 * This extension calls the zigbee-herdsman-converters definition configure() method
 */
class Configure extends ExtensionTS {
    private configuring = new Set();
    private attempts: {[s: string]: number} = {};
    private topic = `${settings.get().mqtt.base_topic}/bridge/request/device/configure`;
    private legacyTopic = `${settings.get().mqtt.base_topic}/bridge/configure`;

    @bind private async onReportingDisabled(data: EventReportingDisabled): Promise<void> {
        // Disabling reporting unbinds some cluster which could be bound by configure, re-setup.
        const device = this.zigbee.resolveEntity(data.device) as Device; // TODO assert device

        if (device.zhDevice.meta?.hasOwnProperty('configured')) {
            delete device.zhDevice.meta.configured;
            device.zhDevice.save();
        }

        await this.configure(device, 'reporting_disabled');
    }

    // TODO remove trailing _
    @bind private async onMQTTMessage_(data: EventMQTTMessage): Promise<void> {
        if (data.topic === this.legacyTopic) {
            const device = this.zigbee.resolveEntity(data.message);
            if (!device || !(device instanceof Device)) {
                logger.error(`Device '${data.message}' does not exist`);
                return;
            }

            if (!device.definition || !device.definition.configure) {
                logger.warn(`Skipping configure of '${device.name}', device does not require this.`);
                return;
            }

            this.configure(device, 'mqtt_message', true);
        } else if (data.topic === this.topic) {
            const message = utils.parseJSON(data.message, data.message);
            const ID = typeof message === 'object' && message.hasOwnProperty('id') ? message.id : message;
            let error = null;

            const device = this.zigbee.resolveEntity(ID);
            if (!device || !(device instanceof Device)) {
                error = `Device '${ID}' does not exist`;
            } else if (!device.definition || !device.definition.configure) {
                error = `Device '${device.name}' cannot be configured`;
            } else {
                try {
                    await this.configure(device, 'mqtt_message', true, true);
                } catch (e) {
                    error = `Failed to configure (${e.message})`;
                }
            }

            const response = utils.getResponse(message, {id: ID}, error);
            await this.mqtt.publish(`bridge/response/device/configure`, stringify(response));
        }
    }

    override async start(): Promise<void> {
        for (const device of this.zigbee.getClients()) {
            await this.configure(device, 'started');
        }

        this.eventBus.onDeviceJoined(this, (data) => {
            if (data.device.zhDevice.meta.hasOwnProperty('configured')) {
                delete data.device.zhDevice.meta.configured;
                data.device.zhDevice.save();
            }

            this.configure(data.device, 'zigbee_event');
        });
        this.eventBus.onLastSeenChanged(this, (data) => this.configure(data.device, 'zigbee_event'));
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage_);
        this.eventBus.onReportingDisabled(this, this.onReportingDisabled);
    }

    private async configure(device: Device, event: 'started' | 'zigbee_event' | 'reporting_disabled' | 'mqtt_message',
        force=false, thowError=false): Promise<boolean> {
        if (!force) {
            if (!device.definition?.configure || device.zhDevice.interviewing) {
                return;
            }

            if (device.zhDevice.meta?.hasOwnProperty('configured') &&
                device.zhDevice.meta.configured === zhc.getConfigureKey(device.definition)) {
                return;
            }

            // Only configure end devices when it is active, otherwise it will likely fails as they are sleeping.
            if (device.zhDevice.type === 'EndDevice' && event !== 'zigbee_event') {
                return;
            }
        }

        if (this.configuring.has(device.ieeeAddr) || (this.attempts[device.ieeeAddr] >= 3 && !force)) {
            return false;
        }

        this.configuring.add(device.ieeeAddr);

        if (!this.attempts.hasOwnProperty(device.ieeeAddr)) {
            this.attempts[device.ieeeAddr] = 0;
        }

        logger.info(`Configuring '${device.name}'`);
        try {
            await device.definition.configure(device.zhDevice, this.zigbee.getFirstCoordinatorEndpoint(), logger);
            logger.info(`Successfully configured '${device.name}'`);
            device.zhDevice.meta.configured = zhc.getConfigureKey(device.definition);
            device.zhDevice.save();
            this.eventBus.emitDevicesChanged();
            this.eventBus.emit(`devicesChanged`);
        } catch (error) {
            this.attempts[device.ieeeAddr]++;
            const attempt = this.attempts[device.ieeeAddr];
            const msg = `Failed to configure '${device.name}', attempt ${attempt} (${error.stack})`;
            logger.error(msg);

            if (thowError) {
                throw error;
            }
        }

        this.configuring.delete(device.ieeeAddr);
    }
}

module.exports = Configure;
