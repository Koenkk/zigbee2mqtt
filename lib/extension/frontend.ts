import http from 'http';
import https from 'https';
import gzipStatic, {RequestHandler} from 'connect-gzip-static';
import finalhandler from 'finalhandler';
import logger from '../util/logger';
import frontend from 'zigbee2mqtt-frontend';
import WebSocket from 'ws';
import net from 'net';
import url from 'url';
import fs from 'fs';
import * as settings from '../util/settings';
import utils from '../util/utils';
import stringify from 'json-stable-stringify-without-jsonify';
import Extension from './extension';
import bind from 'bind-decorator';

/**
 * This extension servers the frontend
 */
export default class Frontend extends Extension {
    private mqttBaseTopic = settings.get().mqtt.base_topic;
    private host = settings.get().frontend.host;
    private port = settings.get().frontend.port;
    private ssl_cert = settings.get().frontend.ssl_cert;
    private ssl_key = settings.get().frontend.ssl_key;
    private authToken = settings.get().frontend.auth_token;
    private retainedMessages = new Map();
    private server: http.Server;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private fileServer: RequestHandler;
    private wss: WebSocket.Server = null;

    constructor(zigbee: Zigbee, mqtt: MQTT, state: State, publishEntityState: PublishEntityState,
        eventBus: EventBus, enableDisableExtension: (enable: boolean, name: string) => Promise<void>,
        restartCallback: () => void, addExtension: (extension: Extension) => Promise<void>) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);
        this.eventBus.onMQTTMessagePublished(this, this.onMQTTPublishMessage);
    }

    private isHttpsConfigured():boolean {
        if (this.ssl_cert && this.ssl_key &&
            this.ssl_cert.length > 0 && this.ssl_key.length > 0) {
            if (!fs.existsSync(this.ssl_cert) || !fs.existsSync(this.ssl_key)) {
                logger.warn(`defined ssl_cert or ssl_key file path does not exists : '${this.ssl_cert}', server won't be secured.`); /* eslint-disable-line max-len */
                return false;
            }
            return true;
        }
        return false;
    }


    override async start(): Promise<void> {
        if (this.isHttpsConfigured()) {
            const serverOptions = {
                key: fs.readFileSync(this.ssl_key),
                cert: fs.readFileSync(this.ssl_cert)};
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

        this.server.listen(this.port, this.host);
        logger.info(`Started frontend on port ${this.host}:${this.port}`);
    }

    override async stop(): Promise<void> {
        super.stop();
        for (const client of this.wss.clients) {
            client.send(stringify({topic: 'bridge/state', payload: 'offline'}));
            client.terminate();
        }
        this.wss.close();
        return new Promise((cb: () => void) => this.server.close(cb));
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
            this.authenticate(request, (isAuthentificated) => {
                if (isAuthentificated) {
                    this.wss.emit('connection', ws, request);
                } else {
                    ws.close(4401, 'Unauthorized');
                }
            });
        });
    }

    @bind private onWebSocketConnection(ws: WebSocket): void {
        ws.on('message', (data: Buffer, isBinary: boolean) => {
            if (!isBinary && data) {
                const message = data.toString();
                const {topic, payload} = JSON.parse(message);
                this.mqtt.onMessage(`${this.mqttBaseTopic}/${topic}`, stringify(payload));
            }
        });

        for (const [key, value] of this.retainedMessages) {
            ws.send(stringify({topic: key, payload: value}));
        }

        for (const device of this.zigbee.devices(false)) {
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
        if (data.topic.startsWith(`${this.mqttBaseTopic}/`)) {
            // Send topic without base_topic
            const topic = data.topic.substring(this.mqttBaseTopic.length + 1);
            const payload = utils.parseJSON(data.payload, data.payload);
            if (data.options.retain) {
                this.retainedMessages.set(topic, payload);
            }

            if (this.wss) {
                for (const client of this.wss.clients) {
                    /* istanbul ignore else */
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(stringify({topic, payload}));
                    }
                }
            }
        }
    }
}
