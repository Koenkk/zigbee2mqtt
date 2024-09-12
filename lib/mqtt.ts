import type {QoS} from 'mqtt-packet';

import fs from 'fs';

import bind from 'bind-decorator';
import * as mqtt from 'mqtt';

import logger from './util/logger';
import * as settings from './util/settings';
import utils from './util/utils';

const NS = 'z2m:mqtt';

export default class MQTT {
    private publishedTopics: Set<string> = new Set();
    private connectionTimer?: NodeJS.Timeout;
    // @ts-expect-error initialized in `connect`
    private client: mqtt.MqttClient;
    private eventBus: EventBus;
    private initialConnect = true;
    private republishRetainedTimer?: NodeJS.Timeout;
    public retainedMessages: {
        [s: string]: {payload: string; options: MQTTOptions; skipLog: boolean; skipReceive: boolean; topic: string; base: string};
    } = {};

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
    }

    async connect(): Promise<void> {
        const mqttSettings = settings.get().mqtt;

        logger.info(`Connecting to MQTT server at ${mqttSettings.server}`);

        const options: mqtt.IClientOptions = {
            will: {
                topic: `${settings.get().mqtt.base_topic}/bridge/state`,
                payload: Buffer.from(utils.availabilityPayload('offline', settings.get())),
                retain: settings.get().mqtt.force_disable_retain ? false : true,
                qos: 1,
            },
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

        return await new Promise((resolve, reject) => {
            this.client = mqtt.connect(mqttSettings.server, options);
            // https://github.com/Koenkk/zigbee2mqtt/issues/9822
            this.client.stream.setMaxListeners(0);
            this.eventBus.onPublishAvailability(this, this.publishStateOnline);

            this.client.on('connect', async () => {
                // Set timer at interval to check if connected to MQTT server.
                clearTimeout(this.connectionTimer);
                this.connectionTimer = setInterval(() => {
                    if (this.client.reconnecting) {
                        logger.error('Not connected to MQTT server!');
                    }
                }, utils.seconds(10));

                logger.info('Connected to MQTT server');
                await this.publishStateOnline();

                if (!this.initialConnect) {
                    this.republishRetainedTimer = setTimeout(async () => {
                        // Republish retained messages in case MQTT broker does not persist them.
                        // https://github.com/Koenkk/zigbee2mqtt/issues/9629
                        for (const msg of Object.values(this.retainedMessages)) {
                            await this.publish(msg.topic, msg.payload, msg.options, msg.base, msg.skipLog, msg.skipReceive);
                        }
                    }, 2000);
                }

                this.initialConnect = false;
                this.subscribe(`${settings.get().mqtt.base_topic}/#`);
                resolve();
            });

            this.client.on('error', (err) => {
                logger.error(`MQTT error: ${err.message}`);
                reject(err);
            });

            this.client.on('message', this.onMessage);
        });
    }

    @bind async publishStateOnline(): Promise<void> {
        await this.publish('bridge/state', utils.availabilityPayload('online', settings.get()), {retain: true, qos: 0});
    }

    async disconnect(): Promise<void> {
        clearTimeout(this.connectionTimer);
        clearTimeout(this.republishRetainedTimer);
        await this.publish('bridge/state', utils.availabilityPayload('offline', settings.get()), {retain: true, qos: 0});
        this.eventBus.removeListeners(this);
        logger.info('Disconnecting from MQTT server');
        this.client?.end();
    }

    subscribe(topic: string): void {
        this.client.subscribe(topic);
    }

    unsubscribe(topic: string): void {
        this.client.unsubscribe(topic);
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
        return this.client && !this.client.reconnecting;
    }

    async publish(
        topic: string,
        payload: string,
        options: MQTTOptions = {},
        base = settings.get().mqtt.base_topic,
        skipLog = false,
        skipReceive = true,
    ): Promise<void> {
        const defaultOptions: {qos: QoS; retain: boolean} = {qos: 0, retain: false};
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
            /* istanbul ignore else */
            if (!skipLog) {
                logger.error(`Not connected to MQTT server!`);
                logger.error(`Cannot send message: topic: '${topic}', payload: '${payload}`);
            }

            return;
        }

        if (!skipLog) {
            logger.info(() => `MQTT publish: topic '${topic}', payload '${payload}'`, NS);
        }

        const actualOptions: mqtt.IClientPublishOptions = {...defaultOptions, ...options};

        if (settings.get().mqtt.force_disable_retain) {
            actualOptions.retain = false;
        }

        return await new Promise<void>((resolve) => {
            this.client.publish(topic, payload, actualOptions, () => resolve());
        });
    }
}
