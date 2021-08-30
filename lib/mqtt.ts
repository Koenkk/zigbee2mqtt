import mqtt from 'mqtt';
import logger from './util/logger';
import * as settings from './util/settings';
import {seconds} from './util/utils';
import fs from 'fs';

export default class MQTT {
    private publishedTopics: Set<string> = new Set();
    private connectionTimer: NodeJS.Timeout;
    private client: mqtt.MqttClient;
    private eventBus: EventBus;

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.onMessage = this.onMessage.bind(this);
        this.onConnect = this.onConnect.bind(this);
    }

    async connect(): Promise<void> {
        const mqttSettings = settings.get().mqtt;
        logger.info(`Connecting to MQTT server at ${mqttSettings.server}`);

        const options: mqtt.IClientOptions = {
            will: {
                topic: `${settings.get().mqtt.base_topic}/bridge/state`,
                payload: 'offline',
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

        if (mqttSettings.hasOwnProperty('reject_unauthorized') && !mqttSettings.reject_unauthorized) {
            logger.debug(`MQTT reject_unauthorized set false, ignoring certificate warnings.`);
            options.rejectUnauthorized = false;
        }

        return new Promise((resolve) => {
            this.client = mqtt.connect(mqttSettings.server, options);

            const onConnect = this.onConnect;
            this.client.on('connect', async () => {
                await onConnect();
                resolve();
            });

            this.client.on('message', this.onMessage);
        });
    }

    private async onConnect(): Promise<void> {
        // Set timer at interval to check if connected to MQTT server.
        clearTimeout(this.connectionTimer);
        this.connectionTimer = setInterval(() => {
            if (this.client.reconnecting) {
                logger.error('Not connected to MQTT server!');
            }
        }, seconds(10));

        logger.info('Connected to MQTT server');
        this.subscribe(`${settings.get().mqtt.base_topic}/#`);
        await this.publish('bridge/state', 'online', {retain: true, qos: 0});
    }

    async disconnect(): Promise<void> {
        clearTimeout(this.connectionTimer);
        await this.publish('bridge/state', 'offline', {retain: true, qos: 0});
        logger.info('Disconnecting from MQTT server');
        this.client.end();
    }

    subscribe(topic: string): void {
        this.client.subscribe(topic);
    }

    private onMessage(topic: string, message: string): void {
        // Since we subscribe to zigbee2mqtt/# we also receive the message we send ourselves, skip these.
        if (!this.publishedTopics.has(topic)) {
            this.eventBus.emitMQTTMessage({topic, message: message + ''});
        }
    }

    isConnected(): boolean {
        return this.client && !this.client.reconnecting;
    }

    async publish(topic: string, payload: string, options: {qos?: mqtt.QoS, retain?: boolean},
        base=settings.get().mqtt.base_topic, skipLog=false, skipReceive=true,
    ): Promise<void> {
        const defaultOptions: {qos: mqtt.QoS, retain: boolean} = {qos: 0, retain: false};
        topic = `${base}/${topic}`;

        if (skipReceive) {
            this.publishedTopics.add(topic);
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
            logger.info(`MQTT publish: topic '${topic}', payload '${payload}'`);
        }

        const actualOptions: mqtt.IClientPublishOptions = {...defaultOptions, ...options};
        if (settings.get().mqtt.force_disable_retain) {
            actualOptions.retain = false;
        }

        return new Promise((resolve) => {
            this.client.publish(topic, payload, actualOptions, () => resolve());
        });
    }
}
