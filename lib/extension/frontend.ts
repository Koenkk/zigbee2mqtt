import bind from 'bind-decorator';
import gzipStatic, {RequestHandler} from 'connect-gzip-static';
import finalhandler from 'finalhandler';
import fs from 'fs';
import http from 'http';
import https from 'https';
import stringify from 'json-stable-stringify-without-jsonify';
import net from 'net';
import url from 'url';
import WebSocket from 'ws';
import frontend from 'zigbee2mqtt-frontend';

import logger from '../util/logger';
import * as settings from '../util/settings';
import utils from '../util/utils';
import Extension from './extension';

/**
 * This extension servers the frontend
 */
export default class Frontend extends Extension {
    private mqttBaseTopic = settings.get().mqtt.base_topic;
    private host = settings.get().frontend.host;
    private port = settings.get().frontend.port;
    private sslCert = settings.get().frontend.ssl_cert;
    private sslKey = settings.get().frontend.ssl_key;
    private authToken = settings.get().frontend.auth_token;
    private server: http.Server;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private fileServer: RequestHandler;
    private wss: WebSocket.Server = null;

    private isHttpsConfigured(): boolean {
        if (this.sslCert && this.sslKey) {
            if (!fs.existsSync(this.sslCert) || !fs.existsSync(this.sslKey)) {
                logger.error(`defined ssl_cert '${this.sslCert}' or ssl_key '${this.sslKey}' file path does not exists, server won't be secured.`);
                return false;
            }
            return true;
        }
        return false;
    }

    override async start(): Promise<void> {
        if (this.isHttpsConfigured()) {
            const serverOptions = {
                key: fs.readFileSync(this.sslKey),
                cert: fs.readFileSync(this.sslCert),
            };
            this.server = https.createServer(serverOptions, this.onRequest);
        } else {
            this.server = http.createServer(this.onRequest);
        }

        this.server.on('upgrade', this.onUpgrade);

        /* istanbul ignore next */
        const options = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setHeaders: (res: any, path: string): void => {
                if (path.endsWith('index.html')) {
                    res.setHeader('Cache-Control', 'no-store');
                }
            },
        };
        this.fileServer = gzipStatic(frontend.getPath(), options);
        this.wss = new WebSocket.Server({noServer: true});
        this.wss.on('connection', this.onWebSocketConnection);

        this.eventBus.onMQTTMessagePublished(this, this.onMQTTPublishMessage);

        if (!this.host) {
            this.server.listen(this.port);
            logger.info(`Started frontend on port ${this.port}`);
        } else if (this.host.startsWith('/')) {
            this.server.listen(this.host);
            logger.info(`Started frontend on socket ${this.host}`);
        } else {
            this.server.listen(this.port, this.host);
            logger.info(`Started frontend on port ${this.host}:${this.port}`);
        }
    }

    override async stop(): Promise<void> {
        await super.stop();
        this.wss?.clients.forEach((client) => {
            client.send(stringify({topic: 'bridge/state', payload: 'offline'}));
            client.terminate();
        });
        this.wss?.close();
        /* istanbul ignore else */
        if (this.server) {
            return new Promise((cb: () => void) => this.server.close(cb));
        }
    }

    @bind private onRequest(request: http.IncomingMessage, response: http.ServerResponse): void {
        // @ts-ignore
        this.fileServer(request, response, finalhandler(request, response));
    }

    private authenticate(request: http.IncomingMessage, cb: (authenticate: boolean) => void): void {
        const {query} = url.parse(request.url, true);
        cb(!this.authToken || this.authToken === query.token);
    }

    @bind private onUpgrade(request: http.IncomingMessage, socket: net.Socket, head: Buffer): void {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.authenticate(request, (isAuthenticated) => {
                if (isAuthenticated) {
                    this.wss.emit('connection', ws, request);
                } else {
                    ws.close(4401, 'Unauthorized');
                }
            });
        });
    }

    @bind private onWebSocketConnection(ws: WebSocket): void {
        ws.on('error', (msg) => logger.error(`WebSocket error: ${msg.message}`));
        ws.on('message', (data: Buffer, isBinary: boolean) => {
            if (!isBinary && data) {
                const message = data.toString();
                const {topic, payload} = JSON.parse(message);
                this.mqtt.onMessage(`${this.mqttBaseTopic}/${topic}`, Buffer.from(stringify(payload)));
            }
        });

        for (const [topic, payload] of Object.entries(this.mqtt.retainedMessages)) {
            /* istanbul ignore else */
            if (topic.startsWith(`${this.mqttBaseTopic}/`)) {
                ws.send(
                    stringify({
                        // Send topic without base_topic
                        topic: topic.substring(this.mqttBaseTopic.length + 1),
                        payload: utils.parseJSON(payload.payload, payload.payload),
                    }),
                );
            }
        }

        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            const payload = this.state.get(device);
            const lastSeen = settings.get().advanced.last_seen;
            /* istanbul ignore if */
            if (lastSeen !== 'disable') {
                payload.last_seen = utils.formatDate(device.zh.lastSeen, lastSeen);
            }

            if (device.zh.linkquality !== undefined) {
                payload.linkquality = device.zh.linkquality;
            }

            ws.send(stringify({topic: device.name, payload}));
        }
    }

    @bind private onMQTTPublishMessage(data: eventdata.MQTTMessagePublished): void {
        /* istanbul ignore else */
        if (data.topic.startsWith(`${this.mqttBaseTopic}/`)) {
            // Send topic without base_topic
            const topic = data.topic.substring(this.mqttBaseTopic.length + 1);
            const payload = utils.parseJSON(data.payload, data.payload);

            for (const client of this.wss.clients) {
                /* istanbul ignore else */
                if (client.readyState === WebSocket.OPEN) {
                    client.send(stringify({topic, payload}));
                }
            }
        }
    }
}
