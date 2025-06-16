import type { IClientPublishOptions } from "mqtt";
export interface MqttPublishOptions {
    clientOptions: IClientPublishOptions;
    baseTopic: string;
    skipLog: boolean;
    skipReceive: boolean;
    meta: {
        isEntityState?: boolean;
    };
}
export default class Mqtt {
    private publishedTopics;
    private connectionTimer?;
    private client;
    private eventBus;
    private republishRetainedTimer?;
    private defaultPublishOptions;
    retainedMessages: {
        [s: string]: {
            topic: string;
            payload: string;
            options: MqttPublishOptions;
        };
    };
    get info(): {
        version: 3 | 4 | 5 | undefined;
        server: string;
    };
    get stats(): {
        connected: boolean;
        queued: number;
    };
    constructor(eventBus: EventBus);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    subscribe(topic: string): Promise<void>;
    unsubscribe(topic: string): Promise<void>;
    private onConnect;
    onMessage(topic: string, message: Buffer): void;
    isConnected(): boolean;
    publish(topic: string, payload: string, options?: Partial<MqttPublishOptions>): Promise<void>;
}
//# sourceMappingURL=mqtt.d.ts.map