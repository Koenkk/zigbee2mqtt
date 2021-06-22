const mqtt = require('mqtt');
const logger = require('./util/logger');
const settings = require('./util/settings');
const fs = require('fs');
const events = require('events');

class MQTT extends events.EventEmitter {
    constructor() {
        super();
        this.onMessage = this.onMessage.bind(this);
        this.publishedTopics = new Set();
    }

    async connect() {
        const mqttSettings = settings.get().mqtt;
        logger.info(`Connecting to MQTT server at ${mqttSettings.server}`);

        const options = {
            will: {
                topic: `${settings.get().mqtt.base_topic}/bridge/state`,
                payload: 'offline',
                retain: settings.get().mqtt.force_disable_retain ? false : true,
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

        // Set timer at interval to check if connected to MQTT server.
        const interval = 10 * 1000; // seconds * 1000.
        this.connectionTimer = setInterval(() => {
            if (this.client.reconnecting) {
                logger.error('Not connected to MQTT server!');
            }
        }, interval);

        return new Promise((resolve) => {
            this.client = mqtt.connect(mqttSettings.server, options);

            const self = this;
            this.client.on('connect', () => {
                logger.info('Connected to MQTT server');
                self.subscribe(`${settings.get().mqtt.base_topic}/#`);
                self.publish('bridge/state', 'online', {retain: true, qos: 0});
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
        // Since we subscribe to zigbee2mqtt/# we also receive the message we send ourselves, skip these.
        if (!this.publishedTopics.has(topic)) {
            this.emit('message', {topic, message: message + ''});
        }
    }

    isConnected() {
        return this.client && !this.client.reconnecting;
    }

    async publish(topic, payload, options, base=settings.get().mqtt.base_topic, skipLog=false, skipReceive=true) {
        topic = `${base}/${topic}`;
        options = {qos: 0, retain: false, ...options};

        if (skipReceive) {
            this.publishedTopics.add(topic);
        }

        this.emit('publishMessage', {topic, payload, options});

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

        const actualOptions = {...options};
        if (settings.get().mqtt.force_disable_retain) {
            actualOptions.retain = false;
        }

        return new Promise((resolve) => {
            this.client.publish(topic, payload, actualOptions, () => {
                resolve();
            });
        });
    }
}

module.exports = MQTT;
