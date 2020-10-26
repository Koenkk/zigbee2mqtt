const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const stringify = require('json-stable-stringify-without-jsonify');

const {coordinator, bulb, bulb_color, WXKG02LM, CC2530_ROUTER, unsupported_router} = zigbeeHerdsman.devices;

zigbeeHerdsman.returnDevices.push(coordinator.ieeeAddr);
zigbeeHerdsman.returnDevices.push(bulb.ieeeAddr);
zigbeeHerdsman.returnDevices.push(bulb_color.ieeeAddr);
zigbeeHerdsman.returnDevices.push(WXKG02LM.ieeeAddr);
zigbeeHerdsman.returnDevices.push(CC2530_ROUTER.ieeeAddr);
zigbeeHerdsman.returnDevices.push(unsupported_router.ieeeAddr);
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
Date.now = jest.fn()
Date.now.mockReturnValue(10000);
const mocksClear = [MQTT.publish, logger.warn, logger.debug];

describe('Networkmap', () => {
    let controller;

    beforeAll(async () => {
        data.writeDefaultConfiguration();
        settings._reRead();
        data.writeEmptyState();
        settings.set(['experimental', 'new_api'], true);
        controller = new Controller();
        await controller.start();
        mocksClear.forEach((m) => m.mockClear());
        await flushPromises();
    });

    beforeEach(async () => {
        mocksClear.forEach((m) => m.mockClear());
        await flushPromises();
        const device = zigbeeHerdsman.devices.bulb_color;
        device.lastSeen = 1000;
    });

    function mock() {
        /**
         * Topology
         *
         *             | -> bulb_color -> unsupported_router (offline)
         * coordinator |      ^     ^
         *             |      |     | (not valid)
         *             | -> bulb    |
         *                    |  -> CC2530_ROUTER -> WXKG02LM
         *
         */
        coordinator.lqi = () => {return {neighbors: [
            {ieeeAddr: bulb_color.ieeeAddr, networkAddress: bulb_color.networkAddress, relationship: 2, depth: 1, linkquality: 120},
            {ieeeAddr: bulb.ieeeAddr, networkAddress: bulb.networkAddress, relationship: 2, depth: 1, linkquality: 92}
        ]}};
        coordinator.routingTable = () => {return {table: [
            {destinationAddress: CC2530_ROUTER.networkAddress, status: 'ACTIVE', nextHop: bulb.networkAddress},
        ]}};

        bulb.lqi = () => {return {neighbors: [
            {ieeeAddr: bulb_color.ieeeAddr, networkAddress: bulb_color.networkAddress, relationship: 1, depth: 2, linkquality: 110},
            {ieeeAddr: CC2530_ROUTER.ieeeAddr, networkAddress: CC2530_ROUTER.networkAddress, relationship: 1, depth: 2, linkquality: 100}
        ]}};
        bulb.routingTable = () => {return {table: []}};

        bulb_color.lqi = () => {return {neighbors: []}}
        bulb_color.routingTable = () => {return {table: []}};

        CC2530_ROUTER.lqi = () => {return {neighbors: [
            {ieeeAddr: '0x0000000000000000', networkAddress: WXKG02LM.networkAddress, relationship: 1, depth: 2, linkquality: 130},
            {ieeeAddr: bulb_color.ieeeAddr, networkAddress: bulb_color.networkAddress, relationship: 4, depth: 2, linkquality: 130},
        ]}};
        CC2530_ROUTER.routingTable = () => {return {table: []}};

        unsupported_router.lqi = () => {throw new Error('failed')};
        unsupported_router.routingTable = () => {throw new Error('failed')};
    }

    it('Output raw networkmap legacy api', async () => {
        mock();
        MQTT.events.message('zigbee2mqtt/bridge/networkmap/routes', 'raw');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        let call = MQTT.publish.mock.calls[0];
        expect(call[0]).toStrictEqual('zigbee2mqtt/bridge/networkmap/raw');

        const conv = (device) => {return {ieeeAddr: device.ieeeAddr, networkAddress: device.networkAddress}};

        const expected = {
            "nodes":[
                {"definition":null,"lastSeen": 1000,"ieeeAddr":coordinator.ieeeAddr,"friendlyName":"Coordinator","type":"Coordinator","networkAddress":0,"modelID":null,"failed":[]},
                {"definition":{"description": "TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white","model": "LED1545G12","supports": "on/off, brightness, color temperature","vendor": "IKEA"},"lastSeen": 1000,"ieeeAddr":bulb.ieeeAddr,"friendlyName":"bulb","type":"Router","networkAddress":40369,"modelID":"TRADFRI bulb E27 WS opal 980lm","failed":[]},
                {"definition":{"description": "Hue Go","model": "7146060PH","supports": "on/off, brightness, color temperature, color xy, power-on behavior","vendor": "Philips"},"lastSeen": 1000,"ieeeAddr":bulb_color.ieeeAddr,"friendlyName":"bulb_color","type":"Router","networkAddress":40399,"modelID":"LLC020","failed":[]},
                {"definition":{"description": "Aqara double key wireless wall switch","model": "WXKG02LM","supports": "left, right, both click (and double, long click for left, right and both depending on model)","vendor": "Xiaomi"},"lastSeen": 1000,"ieeeAddr":WXKG02LM.ieeeAddr,"friendlyName":"button_double_key","type":"EndDevice","networkAddress":6538,"modelID":"lumi.sensor_86sw2.es1"},
                {"definition":null,"lastSeen": 1000,"ieeeAddr":unsupported_router.ieeeAddr,"friendlyName":"0x0017880104e45525","type":"Router","networkAddress":6536,"modelID":"notSupportedModelID","manufacturerName": "Boef","failed":['lqi', 'routingTable']},
                {"definition":{"description": "[CC2530 router](http://ptvo.info/cc2530-based-zigbee-coordinator-and-router-112/)","model": "CC2530.ROUTER","supports": "state, description, type, rssi","vendor": "Custom devices (DiY)"},"lastSeen": 1000,"ieeeAddr":CC2530_ROUTER.ieeeAddr,"friendlyName":"cc2530_router","type":"Router","networkAddress":6540,"modelID":"lumi.router","failed":[]},
            ],
            "links":[
                {depth: 1, linkquality: 120, routes: [], source: conv(bulb_color), target: conv(coordinator), sourceIeeeAddr: bulb_color.ieeeAddr, sourceNwkAddr: bulb_color.networkAddress, targetIeeeAddr: coordinator.ieeeAddr, lqi: 120, relationship: 2},
                {depth: 1, linkquality: 92, routes: [{destinationAddress: CC2530_ROUTER.networkAddress, status: 'ACTIVE', nextHop: bulb.networkAddress}], source: conv(bulb), target: conv(coordinator), sourceIeeeAddr: bulb.ieeeAddr, sourceNwkAddr: bulb.networkAddress, targetIeeeAddr: coordinator.ieeeAddr, lqi: 92, relationship: 2},
                {depth: 2, linkquality: 110, routes: [], source: conv(bulb_color), target: conv(bulb), sourceIeeeAddr: bulb_color.ieeeAddr, sourceNwkAddr: bulb_color.networkAddress, targetIeeeAddr: bulb.ieeeAddr, lqi: 110, relationship: 1},
                {depth: 2, linkquality: 100, routes: [], source: conv(CC2530_ROUTER), target: conv(bulb), sourceIeeeAddr: CC2530_ROUTER.ieeeAddr, sourceNwkAddr: CC2530_ROUTER.networkAddress, targetIeeeAddr: bulb.ieeeAddr, lqi: 100, relationship: 1},
                {depth: 2, linkquality: 130, routes: [], source: conv(WXKG02LM), target: conv(CC2530_ROUTER), sourceIeeeAddr: WXKG02LM.ieeeAddr, sourceNwkAddr: WXKG02LM.networkAddress, targetIeeeAddr: CC2530_ROUTER.ieeeAddr, lqi: 130, relationship: 1}
            ]
        };

        expect(JSON.parse(call[1])).toStrictEqual(expected);

        /**
         * Check again without routes
         */
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/networkmap', 'raw');
        await flushPromises();
        call = MQTT.publish.mock.calls[0];
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(call[0]).toStrictEqual('zigbee2mqtt/bridge/networkmap/raw');

        // Remove routing information
        expected.nodes.forEach((n) => {
            if (n.failed && n.failed.includes('routingTable')) {
                n.failed.splice(n.failed.indexOf('routingTable'), 1);
            }
        });

        expected.links.forEach((l) => l.routes = [])
        expect(JSON.parse(call[1])).toStrictEqual(expected);
    });

    it('Output graphviz networkmap legacy api', async () => {
        mock();
        const device = zigbeeHerdsman.devices.bulb_color;
        device.lastSeen = null;
        const endpoint = device.getEndpoint(1);
        const data = {modelID: 'test'}
        const payload = {data, cluster: 'genOnOff', device, endpoint, type: 'readResponse', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        MQTT.events.message('zigbee2mqtt/bridge/networkmap/routes', 'graphviz');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        let call = MQTT.publish.mock.calls[0];
        expect(call[0]).toStrictEqual('zigbee2mqtt/bridge/networkmap/graphviz');

        const expected = `digraph G {
            node[shape=record];
              "0x00124b00120144ae" [style="bold, filled", fillcolor="#e04e5d", fontcolor="#ffffff", label="{Coordinator|0x00124b00120144ae (0)|0 seconds ago}"];
              "0x000b57fffec6a5b2" [style="rounded, filled", fillcolor="#4ea3e0", fontcolor="#ffffff", label="{bulb|0x000b57fffec6a5b2 (40369)|IKEA TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white (LED1545G12)|9 seconds ago}"];
              "0x000b57fffec6a5b2" -> "0x00124b00120144ae" [penwidth=2, weight=1, color="#009900", label="92 (routes: 6540)"]
              "0x000b57fffec6a5b3" [style="rounded, filled", fillcolor="#4ea3e0", fontcolor="#ffffff", label="{bulb_color|0x000b57fffec6a5b3 (40399)|Philips Hue Go (7146060PH)|unknown}"];
              "0x000b57fffec6a5b3" -> "0x00124b00120144ae" [penwidth=0.5, weight=0, color="#994444", label="120"]
              "0x000b57fffec6a5b3" -> "0x000b57fffec6a5b2" [penwidth=0.5, weight=0, color="#994444", label="110"]
              "0x0017880104e45521" [style="rounded, dashed, filled", fillcolor="#fff8ce", fontcolor="#000000", label="{button_double_key|0x0017880104e45521 (6538)|Xiaomi Aqara double key wireless wall switch (WXKG02LM)|9 seconds ago}"];
              "0x0017880104e45521" -> "0x0017880104e45559" [penwidth=1, weight=0, color="#994444", label="130"]
              "0x0017880104e45525" [style="rounded, filled", fillcolor="#4ea3e0", fontcolor="#ffffff", label="{0x0017880104e45525|0x0017880104e45525 (6536)failed: lqi,routingTable|Boef notSupportedModelID|9 seconds ago}"];
              "0x0017880104e45559" [style="rounded, filled", fillcolor="#4ea3e0", fontcolor="#ffffff", label="{cc2530_router|0x0017880104e45559 (6540)|Custom devices (DiY) [CC2530 router](http://ptvo.info/cc2530-based-zigbee-coordinator-and-router-112/) (CC2530.ROUTER)|9 seconds ago}"];
              "0x0017880104e45559" -> "0x000b57fffec6a5b2" [penwidth=0.5, weight=0, color="#994444", label="100"]
            }`;

        const expectedLines = expected.split('\n');
        const actualLines = call[1].split('\n');

        for (let i = 0; i < expectedLines.length; i++) {
            expect(actualLines[i].trim()).toStrictEqual(expectedLines[i].trim());
        }
    });

    it('Output plantuml networkmap legacy api', async () => {
        mock();
        const device = zigbeeHerdsman.devices.bulb_color;
        device.lastSeen = null;
        const endpoint = device.getEndpoint(1);
        const data = {modelID: 'test'}
        const payload = {data, cluster: 'genOnOff', device, endpoint, type: 'readResponse', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        MQTT.events.message('zigbee2mqtt/bridge/networkmap/routes', 'plantuml');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        let call = MQTT.publish.mock.calls[0];
        expect(call[0]).toStrictEqual('zigbee2mqtt/bridge/networkmap/plantuml');

        const expected = `' paste into: https://www.planttext.com/

        @startuml
        card 0x0017880104e45525 [
        0x0017880104e45525
        ---
        0x0017880104e45525 (6536) failed: lqi,routingTable
        ---
        Boef notSupportedModelID
        ---
        9 seconds ago
        ]

        card 0x000b57fffec6a5b2 [
        bulb
        ---
        0x000b57fffec6a5b2 (40369)
        ---
        IKEA TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white (LED1545G12)
        ---
        9 seconds ago
        ]

        card 0x000b57fffec6a5b3 [
        bulb_color
        ---
        0x000b57fffec6a5b3 (40399)
        ---
        Philips Hue Go (7146060PH)
        ---
        unknown
        ]

        card 0x0017880104e45521 [
        button_double_key
        ---
        0x0017880104e45521 (6538)
        ---
        Xiaomi Aqara double key wireless wall switch (WXKG02LM)
        ---
        9 seconds ago
        ]

        card 0x0017880104e45559 [
        cc2530_router
        ---
        0x0017880104e45559 (6540)
        ---
        Custom devices (DiY) [CC2530 router](http://ptvo.info/cc2530-based-zigbee-coordinator-and-router-112/) (CC2530.ROUTER)
        ---
        9 seconds ago
        ]

        card 0x00124b00120144ae [
        Coordinator
        ---
        0x00124b00120144ae (0)
        ---
        0 seconds ago
        ]

        0x000b57fffec6a5b3 --> 0x00124b00120144ae: 120
        0x000b57fffec6a5b2 --> 0x00124b00120144ae: 92
        0x000b57fffec6a5b3 --> 0x000b57fffec6a5b2: 110
        0x0017880104e45559 --> 0x000b57fffec6a5b2: 100
        0x0017880104e45521 --> 0x0017880104e45559: 130

        @enduml`;

        const expectedLines = expected.split('\n');
        const actualLines = call[1].split('\n');

        for (let i = 0; i < expectedLines.length; i++) {
            expect(actualLines[i].trim()).toStrictEqual(expectedLines[i].trim());
        }
    });

    it('Should output raw networkmap', async () => {
        mock();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/networkmap', stringify({type: 'raw', routes: true}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        let call = MQTT.publish.mock.calls[0];
        expect(call[0]).toStrictEqual('zigbee2mqtt/bridge/response/networkmap');

        const conv = (device) => {return {ieeeAddr: device.ieeeAddr, networkAddress: device.networkAddress}};

        const expected = {
            status: 'ok',
            data: {
                type: 'raw',
                routes: true,
                value: {
                    "nodes":[
                        {"definition":null,"lastSeen": 1000,"ieeeAddr":coordinator.ieeeAddr,"friendlyName":"Coordinator","type":"Coordinator","networkAddress":0,"modelID":null,"failed":[]},
                        {"definition":{"description": "TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white","model": "LED1545G12","supports": "on/off, brightness, color temperature","vendor": "IKEA"},"lastSeen": 1000,"ieeeAddr":bulb.ieeeAddr,"friendlyName":"bulb","type":"Router","networkAddress":40369,"modelID":"TRADFRI bulb E27 WS opal 980lm","failed":[]},
                        {"definition":{"description": "Hue Go","model": "7146060PH","supports": "on/off, brightness, color temperature, color xy, power-on behavior","vendor": "Philips"},"lastSeen": 1000,"ieeeAddr":bulb_color.ieeeAddr,"friendlyName":"bulb_color","type":"Router","networkAddress":40399,"modelID":"LLC020","failed":[]},
                        {"definition":{"description": "Aqara double key wireless wall switch","model": "WXKG02LM","supports": "left, right, both click (and double, long click for left, right and both depending on model)","vendor": "Xiaomi"},"lastSeen": 1000,"ieeeAddr":WXKG02LM.ieeeAddr,"friendlyName":"button_double_key","type":"EndDevice","networkAddress":6538,"modelID":"lumi.sensor_86sw2.es1"},
                        {"definition":null,"lastSeen": 1000,"ieeeAddr":unsupported_router.ieeeAddr,"friendlyName":"0x0017880104e45525","type":"Router","networkAddress":6536,"modelID":"notSupportedModelID","manufacturerName": "Boef","failed":['lqi', 'routingTable']},
                        {"definition":{"description": "[CC2530 router](http://ptvo.info/cc2530-based-zigbee-coordinator-and-router-112/)","model": "CC2530.ROUTER","supports": "state, description, type, rssi","vendor": "Custom devices (DiY)"},"lastSeen": 1000,"ieeeAddr":CC2530_ROUTER.ieeeAddr,"friendlyName":"cc2530_router","type":"Router","networkAddress":6540,"modelID":"lumi.router","failed":[]},
                    ],
                    "links":[
                        {depth: 1, linkquality: 120, routes: [], source: conv(bulb_color), target: conv(coordinator), sourceIeeeAddr: bulb_color.ieeeAddr, sourceNwkAddr: bulb_color.networkAddress, targetIeeeAddr: coordinator.ieeeAddr, lqi: 120, relationship: 2},
                        {depth: 1, linkquality: 92, routes: [{destinationAddress: CC2530_ROUTER.networkAddress, status: 'ACTIVE', nextHop: bulb.networkAddress}], source: conv(bulb), target: conv(coordinator), sourceIeeeAddr: bulb.ieeeAddr, sourceNwkAddr: bulb.networkAddress, targetIeeeAddr: coordinator.ieeeAddr, lqi: 92, relationship: 2},
                        {depth: 2, linkquality: 110, routes: [], source: conv(bulb_color), target: conv(bulb), sourceIeeeAddr: bulb_color.ieeeAddr, sourceNwkAddr: bulb_color.networkAddress, targetIeeeAddr: bulb.ieeeAddr, lqi: 110, relationship: 1},
                        {depth: 2, linkquality: 100, routes: [], source: conv(CC2530_ROUTER), target: conv(bulb), sourceIeeeAddr: CC2530_ROUTER.ieeeAddr, sourceNwkAddr: CC2530_ROUTER.networkAddress, targetIeeeAddr: bulb.ieeeAddr, lqi: 100, relationship: 1},
                        {depth: 2, linkquality: 130, routes: [], source: conv(WXKG02LM), target: conv(CC2530_ROUTER), sourceIeeeAddr: WXKG02LM.ieeeAddr, sourceNwkAddr: WXKG02LM.networkAddress, targetIeeeAddr: CC2530_ROUTER.ieeeAddr, lqi: 130, relationship: 1}
                    ]
                }
            }
        };

        const actual = JSON.parse(call[1]);
        expect(actual).toStrictEqual(expected);
    });

    it('Should throw error when rquesting invalid type', async () => {
        mock();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/networkmap', 'not_existing');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/networkmap',
            stringify({"data":{},"status":"error","error":"Type 'not_existing' not supported, allowed are: raw,graphviz,plantuml"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });
});
