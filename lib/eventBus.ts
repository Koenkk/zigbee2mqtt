/* eslint-disable brace-style */
import events from 'events';
import * as ZHEvents from 'zigbee-herdsman/dist/controller/events';
import Extension from './extension/extension';

declare global {
    interface EventDeviceRenamed { device: Device, homeAssisantRename: boolean, from: string, to: string }
    // TODO: remove resolved entity, replace by Device
    interface EventDeviceRemoved { resolvedEntity: ResolvedEntity}
    type EventMQTTMessage = { topic: string, message: string };
    type EventMQTTMessagePublished = { topic: string, payload: string, options: {retain: boolean, qos: number} };
    type EventStateChange = { ID: string, from: KeyValue, to: KeyValue, reason: string | null, update: KeyValue };
    type EventPermitJoinChanged = ZHEvents.PermitJoinChangedPayload;
    type EventLastSeenChanged = { device: Device };
    type EventDeviceNetworkAddressChanged = { device: Device };
    type EventDeviceAnnounce = { device: Device };
    type EventDeviceInterview = { device: Device, status: 'started' | 'successful' | 'failed' };
    type EventDeviceJoined = { device: Device };
    type EventReportingDisabled = { device: ZHDevice }; // TODO zhdevice -> device
    type EventDeviceLeave = { ieeeAddr: string };
    type EventGroupMembersChanged = {
        group: Group, action: 'remove' | 'add' | 'remove_all', endpoint: ZHEndpoint, skipDisableReporting: boolean };
    type EventPublishEntityState = {
        // TODO: remove resolved entity, replace by Device | Group and remove ieeeAddr
        messagePayload: KeyValue, entity: ResolvedEntity, stateChangeReason: 'publishDebounce', payload: KeyValue,
        ieeeAddr: string,
    };
    type EventDeviceMessage = {
        type: ZHEvents.MessagePayloadType;
        device: Device;
        endpoint: ZHEndpoint;
        linkquality: number;
        groupID: number;
        cluster: string | number;
        data: KeyValue | Array<string | number>;
        meta: {
            zclTransactionSequenceNumber?: number;
        };
    };
}

type ListenerKey = string | Extension;

export default class EventBus {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    private callbacksByExtension: { [s: string]: { event: string, callback: (...args: any[]) => void }[] } = {};
    private emitter = new events.EventEmitter();

    constructor() {
        this.emitter.setMaxListeners(100);
    }

    public emitAdapterDisconnected(): void {this.emitter.emit('adapterDisconnected');}
    public onAdapterDisconnected(key: ListenerKey, callback: () => void): void {
        this.on('adapterDisconnected', callback, key);}

    public emitPermitJoinChanged(data: EventPermitJoinChanged): void {this.emitter.emit('permitJoinChanged', data);}
    public onPermitJoinChanged(key: ListenerKey, callback: (data: EventPermitJoinChanged) => void): void {
        this.on('permitJoinChanged', callback, key);}

    // public emitDeviceRenamed(data: EventDeviceRenamed): void {this.emitter.emit('deviceRenamed', data);}
    public onDeviceRenamed(key: ListenerKey, callback: (data: EventDeviceRenamed) => void): void {
        this.on('deviceRenamed', callback, key);}

    // public emitDeviceRemoved(data: EventDeviceRemoved): void {this.emitter.emit('deviceRemoved', data);}
    public onDeviceRemoved(key: ListenerKey, callback: (data: EventDeviceRemoved) => void): void {
        this.on('deviceRemoved', callback, key);}

    public emitLastSeenChanged(data: EventLastSeenChanged): void {this.emitter.emit('lastSeenChanged', data);}
    public onLastSeenChanged(key: ListenerKey, callback: (data: EventLastSeenChanged) => void): void {
        this.on('lastSeenChanged', callback, key);}

    public emitDeviceNetworkAddressChanged(data: EventDeviceNetworkAddressChanged): void {
        this.emitter.emit('deviceNetworkAddressChanged', data);}
    public onDeviceNetworkAddressChanged(
        key: ListenerKey, callback: (data: EventDeviceNetworkAddressChanged) => void): void {
        this.on('deviceNetworkAddressChanged', callback, key);}

