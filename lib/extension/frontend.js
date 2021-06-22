const http = require('http');
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
        this.onMQTTPublishMessage = this.onMQTTPublishMessage.bind(this);
        this.mqtt.on('publishMessage', this.onMQTTPublishMessage);
        this.onWebSocketConnection = this.onWebSocketConnection.bind(this);
        this.server = http.createServer(this.onRequest);
        this.server.on('upgrade', this.onUpgrade);
        this.host = settings.get().frontend.host || '0.0.0.0';
        this.port = settings.get().frontend.port || 8080;
        this.authToken = settings.get().frontend.auth_token || false;
        this.retainedMessages = new Map();
        /* istanbul ignore next */
        const options = {setHeaders: (res, path) => {
            if (path.endsWith('index.html')) {
                res.setHeader('Cache-Control', 'no-store');
            }
        }};
        this.fileServer = serveStatic(frontend.getPath(), options);
        this.wss = new WebSocket.Server({noServer: true});
        this.wss.on('connection', this.onWebSocketConnection);
    }

    onZigbeeStarted() {
        this.server.listen(this.port, this.host);
        logger.info(`Started frontend on port ${this.host}:${this.port}`);
    }

    async stop() {
        for (const client of this.wss.clients) {
            client.send(stringify({topic: 'bridge/state', payload: 'offline'}));
            client.close();
        }

        return new Promise((resolve) => {
            this.server.close(resolve);
        });
    }
    onRequest(request, response) {
        this.fileServer(request, response, finalhandler(request, response));
    }
    authenticate(request, cb) {
        const {query} = url.parse(request.url, true);
        cb(!this.authToken || this.authToken === query.token);
    }

    onUpgrade(request, socket, head) {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.authenticate(request, (isAuthentificated) => {
                if (isAuthentificated) {
                    this.wss.emit('connection', ws, request);
                } else {
                    ws.close(4401, 'Unauthorized');
                }
            });
        });
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
            let payload = {};
            const resolvedEntity = this.zigbee.resolveEntity(device);
            if (this.state.exists(device.ieeeAddr)) {
                payload = {...payload, ...this.state.get(device.ieeeAddr)};
            }

            const lastSeen = settings.get().advanced.last_seen;
            if (lastSeen !== 'disable') {
                payload.last_seen = utils.formatDate(resolvedEntity.device.lastSeen, lastSeen);
            }

            if (resolvedEntity.device.linkquality !== undefined) {
                payload.linkquality = resolvedEntity.device.linkquality;
            }

            ws.send(stringify({topic: resolvedEntity.name, payload}));
        }
    }

    onMQTTPublishMessage(data) {
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
