import events from 'events';

import logger from './util/logger';

type ListenerKey = object;

interface EventBusMap {
    adapterDisconnected: [];
    permitJoinChanged: [data: eventdata.PermitJoinChanged];
    publishAvailability: [];
    deviceRenamed: [data: eventdata.EntityRenamed];
    deviceRemoved: [data: eventdata.EntityRemoved];
    lastSeenChanged: [data: eventdata.LastSeenChanged];
    deviceNetworkAddressChanged: [data: eventdata.DeviceNetworkAddressChanged];
    deviceAnnounce: [data: eventdata.DeviceAnnounce];
    deviceInterview: [data: eventdata.DeviceInterview];
    deviceJoined: [data: eventdata.DeviceJoined];
    entityOptionsChanged: [data: eventdata.EntityOptionsChanged];
    exposesChanged: [data: eventdata.ExposesChanged];
    deviceLeave: [data: eventdata.DeviceLeave];
    deviceMessage: [data: eventdata.DeviceMessage];
    mqttMessage: [data: eventdata.MQTTMessage];
    mqttMessagePublished: [data: eventdata.MQTTMessagePublished];
    publishEntityState: [data: eventdata.PublishEntityState];
    groupMembersChanged: [data: eventdata.GroupMembersChanged];
    devicesChanged: [];
    scenesChanged: [data: eventdata.ScenesChanged];
    reconfigure: [data: eventdata.Reconfigure];
    stateChange: [data: eventdata.StateChange];
}
type EventBusListener<K> = K extends keyof EventBusMap
    ? EventBusMap[K] extends unknown[]
        ? (...args: EventBusMap[K]) => Promise<void> | void
        : never
    : never;

export default class EventBus {
    private callbacksByExtension: {[s: string]: {event: keyof EventBusMap; callback: EventBusListener<keyof EventBusMap>}[]} = {};
    private emitter = new events.EventEmitter<EventBusMap>();

    constructor() {
        this.emitter.setMaxListeners(100);
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

    public emitEntityRemoved(data: eventdata.EntityRemoved): void {
        this.emitter.emit('deviceRemoved', data);
    }
    public onEntityRemoved(key: ListenerKey, callback: (data: eventdata.EntityRemoved) => void): void {
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
    public onDeviceNetworkAddressChanged(key: ListenerKey, callback: (data: eventdata.DeviceNetworkAddressChanged) => void): void {
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

    public emitExposesChanged(data: eventdata.ExposesChanged): void {
        this.emitter.emit('exposesChanged', data);
    }
    public onExposesChanged(key: ListenerKey, callback: (data: eventdata.ExposesChanged) => void): void {
        this.on('exposesChanged', callback, key);
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

    public emitScenesChanged(data: eventdata.ScenesChanged): void {
        this.emitter.emit('scenesChanged', data);
    }
    public onScenesChanged(key: ListenerKey, callback: (data: eventdata.ScenesChanged) => void): void {
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

    private on<K extends keyof EventBusMap>(event: K, callback: EventBusListener<K>, key: ListenerKey): void {
        if (!this.callbacksByExtension[key.constructor.name]) {
            this.callbacksByExtension[key.constructor.name] = [];
        }

        const wrappedCallback = async (...args: never[]): Promise<void> => {
            try {
                await callback(...args);
            } catch (error) {
                logger.error(`EventBus error '${key.constructor.name}/${event}': ${(error as Error).message}`);
                logger.debug((error as Error).stack!);
            }
        };

        this.callbacksByExtension[key.constructor.name].push({event, callback: wrappedCallback});
        this.emitter.on(event, wrappedCallback as EventBusListener<K>);
    }

    public removeListeners(key: ListenerKey): void {
        this.callbacksByExtension[key.constructor.name]?.forEach((e) => this.emitter.removeListener(e.event, e.callback));
    }
}
