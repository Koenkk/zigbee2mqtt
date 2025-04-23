import {onEvent} from "zigbee-herdsman-converters";

import utils from "../util/utils";
import Extension from "./extension";

/**
 * This extension calls the zigbee-herdsman-converters onEvent.
 */
export default class OnEvent extends Extension {
    // biome-ignore lint/suspicious/useAwait: API
    override async start(): Promise<void> {
        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            // don't await, in case of repeated failures this would hold startup
            this.callOnEvent(device, "start", {}).catch(utils.noop);
        }

        this.eventBus.onDeviceMessage(this, async (data) => {
            await this.callOnEvent(data.device, "message", {
                endpoint: data.endpoint,
                meta: data.meta,
                cluster: typeof data.cluster === "string" ? data.cluster : /* v8 ignore next */ undefined, // XXX: ZH typing is wrong?
                type: data.type,
                data: data.data, // XXX: typing is a bit convoluted: ZHC has `KeyValueAny` here while Z2M has `KeyValue | Array<string | number>`
            });
        });
        this.eventBus.onDeviceJoined(this, async (data) => {
            await this.callOnEvent(data.device, "deviceJoined", {});
        });
        this.eventBus.onDeviceLeave(this, async (data) => {
            if (data.device) {
                await this.callOnEvent(data.device, "stop", {});
            }
        });
        this.eventBus.onDeviceInterview(this, async (data) => {
            await this.callOnEvent(data.device, "deviceInterview", {});
        });
        this.eventBus.onDeviceAnnounce(this, async (data) => {
            await this.callOnEvent(data.device, "deviceAnnounce", {});
        });
        this.eventBus.onDeviceNetworkAddressChanged(this, async (data) => {
            await this.callOnEvent(data.device, "deviceNetworkAddressChanged", {});
        });
        this.eventBus.onEntityOptionsChanged(this, async (data) => {
            if (data.entity.isDevice()) {
                await this.callOnEvent(data.entity, "deviceOptionsChanged", {});
                this.eventBus.emitDevicesChanged();
            }
        });
    }

    override async stop(): Promise<void> {
        await super.stop();

        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            await this.callOnEvent(device, "stop", {});
        }
    }

    private async callOnEvent(device: Device, type: Parameters<typeof onEvent>[0], data: Parameters<typeof onEvent>[1]): Promise<void> {
        if (device.options.disabled) {
            return;
        }

        const state = this.state.get(device);
        const deviceExposesChanged = (): void => this.eventBus.emitExposesAndDevicesChanged(device);

        await onEvent(type, data, device.zh, {deviceExposesChanged});

        if (device.definition?.onEvent) {
            const options: KeyValue = device.options;
            await device.definition.onEvent(type, data, device.zh, options, state, {deviceExposesChanged});
        }
    }
}
