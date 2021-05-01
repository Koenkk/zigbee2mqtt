const data = require('./stub/data');
require('./stub/logger');
require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const stringify = require('json-stable-stringify-without-jsonify');
const flushPromises = () => new Promise(setImmediate);
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
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

const mockWSocket = {
    close: jest.fn(),
};

const mockWS = {
    implementation: {
        clients: [],
        on: (event, handler) => {mockWS.events[event] = handler},
        handleUpgrade: jest.fn().mockImplementation((request, socket, head, cb) => {
            cb(mockWSocket)
        }),
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
        settings.reRead();
        settings.set(['frontend'], {port: 8081, host: "127.0.0.1"});
        settings.set(['homeassistant'], true);
        zigbeeHerdsman.devices.bulb.linkquality = 10;
    });

    afterEach(async() => {
        delete zigbeeHerdsman.devices.bulb.linkquality;
    });

    it('Start/stop', async () => {
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        expect(mockNodeStatic.variables.path).toBe("my/dummy/path");
        expect(mockHTTP.implementation.listen).toHaveBeenCalledWith(8081, "127.0.0.1");

        const mockWSClient = {
            implementation: {
                close: jest.fn(),
                send: jest.fn(),
            },
            events: {},
        };
        mockWS.implementation.clients.push(mockWSClient.implementation);
        await controller.stop();
        expect(mockWSClient.implementation.close).toHaveBeenCalledTimes(1);
        expect(mockHTTP.implementation.close).toHaveBeenCalledTimes(1);
    });

    it('Websocket interaction', async () => {
        controller = new Controller(jest.fn(), jest.fn());
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

        expect(mockWSClient.implementation.send).toHaveBeenCalledWith(stringify({topic: 'bridge/state', payload: 'online'}));
        expect(mockWSClient.implementation.send).toHaveBeenCalledWith(stringify({topic:"remote", payload:{brightness:255}}));

        // Message
        MQTT.publish.mockClear();
        mockWSClient.implementation.send.mockClear();
        mockWSClient.events.message(stringify({topic: 'bulb_color/set', payload: {state: 'ON'}}))
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bulb_color',
            stringify({state: 'ON', linkquality: null}),
            { retain: false, qos: 0 },
            expect.any(Function)
        );
        mockWSClient.events.message(undefined);
        mockWSClient.events.message("");
        mockWSClient.events.message(null);
        await flushPromises();

        // Received message on socket
        expect(mockWSClient.implementation.send).toHaveBeenCalledTimes(1);
        expect(mockWSClient.implementation.send).toHaveBeenCalledWith(stringify({topic: 'bulb_color', payload: {state: 'ON', linkquality: null}}));

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
        expect(mockWSClient.implementation.send).toHaveBeenCalledWith(stringify({topic:"remote", payload:{brightness:255, last_seen: "1970-01-01T00:00:01.000Z"}}));
    });

    it('onReques/onUpgrade', async () => {
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();

        const mockSocket = {destroy: jest.fn()};
        mockWS.implementation.handleUpgrade.mockClear();
        mockHTTP.events.upgrade({url: 'http://localhost:8080/api'}, mockSocket, 3);
        expect(mockWS.implementation.handleUpgrade).toHaveBeenCalledTimes(1);
        expect(mockSocket.destroy).toHaveBeenCalledTimes(0);
        expect(mockWS.implementation.handleUpgrade).toHaveBeenCalledWith({"url": "http://localhost:8080/api"}, mockSocket, 3, expect.any(Function));
        mockWS.implementation.handleUpgrade.mock.calls[0][3](99);
        expect(mockWS.implementation.emit).toHaveBeenCalledWith('connection', 99, {"url": "http://localhost:8080/api"});

        mockHTTP.variables.onRequest(1, 2);
        expect(mockNodeStatic.implementation).toHaveBeenCalledTimes(1);
        expect(mockNodeStatic.implementation).toHaveBeenCalledWith(1, 2, expect.any(Function));
    });

    it('Static server', async () => {
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();

        expect(mockHTTP.implementation.listen).toHaveBeenCalledWith(8081, "127.0.0.1");
    });

    it('Authentification', async () => {
        const authToken = 'sample-secure-token'
        settings.set(['frontend'], {auth_token: authToken});
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();

        const mockSocket = {destroy: jest.fn()};
        mockWS.implementation.handleUpgrade.mockClear();
        mockHTTP.events.upgrade({url: '/api'}, mockSocket, mockWSocket);
        expect(mockWS.implementation.handleUpgrade).toHaveBeenCalledTimes(1);
        expect(mockSocket.destroy).toHaveBeenCalledTimes(0);
        expect(mockWS.implementation.handleUpgrade).toHaveBeenCalledWith({"url": "/api"}, mockSocket, mockWSocket, expect.any(Function));
        expect(mockWSocket.close).toHaveBeenCalledWith(4401, "Unauthorized");

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
});
