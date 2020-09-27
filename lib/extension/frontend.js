const http = require('http');
const httpProxy = require('http-proxy');
const serveStatic = require('serve-static');
const finalhandler = require('finalhandler');
const Extension = require('./extension');
const logger = require('../util/logger');
const frontend = require('zigbee2mqtt-frontend');
const WebSocket = require('ws');
const url = require('url');
const settings = require('../util/settings');
const utils = require('../util/utils');
const stringify = require('json-stable-stringify-without-jsonify');

/**
 * This extension servers the frontend
 */
class Frontend extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.onRequest = this.onRequest.bind(this);
        this.onUpgrade = this.onUpgrade.bind(this);
        this.mqttBaseTopic = settings.get().mqtt.base_topic;
        this.onMQTTPublishedMessage = this.onMQTTPublishedMessage.bind(this);
        this.mqtt.on('publishedMessage', this.onMQTTPublishedMessage);
        this.onWebSocketConnection = this.onWebSocketConnection.bind(this);
        this.server = http.createServer(this.onRequest);
        this.server.on('upgrade', this.onUpgrade);
        this.developmentServer = settings.get().frontend.development_server;
        this.development = !!this.developmentServer;
        this.port = settings.get().frontend.port || 8080;
        this.retainedMessages = new Map();

        if (this.development) {
            this.proxy = httpProxy.createProxyServer({ws: true});
        } else {
            this.fileServer = serveStatic(frontend.getPath());
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
    }

    async stop() {
        for (const client of this.wss.clients) {
            client.close();
        }

        return new Promise((resolve) => {
            this.server.close(resolve);
        });
    }

    onRequest(request, response) {
        if (this.development) {
            this.proxy.web(request, response, {target: `http://${this.developmentServer}`});
        } else {
            this.fileServer(request, response, finalhandler(request, response));
        }
    }

    onUpgrade(request, socket, head) {
        const pathname = url.parse(request.url).pathname;
        if (pathname === '/api') {
            const wss = this.wss;
            wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
        } else if (this.development && pathname === '/sockjs-node') {
            this.proxy.ws(request, socket, head, {target: `ws://${this.developmentServer}`});
        } else {
            socket.destroy();
        }
    }

    onWebSocketConnection(ws) {
        ws.on('message', (message) => {
            if (message) {
                const {topic, payload} = utils.parseJSON(message, message);
                this.mqtt.onMessage(`${this.mqttBaseTopic}/${topic}`, stringify(payload));
            }
        });

        for (const [key, value] of this.retainedMessages) {
            ws.send(stringify({topic: key, payload: value}));
        }

        for (const device of this.zigbee.getClients()) {
            if (this.state.exists(device.ieeeAddr)) {
                const resolvedEntity = this.zigbee.resolveEntity(device);
                ws.send(stringify({topic: resolvedEntity.name, payload: this.state.get(device.ieeeAddr)}));
            }
        }
    }

    onMQTTPublishedMessage(data) {
        let {topic, payload, options} = data;
        if (topic.startsWith(`${this.mqttBaseTopic}/`)) {
            // Send topic without base_topic
            topic = topic.substring(this.mqttBaseTopic.length + 1);
            payload = utils.parseJSON(payload, payload);
            if (options.retain) {
                this.retainedMessages.set(topic, payload);
            }

            for (const client of this.wss.clients) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(stringify({topic, payload}));
                }
            }
        }
    }
}

module.exports = Frontend;
