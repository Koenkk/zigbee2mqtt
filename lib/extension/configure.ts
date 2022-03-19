import * as settings from '../util/settings';
import utils from '../util/utils';
import logger from '../util/logger';
import stringify from 'json-stable-stringify-without-jsonify';
import zhc from 'zigbee-herdsman-converters';
import Extension from './extension';
import bind from 'bind-decorator';
import Device from '../model/device';

/**
 * This extension calls the zigbee-herdsman-converters definition configure() method
 */
export default class Configure extends Extension {
    private configuring = new Set();
    private attempts: {[s: string]: number} = {};
    private topic = `${settings.get().mqtt.base_topic}/bridge/request/device/configure`;
    private legacyTopic = `${settings.get().mqtt.base_topic}/bridge/configure`;

    @bind private async onReconfigure(data: eventdata.Reconfigure): Promise<void> {
        // Disabling reporting unbinds some cluster which could be bound by configure, re-setup.
        if (data.device.zh.meta?.hasOwnProperty('configured')) {
            delete data.device.zh.meta.configured;
            data.device.zh.save();
        }

        await this.configure(data.device, 'reporting_disabled');
    }

    @bind private async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
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
        for (const device of this.zigbee.devices(false)) {
            await this.configure(device, 'started');
        }

        this.eventBus.onDeviceJoined(this, (data) => {
            if (data.device.zh.meta.hasOwnProperty('configured')) {
                delete data.device.zh.meta.configured;
                data.device.zh.save();
            }

            this.configure(data.device, 'zigbee_event');
        });
        this.eventBus.onDeviceInterview(this, (data) => this.configure(data.device, 'zigbee_event'));
        this.eventBus.onLastSeenChanged(this, (data) => this.configure(data.device, 'zigbee_event'));
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onReconfigure(this, this.onReconfigure);
    }

    private async configure(device: Device, event: 'started' | 'zigbee_event' | 'reporting_disabled' | 'mqtt_message',
        force=false, thowError=false): Promise<void> {
        if (!force) {
            if (!device.definition?.configure || !device.zh.interviewCompleted) {
                return;
            }

            if (device.zh.meta?.hasOwnProperty('configured') &&
                device.zh.meta.configured === zhc.getConfigureKey(device.definition)) {
                return;
            }

            // Only configure end devices when it is active, otherwise it will likely fails as they are sleeping.
            if (device.zh.type === 'EndDevice' && event !== 'zigbee_event') {
                return;
            }
        }

        if (this.configuring.has(device.ieeeAddr) || (this.attempts[device.ieeeAddr] >= 3 && !force)) {
            return;
        }

        this.configuring.add(device.ieeeAddr);

        if (!this.attempts.hasOwnProperty(device.ieeeAddr)) {
            this.attempts[device.ieeeAddr] = 0;
        }

        logger.info(`Configuring '${device.name}'`);
        try {
            await device.definition.configure(device.zh, this.zigbee.firstCoordinatorEndpoint(), logger,
                device.options);
            logger.info(`Successfully configured '${device.name}'`);
            device.zh.meta.configured = zhc.getConfigureKey(device.definition);
            device.zh.save();
            this.eventBus.emitDevicesChanged();
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
