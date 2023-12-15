import events from 'events';
events.captureRejections = true;

// eslint-disable-next-line
type ListenerKey = object;

export default class EventBus {
    private callbacksByExtension: { [s: string]: { event: string, callback: (...args: unknown[]) => void }[] } = {};
    private emitter = new events.EventEmitter();

    constructor(onError: (error: Error) => void) {
        this.emitter.setMaxListeners(100);
        this.emitter.on('error', onError);
    }

    public emitAdapterDisconnected(): void {
        this.emitter.emit('adapterDisconnected');
    }
    public onAdapterDisconnected(key: ListenerKey, callback: () => void): void {
        this.on('adapterDisconnected', callback, key);
    }

    public emitPermitJoinChanged(data: eventdata.PermitJoinChanged): void {
        this.emitter.emit('permitJoinChanged', data);
    }
    public onPermitJoinChanged(key: ListenerKey, callback: (data: eventdata.PermitJoinChanged) => void): void {
        this.on('permitJoinChanged', callback, key);
    }

    public emitPublishAvailability(): void {
        this.emitter.emit('publishAvailability');
    }
    public onPublishAvailability(key: ListenerKey, callback: () => void): void {
        this.on('publishAvailability', callback, key);
    }

    public emitEntityRenamed(data: eventdata.EntityRenamed): void {
        this.emitter.emit('deviceRenamed', data);
    }
    public onEntityRenamed(key: ListenerKey, callback: (data: eventdata.EntityRenamed) => void): void {
        this.on('deviceRenamed', callback, key);
    }

    public emitDeviceRemoved(data: eventdata.DeviceRemoved): void {
        this.emitter.emit('deviceRemoved', data);
    }
    public onDeviceRemoved(key: ListenerKey, callback: (data: eventdata.DeviceRemoved) => void): void {
        this.on('deviceRemoved', callback, key);
    }

    public emitLastSeenChanged(data: eventdata.LastSeenChanged): void {
        this.emitter.emit('lastSeenChanged', data);
    }
    public onLastSeenChanged(key: ListenerKey, callback: (data: eventdata.LastSeenChanged) => void): void {
        this.on('lastSeenChanged', callback, key);
    }

    public emitDeviceNetworkAddressChanged(data: eventdata.DeviceNetworkAddressChanged): void {
        this.emitter.emit('deviceNetworkAddressChanged', data);
    }
    public onDeviceNetworkAddressChanged(
        key: ListenerKey, callback: (data: eventdata.DeviceNetworkAddressChanged) => void): void {
        this.on('deviceNetworkAddressChanged', callback, key);
    }

    public emitDeviceAnnounce(data: eventdata.DeviceAnnounce): void {
        this.emitter.emit('deviceAnnounce', data);
    }
    public onDeviceAnnounce(key: ListenerKey, callback: (data: eventdata.DeviceAnnounce) => void): void {
        this.on('deviceAnnounce', callback, key);
    }

    public emitDeviceInterview(data: eventdata.DeviceInterview): void {
        this.emitter.emit('deviceInterview', data);
    }
    public onDeviceInterview(key: ListenerKey, callback: (data: eventdata.DeviceInterview) => void): void {
        this.on('deviceInterview', callback, key);
    }

    public emitDeviceJoined(data: eventdata.DeviceJoined): void {
        this.emitter.emit('deviceJoined', data);
    }
    public onDeviceJoined(key: ListenerKey, callback: (data: eventdata.DeviceJoined) => void): void {
        this.on('deviceJoined', callback, key);
    }

    public emitEntityOptionsChanged(data: eventdata.EntityOptionsChanged): void {
        this.emitter.emit('entityOptionsChanged', data);
    }
    public onEntityOptionsChanged(key: ListenerKey, callback: (data: eventdata.EntityOptionsChanged) => void): void {
        this.on('entityOptionsChanged', callback, key);
    }

    public emitDeviceLeave(data: eventdata.DeviceLeave): void {
        this.emitter.emit('deviceLeave', data);
    }
    public onDeviceLeave(key: ListenerKey, callback: (data: eventdata.DeviceLeave) => void): void {
        this.on('deviceLeave', callback, key);
    }

    public emitDeviceMessage(data: eventdata.DeviceMessage): void {
        this.emitter.emit('deviceMessage', data);
    }
    public onDeviceMessage(key: ListenerKey, callback: (data: eventdata.DeviceMessage) => void): void {
        this.on('deviceMessage', callback, key);
    }

    public emitMQTTMessage(data: eventdata.MQTTMessage): void {
        this.emitter.emit('mqttMessage', data);
    }
    public onMQTTMessage(key: ListenerKey, callback: (data: eventdata.MQTTMessage) => void): void {
        this.on('mqttMessage', callback, key);
    }

    public emitMQTTMessagePublished(data: eventdata.MQTTMessagePublished): void {
        this.emitter.emit('mqttMessagePublished', data);
    }
    public onMQTTMessagePublished(key: ListenerKey, callback: (data: eventdata.MQTTMessagePublished) => void): void {
        this.on('mqttMessagePublished', callback, key);
    }

    public emitPublishEntityState(data: eventdata.PublishEntityState): void {
        this.emitter.emit('publishEntityState', data);
    }
    public onPublishEntityState(key: ListenerKey, callback: (data: eventdata.PublishEntityState) => void): void {
        this.on('publishEntityState', callback, key);
    }

    public emitGroupMembersChanged(data: eventdata.GroupMembersChanged): void {
        this.emitter.emit('groupMembersChanged', data);
    }
    public onGroupMembersChanged(key: ListenerKey, callback: (data: eventdata.GroupMembersChanged) => void): void {
        this.on('groupMembersChanged', callback, key);
    }

    public emitDevicesChanged(): void {
        this.emitter.emit('devicesChanged');
    }
    public onDevicesChanged(key: ListenerKey, callback: () => void): void {
        this.on('devicesChanged', callback, key);
    }

    public emitScenesChanged(): void {
        this.emitter.emit('scenesChanged');
    }
    public onScenesChanged(key: ListenerKey, callback: () => void): void {
        this.on('scenesChanged', callback, key);
    }

    public emitReconfigure(data: eventdata.Reconfigure): void {
        this.emitter.emit('reconfigure', data);
    }
    public onReconfigure(key: ListenerKey, callback: (data: eventdata.Reconfigure) => void): void {
        this.on('reconfigure', callback, key);
    }

    public emitStateChange(data: eventdata.StateChange): void {
        this.emitter.emit('stateChange', data);
    }
    public onStateChange(key: ListenerKey, callback: (data: eventdata.StateChange) => void): void {
        this.on('stateChange', callback, key);
    }

    private on(event: string, callback: (...args: unknown[]) => void, key: ListenerKey): void {
        if (!this.callbacksByExtension[key.constructor.name]) this.callbacksByExtension[key.constructor.name] = [];
        this.callbacksByExtension[key.constructor.name].push({event, callback});
        this.emitter.on(event, callback);
    }

    public removeListeners(key: ListenerKey): void {
        this.callbacksByExtension[key.constructor.name]?.forEach(
            (e) => this.emitter.removeListener(e.event, e.callback));
    }
}
