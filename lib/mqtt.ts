import type {IClientOptions, IClientPublishOptions, MqttClient} from 'mqtt';

import type {Zigbee2MQTTAPI} from './types/api';

import fs from 'node:fs';

import bind from 'bind-decorator';
import {connectAsync} from 'mqtt';

import logger from './util/logger';
import * as settings from './util/settings';
import utils from './util/utils';

const NS = 'z2m:mqtt';

export default class MQTT {
    private publishedTopics: Set<string> = new Set();
    private connectionTimer?: NodeJS.Timeout;
    private client!: MqttClient;
    private eventBus: EventBus;
    private republishRetainedTimer?: NodeJS.Timeout;
    public retainedMessages: {
        [s: string]: {payload: string; options: IClientPublishOptions; skipLog: boolean; skipReceive: boolean; topic: string; base: string};
    } = {};

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
    }

    async connect(): Promise<void> {
        const mqttSettings = settings.get().mqtt;

        logger.info(`Connecting to MQTT server at ${mqttSettings.server}`);

        const options: IClientOptions = {
            will: {
                topic: `${settings.get().mqtt.base_topic}/bridge/state`,
                payload: Buffer.from(JSON.stringify({state: 'offline'})),
                retain: settings.get().mqtt.force_disable_retain ? false : true,
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
            logger.debug(`Using MQTT anonymous login`);
        }

        if (mqttSettings.client_id) {
            logger.debug(`Using MQTT client ID: '${mqttSettings.client_id}'`);
            options.clientId = mqttSettings.client_id;
        }

        if (mqttSettings.reject_unauthorized !== undefined && !mqttSettings.reject_unauthorized) {
            logger.debug(`MQTT reject_unauthorized set false, ignoring certificate warnings.`);
            options.rejectUnauthorized = false;
        }

        this.client = await connectAsync(mqttSettings.server, options);

        // https://github.com/Koenkk/zigbee2mqtt/issues/9822
        this.client.stream.setMaxListeners(0);

        this.client.on('error', (err) => {
            logger.error(`MQTT error: ${err.message}`);
        });

        if (mqttSettings.version != undefined && mqttSettings.version >= 5) {
            this.client.on('disconnect', (packet) => {
                logger.error(`MQTT disconnect: reason ${packet.reasonCode} (${packet.properties?.reasonString})`);
            });
        }

        this.client.on('message', this.onMessage);

        await this.onConnect();

        this.client.on('connect', this.onConnect);

        this.republishRetainedTimer = setTimeout(async () => {
            // Republish retained messages in case MQTT broker does not persist them.
            // https://github.com/Koenkk/zigbee2mqtt/issues/9629
            for (const msg of Object.values(this.retainedMessages)) {
                await this.publish(msg.topic, msg.payload, msg.options, msg.base, msg.skipLog, msg.skipReceive);
            }
        }, 2000);

        // Set timer at interval to check if connected to MQTT server.
        this.connectionTimer = setInterval(() => {
            if (!this.isConnected()) {
                logger.error('Not connected to MQTT server!');
            }
        }, utils.seconds(10));
    }

    async disconnect(): Promise<void> {
        clearTimeout(this.connectionTimer);
        clearTimeout(this.republishRetainedTimer);

        const stateData: Zigbee2MQTTAPI['bridge/state'] = {state: 'offline'};

        await this.publish('bridge/state', JSON.stringify(stateData), {retain: true, qos: 0});
        this.eventBus.removeListeners(this);
        logger.info('Disconnecting from MQTT server');
        await this.client?.endAsync();
    }

    async subscribe(topic: string): Promise<void> {
        await this.client.subscribeAsync(topic);
    }

    async unsubscribe(topic: string): Promise<void> {
        await this.client.unsubscribeAsync(topic);
    }

    @bind private async onConnect(): Promise<void> {
        logger.info('Connected to MQTT server');

        const stateData: Zigbee2MQTTAPI['bridge/state'] = {state: 'online'};

        await this.publish('bridge/state', JSON.stringify(stateData), {retain: true, qos: 0});
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

    async publish(
        topic: string,
        payload: string,
        options: IClientPublishOptions = {},
        base = settings.get().mqtt.base_topic,
        skipLog = false,
        skipReceive = true,
    ): Promise<void> {
        const defaultOptions = {qos: 0 as const, retain: false};
        topic = `${base}/${topic}`;

        if (skipReceive) {
            this.publishedTopics.add(topic);
        }

        if (options.retain) {
            if (payload) {
                this.retainedMessages[topic] = {payload, options, skipReceive, skipLog, topic: topic.substring(base.length + 1), base};
            } else {
                delete this.retainedMessages[topic];
            }
        }

        this.eventBus.emitMQTTMessagePublished({topic, payload, options: {...defaultOptions, ...options}});

        if (!this.isConnected()) {
            if (!skipLog) {
                logger.error(`Not connected to MQTT server!`);
                logger.error(`Cannot send message: topic: '${topic}', payload: '${payload}`);
            }

            return;
        }

        if (!skipLog) {
            logger.info(() => `MQTT publish: topic '${topic}', payload '${payload}'`, NS);
        }

        const actualOptions: IClientPublishOptions = {...defaultOptions, ...options};

        if (settings.get().mqtt.force_disable_retain) {
            actualOptions.retain = false;
        }

        try {
            await this.client.publishAsync(topic, payload, actualOptions);
        } catch (error) {
            if (!skipLog) {
                logger.error(`MQTT server error: ${(error as Error).message}`);
                logger.error(`Could not send message: topic: '${topic}', payload: '${payload}`);
            }
        }
    }
}
