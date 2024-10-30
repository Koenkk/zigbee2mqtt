const data = require('./stub/data');
const logger = require('./stub/logger');
require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const stringify = require('json-stable-stringify-without-jsonify');
const flushPromises = require('./lib/flushPromises');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const path = require('path');
const finalhandler = require('finalhandler');
const ws = require('ws');
jest.spyOn(process, 'exit').mockImplementation(() => {});

afterEach(() => {
    jest.clearAllMocks();
});

const mockHTTP = {
    implementation: {
        listen: jest.fn(),
        on: (event, handler) => {
            mockHTTP.events[event] = handler;
        },
        close: jest.fn().mockImplementation((cb) => cb()),
    },
    variables: {},
    events: {},
};

const mockHTTPS = {
    implementation: {
        listen: jest.fn(),
        on: (event, handler) => {
            mockHTTPS.events[event] = handler;
        },
        close: jest.fn().mockImplementation((cb) => cb()),
    },
    variables: {},
    events: {},
};

const mockWSocket = {
    close: jest.fn(),
};

const mockWS = {
    implementation: {
        clients: [],
        on: (event, handler) => {
            mockWS.events[event] = handler;
        },
        handleUpgrade: jest.fn().mockImplementation((request, socket, head, cb) => {
            cb(mockWSocket);
        }),
        emit: jest.fn(),
        close: jest.fn(),
    },
    variables: {},
    events: {},
};

const mockNodeStatic = {
    implementation: jest.fn(),
    variables: {},
    events: {},
};

const mockFinalHandler = {
    implementation: jest.fn(),
};

jest.mock('http', () => ({
    createServer: jest.fn().mockImplementation((onRequest) => {
        mockHTTP.variables.onRequest = onRequest;
        return mockHTTP.implementation;
    }),
    Agent: jest.fn(),
}));

jest.mock('https', () => ({
    createServer: jest.fn().mockImplementation((onRequest) => {
        mockHTTPS.variables.onRequest = onRequest;
        return mockHTTPS.implementation;
    }),
    Agent: jest.fn(),
}));

jest.mock('connect-gzip-static', () =>
    jest.fn().mockImplementation((path) => {
        mockNodeStatic.variables.path = path;
        return mockNodeStatic.implementation;
    }),
);

jest.mock('zigbee2mqtt-frontend', () => ({
    getPath: () => 'my/dummy/path',
}));

jest.mock('ws', () => ({
    OPEN: 'open',
    Server: jest.fn().mockImplementation(() => {
        return mockWS.implementation;
    }),
}));

jest.mock('finalhandler', () =>
    jest.fn().mockImplementation(() => {
        return mockFinalHandler.implementation;
    }),
);

