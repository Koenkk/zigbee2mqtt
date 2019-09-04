const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');

const {coordinator, bulb, bulb_color, WXKG02LM, CC2530_ROUTER} = zigbeeHerdsman.devices;

zigbeeHerdsman.returnDevices.push(coordinator.ieeeAddr);
zigbeeHerdsman.returnDevices.push(bulb.ieeeAddr);
zigbeeHerdsman.returnDevices.push(bulb_color.ieeeAddr);
zigbeeHerdsman.returnDevices.push(WXKG02LM.ieeeAddr);
zigbeeHerdsman.returnDevices.push(CC2530_ROUTER.ieeeAddr);
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mocksClear = [MQTT.publish, logger.warn, logger.debug];

describe('onlythis Networkmap', () => {
    let controller;

    beforeAll(async () => {
        data.writeDefaultConfiguration();
        settings._reRead();
        data.writeEmptyState();
        controller = new Controller();
        await controller.start();
        mocksClear.forEach((m) => m.mockClear());
        await flushPromises();
    });

    beforeEach(async () => {
        mocksClear.forEach((m) => m.mockClear());
        await flushPromises();
    });

    function mock() {
        /**
         * Topology
         *             | -> bulb_color
         * coordinator |
         *             | -> bulb
         */
        coordinator.lqi = () => {return {neighbors: [
            {ieeeAddr: bulb_color.ieeeAddr, networkAddress: bulb_color.networkAddress, relationship: 2, depth: 1, linkquality: 120}
        ]}};
        coordinator.routingTable = () => {return {table: []}};

        bulb.lqi = () => {return {neighbors: []}}
        bulb.routingTable = () => {return {table: []}};
        bulb_color.lqi = () => {return {neighbors: []}}
        bulb_color.routingTable = () => {return {table: []}};
        CC2530_ROUTER.lqi = () => {return {neighbors: []}}
        CC2530_ROUTER.routingTable = () => {return {table: []}};
    }

    it('Output raw networkmap', async () => {
        mock();
        MQTT.events.message('zigbee2mqtt/bridge/networkmap', 'raw');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        const call = MQTT.publish.mock.calls[0];
        expect(call[0]).toStrictEqual('zigbee2mqtt/bridge/networkmap/raw');

        const conv = (device) => {return {ieeeAddr: device.ieeeAddr, networkAddress: device.networkAddress}};

        const expected = {
            "nodes":[
                {"ieeeAddr":coordinator.ieeeAddr,"friendlyName":"Coordinator","type":"Coordinator","networkAddress":0,"modelID":null,"failed":[]},
                {"ieeeAddr":bulb.ieeeAddr,"friendlyName":"bulb","type":"Router","networkAddress":40369,"modelID":"TRADFRI bulb E27 WS opal 980lm","failed":[]},
                {"ieeeAddr":bulb_color.ieeeAddr,"friendlyName":"bulb_color","type":"Router","networkAddress":40399,"modelID":"LLC020","failed":[]},
                {"ieeeAddr":CC2530_ROUTER.ieeeAddr,"friendlyName":"cc2530_router","type":"Router","networkAddress":6540,"modelID":"lumi.router","failed":[]}
            ],
            "links":[
                {depth: 1, linkquality: 120, routes: [], source: conv(bulb_color), target: conv(coordinator)}
            ]
        };

        expect(JSON.parse(call[1])).toStrictEqual(expected);
    });
});
