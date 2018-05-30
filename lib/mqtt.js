const mqtt = require('mqtt');
const logger = require('./util/logger');
const settings = require('./util/settings');

class MQTT {
    constructor() {
        this.handleConnect = this.handleConnect.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
    }

    connect(onMessage, subscriptions, callback) {
        const mqttSettings = settings.get().mqtt;
        logger.info(`Connecting to MQTT server at ${mqttSettings.server}`);

        const options = {};
        if (mqttSettings.user && mqttSettings.password) {
            options.username = mqttSettings.user;
            options.password = mqttSettings.password;
        }

        this.client = mqtt.connect(mqttSettings.server, options);

        // Register callbacks.
        this.client.on('connect', () => {
            this.handleConnect();
            callback();
        });

        this.client.on('message', this.handleMessage);

        // Set timer at interval to check if connected to MQTT server.
        const interval = 10 * 1000; // seconds * 1000.
        this.connectionTimer = setInterval(() => {
            if (this.client.reconnecting) {
                logger.error('Not connected to MQTT server!');
            }
        }, interval);

        this.onMessage = onMessage;
        this.subscriptions = subscriptions;
    }

    disconnect() {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;

        this.publish('bridge/state', 'offline', {retain: true, qos: 0}, () => {
            logger.info('Disconnecting from MQTT server');
            this.client.end();
        });
    }

    handleConnect() {
        logger.info('Connected to MQTT server');
        this.publish('bridge/state', 'online', {retain: true, qos: 0});
        this.subscriptions.forEach((topic) => this.client.subscribe(topic));
    }

    handleMessage(topic, message) {
        if (this.onMessage) {
            this.onMessage(topic, message);
        }
    }

    publish(topic, payload, options, callback, baseTopic) {
        baseTopic = baseTopic ? baseTopic : settings.get().mqtt.base_topic;
        topic = `${baseTopic}/${topic}`;

        if (!this.client || this.client.reconnecting) {
            logger.error(`Not connected to MQTT server!`);
            logger.error(`Cannot send message: topic: '${topic}', payload: '${payload}`);
            return;
        }

        logger.info(`MQTT publish, topic: '${topic}', payload: '${payload}'`);
        this.client.publish(topic, payload, options, callback);
    }

    log(type, message) {
        const payload = {type: type, message: message};
        this.publish('bridge/log', JSON.stringify(payload), {retain: false});
    }
}

module.exports = MQTT;
