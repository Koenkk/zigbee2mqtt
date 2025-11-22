import type {AdapterTypes as ZHAdapterTypes, Events as ZHEvents, Models as ZHModels} from "zigbee-herdsman";
import type {Cluster as ZHCluster, FrameControl as ZHFrameControl} from "zigbee-herdsman/dist/zspec/zcl/definition/tstype";

import type TypeEventBus from "../eventBus";
import type TypeExtension from "../extension/extension";
import type TypeDevice from "../model/device";
import type TypeGroup from "../model/group";
import type TypeMqtt from "../mqtt";
import type {MqttPublishOptions} from "../mqtt";
import type TypeState from "../state";
import type TypeZigbee from "../zigbee";
import type {Zigbee2MQTTDeviceOptions, Zigbee2MQTTGroupOptions, Zigbee2MQTTSettings} from "./api";

declare global {
    // Define some class types as global
    type EventBus = TypeEventBus;
    type Mqtt = TypeMqtt;
    type Zigbee = TypeZigbee;
    type Group = TypeGroup;
    type Device = TypeDevice;
    type State = TypeState;
    type Extension = TypeExtension;

    // Types
    type StateChangeReason = "publishDebounce" | "groupOptimistic" | "lastSeenChanged" | "publishCached" | "publishThrottle";
    type PublishEntityState = (entity: Device | Group, payload: KeyValue, stateChangeReason?: StateChangeReason) => Promise<void>;
    type RecursivePartial<T> = {[P in keyof T]?: RecursivePartial<T[P]>};
    type MakePartialExcept<T, K extends keyof T> = Partial<Omit<T, K>> & Pick<T, K>;
    interface KeyValue {
        // biome-ignore lint/suspicious/noExplicitAny: API
        [s: string]: any;
    }

    // zigbee-herdsman
    namespace zh {
        type Endpoint = ZHModels.Endpoint;
        type Device = ZHModels.Device;
        type Group = ZHModels.Group;
        type CoordinatorVersion = ZHAdapterTypes.CoordinatorVersion;
        type NetworkParameters = ZHAdapterTypes.NetworkParameters;
        interface Bind {
            cluster: ZHCluster;
            target: zh.Endpoint | zh.Group;
        }
    }

    namespace eventdata {
        type EntityRenamed = {entity: Device | Group; homeAssisantRename: boolean; from: string; to: string};
        type EntityRemoved = {entity: Device | Group; name: string};
        type MQTTMessage = {topic: string; message: string};
        type MQTTMessagePublished = {topic: string; payload: string; options: MqttPublishOptions};
        type StateChange = {
            entity: Device | Group;
            from: KeyValue;
            to: KeyValue;
            reason?: string;
            update: KeyValue;
        };
        type PermitJoinChanged = ZHEvents.PermitJoinChangedPayload;
        type LastSeenChanged = {
            device: Device;
            reason: "deviceAnnounce" | "networkAddress" | "deviceJoined" | "messageEmitted" | "messageNonEmitted";
        };
        type DeviceNetworkAddressChanged = {device: Device};
        type DeviceAnnounce = {device: Device};
        type DeviceInterview = {device: Device; status: "started" | "successful" | "failed"};
        type DeviceJoined = {device: Device};
        type EntityOptionsChanged = {entity: Device | Group; from: KeyValue; to: KeyValue};
        type ExposesChanged = {device: Device};
        type Reconfigure = {device: Device};
        type DeviceLeave = {ieeeAddr: string; name: string; device?: Device};
        type GroupMembersChanged = {group: Group; action: "remove" | "add" | "remove_all"; endpoint: zh.Endpoint; skipDisableReporting: boolean};
        type PublishEntityState = {entity: Group | Device; message: KeyValue; stateChangeReason?: StateChangeReason; payload: KeyValue};
        type DeviceMessage = {
            type: ZHEvents.MessagePayloadType;
            device: Device;
            endpoint: zh.Endpoint;
            linkquality: number;
            groupID: number; // XXX: should this be `?`
            cluster: string | number;
            data: KeyValue | Array<string | number>;
            meta: {zclTransactionSequenceNumber?: number; manufacturerCode?: number; frameControl?: ZHFrameControl; rawData: Buffer};
        };
        type ScenesChanged = {entity: Device | Group};
    }

    // Settings
    type Settings = Zigbee2MQTTSettings;

    type DeviceOptions = Zigbee2MQTTDeviceOptions;

    interface DeviceOptionsWithId extends DeviceOptions {
        ID: string;
    }

    type GroupOptions = Zigbee2MQTTGroupOptions;
}
