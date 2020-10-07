const data = require('./stub/data');
require('./stub/logger');
require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const stringify = require('json-stable-stringify-without-jsonify');
const flushPromises = () => new Promise(setImmediate);
jest.spyOn(process, 'exit').mockImplementation(() => {});

const mockHTTP = {
    implementation: {
        listen: jest.fn(),
        on: (event, handler) => {mockHTTP.events[event] = handler},
        close: jest.fn().mockImplementation((cb) => cb()),
    },
    variables: {},
    events: {},
};

const mockHTTPProxy = {
    implementation: {
        web: jest.fn(),
        ws: jest.fn(),
    },
    variables: {},
    events: {},
};

const mockWS = {
    implementation: {
        clients: [],
        on: (event, handler) => {mockWS.events[event] = handler},
        handleUpgrade: jest.fn(),
        emit: jest.fn(),
    },
    variables: {},
    events: {},
};

const mockNodeStatic = {
    implementation: jest.fn(),
    variables: {},
    events: {},
};

jest.mock('http', () => ({
    createServer: jest.fn().mockImplementation((onRequest) => {
        mockHTTP.variables.onRequest = onRequest;
        return mockHTTP.implementation;
    }),
}));

jest.mock('http-proxy', () => ({
    createProxyServer: jest.fn().mockImplementation((initParameter) => {
        mockHTTPProxy.variables.initParameter = initParameter;
        return mockHTTPProxy.implementation;
    }),
}));

