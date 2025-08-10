import fs from "node:fs";
import bind from "bind-decorator";
import type {IClientOptions, IClientPublishOptions, MqttClient} from "mqtt";
import {connectAsync} from "mqtt";
import type {Zigbee2MQTTAPI} from "./types/api";

import logger from "./util/logger";
import * as settings from "./util/settings";
import utils from "./util/utils";

const NS = "z2m:mqtt";

export interface MqttPublishOptions {
    clientOptions: IClientPublishOptions;
    baseTopic: string;
    skipLog: boolean;
    skipReceive: boolean;
    meta: {isEntityState?: boolean};
}

export default class Mqtt {
    private publishedTopics = new Set<string>();
    private connectionTimer?: NodeJS.Timeout;
    private client!: MqttClient;
    private eventBus: EventBus;
    private republishRetainedTimer?: NodeJS.Timeout;
    private defaultPublishOptions: MqttPublishOptions;
    public retainedMessages: {[s: string]: {topic: string; payload: string; options: MqttPublishOptions}} = {};

    get info() {
        return {
            version: this.client.options.protocolVersion,
            server: `${this.client.options.protocol}://${this.client.options.host}:${this.client.options.port}`,
        };
    }

    get stats() {
        return {
            connected: this.isConnected(),
            queued: this.client.queue.length,
        };
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

    async connect(): Promise<void> {
        const mqttSettings = settings.get().mqtt;

        logger.info(`Connecting to MQTT server at ${mqttSettings.server}`);

        const options: IClientOptions = {
            will: {
                topic: `${settings.get().mqtt.base_topic}/bridge/state`,
                payload: Buffer.from(JSON.stringify({state: "offline"})),
                retain: !settings.get().mqtt.force_disable_retain,
                qos: 1,
            },
            properties: {maximumPacketSize: mqttSettings.maximum_packet_size},
        };

        if (mqttSettings.version) {
            options.protocolVersion = mqttSettings.version;
        }

        if (mqttSettings.keepalive) {
            logger.debug(`Using MQTT keepalive: ${mqttSettings.keepalive}`);
            options.keepalive = mqttSettings.keepalive;
        }

        if (mqttSettings.ca) {
            logger.debug(`MQTT SSL/TLS: Path to CA certificate = ${mqttSettings.ca}`);
            options.ca = fs.readFileSync(mqttSettings.ca);
        }

        if (mqttSettings.key && mqttSettings.cert) {
            logger.debug(`MQTT SSL/TLS: Path to client key = ${mqttSettings.key}`);
            logger.debug(`MQTT SSL/TLS: Path to client certificate = ${mqttSettings.cert}`);
            options.key = fs.readFileSync(mqttSettings.key);
            options.cert = fs.readFileSync(mqttSettings.cert);
        }

        if (mqttSettings.user && mqttSettings.password) {
            logger.debug(`Using MQTT login with username: ${mqttSettings.user}`);
            options.username = mqttSettings.user;
            options.password = mqttSettings.password;
        } else if (mqttSettings.user) {
            logger.debug(`Using MQTT login with username only: ${mqttSettings.user}`);
            options.username = mqttSettings.user;
        } else {
            logger.debug("Using MQTT anonymous login");
        }

        if (mqttSettings.client_id) {
            logger.debug(`Using MQTT client ID: '${mqttSettings.client_id}'`);
            options.clientId = mqttSettings.client_id;
        }

        if (mqttSettings.reject_unauthorized !== undefined && !mqttSettings.reject_unauthorized) {
            logger.debug("MQTT reject_unauthorized set false, ignoring certificate warnings.");
            options.rejectUnauthorized = false;
        }

        this.client = await connectAsync(mqttSettings.server, options);

        // https://github.com/Koenkk/zigbee2mqtt/issues/9822
        this.client.stream.setMaxListeners(0);

        this.client.on("error", (err) => {
            logger.error(`MQTT error: ${err.message}`);
        });

        if (mqttSettings.version != null && mqttSettings.version >= 5) {
            this.client.on("disconnect", (packet) => {
                logger.error(`MQTT disconnect: reason ${packet.reasonCode} (${packet.properties?.reasonString})`);
            });
        }

        this.client.on("message", this.onMessage);

        await this.onConnect();

        this.client.on("connect", this.onConnect);

        this.republishRetainedTimer = setTimeout(async () => {
            // Republish retained messages in case MQTT broker does not persist them.
            // https://github.com/Koenkk/zigbee2mqtt/issues/9629
            for (const msg of Object.values(this.retainedMessages)) {
                await this.publish(msg.topic, msg.payload, msg.options);
            }
        }, 2000);

        // Set timer at interval to check if connected to MQTT server.
        this.connectionTimer = setInterval(() => {
            if (!this.isConnected()) {
                logger.error("Not connected to MQTT server!");
            }
        }, utils.seconds(10));
    }

    async disconnect(): Promise<void> {
        clearTimeout(this.connectionTimer);
        clearTimeout(this.republishRetainedTimer);

        const stateData: Zigbee2MQTTAPI["bridge/state"] = {state: "offline"};

        await this.publish("bridge/state", JSON.stringify(stateData), {clientOptions: {retain: true}});
        this.eventBus.removeListeners(this);
        logger.info("Disconnecting from MQTT server");
        await this.client?.endAsync();
    }

    async subscribe(topic: string): Promise<void> {
        await this.client.subscribeAsync(topic);
    }

    async unsubscribe(topic: string): Promise<void> {
        await this.client.unsubscribeAsync(topic);
    }

    @bind private async onConnect(): Promise<void> {
        logger.info("Connected to MQTT server");

        const stateData: Zigbee2MQTTAPI["bridge/state"] = {state: "online"};

        await this.publish("bridge/state", JSON.stringify(stateData), {clientOptions: {retain: true, qos: 1}});
        await this.subscribe(`${settings.get().mqtt.base_topic}/#`);
    }

    @bind public onMessage(topic: string, message: Buffer): void {
        // Since we subscribe to zigbee2mqtt/# we also receive the message we send ourselves, skip these.
        if (!this.publishedTopics.has(topic)) {
            logger.debug(() => `Received MQTT message on '${topic}' with data '${message.toString()}'`, NS);
            this.eventBus.emitMQTTMessage({topic, message: message.toString()});
        }

        if (this.republishRetainedTimer && topic === `${settings.get().mqtt.base_topic}/bridge/info`) {
            clearTimeout(this.republishRetainedTimer);

            this.republishRetainedTimer = undefined;
        }
    }

    isConnected(): boolean {
        return this.client && !this.client.reconnecting && !this.client.disconnecting && !this.client.disconnected;
    }

    async publish(topic: string, payload: string, options: Partial<MqttPublishOptions> = {}): Promise<void> {
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

        if (!this.isConnected()) {
            if (!finalOptions.skipLog) {
                logger.error("Not connected to MQTT server!");
                logger.error(`Cannot send message: topic: '${topic}', payload: '${payload}`);
            }
            return;
        }

        let clientOptions: IClientPublishOptions = finalOptions.clientOptions;
        if (settings.get().mqtt.force_disable_retain) {
            clientOptions = {...finalOptions.clientOptions, retain: false};
        }

        if (!finalOptions.skipLog) {
            logger.info(() => `MQTT publish: topic '${topic}', payload '${payload}'`, NS);
        }

        try {
            await this.client.publishAsync(topic, payload, clientOptions);
        } catch (error) {
            if (!finalOptions.skipLog) {
                logger.error(`MQTT server error: ${(error as Error).message}`);
                logger.error(`Could not send message: topic: '${topic}', payload: '${payload}`);
            }
        }
    }
}
