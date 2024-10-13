import type {IncomingMessage, Server, ServerResponse} from 'http';
import type {Socket} from 'net';

import assert from 'assert';
import {existsSync, readFileSync} from 'fs';
import {createServer} from 'http';
import {createServer as createSecureServer} from 'https';
import {posix} from 'path';
import {parse} from 'url';

import bind from 'bind-decorator';
import gzipStatic, {RequestHandler} from 'connect-gzip-static';
import finalhandler from 'finalhandler';
import stringify from 'json-stable-stringify-without-jsonify';
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
    private mqttBaseTopic: string;
    private host: string | undefined;
    private port: number;
    private sslCert: string | undefined;
    private sslKey: string | undefined;
    private authToken: string | undefined;
    private server!: Server;
    private fileServer!: RequestHandler;
    private wss!: WebSocket.Server;
    private baseUrl: string;

    constructor(
        zigbee: Zigbee,
        mqtt: MQTT,
        state: State,
        publishEntityState: PublishEntityState,
        eventBus: EventBus,
        enableDisableExtension: (enable: boolean, name: string) => Promise<void>,
        restartCallback: () => Promise<void>,
        addExtension: (extension: Extension) => Promise<void>,
    ) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);

        const frontendSettings = settings.get().frontend;
        assert(frontendSettings, 'Frontend extension created without having frontend settings');
        this.host = frontendSettings.host;
        this.port = frontendSettings.port;
        this.sslCert = frontendSettings.ssl_cert;
        this.sslKey = frontendSettings.ssl_key;
        this.authToken = frontendSettings.auth_token;
        this.baseUrl = frontendSettings.base_url;
        this.mqttBaseTopic = settings.get().mqtt.base_topic;
    }

    private isHttpsConfigured(): boolean {
        if (this.sslCert && this.sslKey) {
            if (!existsSync(this.sslCert) || !existsSync(this.sslKey)) {
                logger.error(`defined ssl_cert '${this.sslCert}' or ssl_key '${this.sslKey}' file path does not exists, server won't be secured.`);
                return false;
            }
            return true;
        }
        return false;
    }

    override async start(): Promise<void> {
        /* istanbul ignore next */
        const options = {
            setHeaders: (res: ServerResponse, path: string): void => {
                if (path.endsWith('index.html')) {
                    res.setHeader('Cache-Control', 'no-store');
                }
            },
        };
        this.fileServer = gzipStatic(frontend.getPath(), options);
        this.wss = new WebSocket.Server({noServer: true, path: posix.join(this.baseUrl, 'api')});

        this.wss.on('connection', this.onWebSocketConnection);

        if (this.isHttpsConfigured()) {
            const serverOptions = {
                key: readFileSync(this.sslKey!), // valid from `isHttpsConfigured`
                cert: readFileSync(this.sslCert!), // valid from `isHttpsConfigured`
            };
            this.server = createSecureServer(serverOptions, this.onRequest);
        } else {
            this.server = createServer(this.onRequest);
        }

        this.server.on('upgrade', this.onUpgrade);
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
        this.wss.clients.forEach((client) => {
            client.send(stringify({topic: 'bridge/state', payload: 'offline'}));
            client.terminate();
        });
        this.wss.close();

        await new Promise((resolve) => this.server.close(resolve));
    }

    @bind private onRequest(request: IncomingMessage, response: ServerResponse): void {
        const fin = finalhandler(request, response);
        const newUrl = posix.relative(this.baseUrl, request.url!);

        // The request url is not within the frontend base url, so the relative path starts with '..'
        if (newUrl.startsWith('.')) {
            return fin();
        }

        // Attach originalUrl so that static-server can perform a redirect to '/' when serving the root directory.
        // This is necessary for the browser to resolve relative assets paths correctly.
        request.originalUrl = request.url;
        request.url = '/' + newUrl;

        this.fileServer(request, response, fin);
    }

    private authenticate(request: IncomingMessage, cb: (authenticate: boolean) => void): void {
        const {query} = parse(request.url!, true);
        cb(!this.authToken || this.authToken === query.token);
    }

    @bind private onUpgrade(request: IncomingMessage, socket: Socket, head: Buffer): void {
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
                payload.last_seen = utils.formatDate(device.zh.lastSeen ?? 0, lastSeen);
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