    public emitDeviceAnnounce(data: EventDeviceAnnounce): void {this.emitter.emit('deviceAnnounce', data);}
    public onDeviceAnnounce(key: ListenerKey, callback: (data: EventDeviceAnnounce) => void): void {
        this.on('deviceAnnounce', callback, key);}

    public emitDeviceInterview(data: EventDeviceInterview): void {this.emitter.emit('deviceInterview', data);}
    public onDeviceInterview(key: ListenerKey, callback: (data: EventDeviceInterview) => void): void {
        this.on('deviceInterview', callback, key);}

    public emitDeviceJoined(data: EventDeviceJoined): void {this.emitter.emit('deviceJoined', data);}
    public onDeviceJoined(key: ListenerKey, callback: (data: EventDeviceJoined) => void): void {
        this.on('deviceJoined', callback, key);}

    public emitDeviceLeave(data: EventDeviceLeave): void {this.emitter.emit('deviceLeave', data);}
    public onDeviceLeave(key: ListenerKey, callback: (data: EventDeviceLeave) => void): void {
        this.on('deviceLeave', callback, key);}

    public emitDeviceMessage(data: EventDeviceMessage): void {this.emitter.emit('deviceMessage', data);}
    public onDeviceMessage(key: ListenerKey, callback: (data: EventDeviceMessage) => void): void {
        this.on('deviceMessage', callback, key);}

    public emitMQTTMessage(data: EventMQTTMessage): void {this.emitter.emit('mqttMessage', data);}
    public onMQTTMessage(key: ListenerKey, callback: (data: EventMQTTMessage) => void): void {
        this.on('mqttMessage', callback, key);}

    public emitMQTTMessagePublished(data: EventMQTTMessagePublished): void {
        this.emitter.emit('mqttMessagePublished', data);}
    public onMQTTMessagePublished(key: ListenerKey, callback: (data: EventMQTTMessagePublished) => void): void {
        this.on('mqttMessagePublished', callback, key);}

    // public emitPublishEntityState(data: EventPublishEntityState): void {
    //     this.emitter.emit('publishEntityState', data);}
    public onPublishEntityState(key: ListenerKey, callback: (data: EventPublishEntityState) => void): void {
        this.on('publishEntityState', callback, key);}

    public emitGroupMembersChanged(data: EventGroupMembersChanged): void {
        this.emitter.emit('groupMembersChanged', data);}
    public onGroupMembersChanged(key: ListenerKey, callback: (data: EventGroupMembersChanged) => void): void {
        this.on('groupMembersChanged', callback, key);}

    public emitDevicesChanged(): void {this.emitter.emit('devicesChanged');}
    public onDevicesChanged(key: ListenerKey, callback: () => void): void {this.on('devicesChanged', callback, key);}

    // public emitReportingDisabled(data: EventReportingDisabled): void {
    //     this.emitter.emit('reportingDisabled', data);}
    public onReportingDisabled(key: ListenerKey, callback: (data: EventReportingDisabled) => void): void {
        this.on('reportingDisabled', callback, key);}

    // public emitStateChange(data: EventStateChange): void {
    //     this.emitter.emit('stateChange', data);}
    public onStateChange(key: ListenerKey, callback: (data: EventStateChange) => void): void {
        this.on('stateChange', callback, key);}

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    private on(event: string, callback: (...args: any[]) => void, key: ListenerKey): void {
        key = typeof key === 'string' ? key : key.constructor.name;
        if (!this.callbacksByExtension[key]) this.callbacksByExtension[key] = [];
        this.callbacksByExtension[key].push({event, callback});
        this.emitter.on(event, callback);
    }

    // TODO: remove
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    emit(event: string, ...args: any[]): void {
        this.emitter.emit(event, ...args);
    }

    public removeListeners(key: ListenerKey): void {
        key = typeof key === 'string' ? key : key.constructor.name;
        this.callbacksByExtension[key]?.forEach((e) => this.emitter.removeListener(e.event, e.callback));
    }
}
