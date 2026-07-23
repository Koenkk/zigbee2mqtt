import fs from "node:fs";
import bind from "bind-decorator";
import type {IClientOptions, IClientPublishOptions, MqttClient as MqttJsClient} from "mqtt";

import type MessageBus from "./messageBus";
import type {MqttPublishOptions} from "./messageBus";
import type {Zigbee2MQTTAPI} from "./types/api";
import logger from "./util/logger";
import * as settings from "./util/settings";
import utils from "./util/utils";

const NS = "z2m:mqtt";

/** Optional network adapter that connects the local message bus to an MQTT broker. */
export default class MqttClient {
    private connectionTimer?: NodeJS.Timeout;
    private client!: MqttJsClient;
    private republishRetainedTimer?: NodeJS.Timeout;

    constructor(private messageBus: MessageBus) {}

    get info() {
        return {
            version: this.client.options.protocolVersion,
            server: `${this.client.options.protocol}://${this.client.options.host}:${this.client.options.port}`,
        };
    }

    get stats() {
        return {connected: this.isConnected(), queued: this.client.queue.length};
    }

    async connect(): Promise<void> {
        const mqttSettings = settings.get().mqtt;
        logger.info(`Connecting to MQTT server at ${mqttSettings.server}`);

        const options: IClientOptions = {
            will: {
                topic: `${mqttSettings.base_topic}/bridge/state`,
                payload: Buffer.from(JSON.stringify({state: "offline"})),
                retain: !mqttSettings.force_disable_retain,
                qos: 1,
            },
            properties: {maximumPacketSize: mqttSettings.maximum_packet_size},
        };

        if (mqttSettings.version) options.protocolVersion = mqttSettings.version;
        if (mqttSettings.keepalive) options.keepalive = mqttSettings.keepalive;
        if (mqttSettings.ca) options.ca = fs.readFileSync(mqttSettings.ca);
        if (mqttSettings.key && mqttSettings.cert) {
            options.key = fs.readFileSync(mqttSettings.key);
            options.cert = fs.readFileSync(mqttSettings.cert);
        }
        if (mqttSettings.user) options.username = mqttSettings.user;
        if (mqttSettings.password) options.password = mqttSettings.password;
        if (mqttSettings.client_id) options.clientId = mqttSettings.client_id;
        if (mqttSettings.reject_unauthorized === false) options.rejectUnauthorized = false;
        if (mqttSettings.server_name) options.servername = mqttSettings.server_name;

        // Keep MQTT.js out of WS-only deployments until a broker is explicitly enabled.
        const {connectAsync} = await import("mqtt");
        this.client = await connectAsync(mqttSettings.server, options);
        this.client.stream.setMaxListeners(0);
        this.client.on("error", (error) => logger.error(`MQTT error: ${error.message}`));
        if (mqttSettings.version != null && mqttSettings.version >= 5) {
            this.client.on("disconnect", (packet) => {
                logger.error(`MQTT disconnect: reason ${packet.reasonCode} (${packet.properties?.reasonString})`);
            });
        }
        this.client.on("message", this.onMessage);

        await this.onConnect();
        this.client.on("connect", this.onConnect);

        this.republishRetainedTimer = setTimeout(() => void this.republishRetainedMessages(), 2000);
        this.connectionTimer = setInterval(() => {
            if (!this.isConnected()) logger.error("Not connected to MQTT server!");
        }, utils.seconds(10));
    }

    async disconnect(): Promise<void> {
        clearTimeout(this.connectionTimer);
        clearTimeout(this.republishRetainedTimer);

        if (this.client) {
            await this.messageBus.publish("bridge/state", JSON.stringify({state: "offline"} satisfies Zigbee2MQTTAPI["bridge/state"]), {
                clientOptions: {retain: true},
            });
        }

        logger.info("Disconnecting from MQTT server");
        await this.client?.endAsync();
    }

    async subscribe(topic: string): Promise<void> {
        await this.client.subscribeAsync(topic);
    }

    async unsubscribe(topic: string): Promise<void> {
        await this.client.unsubscribeAsync(topic);
    }

    async publish(topic: string, payload: string, options: MqttPublishOptions): Promise<void> {
        if (!this.isConnected()) {
            if (!options.skipLog) {
                logger.error("Not connected to MQTT server!");
                logger.error(`Cannot send message: topic: '${topic}', payload: '${payload}`);
            }
            return;
        }

        let clientOptions: IClientPublishOptions = options.clientOptions;
        if (settings.get().mqtt.force_disable_retain) clientOptions = {...clientOptions, retain: false};

        if (!options.skipLog) logger.info(() => `MQTT publish: topic '${topic}', payload '${payload}'`, NS);

        try {
            await this.client.publishAsync(topic, payload, clientOptions);
        } catch (error) {
            if (!options.skipLog) {
                logger.error(`MQTT server error: ${(error as Error).message}`);
                logger.error(`Could not send message: topic: '${topic}', payload: '${payload}`);
            }
        }
    }

    @bind private async onConnect(): Promise<void> {
        logger.info("Connected to MQTT server");
        await this.messageBus.publish("bridge/state", JSON.stringify({state: "online"} satisfies Zigbee2MQTTAPI["bridge/state"]), {
            clientOptions: {retain: true, qos: 1},
        });
        await this.subscribe(`${settings.get().mqtt.base_topic}/#`);
    }

    @bind private onMessage(topic: string, message: Buffer): void {
        if (this.republishRetainedTimer && topic === `${settings.get().mqtt.base_topic}/bridge/info`) {
            clearTimeout(this.republishRetainedTimer);
            this.republishRetainedTimer = undefined;
        }

        this.messageBus.onMessage(topic, message);
    }

    private isConnected(): boolean {
        return this.client && !this.client.reconnecting && !this.client.disconnecting && !this.client.disconnected;
    }

    private async republishRetainedMessages(): Promise<void> {
        // Republish retained messages in case MQTT broker does not persist them.
        // https://github.com/Koenkk/zigbee2mqtt/issues/9629
        for (const message of Object.values(this.messageBus.retainedMessages)) {
            await this.messageBus.publish(message.topic, message.payload, message.options);
        }
    }
}
