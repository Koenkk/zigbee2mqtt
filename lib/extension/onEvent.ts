import * as zhc from 'zigbee-herdsman-converters';

import utils from '../util/utils';
import Extension from './extension';

/**
 * This extension calls the zigbee-herdsman-converters onEvent.
 */
export default class OnEvent extends Extension {
    override async start(): Promise<void> {
        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            await this.callOnEvent(device, 'start', {});
        }

        this.eventBus.onDeviceMessage(this, (data) => this.callOnEvent(data.device, 'message', this.convertData(data)));
        this.eventBus.onDeviceJoined(this, (data) => this.callOnEvent(data.device, 'deviceJoined', this.convertData(data)));
        this.eventBus.onDeviceInterview(this, (data) => this.callOnEvent(data.device, 'deviceInterview', this.convertData(data)));
        this.eventBus.onDeviceAnnounce(this, (data) => this.callOnEvent(data.device, 'deviceAnnounce', this.convertData(data)));
        this.eventBus.onDeviceNetworkAddressChanged(this, (data) =>
            this.callOnEvent(data.device, 'deviceNetworkAddressChanged', this.convertData(data)),
        );
        this.eventBus.onEntityOptionsChanged(this, async (data) => {
            if (data.entity.isDevice()) {
                await this.callOnEvent(data.entity, 'deviceOptionsChanged', data).then(() => this.eventBus.emitDevicesChanged());
            }
        });
    }

    private convertData(data: KeyValue): KeyValue {
        return {...data, device: data.device.zh};
    }

    override async stop(): Promise<void> {
        await super.stop();

        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            await this.callOnEvent(device, 'stop', {});
        }
    }

    private async callOnEvent(device: Device, type: zhc.OnEventType, data: KeyValue): Promise<void> {
        if (device.options.disabled) return;
        const state = this.state.get(device);
        await zhc.onEvent(type, data, device.zh);

        if (device.definition?.onEvent) {
            const options: KeyValue = device.options;
            await device.definition.onEvent(type, data, device.zh, options, state);
        }
    }
}