jest.mock("serve-static", () =>
    jest.fn().mockImplementation((path) => {
        mockNodeStatic.variables.path = path
        return mockNodeStatic.implementation
    })
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

describe('Frontend', () => {
    let controller;

    beforeEach(async () => {
        mockWS.implementation.clients = [];
        data.writeDefaultConfiguration();
        data.writeDefaultState();
        settings._reRead();
        settings.set(['experimental'], {new_api: true});
        settings.set(['frontend'], {port: 8081});
        settings.set(['homeassistant'], true);
    });

    it('Start/stop', async () => {
        controller = new Controller();
        await controller.start();
        expect(mockNodeStatic.variables.path).toBe("my/dummy/path");
        expect(mockHTTP.implementation.listen).toHaveBeenCalledWith(8081);

        const mockWSClient = {
            implementation: {
                close: jest.fn(),
            },
            events: {},
        };
        mockWS.implementation.clients.push(mockWSClient.implementation);
        await controller.stop();
        expect(mockWSClient.implementation.close).toHaveBeenCalledTimes(1);
        expect(mockHTTP.implementation.close).toHaveBeenCalledTimes(1);
    });

    it('Websocket interaction', async () => {
        controller = new Controller();
        await controller.start();

        // Connect
        const mockWSClient = {
            implementation: {
                on: (event, handler) => {mockWSClient.events[event] = handler},
                send: jest.fn(),
                readyState: 'open',
            },
            events: {},
        };
        mockWS.implementation.clients.push(mockWSClient.implementation);
        await mockWS.events.connection(mockWSClient.implementation);
        expect(mockWSClient.implementation.send).toHaveBeenCalledTimes(48);

        expect(JSON.parse(mockWSClient.implementation.send.mock.calls[0])).toStrictEqual({topic: 'bridge/state', payload: 'online'});
        expect(JSON.parse(mockWSClient.implementation.send.mock.calls[12])).toStrictEqual({topic:"remote", payload:{brightness:255, update:{state: "idle"}, update_available: false}});

        // Message
        MQTT.publish.mockClear();
        mockWSClient.implementation.send.mockClear();
        mockWSClient.events.message(stringify({topic: 'bulb_color/set', payload: {state: 'ON'}}))
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(4);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({state: 'ON'}),
            { retain: false, qos: 0 },
            expect.any(Function)
        );
        mockWSClient.events.message(undefined);
        mockWSClient.events.message("");
        mockWSClient.events.message(null);
        await flushPromises();

        // Received message on socket
        expect(mockWSClient.implementation.send).toHaveBeenCalledTimes(4);
        expect(mockWSClient.implementation.send).toHaveBeenCalledWith(stringify({topic: 'bulb_color', payload: {state: 'ON'}}));

        // Shouldnt set when not ready
        mockWSClient.implementation.send.mockClear();
        mockWSClient.implementation.readyState = 'close';
        mockWSClient.events.message(stringify({topic: 'bulb_color/set', payload: {state: 'ON'}}))
        expect(mockWSClient.implementation.send).toHaveBeenCalledTimes(0);

        // Send last seen on connect
        mockWSClient.implementation.send.mockClear();
        mockWSClient.implementation.readyState = 'open';
        settings.set(['advanced'], {last_seen: 'ISO_8601'});
        mockWS.implementation.clients.push(mockWSClient.implementation);
        await mockWS.events.connection(mockWSClient.implementation);
        expect(JSON.parse(mockWSClient.implementation.send.mock.calls[12])).toStrictEqual({topic:"remote", payload:{brightness:255, last_seen: "1970-01-01T00:00:01.000Z", update:{state: "idle"}, update_available: false}});
    });

    it('onReques/onUpgrade', async () => {
        controller = new Controller();
        await controller.start();

        const mockSocket = {destroy: jest.fn()};
        mockWS.implementation.handleUpgrade.mockClear();
        mockHTTP.events.upgrade({url: 'http://localhost:8080/api'}, mockSocket, 3);
        expect(mockWS.implementation.handleUpgrade).toHaveBeenCalledTimes(1);
        expect(mockSocket.destroy).toHaveBeenCalledTimes(0);
        expect(mockWS.implementation.handleUpgrade).toHaveBeenCalledWith({"url": "http://localhost:8080/api"}, mockSocket, 3, expect.any(Function));
        mockWS.implementation.handleUpgrade.mock.calls[0][3](99);
        expect(mockWS.implementation.emit).toHaveBeenCalledWith('connection', 99, {"url": "http://localhost:8080/api"});

        mockWS.implementation.handleUpgrade.mockClear();
        mockHTTP.events.upgrade({url: 'http://localhost:8080/unkown'}, mockSocket, 3);
        expect(mockWS.implementation.handleUpgrade).toHaveBeenCalledTimes(0);
        expect(mockSocket.destroy).toHaveBeenCalledTimes(1);

        mockHTTP.variables.onRequest(1, 2);
        expect(mockNodeStatic.implementation).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic.implementation).toHaveBeenCalledWith(1, 2, expect.any(Function));
    });

    it('Development server', async () => {
        settings.set(['frontend'], {development_server: 'localhost:3001'});
        controller = new Controller();
        await controller.start();
        expect(mockHTTPProxy.variables.initParameter).toStrictEqual({ws: true});
        expect(mockHTTP.implementation.listen).toHaveBeenCalledWith(8080);

        mockHTTP.variables.onRequest(1, 2);
        expect(mockHTTPProxy.implementation.web).toHaveBeenCalledTimes(1);
        expect(mockHTTPProxy.implementation.web).toHaveBeenCalledWith(1, 2, {"target": "http://localhost:3001"});

        const mockSocket = {destroy: jest.fn()};
        mockHTTPProxy.implementation.ws.mockClear();
        mockHTTP.events.upgrade({url: 'http://localhost:8080/sockjs-node'}, mockSocket, 3);
        expect(mockHTTPProxy.implementation.ws).toHaveBeenCalledTimes(1);
        expect(mockSocket.destroy).toHaveBeenCalledTimes(0);
        expect(mockHTTPProxy.implementation.ws).toHaveBeenCalledWith({"url": "http://localhost:8080/sockjs-node"}, mockSocket, 3, {"target": "ws://localhost:3001"});
    });
});