describe('Frontend', () => {
    let controller;

    beforeAll(async () => {
        jest.useFakeTimers();
    });

    beforeEach(async () => {
        mockWS.implementation.clients = [];
        data.writeDefaultConfiguration();
        data.writeDefaultState();
        settings.reRead();
        settings.set(['frontend'], {port: 8081, host: '127.0.0.1'});
        settings.set(['homeassistant'], true);
        zigbeeHerdsman.devices.bulb.linkquality = 10;
    });

    afterAll(async () => {
        jest.useRealTimers();
    });

    afterEach(async () => {
        delete zigbeeHerdsman.devices.bulb.linkquality;
    });

    it('Start/stop', async () => {
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        expect(mockNodeStatic.variables.path).toBe('my/dummy/path');
        expect(mockHTTP.implementation.listen).toHaveBeenCalledWith(8081, '127.0.0.1');
        const mockWSClient = {
            implementation: {
                terminate: jest.fn(),
                send: jest.fn(),
            },
            events: {},
        };
        mockWS.implementation.clients.push(mockWSClient.implementation);
        await controller.stop();
        expect(mockWSClient.implementation.terminate).toHaveBeenCalledTimes(1);
        expect(mockHTTP.implementation.close).toHaveBeenCalledTimes(1);
        expect(mockWS.implementation.close).toHaveBeenCalledTimes(1);
    });

    it('Start/stop without host', async () => {
        settings.set(['frontend'], {port: 8081});
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        expect(mockNodeStatic.variables.path).toBe('my/dummy/path');
        expect(mockHTTP.implementation.listen).toHaveBeenCalledWith(8081);
        const mockWSClient = {
            implementation: {
                terminate: jest.fn(),
                send: jest.fn(),
            },
            events: {},
        };
        mockWS.implementation.clients.push(mockWSClient.implementation);
        await controller.stop();
        expect(mockWSClient.implementation.terminate).toHaveBeenCalledTimes(1);
        expect(mockHTTP.implementation.close).toHaveBeenCalledTimes(1);
        expect(mockWS.implementation.close).toHaveBeenCalledTimes(1);
    });

    it('Start/stop unix socket', async () => {
        settings.set(['frontend'], {host: '/tmp/zigbee2mqtt.sock'});
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        expect(mockNodeStatic.variables.path).toBe('my/dummy/path');
        expect(mockHTTP.implementation.listen).toHaveBeenCalledWith('/tmp/zigbee2mqtt.sock');
        const mockWSClient = {
            implementation: {
                terminate: jest.fn(),
                send: jest.fn(),
            },
            events: {},
        };
        mockWS.implementation.clients.push(mockWSClient.implementation);
        await controller.stop();
        expect(mockWSClient.implementation.terminate).toHaveBeenCalledTimes(1);
        expect(mockHTTP.implementation.close).toHaveBeenCalledTimes(1);
        expect(mockWS.implementation.close).toHaveBeenCalledTimes(1);
    });

    it('Start/stop HTTPS valid', async () => {
        settings.set(['frontend', 'ssl_cert'], path.join(__dirname, 'assets', 'certs', 'dummy.crt'));
        settings.set(['frontend', 'ssl_key'], path.join(__dirname, 'assets', 'certs', 'dummy.key'));
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        expect(mockHTTP.implementation.listen).not.toHaveBeenCalledWith(8081, '127.0.0.1');
        expect(mockHTTPS.implementation.listen).toHaveBeenCalledWith(8081, '127.0.0.1');
        await controller.stop();
    });

    it('Start/stop HTTPS invalid : missing config', async () => {
        settings.set(['frontend', 'ssl_cert'], path.join(__dirname, 'assets', 'certs', 'dummy.crt'));
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        expect(mockHTTP.implementation.listen).toHaveBeenCalledWith(8081, '127.0.0.1');
        expect(mockHTTPS.implementation.listen).not.toHaveBeenCalledWith(8081, '127.0.0.1');
        await controller.stop();
    });

    it('Start/stop HTTPS invalid : missing file', async () => {
        settings.set(['frontend', 'ssl_cert'], 'filesNotExists.crt');
        settings.set(['frontend', 'ssl_key'], path.join(__dirname, 'assets', 'certs', 'dummy.key'));
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        expect(mockHTTP.implementation.listen).toHaveBeenCalledWith(8081, '127.0.0.1');
        expect(mockHTTPS.implementation.listen).not.toHaveBeenCalledWith(8081, '127.0.0.1');
        await controller.stop();
    });

    it('Websocket interaction', async () => {
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();

        // Connect
        const mockWSClient = {
            implementation: {
                on: (event, handler) => {
                    mockWSClient.events[event] = handler;
                },
                send: jest.fn(),
                readyState: 'open',
            },
            events: {},
        };
        mockWS.implementation.clients.push(mockWSClient.implementation);
        await mockWS.events.connection(mockWSClient.implementation);

        const allTopics = mockWSClient.implementation.send.mock.calls.map((m) => JSON.parse(m).topic);
        expect(allTopics).toContain('bridge/devices');
        expect(allTopics).toContain('bridge/info');
        expect(allTopics).toContain('bridge/config');
        expect(mockWSClient.implementation.send).toHaveBeenCalledWith(stringify({topic: 'bridge/state', payload: 'online'}));
        expect(mockWSClient.implementation.send).toHaveBeenCalledWith(stringify({topic: 'remote', payload: {brightness: 255}}));

        // Message
        MQTT.publish.mockClear();
        mockWSClient.implementation.send.mockClear();
        mockWSClient.events.message(stringify({topic: 'bulb_color/set', payload: {state: 'ON'}}), false);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({
                state: 'ON',
                power_on_behavior: null,
                linkquality: null,
                update_available: null,
                update: {state: null, installed_version: -1, latest_version: -1},
            }),
            {retain: false, qos: 0},
            expect.any(Function),
        );
        mockWSClient.events.message(undefined, false);
        mockWSClient.events.message('', false);
        mockWSClient.events.message(null, false);
        await flushPromises();

        // Error
        mockWSClient.events.error(new Error('This is an error'));
        expect(logger.error).toHaveBeenCalledWith('WebSocket error: This is an error');

        // Received message on socket
        expect(mockWSClient.implementation.send).toHaveBeenCalledTimes(1);
        expect(mockWSClient.implementation.send).toHaveBeenCalledWith(
            stringify({
                topic: 'bulb_color',
                payload: {
                    state: 'ON',
                    power_on_behavior: null,
                    linkquality: null,
                    update_available: null,
                    update: {state: null, installed_version: -1, latest_version: -1},
                },
            }),
        );

        // Shouldnt set when not ready
        mockWSClient.implementation.send.mockClear();
        mockWSClient.implementation.readyState = 'close';
        mockWSClient.events.message(stringify({topic: 'bulb_color/set', payload: {state: 'ON'}}), false);
        expect(mockWSClient.implementation.send).toHaveBeenCalledTimes(0);

        // Send last seen on connect
        mockWSClient.implementation.send.mockClear();
        mockWSClient.implementation.readyState = 'open';
        settings.set(['advanced'], {last_seen: 'ISO_8601'});
        mockWS.implementation.clients.push(mockWSClient.implementation);
        await mockWS.events.connection(mockWSClient.implementation);
        expect(mockWSClient.implementation.send).toHaveBeenCalledWith(
            stringify({topic: 'remote', payload: {brightness: 255, last_seen: '1970-01-01T00:00:01.000Z'}}),
        );
    });

    it('onReques/onUpgrade', async () => {
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();

        const mockSocket = {destroy: jest.fn()};
        mockHTTP.events.upgrade({url: 'http://localhost:8080/api'}, mockSocket, 3);
        expect(mockWS.implementation.handleUpgrade).toHaveBeenCalledTimes(1);
        expect(mockSocket.destroy).toHaveBeenCalledTimes(0);
        expect(mockWS.implementation.handleUpgrade).toHaveBeenCalledWith({url: 'http://localhost:8080/api'}, mockSocket, 3, expect.any(Function));
        mockWS.implementation.handleUpgrade.mock.calls[0][3](99);
        expect(mockWS.implementation.emit).toHaveBeenCalledWith('connection', 99, {url: 'http://localhost:8080/api'});

        mockHTTP.variables.onRequest({url: '/file.txt'}, 2);
        expect(mockNodeStatic.implementation).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic.implementation).toHaveBeenCalledWith({originalUrl: '/file.txt', url: '/file.txt'}, 2, expect.any(Function));
    });

    it('Static server', async () => {
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();

        expect(mockHTTP.implementation.listen).toHaveBeenCalledWith(8081, '127.0.0.1');
    });

    it('Authentification', async () => {
        const authToken = 'sample-secure-token';
        settings.set(['frontend'], {auth_token: authToken});
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();

        const mockSocket = {destroy: jest.fn()};
        mockHTTP.events.upgrade({url: '/api'}, mockSocket, mockWSocket);
        expect(mockWS.implementation.handleUpgrade).toHaveBeenCalledTimes(1);
        expect(mockSocket.destroy).toHaveBeenCalledTimes(0);
        expect(mockWS.implementation.handleUpgrade).toHaveBeenCalledWith({url: '/api'}, mockSocket, mockWSocket, expect.any(Function));
        expect(mockWSocket.close).toHaveBeenCalledWith(4401, 'Unauthorized');

        mockWSocket.close.mockClear();
        mockWS.implementation.emit.mockClear();

        const url = `/api?token=${authToken}`;
        mockWS.implementation.handleUpgrade.mockClear();
        mockHTTP.events.upgrade({url: url}, mockSocket, 3);
        expect(mockWS.implementation.handleUpgrade).toHaveBeenCalledTimes(1);
        expect(mockSocket.destroy).toHaveBeenCalledTimes(0);
        expect(mockWS.implementation.handleUpgrade).toHaveBeenCalledWith({url}, mockSocket, 3, expect.any(Function));
        expect(mockWSocket.close).toHaveBeenCalledTimes(0);
        mockWS.implementation.handleUpgrade.mock.calls[0][3](mockWSocket);
        expect(mockWS.implementation.emit).toHaveBeenCalledWith('connection', mockWSocket, {url});
    });

    it.each(['/z2m/', '/z2m'])('Works with non-default base url %s', async (baseUrl) => {
        settings.set(['frontend'], {base_url: baseUrl});
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();

        expect(ws.Server).toHaveBeenCalledWith({noServer: true, path: '/z2m/api'});

        mockHTTP.variables.onRequest({url: '/z2m'}, 2);
        expect(mockNodeStatic.implementation).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic.implementation).toHaveBeenCalledWith({originalUrl: '/z2m', url: '/'}, 2, expect.any(Function));
        expect(mockFinalHandler.implementation).not.toHaveBeenCalledWith();

        mockNodeStatic.implementation.mockReset();
        expect(mockFinalHandler.implementation).not.toHaveBeenCalledWith();
        mockHTTP.variables.onRequest({url: '/z2m/file.txt'}, 2);
        expect(mockNodeStatic.implementation).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic.implementation).toHaveBeenCalledWith({originalUrl: '/z2m/file.txt', url: '/file.txt'}, 2, expect.any(Function));
        expect(mockFinalHandler.implementation).not.toHaveBeenCalledWith();

        mockNodeStatic.implementation.mockReset();
        mockHTTP.variables.onRequest({url: '/z/file.txt'}, 2);
        expect(mockNodeStatic.implementation).not.toHaveBeenCalled();
        expect(mockFinalHandler.implementation).toHaveBeenCalled();
    });

    it('Works with non-default complex base url', async () => {
        const baseUrl = '/z2m-more++/c0mplex.url/';
        settings.set(['frontend'], {base_url: baseUrl});
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();

        expect(ws.Server).toHaveBeenCalledWith({noServer: true, path: '/z2m-more++/c0mplex.url/api'});

        mockHTTP.variables.onRequest({url: '/z2m-more++/c0mplex.url'}, 2);
        expect(mockNodeStatic.implementation).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic.implementation).toHaveBeenCalledWith({originalUrl: '/z2m-more++/c0mplex.url', url: '/'}, 2, expect.any(Function));
        expect(mockFinalHandler.implementation).not.toHaveBeenCalledWith();

        mockNodeStatic.implementation.mockReset();
        expect(mockFinalHandler.implementation).not.toHaveBeenCalledWith();
        mockHTTP.variables.onRequest({url: '/z2m-more++/c0mplex.url/file.txt'}, 2);
        expect(mockNodeStatic.implementation).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic.implementation).toHaveBeenCalledWith(
            {originalUrl: '/z2m-more++/c0mplex.url/file.txt', url: '/file.txt'},
            2,
            expect.any(Function),
        );
        expect(mockFinalHandler.implementation).not.toHaveBeenCalledWith();

        mockNodeStatic.implementation.mockReset();
        mockHTTP.variables.onRequest({url: '/z/file.txt'}, 2);
        expect(mockNodeStatic.implementation).not.toHaveBeenCalled();
        expect(mockFinalHandler.implementation).toHaveBeenCalled();
    });
});
