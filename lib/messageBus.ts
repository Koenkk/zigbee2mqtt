import logger from "./util/logger";
import * as settings from "./util/settings";

const NS = "z2m:mqtt";

/**
 * Shared publish options used by the local message bus and the optional MQTT adapter.
 * The shape intentionally mirrors MQTT.js publish options so existing extensions do not
 * need to know which transport is currently active.
 */
export interface MqttPublishOptions {
    clientOptions: {
        properties?: {messageExpiryInterval?: number};
        qos?: 0 | 1 | 2;
        retain?: boolean;
    };
    baseTopic: string;
    skipLog: boolean;
    skipReceive: boolean;
    meta: {isEntityState?: boolean};
}

export interface MqttAdapter {
    disconnect(): Promise<void>;
    readonly info: {server: string; version: number | undefined};
    publish(topic: string, payload: string, options: MqttPublishOptions): Promise<void>;
    readonly stats: {connected: boolean; queued: number};
    subscribe(topic: string): Promise<void>;
    unsubscribe(topic: string): Promise<void>;
}

/**
 * Local application message bus. The network MQTT connection is implemented by a separate
 * optional adapter.
 */
export default class MessageBus {
    private publishedTopics = new Set<string>();
    private eventBus: EventBus;
    private adapter: MqttAdapter | undefined;
    private defaultPublishOptions: MqttPublishOptions;
    public retainedMessages: {[s: string]: {topic: string; payload: string; options: MqttPublishOptions}} = {};

    get info() {
        return this.adapter?.info ?? {version: undefined, server: ""};
    }

    get stats() {
        return this.adapter?.stats ?? {connected: false, queued: 0};
    }

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.defaultPublishOptions = {
            clientOptions: {},
            baseTopic: settings.get().mqtt.base_topic,
            skipLog: false,
            skipReceive: true,
            meta: {},
        };
    }

    public setAdapter(adapter: MqttAdapter | undefined): void {
        this.adapter = adapter;
    }

    async subscribe(topic: string): Promise<void> {
        await this.adapter?.subscribe(topic);
    }

    async unsubscribe(topic: string): Promise<void> {
        await this.adapter?.unsubscribe(topic);
    }

    public onMessage(topic: string, message: Buffer): void {
        // Since we subscribe to zigbee2mqtt/# we also receive the message we send ourselves, skip these.
        if (!this.publishedTopics.has(topic)) {
            logger.debug(() => `Received MQTT message on '${topic}' with data '${message.toString()}'`, NS);
            this.eventBus.emitMQTTMessage({topic, message: message.toString()});
        }
    }

    async publish(topic: string, payload: string, options: Partial<MqttPublishOptions> = {}): Promise<void> {
        // TODO: add `options.validateTopic: boolean` to bypass these checks when topic is "controlled"
        if (topic.includes("+") || topic.includes("#")) {
            // https://github.com/Koenkk/zigbee2mqtt/issues/26939#issuecomment-2772309646
            logger.error(`Topic '${topic}' includes wildcard characters, skipping publish.`);
            return;
        }

        const finalOptions = {...this.defaultPublishOptions, ...options};
        topic = `${finalOptions.baseTopic}/${topic}`;

        if (finalOptions.skipReceive) {
            this.publishedTopics.add(topic);
        }

        if (finalOptions.clientOptions.retain) {
            if (payload) {
                this.retainedMessages[topic] = {payload, options: finalOptions, topic: topic.substring(finalOptions.baseTopic.length + 1)};
            } else {
                delete this.retainedMessages[topic];
            }
        }

        this.eventBus.emitMQTTMessagePublished({topic, payload, options: finalOptions});
        await this.adapter?.publish(topic, payload, finalOptions);
    }
}
