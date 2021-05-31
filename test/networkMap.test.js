const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const stringify = require('json-stable-stringify-without-jsonify');
const fs = require('fs');
const path = require('path');
const {coordinator, bulb, bulb_color, WXKG02LM_rev1, CC2530_ROUTER, unsupported_router, external_converter_device} = zigbeeHerdsman.devices;

zigbeeHerdsman.returnDevices.push(coordinator.ieeeAddr);
zigbeeHerdsman.returnDevices.push(bulb.ieeeAddr);
zigbeeHerdsman.returnDevices.push(bulb_color.ieeeAddr);
zigbeeHerdsman.returnDevices.push(WXKG02LM_rev1.ieeeAddr);
zigbeeHerdsman.returnDevices.push(CC2530_ROUTER.ieeeAddr);
zigbeeHerdsman.returnDevices.push(unsupported_router.ieeeAddr);
zigbeeHerdsman.returnDevices.push(external_converter_device.ieeeAddr)
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);
Date.now = jest.fn()
Date.now.mockReturnValue(10000);
const mocksClear = [MQTT.publish, logger.warn, logger.debug];
const setTimeoutNative = setTimeout;

describe('Networkmap', () => {
    let controller;

    beforeAll(async () => {
        data.writeDefaultConfiguration();
        settings.reRead();
        data.writeEmptyState();
        fs.copyFileSync(path.join(__dirname, 'assets', 'mock-external-converter.js'), path.join(data.mockDir, 'mock-external-converter.js'));
        settings.set(['external_converters'], ['mock-external-converter.js']);
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        mocksClear.forEach((m) => m.mockClear());
        await flushPromises();
    });

    beforeEach(async () => {
        mocksClear.forEach((m) => m.mockClear());
        await flushPromises();
        const device = zigbeeHerdsman.devices.bulb_color;
        device.lastSeen = 1000;
        external_converter_device.lastSeen = 1000;
        global.setTimeout = (r) => r();
    });

    afterEach(async () => {
        global.setTimeout = setTimeoutNative;
    });

    function mock() {
        /**
         * Topology
         *             | -> external_device
         *             | -> bulb_color -> unsupported_router (offline)
         * coordinator |      ^     ^
         *             |      |     | (not valid)
         *             | -> bulb    |
         *                    |  -> CC2530_ROUTER -> WXKG02LM_rev1
         *
         */
        coordinator.lqi = () => {return {neighbors: [
            {ieeeAddr: bulb_color.ieeeAddr, networkAddress: bulb_color.networkAddress, relationship: 2, depth: 1, linkquality: 120},
            {ieeeAddr: bulb.ieeeAddr, networkAddress: bulb.networkAddress, relationship: 2, depth: 1, linkquality: 92},
            {ieeeAddr: external_converter_device.ieeeAddr, networkAddress: external_converter_device.networkAddress, relationship: 2, depth: 1, linkquality: 92}
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
            {ieeeAddr: '0x0000000000000000', networkAddress: WXKG02LM_rev1.networkAddress, relationship: 1, depth: 2, linkquality: 130},
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

        const expected =  {"links":[{"depth":1,"linkquality":120,"lqi":120,"relationship":2,"routes":[],"source":{"ieeeAddr":"0x000b57fffec6a5b3","networkAddress":40399},"sourceIeeeAddr":"0x000b57fffec6a5b3","sourceNwkAddr":40399,"target":{"ieeeAddr":"0x00124b00120144ae","networkAddress":0},"targetIeeeAddr":"0x00124b00120144ae"},{"depth":1,"linkquality":92,"lqi":92,"relationship":2,"routes":[{"destinationAddress":6540,"nextHop":40369,"status":"ACTIVE"}],"source":{"ieeeAddr":"0x000b57fffec6a5b2","networkAddress":40369},"sourceIeeeAddr":"0x000b57fffec6a5b2","sourceNwkAddr":40369,"target":{"ieeeAddr":"0x00124b00120144ae","networkAddress":0},"targetIeeeAddr":"0x00124b00120144ae"},{"depth":1,"linkquality":92,"lqi":92,"relationship":2,"routes":[],"source":{"ieeeAddr":"0x0017880104e45511","networkAddress":1114},"sourceIeeeAddr":"0x0017880104e45511","sourceNwkAddr":1114,"target":{"ieeeAddr":"0x00124b00120144ae","networkAddress":0},"targetIeeeAddr":"0x00124b00120144ae"},{"depth":2,"linkquality":110,"lqi":110,"relationship":1,"routes":[],"source":{"ieeeAddr":"0x000b57fffec6a5b3","networkAddress":40399},"sourceIeeeAddr":"0x000b57fffec6a5b3","sourceNwkAddr":40399,"target":{"ieeeAddr":"0x000b57fffec6a5b2","networkAddress":40369},"targetIeeeAddr":"0x000b57fffec6a5b2"},{"depth":2,"linkquality":100,"lqi":100,"relationship":1,"routes":[],"source":{"ieeeAddr":"0x0017880104e45559","networkAddress":6540},"sourceIeeeAddr":"0x0017880104e45559","sourceNwkAddr":6540,"target":{"ieeeAddr":"0x000b57fffec6a5b2","networkAddress":40369},"targetIeeeAddr":"0x000b57fffec6a5b2"},{"depth":2,"linkquality":130,"lqi":130,"relationship":1,"routes":[],"source":{"ieeeAddr":"0x0017880104e45521","networkAddress":6538},"sourceIeeeAddr":"0x0017880104e45521","sourceNwkAddr":6538,"target":{"ieeeAddr":"0x0017880104e45559","networkAddress":6540},"targetIeeeAddr":"0x0017880104e45559"}],"nodes":[{"definition":null,"failed":[],"friendlyName":"Coordinator","ieeeAddr":"0x00124b00120144ae","lastSeen":1000,"modelID":null,"networkAddress":0,"type":"Coordinator"},{"definition":{"description":"TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white","model":"LED1545G12","supports":"light (state, brightness, color_temp, color_temp_startup), effect, power_on_behavior, linkquality","vendor":"IKEA"},"failed":[],"friendlyName":"bulb","ieeeAddr":"0x000b57fffec6a5b2","lastSeen":1000,"modelID":"TRADFRI bulb E27 WS opal 980lm","networkAddress":40369,"type":"Router"},{"definition":{"description":"Hue Go","model":"7146060PH","supports":"light (state, brightness, color_temp, color_temp_startup, color_xy, color_hs), effect, linkquality","vendor":"Philips"},"failed":[],"friendlyName":"bulb_color","ieeeAddr":"0x000b57fffec6a5b3","lastSeen":1000,"modelID":"LLC020","networkAddress":40399,"type":"Router"},{"definition":{"description":"Aqara double key wireless wall switch (2016 model)","model":"WXKG02LM_rev1","supports":"battery, action, voltage, linkquality","vendor":"Xiaomi"},"friendlyName":"button_double_key","ieeeAddr":"0x0017880104e45521","lastSeen":1000,"modelID":"lumi.sensor_86sw2.es1","networkAddress":6538,"type":"EndDevice"},{"definition":null,"failed":["lqi","routingTable"],"friendlyName":"0x0017880104e45525","ieeeAddr":"0x0017880104e45525","lastSeen":1000,"manufacturerName":"Boef","modelID":"notSupportedModelID","networkAddress":6536,"type":"Router"},{"definition":{"description":"[CC2530 router](http://ptvo.info/cc2530-based-zigbee-coordinator-and-router-112/)","model":"CC2530.ROUTER","supports":"led, linkquality","vendor":"Custom devices (DiY)"},"failed":[],"friendlyName":"cc2530_router","ieeeAddr":"0x0017880104e45559","lastSeen":1000,"modelID":"lumi.router","networkAddress":6540,"type":"Router"},{"definition":{"description": "external","model":"external_converter_device","supports":"linkquality","vendor":"external"},"friendlyName":"0x0017880104e45511","ieeeAddr":"0x0017880104e45511","lastSeen":1000,"modelID":"external_converter_device","networkAddress":1114,"type":"EndDevice"}]};
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
              "0x00124b00120144ae" [style="bold, filled", fillcolor="#e04e5d", fontcolor="#ffffff", label="{Coordinator|0x00124b00120144ae (0x0000)|0 seconds ago}"];
              "0x000b57fffec6a5b2" [style="rounded, filled", fillcolor="#4ea3e0", fontcolor="#ffffff", label="{bulb|0x000b57fffec6a5b2 (0x9db1)|IKEA TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white (LED1545G12)|9 seconds ago}"];
              "0x000b57fffec6a5b2" -> "0x00124b00120144ae" [penwidth=2, weight=1, color="#009900", label="92 (routes: 0x198c)"]
              "0x000b57fffec6a5b3" [style="rounded, filled", fillcolor="#4ea3e0", fontcolor="#ffffff", label="{bulb_color|0x000b57fffec6a5b3 (0x9dcf)|Philips Hue Go (7146060PH)|unknown}"];
              "0x000b57fffec6a5b3" -> "0x00124b00120144ae" [penwidth=0.5, weight=0, color="#994444", label="120"]
              "0x000b57fffec6a5b3" -> "0x000b57fffec6a5b2" [penwidth=0.5, weight=0, color="#994444", label="110"]
              "0x0017880104e45521" [style="rounded, dashed, filled", fillcolor="#fff8ce", fontcolor="#000000", label="{button_double_key|0x0017880104e45521 (0x198a)|Xiaomi Aqara double key wireless wall switch (2016 model) (WXKG02LM_rev1)|9 seconds ago}"];
              "0x0017880104e45521" -> "0x0017880104e45559" [penwidth=1, weight=0, color="#994444", label="130"]
              "0x0017880104e45525" [style="rounded, filled", fillcolor="#4ea3e0", fontcolor="#ffffff", label="{0x0017880104e45525|0x0017880104e45525 (0x1988)failed: lqi,routingTable|Boef notSupportedModelID|9 seconds ago}"];
              "0x0017880104e45559" [style="rounded, filled", fillcolor="#4ea3e0", fontcolor="#ffffff", label="{cc2530_router|0x0017880104e45559 (0x198c)|Custom devices (DiY) [CC2530 router](http://ptvo.info/cc2530-based-zigbee-coordinator-and-router-112/) (CC2530.ROUTER)|9 seconds ago}"];
              "0x0017880104e45559" -> "0x000b57fffec6a5b2" [penwidth=0.5, weight=0, color="#994444", label="100"]
              "0x0017880104e45511" [style="rounded, dashed, filled", fillcolor="#fff8ce", fontcolor="#000000", label="{0x0017880104e45511|0x0017880104e45511 (0x045a)|external external (external_converter_device)|9 seconds ago}"];
              "0x0017880104e45511" -> "0x00124b00120144ae" [penwidth=1, weight=0, color="#994444", label="92"]
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
        card 0x0017880104e45511 [
        0x0017880104e45511
        ---
        0x0017880104e45511 (0x045a)
        ---
        external external (external_converter_device)
        ---
        9 seconds ago
        ]

        card 0x0017880104e45525 [
        0x0017880104e45525
        ---
        0x0017880104e45525 (0x1988) failed: lqi,routingTable
        ---
        Boef notSupportedModelID
        ---
        9 seconds ago
        ]

        card 0x000b57fffec6a5b2 [
        bulb
        ---
        0x000b57fffec6a5b2 (0x9db1)
        ---
        IKEA TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white (LED1545G12)
        ---
        9 seconds ago
        ]

        card 0x000b57fffec6a5b3 [
        bulb_color
        ---
        0x000b57fffec6a5b3 (0x9dcf)
        ---
        Philips Hue Go (7146060PH)
        ---
        unknown
        ]

        card 0x0017880104e45521 [
        button_double_key
        ---
        0x0017880104e45521 (0x198a)
        ---
        Xiaomi Aqara double key wireless wall switch (2016 model) (WXKG02LM_rev1)
        ---
        9 seconds ago
        ]

        card 0x0017880104e45559 [
        cc2530_router
        ---
        0x0017880104e45559 (0x198c)
        ---
        Custom devices (DiY) [CC2530 router](http://ptvo.info/cc2530-based-zigbee-coordinator-and-router-112/) (CC2530.ROUTER)
        ---
        9 seconds ago
        ]

        card 0x00124b00120144ae [
        Coordinator
        ---
        0x00124b00120144ae (0x0000)
        ---
        0 seconds ago
        ]

        0x000b57fffec6a5b3 --> 0x00124b00120144ae: 120
        0x000b57fffec6a5b2 --> 0x00124b00120144ae: 92
        0x0017880104e45511 --> 0x00124b00120144ae: 92
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

        const expected = {"data":{"routes":true,"type":"raw","value":{"links":[{"depth":1,"linkquality":120,"lqi":120,"relationship":2,"routes":[],"source":{"ieeeAddr":"0x000b57fffec6a5b3","networkAddress":40399},"sourceIeeeAddr":"0x000b57fffec6a5b3","sourceNwkAddr":40399,"target":{"ieeeAddr":"0x00124b00120144ae","networkAddress":0},"targetIeeeAddr":"0x00124b00120144ae"},{"depth":1,"linkquality":92,"lqi":92,"relationship":2,"routes":[{"destinationAddress":6540,"nextHop":40369,"status":"ACTIVE"}],"source":{"ieeeAddr":"0x000b57fffec6a5b2","networkAddress":40369},"sourceIeeeAddr":"0x000b57fffec6a5b2","sourceNwkAddr":40369,"target":{"ieeeAddr":"0x00124b00120144ae","networkAddress":0},"targetIeeeAddr":"0x00124b00120144ae"},{"depth":1,"linkquality":92,"lqi":92,"relationship":2,"routes":[],"source":{"ieeeAddr":"0x0017880104e45511","networkAddress":1114},"sourceIeeeAddr":"0x0017880104e45511","sourceNwkAddr":1114,"target":{"ieeeAddr":"0x00124b00120144ae","networkAddress":0},"targetIeeeAddr":"0x00124b00120144ae"},{"depth":2,"linkquality":110,"lqi":110,"relationship":1,"routes":[],"source":{"ieeeAddr":"0x000b57fffec6a5b3","networkAddress":40399},"sourceIeeeAddr":"0x000b57fffec6a5b3","sourceNwkAddr":40399,"target":{"ieeeAddr":"0x000b57fffec6a5b2","networkAddress":40369},"targetIeeeAddr":"0x000b57fffec6a5b2"},{"depth":2,"linkquality":100,"lqi":100,"relationship":1,"routes":[],"source":{"ieeeAddr":"0x0017880104e45559","networkAddress":6540},"sourceIeeeAddr":"0x0017880104e45559","sourceNwkAddr":6540,"target":{"ieeeAddr":"0x000b57fffec6a5b2","networkAddress":40369},"targetIeeeAddr":"0x000b57fffec6a5b2"},{"depth":2,"linkquality":130,"lqi":130,"relationship":1,"routes":[],"source":{"ieeeAddr":"0x0017880104e45521","networkAddress":6538},"sourceIeeeAddr":"0x0017880104e45521","sourceNwkAddr":6538,"target":{"ieeeAddr":"0x0017880104e45559","networkAddress":6540},"targetIeeeAddr":"0x0017880104e45559"}],"nodes":[{"definition":null,"failed":[],"friendlyName":"Coordinator","ieeeAddr":"0x00124b00120144ae","lastSeen":1000,"modelID":null,"networkAddress":0,"type":"Coordinator"},{"definition":{"description":"TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white","model":"LED1545G12","supports":"light (state, brightness, color_temp, color_temp_startup), effect, power_on_behavior, linkquality","vendor":"IKEA"},"failed":[],"friendlyName":"bulb","ieeeAddr":"0x000b57fffec6a5b2","lastSeen":1000,"modelID":"TRADFRI bulb E27 WS opal 980lm","networkAddress":40369,"type":"Router"},{"definition":{"description":"Hue Go","model":"7146060PH","supports":"light (state, brightness, color_temp, color_temp_startup, color_xy, color_hs), effect, linkquality","vendor":"Philips"},"failed":[],"friendlyName":"bulb_color","ieeeAddr":"0x000b57fffec6a5b3","lastSeen":1000,"modelID":"LLC020","networkAddress":40399,"type":"Router"},{"definition":{"description":"Aqara double key wireless wall switch (2016 model)","model":"WXKG02LM_rev1","supports":"battery, action, voltage, linkquality","vendor":"Xiaomi"},"friendlyName":"button_double_key","ieeeAddr":"0x0017880104e45521","lastSeen":1000,"modelID":"lumi.sensor_86sw2.es1","networkAddress":6538,"type":"EndDevice"},{"definition":null,"failed":["lqi","routingTable"],"friendlyName":"0x0017880104e45525","ieeeAddr":"0x0017880104e45525","lastSeen":1000,"manufacturerName":"Boef","modelID":"notSupportedModelID","networkAddress":6536,"type":"Router"},{"definition":{"description":"[CC2530 router](http://ptvo.info/cc2530-based-zigbee-coordinator-and-router-112/)","model":"CC2530.ROUTER","supports":"led, linkquality","vendor":"Custom devices (DiY)"},"failed":[],"friendlyName":"cc2530_router","ieeeAddr":"0x0017880104e45559","lastSeen":1000,"modelID":"lumi.router","networkAddress":6540,"type":"Router"},{"definition":{"description":"external","model":"external_converter_device","supports":"linkquality","vendor":"external"},"friendlyName":"0x0017880104e45511","ieeeAddr":"0x0017880104e45511","lastSeen":1000,"modelID":"external_converter_device","networkAddress":1114,"type":"EndDevice"}]}},"status":"ok"};
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
