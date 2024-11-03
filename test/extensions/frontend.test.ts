import * as data from '../mocks/data';
import {mockLogger} from '../mocks/logger';
import {mockMQTT} from '../mocks/mqtt';
import {EventHandler, flushPromises} from '../mocks/utils';
import {devices} from '../mocks/zigbeeHerdsman';

import path from 'path';

import stringify from 'json-stable-stringify-without-jsonify';
import ws from 'ws';

import {Controller} from '../../lib/controller';
import * as settings from '../../lib/util/settings';

let mockHTTPOnRequest: (request: {url: string}, response: number) => void;
const mockHTTPEvents: Record<string, EventHandler> = {};
const mockHTTP = {
    listen: jest.fn(),
    on: (event: string, handler: EventHandler): void => {
        mockHTTPEvents[event] = handler;
    },
    close: jest.fn().mockImplementation((cb) => cb()),
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let mockHTTPSOnRequest: (request: {url: string}, response: number) => void;
const mockHTTPSEvents: Record<string, EventHandler> = {};
const mockHTTPS = {
    listen: jest.fn(),
    on: (event: string, handler: EventHandler): void => {
        mockHTTPSEvents[event] = handler;
    },
    close: jest.fn().mockImplementation((cb) => cb()),
};

const mockWSocket = {
    close: jest.fn(),
};

const mockWSClientEvents: Record<string, EventHandler> = {};
const mockWSClient = {
    on: (event: string, handler: EventHandler): void => {
        mockWSClientEvents[event] = handler;
    },
    send: jest.fn(),
    terminate: jest.fn(),
    readyState: 'close',
};
const mockWSEvents: Record<string, EventHandler> = {};
const mockWSClients: (typeof mockWSClient)[] = [];
const mockWS = {
    clients: mockWSClients,
    on: (event: string, handler: EventHandler): void => {
        mockWSEvents[event] = handler;
    },
    handleUpgrade: jest.fn().mockImplementation((request, socket, head, cb) => {
        cb(mockWSocket);
    }),
    emit: jest.fn(),
    close: jest.fn(),
};

let mockNodeStaticPath: string = '';
const mockNodeStatic = jest.fn();

const mockFinalHandler = jest.fn();

jest.mock('http', () => ({
    createServer: jest.fn().mockImplementation((onRequest) => {
        mockHTTPOnRequest = onRequest;
        return mockHTTP;
    }),
    Agent: jest.fn(),
}));

jest.mock('https', () => ({
    createServer: jest.fn().mockImplementation((onRequest) => {
        mockHTTPSOnRequest = onRequest;
        return mockHTTPS;
    }),
    Agent: jest.fn(),
}));

jest.mock('connect-gzip-static', () =>
    jest.fn().mockImplementation((path) => {
        mockNodeStaticPath = path;
        return mockNodeStatic;
    }),
);

jest.mock('zigbee2mqtt-frontend', () => ({
    getPath: (): string => 'my/dummy/path',
}));

jest.mock('ws', () => ({
    OPEN: 'open',
    Server: jest.fn().mockImplementation(() => {
        return mockWS;
    }),
}));

jest.mock('finalhandler', () =>
    jest.fn().mockImplementation(() => {
        return mockFinalHandler;
    }),
);

const mocksClear = [
    mockHTTP.close,
    mockHTTP.listen,
    mockHTTPS.close,
    mockHTTPS.listen,
    mockWSocket.close,
    mockWS.close,
    mockWS.handleUpgrade,
    mockWS.emit,
    mockWSClient.send,
    mockWSClient.terminate,
    mockNodeStatic,
    mockFinalHandler,
    mockMQTT.publish,
    mockLogger.error,
];

describe('Extension: Frontend', () => {
    let controller: Controller;

    beforeAll(async () => {
        jest.useFakeTimers();
    });

    beforeEach(async () => {
        mockWS.clients = [];
        data.writeDefaultConfiguration();
        data.writeDefaultState();
        settings.reRead();
        settings.set(['frontend'], {port: 8081, host: '127.0.0.1'});
        settings.set(['homeassistant'], true);
        devices.bulb.linkquality = 10;
        mocksClear.forEach((m) => m.mockClear());
        mockWSClient.readyState = 'close';
    });

    afterAll(async () => {
        jest.useRealTimers();
    });

    afterEach(async () => {
        delete devices.bulb.linkquality;
    });

    it('Start/stop with defaults', async () => {
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        expect(mockNodeStaticPath).toBe('my/dummy/path');
        expect(mockHTTP.listen).toHaveBeenCalledWith(8081, '127.0.0.1');
        mockWS.clients.push(mockWSClient);
        await controller.stop();
        expect(mockWSClient.terminate).toHaveBeenCalledTimes(1);
        expect(mockHTTP.close).toHaveBeenCalledTimes(1);
        expect(mockWS.close).toHaveBeenCalledTimes(1);
    });

    it('Start/stop without host', async () => {
        settings.set(['frontend'], {port: 8081});
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        expect(mockNodeStaticPath).toBe('my/dummy/path');
        expect(mockHTTP.listen).toHaveBeenCalledWith(8081);
        mockWS.clients.push(mockWSClient);
        await controller.stop();
        expect(mockWSClient.terminate).toHaveBeenCalledTimes(1);
        expect(mockHTTP.close).toHaveBeenCalledTimes(1);
        expect(mockWS.close).toHaveBeenCalledTimes(1);
    });

    it('Start/stop unix socket', async () => {
        settings.set(['frontend'], {host: '/tmp/zigbee2mqtt.sock'});
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        expect(mockNodeStaticPath).toBe('my/dummy/path');
        expect(mockHTTP.listen).toHaveBeenCalledWith('/tmp/zigbee2mqtt.sock');
        mockWS.clients.push(mockWSClient);
        await controller.stop();
        expect(mockWSClient.terminate).toHaveBeenCalledTimes(1);
        expect(mockHTTP.close).toHaveBeenCalledTimes(1);
        expect(mockWS.close).toHaveBeenCalledTimes(1);
    });

    it('Start/stop HTTPS valid', async () => {
        settings.set(['frontend', 'ssl_cert'], path.join(__dirname, '..', 'assets', 'certs', 'dummy.crt'));
        settings.set(['frontend', 'ssl_key'], path.join(__dirname, '..', 'assets', 'certs', 'dummy.key'));
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        expect(mockHTTP.listen).not.toHaveBeenCalledWith(8081, '127.0.0.1');
        expect(mockHTTPS.listen).toHaveBeenCalledWith(8081, '127.0.0.1');
        await controller.stop();
    });

    it('Start/stop HTTPS invalid : missing config', async () => {
        settings.set(['frontend', 'ssl_cert'], path.join(__dirname, '..', 'assets', 'certs', 'dummy.crt'));
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        expect(mockHTTP.listen).toHaveBeenCalledWith(8081, '127.0.0.1');
        expect(mockHTTPS.listen).not.toHaveBeenCalledWith(8081, '127.0.0.1');
        await controller.stop();
    });

    it('Start/stop HTTPS invalid : missing file', async () => {
        settings.set(['frontend', 'ssl_cert'], 'filesNotExists.crt');
        settings.set(['frontend', 'ssl_key'], path.join(__dirname, '..', 'assets', 'certs', 'dummy.key'));
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        expect(mockHTTP.listen).toHaveBeenCalledWith(8081, '127.0.0.1');
        expect(mockHTTPS.listen).not.toHaveBeenCalledWith(8081, '127.0.0.1');
        await controller.stop();
    });

    it('Websocket interaction', async () => {
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        mockWSClient.readyState = 'open';
        mockWS.clients.push(mockWSClient);
        await mockWSEvents.connection(mockWSClient);

        const allTopics = mockWSClient.send.mock.calls.map((m) => JSON.parse(m).topic);
        expect(allTopics).toContain('bridge/devices');
        expect(allTopics).toContain('bridge/info');
        expect(mockWSClient.send).toHaveBeenCalledWith(stringify({topic: 'bridge/state', payload: {state: 'online'}}));
        expect(mockWSClient.send).toHaveBeenCalledWith(stringify({topic: 'remote', payload: {brightness: 255}}));

        // Message
        mockMQTT.publish.mockClear();
        mockWSClient.send.mockClear();
        mockWSClientEvents.message(stringify({topic: 'bulb_color/set', payload: {state: 'ON'}}), false);
        await flushPromises();
        expect(mockMQTT.publish).toHaveBeenCalledTimes(1);
        expect(mockMQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({
                state: 'ON',
                power_on_behavior: null,
                linkquality: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        mockWSClientEvents.message(undefined, false);
        mockWSClientEvents.message('', false);
        mockWSClientEvents.message(null, false);
        await flushPromises();

        // Error
        mockWSClientEvents.error(new Error('This is an error'));
        expect(mockLogger.error).toHaveBeenCalledWith('WebSocket error: This is an error');

        // Received message on socket
        expect(mockWSClient.send).toHaveBeenCalledTimes(1);
        expect(mockWSClient.send).toHaveBeenCalledWith(
            stringify({
                topic: 'bulb_color',
                payload: {
                    state: 'ON',
                    power_on_behavior: null,
                    linkquality: null,
                    update: {state: null, installed_version: -1, latest_version: -1},
                },
            }),
        );

        // Shouldnt set when not ready
        mockWSClient.send.mockClear();
        mockWSClient.readyState = 'close';
        mockWSClientEvents.message(stringify({topic: 'bulb_color/set', payload: {state: 'ON'}}), false);
        expect(mockWSClient.send).toHaveBeenCalledTimes(0);

        // Send last seen on connect
        mockWSClient.send.mockClear();
        mockWSClient.readyState = 'open';
        settings.set(['advanced'], {last_seen: 'ISO_8601'});
        mockWS.clients.push(mockWSClient);
        await mockWSEvents.connection(mockWSClient);
        expect(mockWSClient.send).toHaveBeenCalledWith(
            stringify({topic: 'remote', payload: {brightness: 255, last_seen: '1970-01-01T00:00:01.000Z'}}),
        );
    });

    it('onRequest/onUpgrade', async () => {
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();

        const mockSocket = {destroy: jest.fn()};
        mockHTTPEvents.upgrade({url: 'http://localhost:8080/api'}, mockSocket, 3);
        expect(mockWS.handleUpgrade).toHaveBeenCalledTimes(1);
        expect(mockSocket.destroy).toHaveBeenCalledTimes(0);
        expect(mockWS.handleUpgrade).toHaveBeenCalledWith({url: 'http://localhost:8080/api'}, mockSocket, 3, expect.any(Function));
        mockWS.handleUpgrade.mock.calls[0][3](99);
        expect(mockWS.emit).toHaveBeenCalledWith('connection', 99, {url: 'http://localhost:8080/api'});

        mockHTTPOnRequest({url: '/file.txt'}, 2);
        expect(mockNodeStatic).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic).toHaveBeenCalledWith({originalUrl: '/file.txt', url: '/file.txt'}, 2, expect.any(Function));
    });

    it('Static server', async () => {
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();

        expect(mockHTTP.listen).toHaveBeenCalledWith(8081, '127.0.0.1');
    });

    it('Authentification', async () => {
        const authToken = 'sample-secure-token';
        settings.set(['frontend'], {auth_token: authToken});
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();

        const mockSocket = {destroy: jest.fn()};
        mockHTTPEvents.upgrade({url: '/api'}, mockSocket, mockWSocket);
        expect(mockWS.handleUpgrade).toHaveBeenCalledTimes(1);
        expect(mockSocket.destroy).toHaveBeenCalledTimes(0);
        expect(mockWS.handleUpgrade).toHaveBeenCalledWith({url: '/api'}, mockSocket, mockWSocket, expect.any(Function));
        expect(mockWSocket.close).toHaveBeenCalledWith(4401, 'Unauthorized');

        mockWSocket.close.mockClear();
        mockWS.emit.mockClear();

        const url = `/api?token=${authToken}`;
        mockWS.handleUpgrade.mockClear();
        mockHTTPEvents.upgrade({url: url}, mockSocket, 3);
        expect(mockWS.handleUpgrade).toHaveBeenCalledTimes(1);
        expect(mockSocket.destroy).toHaveBeenCalledTimes(0);
        expect(mockWS.handleUpgrade).toHaveBeenCalledWith({url}, mockSocket, 3, expect.any(Function));
        expect(mockWSocket.close).toHaveBeenCalledTimes(0);
        mockWS.handleUpgrade.mock.calls[0][3](mockWSocket);
        expect(mockWS.emit).toHaveBeenCalledWith('connection', mockWSocket, {url});
    });

    it.each(['/z2m/', '/z2m'])('Works with non-default base url %s', async (baseUrl) => {
        settings.set(['frontend'], {base_url: baseUrl});
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();

        expect(ws.Server).toHaveBeenCalledWith({noServer: true, path: '/z2m/api'});

        mockHTTPOnRequest({url: '/z2m'}, 2);
        expect(mockNodeStatic).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic).toHaveBeenCalledWith({originalUrl: '/z2m', url: '/'}, 2, expect.any(Function));
        expect(mockFinalHandler).not.toHaveBeenCalledWith();

        mockNodeStatic.mockReset();
        expect(mockFinalHandler).not.toHaveBeenCalledWith();
        mockHTTPOnRequest({url: '/z2m/file.txt'}, 2);
        expect(mockNodeStatic).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic).toHaveBeenCalledWith({originalUrl: '/z2m/file.txt', url: '/file.txt'}, 2, expect.any(Function));
        expect(mockFinalHandler).not.toHaveBeenCalledWith();

        mockNodeStatic.mockReset();
        mockHTTPOnRequest({url: '/z/file.txt'}, 2);
        expect(mockNodeStatic).not.toHaveBeenCalled();
        expect(mockFinalHandler).toHaveBeenCalled();
    });

    it('Works with non-default complex base url', async () => {
        const baseUrl = '/z2m-more++/c0mplex.url/';
        settings.set(['frontend'], {base_url: baseUrl});
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();

        expect(ws.Server).toHaveBeenCalledWith({noServer: true, path: '/z2m-more++/c0mplex.url/api'});

        mockHTTPOnRequest({url: '/z2m-more++/c0mplex.url'}, 2);
        expect(mockNodeStatic).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic).toHaveBeenCalledWith({originalUrl: '/z2m-more++/c0mplex.url', url: '/'}, 2, expect.any(Function));
        expect(mockFinalHandler).not.toHaveBeenCalledWith();

        mockNodeStatic.mockReset();
        expect(mockFinalHandler).not.toHaveBeenCalledWith();
        mockHTTPOnRequest({url: '/z2m-more++/c0mplex.url/file.txt'}, 2);
        expect(mockNodeStatic).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic).toHaveBeenCalledWith({originalUrl: '/z2m-more++/c0mplex.url/file.txt', url: '/file.txt'}, 2, expect.any(Function));
        expect(mockFinalHandler).not.toHaveBeenCalledWith();

        mockNodeStatic.mockReset();
        mockHTTPOnRequest({url: '/z/file.txt'}, 2);
        expect(mockNodeStatic).not.toHaveBeenCalled();
        expect(mockFinalHandler).toHaveBeenCalled();
    });
});
