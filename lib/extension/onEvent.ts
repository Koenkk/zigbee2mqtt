import {onEvent, type OnEvent as ZhcOnEvent} from "zigbee-herdsman-converters";

import utils from "../util/utils";
import Extension from "./extension";

/**
 * This extension calls the zigbee-herdsman-converters onEvent.
 */
export default class OnEvent extends Extension {
    readonly #startCalled: Set<string> = new Set();

    #getOnEventBaseData(device: Device): ZhcOnEvent.BaseData {
        const deviceExposesChanged = (): void => this.eventBus.emitExposesAndDevicesChanged(device);
        const state = this.state.get(device);
        const options = device.options as KeyValue;
        return {deviceExposesChanged, device: device.zh, state, options};
    }

    // biome-ignore lint/suspicious/useAwait: API
    override async start(): Promise<void> {
        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            // don't await, in case of repeated failures this would hold startup
            this.callOnEvent(device, {type: "start", data: this.#getOnEventBaseData(device)}).catch(utils.noop);
        }

        this.eventBus.onDeviceJoined(this, async (data) => {
            await this.callOnEvent(data.device, {type: "deviceJoined", data: this.#getOnEventBaseData(data.device)});
        });
        this.eventBus.onDeviceLeave(this, async (data) => {
            if (data.device) {
                await this.callOnEvent(data.device, {type: "stop", data: {ieeeAddr: data.device.ieeeAddr}});
            }
        });
        this.eventBus.onEntityRemoved(this, async (data) => {
            if (data.entity.isDevice()) {
                await this.callOnEvent(data.entity, {type: "stop", data: {ieeeAddr: data.entity.ieeeAddr}});
            }
        });
        this.eventBus.onDeviceInterview(this, async (data) => {
            await this.callOnEvent(data.device, {type: "deviceInterview", data: {...this.#getOnEventBaseData(data.device), status: data.status}});
        });
        this.eventBus.onDeviceAnnounce(this, async (data) => {
            await this.callOnEvent(data.device, {type: "deviceAnnounce", data: this.#getOnEventBaseData(data.device)});
        });
        this.eventBus.onDeviceNetworkAddressChanged(this, async (data) => {
            await this.callOnEvent(data.device, {type: "deviceNetworkAddressChanged", data: this.#getOnEventBaseData(data.device)});
        });
        this.eventBus.onEntityOptionsChanged(this, async (data) => {
            if (data.entity.isDevice()) {
                await this.callOnEvent(data.entity, {
                    type: "deviceOptionsChanged",
                    data: {...this.#getOnEventBaseData(data.entity), from: data.from, to: data.to},
                });
                this.eventBus.emitDevicesChanged();
            }
        });
    }

    override async stop(): Promise<void> {
        await super.stop();

        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            await this.callOnEvent(device, {type: "stop", data: {ieeeAddr: device.ieeeAddr}});
        }
    }

    private async callOnEvent(device: Device, event: ZhcOnEvent.Event): Promise<void> {
        if (device.options.disabled) {
            return;
        }

        if (event.type === "start") {
            this.#startCalled.add(device.ieeeAddr);
        } else if (event.type !== "stop" && !this.#startCalled.has(device.ieeeAddr) && device.definition?.onEvent) {
            this.#startCalled.add(device.ieeeAddr);
            await device.definition.onEvent({type: "start", data: this.#getOnEventBaseData(device)});
        }

        await onEvent(event);
        await device.definition?.onEvent?.(event);

        if (event.type === "stop") {
            this.#startCalled.delete(device.ieeeAddr);
        }
    }
}
