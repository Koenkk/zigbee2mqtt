const http = require('http');
const mqtt = require('mqtt');
const httpProxy = require('http-proxy');
const nStatic = require('node-static');
const Extension = require('./extension');
const logger = require('../util/logger');
const frontend = require('zigbee2mqtt-frontend');
const WebSocket = require('ws');
const url = require('url');
const settings = require('../util/settings');
const utils = require('../util/utils');
const stringify = require('json-stable-stringify');

/**
 * This extension servers the frontend
 */
class Frontend extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.onRequest = this.onRequest.bind(this);
        this.onUpgrade = this.onUpgrade.bind(this);
        this.onMQTTClientMessage = this.onMQTTClientMessage.bind(this);
        this.onWebSocketConnection = this.onWebSocketConnection.bind(this);
        this.server = http.createServer(this.onRequest);
        this.server.on('upgrade', this.onUpgrade);
        this.developmentServer = settings.get().experimental.frontend.development_server;
        this.development = !!this.developmentServer;
        this.port = settings.get().experimental.frontend.port;
        this.retainedMessages = new Map();

        if (this.development) {
            this.proxy = httpProxy.createProxyServer({ws: true});
        } else {
            this.fileServer = new nStatic.Server(frontend.getPath());
        }

        this.wss = new WebSocket.Server({noServer: true});
        this.wss.on('connection', this.onWebSocketConnection);
    }

    onZigbeeStarted() {
        if (this.development) {
            logger.info(`Running frontend in development mode (${this.developmentServer})`);
        }

        this.server.listen(this.port);
        logger.info(`Started frontend on port ${this.port}`);

        const mqttSettings = settings.get().mqtt;
        this.mqttClient = this.client = mqtt.connect(mqttSettings.server, {});
        this.mqttClient.on('connect', () => {
            this.mqttClient.subscribe(`${settings.get().mqtt.base_topic}/#`);
        });
        this.mqttClient.on('message', this.onMQTTClientMessage);
    }

    onRequest(request, response) {
        if (this.development) {
            this.proxy.web(request, response, {target: `http://${this.developmentServer}`});
        } else {
            this.fileServer.serve(request, response);
        }
    }

    onUpgrade(request, socket, head) {
        const pathname = url.parse(request.url).pathname;
        if (pathname === '/api') {
            const wss = this.wss;
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        } else if (this.development && pathname === '/sockjs-node') {
            this.proxy.ws(request, socket, head, {target: `ws://${this.developmentServer}`});
        } else {
            socket.destroy();
        }
    }

    onWebSocketConnection(ws) {
        ws.on('message', (message) => {
            const parsedMessage = utils.parseJSON(message, message);

            this.mqtt.publish(parsedMessage.topic, stringify(parsedMessage.payload));
            console.log('received: %s', message);
        });

        for (const [key, value] of this.retainedMessages) {
            ws.send(stringify({topic: key, message: value}));
        }
    }

    onMQTTClientMessage(topic, message, packet) {
        // send topic without base_topic
        topic = topic.substring(settings.get().mqtt.base_topic.length + 1);
        message = message.toString();
        if (packet.retain || this.retainedMessages.has(topic)) {
            this.retainedMessages.set(topic, message);
        }
        this.wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(stringify({topic, message}));
            }
        });
    }
}

module.exports = Frontend;
