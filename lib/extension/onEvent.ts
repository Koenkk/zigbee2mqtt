// @ts-ignore
import zhc from 'zigbee-herdsman-converters';
import ExtensionTS from './extensionts';

/**
 * This extension calls the zigbee-herdsman-converters onEvent.
 */
class OnEvent extends ExtensionTS {
    override async start(): Promise<void> {
        for (const device of this.zigbee.getClients()) {
            await this.callOnEvent(device, 'start', {});
        }

        this.eventBus.onDeviceMessage(this, (data) => this.callOnEvent(data.device, 'message', this.convertData(data)));
        this.eventBus.onDeviceJoined(this,
            (data) => this.callOnEvent(data.device, 'deviceJoined', this.convertData(data)));
        this.eventBus.onDeviceInterview(this,
            (data) => this.callOnEvent(data.device, 'deviceInterview', this.convertData(data)));
        this.eventBus.onDeviceAnnounce(this,
            (data) => this.callOnEvent(data.device, 'deviceAnnounce', this.convertData(data)));
        this.eventBus.onDeviceNetworkAddressChanged(this,
            (data) => this.callOnEvent(data.device, 'deviceNetworkAddressChanged', this.convertData(data)));
    }

    private convertData(data: KeyValue): KeyValue {
        return {...data, device: data.device.zhDevice};
    }

    override async stop(): Promise<void> {
        super.stop();
        for (const device of this.zigbee.getClients()) {
            await this.callOnEvent(device, 'stop', {});
        }
    }

    private async callOnEvent(device: Device, type: string, data: KeyValue): Promise<void> {
        zhc.onEvent(type, data, device.zhDevice, device.settings);

        if (device.definition?.onEvent) {
            await device.definition.onEvent(type, data, device.zhDevice, device.settings);
        }
    }
}

module.exports = OnEvent;
