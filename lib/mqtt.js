const mqtt = require('mqtt');
const logger = require('./util/logger');
const settings = require('./util/settings');

class MQTT {
    constructor() {
        this.onConnect = this.onConnect.bind(this);
        this.onMessage = this.onMessage.bind(this);
        this.messageHandler = null;
    }

    connect(messageHandler, callback) {
        const mqttSettings = settings.get().mqtt;
        logger.info(`Connecting to MQTT server at ${mqttSettings.server}`);

        const options = {
            will: {
                topic: `${settings.get().mqtt.base_topic}/bridge/state`,
                payload: 'offline',
                retain: true,
            },
        };

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

        this.client = mqtt.connect(mqttSettings.server, options);

        // Register callbacks.
        this.client.on('connect', () => {
            this.onConnect();
            callback();
        });

        this.client.on('message', this.onMessage);

        // Set timer at interval to check if connected to MQTT server.
        const interval = 10 * 1000; // seconds * 1000.
        this.connectionTimer = setInterval(() => {
            if (this.client.reconnecting) {
                logger.error('Not connected to MQTT server!');
            }
        }, interval);

        this.messageHandler = messageHandler;
    }

    disconnect() {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;

        this.publish('bridge/state', 'offline', {retain: true, qos: 0}, () => {
            logger.info('Disconnecting from MQTT server');
            this.client.end();
        });
    }

    onConnect() {
        logger.info('Connected to MQTT server');
        this.publish('bridge/state', 'online', {retain: true, qos: 0});
    }

    subscribe(topic) {
        this.client.subscribe(topic);
    }

    onMessage(topic, message) {
        if (this.messageHandler) {
            this.messageHandler(topic, message);
        }
    }

    publish(topic, payload, options, callback, base=settings.get().mqtt.base_topic) {
        topic = `${base}/${topic}`;

        if (!this.client || this.client.reconnecting) {
            logger.error(`Not connected to MQTT server!`);
            logger.error(`Cannot send message: topic: '${topic}', payload: '${payload}`);
            return;
        }

        logger.info(`MQTT publish: topic '${topic}', payload '${payload}'`);
        this.client.publish(topic, payload, options, callback);
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
