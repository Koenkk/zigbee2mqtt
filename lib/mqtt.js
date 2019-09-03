const mqtt = require('mqtt');
const logger = require('./util/logger');
const settings = require('./util/settings');
const fs = require('fs');
const events = require('events');

class MQTT extends events.EventEmitter {
    constructor() {
        super();
        this.onMessage = this.onMessage.bind(this);
    }

    async connect() {
        const mqttSettings = settings.get().mqtt;
        logger.info(`Connecting to MQTT server at ${mqttSettings.server}`);

        const options = {
            will: {
                topic: `${settings.get().mqtt.base_topic}/bridge/state`,
                payload: 'offline',
                retain: true,
            },
        };

        if (mqttSettings.ca) {
            logger.debug(`MQTT SSL/TLS: Path to CA certificate = ${mqttSettings.ca}`);
            const ca = fs.readFileSync(mqttSettings.ca);

            if (ca) {
                options.ca = ca;
            } else {
                logger.error(`Error loading CA certificate for MQTT SSL/TLS configuration.`);
            }
        }

        if (mqttSettings.key && mqttSettings.cert) {
            logger.debug(`MQTT SSL/TLS: Path to client key = ${mqttSettings.key}`);
            logger.debug(`MQTT SSL/TLS: Path to client certificate = ${mqttSettings.cert}`);

            const key = fs.readFileSync(mqttSettings.key);
            const cert = fs.readFileSync(mqttSettings.cert);

            if (key && cert) {
                options.key = key;
                options.cert = cert;
            } else {
                logger.error(`Error loading key and/or certificate for MQTT SSL/TLS client authentication.`);
            }
        }

        if (mqttSettings.user && mqttSettings.password) {
            options.username = mqttSettings.user;
            options.password = mqttSettings.password;
        }

        if (mqttSettings.client_id) {
            logger.debug(`Using MQTT client ID: '${mqttSettings.client_id}'`);
            options.clientId = mqttSettings.client_id;
        }

        if (mqttSettings.hasOwnProperty('reject_unauthorized') && !mqttSettings.reject_unauthorized) {
            logger.debug(`MQTT reject_unauthorized set false, ignoring certificate warnings.`);
            options.rejectUnauthorized = false;
        }

        // Set timer at interval to check if connected to MQTT server.
        const interval = 10 * 1000; // seconds * 1000.
        this.connectionTimer = setInterval(() => {
            if (this.client.reconnecting) {
                logger.error('Not connected to MQTT server!');
            }
        }, interval);

        return new Promise((resolve) => {
            this.client = mqtt.connect(mqttSettings.server, options);

            this.client.on('connect', () => {
                logger.info('Connected to MQTT server');
                this.publish('bridge/state', 'online', {retain: true, qos: 0});
                resolve();
            });

            this.client.on('message', this.onMessage);
        });
    }

    async disconnect() {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
        await this.publish('bridge/state', 'offline', {retain: true, qos: 0});
        logger.info('Disconnecting from MQTT server');
        this.client.end();
    }

    subscribe(topic) {
        this.client.subscribe(topic);
    }

    onMessage(topic, message) {
        this.emit('message', {topic, message});
    }

    async publish(topic, payload, options, base=settings.get().mqtt.base_topic) {
        topic = `${base}/${topic}`;
        options = {qos: 0, retain: false, ...options};

        if (!this.client || this.client.reconnecting) {
            logger.error(`Not connected to MQTT server!`);
            logger.error(`Cannot send message: topic: '${topic}', payload: '${payload}`);
            return;
        }

        logger.info(`MQTT publish: topic '${topic}', payload '${payload}'`);

        return new Promise((resolve) => {
            this.client.publish(topic, payload, options, () => resolve());
        });
    }

    log(type, message, meta=null) {
        const payload = {type, message};

        if (meta) {
            payload.meta = meta;
        }

        this.publish('bridge/log', JSON.stringify(payload), {retain: false});
    }
}

module.exports = MQTT;
