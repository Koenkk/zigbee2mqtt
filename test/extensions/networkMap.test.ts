import * as data from '../mocks/data';
import {mockLogger} from '../mocks/logger';
import {events as mockMQTTEvents, mockMQTTPublishAsync} from '../mocks/mqtt';
import * as mockSleep from '../mocks/sleep';
import {flushPromises} from '../mocks/utils';
import {devices, events as mockZHEvents, returnDevices} from '../mocks/zigbeeHerdsman';

import fs from 'node:fs';
import path from 'node:path';

import stringify from 'json-stable-stringify-without-jsonify';

import {Controller} from '../../lib/controller';
import * as settings from '../../lib/util/settings';

returnDevices.push(
    devices.coordinator.ieeeAddr,
    devices.bulb.ieeeAddr,
    devices.bulb_color.ieeeAddr,
    devices.WXKG02LM_rev1.ieeeAddr,
    devices.CC2530_ROUTER.ieeeAddr,
    devices.unsupported_router.ieeeAddr,
    devices.external_converter_device.ieeeAddr,
);

const mocksClear = [mockMQTTPublishAsync, mockLogger.warning, mockLogger.debug];

describe('Extension: NetworkMap', () => {
    let controller: Controller;

    const mock = (): void => {
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
        devices.coordinator.lqi.mockResolvedValueOnce({
            neighbors: [
                {
                    ieeeAddr: devices.bulb_color.ieeeAddr,
                    networkAddress: devices.bulb_color.networkAddress,
                    relationship: 2,
                    depth: 1,
                    linkquality: 120,
                },
                {ieeeAddr: devices.bulb.ieeeAddr, networkAddress: devices.bulb.networkAddress, relationship: 2, depth: 1, linkquality: 92},
                {
                    ieeeAddr: devices.external_converter_device.ieeeAddr,
                    networkAddress: devices.external_converter_device.networkAddress,
                    relationship: 2,
                    depth: 1,
                    linkquality: 92,
                },
            ],
        });
        devices.coordinator.routingTable.mockResolvedValueOnce({
            table: [{destinationAddress: devices.CC2530_ROUTER.networkAddress, status: 'ACTIVE', nextHop: devices.bulb.networkAddress}],
        });
        devices.bulb.lqi.mockResolvedValueOnce({
            neighbors: [
                {
                    ieeeAddr: devices.bulb_color.ieeeAddr,
                    networkAddress: devices.bulb_color.networkAddress,
                    relationship: 1,
                    depth: 2,
                    linkquality: 110,
                },
                {
                    ieeeAddr: devices.CC2530_ROUTER.ieeeAddr,
                    networkAddress: devices.CC2530_ROUTER.networkAddress,
                    relationship: 1,
                    depth: 2,
                    linkquality: 100,
                },
            ],
        });
        devices.CC2530_ROUTER.lqi.mockResolvedValueOnce({
            neighbors: [
                {ieeeAddr: '0x0000000000000000', networkAddress: devices.WXKG02LM_rev1.networkAddress, relationship: 1, depth: 2, linkquality: 130},
                {
                    ieeeAddr: devices.bulb_color.ieeeAddr,
                    networkAddress: devices.bulb_color.networkAddress,
                    relationship: 4,
                    depth: 2,
                    linkquality: 130,
                },
            ],
        });
        devices.unsupported_router.lqi.mockRejectedValueOnce('failed').mockRejectedValueOnce('failed');
        devices.unsupported_router.routingTable.mockRejectedValueOnce('failed').mockRejectedValueOnce('failed');
    };

    beforeAll(async () => {
        vi.useFakeTimers();
        mockSleep.mock();
        vi.spyOn(Date, 'now').mockReturnValue(10000);
        data.writeDefaultConfiguration();
        settings.reRead();
        data.writeEmptyState();
        fs.mkdirSync(path.join(data.mockDir, 'external_converters'));
        fs.copyFileSync(
            path.join(__dirname, '..', 'assets', 'external_converters', 'mock-external-converter.js'),
            path.join(data.mockDir, 'external_converters', 'mock-external-converter.js'),
        );
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
    });

    beforeEach(async () => {
        mocksClear.forEach((m) => m.mockClear());
        await flushPromises();
        const device = devices.bulb_color;
        device.lastSeen = 1000;
        devices.external_converter_device.lastSeen = 1000;
    });

    afterEach(async () => {});

    afterAll(async () => {
        mockSleep.restore();
        fs.rmSync(path.join(data.mockDir, 'external_converters'), {recursive: true});
        vi.useRealTimers();
    });

    it('Output raw networkmap', async () => {
        mock();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/networkmap', stringify({type: 'raw', routes: true}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/response/networkmap');

        const expected = {
            data: {
                routes: true,
                type: 'raw',
                value: {
                    links: [
                        {
                            depth: 1,
                            linkquality: 120,
                            lqi: 120,
                            relationship: 2,
                            routes: [],
                            source: {ieeeAddr: '0x000b57fffec6a5b3', networkAddress: 40399},
                            sourceIeeeAddr: '0x000b57fffec6a5b3',
                            sourceNwkAddr: 40399,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 1,
                            linkquality: 92,
                            lqi: 92,
                            relationship: 2,
                            routes: [{destinationAddress: 6540, nextHop: 40369, status: 'ACTIVE'}],
                            source: {ieeeAddr: '0x000b57fffec6a5b2', networkAddress: 40369},
                            sourceIeeeAddr: '0x000b57fffec6a5b2',
                            sourceNwkAddr: 40369,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 1,
                            linkquality: 92,
                            lqi: 92,
                            relationship: 2,
                            routes: [],
                            source: {ieeeAddr: '0x0017880104e45511', networkAddress: 1114},
                            sourceIeeeAddr: '0x0017880104e45511',
                            sourceNwkAddr: 1114,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 2,
                            linkquality: 110,
                            lqi: 110,
                            relationship: 1,
                            routes: [],
                            source: {ieeeAddr: '0x000b57fffec6a5b3', networkAddress: 40399},
                            sourceIeeeAddr: '0x000b57fffec6a5b3',
                            sourceNwkAddr: 40399,
                            target: {ieeeAddr: '0x000b57fffec6a5b2', networkAddress: 40369},
                            targetIeeeAddr: '0x000b57fffec6a5b2',
                        },
                        {
                            depth: 2,
                            linkquality: 100,
                            lqi: 100,
                            relationship: 1,
                            routes: [],
                            source: {ieeeAddr: '0x0017880104e45559', networkAddress: 6540},
                            sourceIeeeAddr: '0x0017880104e45559',
                            sourceNwkAddr: 6540,
                            target: {ieeeAddr: '0x000b57fffec6a5b2', networkAddress: 40369},
                            targetIeeeAddr: '0x000b57fffec6a5b2',
                        },
                        {
                            depth: 2,
                            linkquality: 130,
                            lqi: 130,
                            relationship: 1,
                            routes: [],
                            source: {ieeeAddr: '0x0017880104e45521', networkAddress: 6538},
                            sourceIeeeAddr: '0x0017880104e45521',
                            sourceNwkAddr: 6538,
                            target: {ieeeAddr: '0x0017880104e45559', networkAddress: 6540},
                            targetIeeeAddr: '0x0017880104e45559',
                        },
                    ],
                    nodes: [
                        {
                            // definition: null,
                            failed: [],
                            friendlyName: 'Coordinator',
                            ieeeAddr: '0x00124b00120144ae',
                            lastSeen: 1000,
                            // modelID: null,
                            networkAddress: 0,
                            type: 'Coordinator',
                        },
                        {
                            definition: {
                                description: 'TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm',
                                model: 'LED1545G12',
                                supports:
                                    'light (state, brightness, color_temp, color_temp_startup, level_config), effect, power_on_behavior, color_options, identify, linkquality',
                                vendor: 'IKEA',
                            },
                            failed: [],
                            friendlyName: 'bulb',
                            ieeeAddr: '0x000b57fffec6a5b2',
                            lastSeen: 1000,
                            modelID: 'TRADFRI bulb E27 WS opal 980lm',
                            networkAddress: 40369,
                            type: 'Router',
                        },
                        {
                            definition: {
                                description: 'Hue Go',
                                model: '7146060PH',
                                supports:
                                    'light (state, brightness, color_temp, color_temp_startup, color_xy, color_hs), power_on_behavior, effect, linkquality',
                                vendor: 'Philips',
                            },
                            failed: [],
                            friendlyName: 'bulb_color',
                            ieeeAddr: '0x000b57fffec6a5b3',
                            lastSeen: 1000,
                            modelID: 'LLC020',
                            networkAddress: 40399,
                            type: 'Router',
                        },
                        {
                            definition: {
                                description: 'Wireless remote switch (double rocker), 2016 model',
                                model: 'WXKG02LM_rev1',
                                supports: 'battery, voltage, power_outage_count, action, linkquality',
                                vendor: 'Aqara',
                            },
                            friendlyName: 'button_double_key',
                            ieeeAddr: '0x0017880104e45521',
                            lastSeen: 1000,
                            modelID: 'lumi.sensor_86sw2.es1',
                            networkAddress: 6538,
                            type: 'EndDevice',
                        },
                        {
                            definition: {
                                description: 'Automatically generated definition',
                                model: 'notSupportedModelID',
                                supports: 'action, linkquality',
                                vendor: 'Boef',
                            },
                            failed: ['lqi', 'routingTable'],
                            friendlyName: '0x0017880104e45525',
                            ieeeAddr: '0x0017880104e45525',
                            lastSeen: 1000,
                            manufacturerName: 'Boef',
                            modelID: 'notSupportedModelID',
                            networkAddress: 6536,
                            type: 'Router',
                        },
                        {
                            definition: {
                                description: 'CC2530 router',
                                model: 'CC2530.ROUTER',
                                supports: 'led, linkquality',
                                vendor: 'Custom devices (DiY)',
                            },
                            failed: [],
                            friendlyName: 'cc2530_router',
                            ieeeAddr: '0x0017880104e45559',
                            lastSeen: 1000,
                            modelID: 'lumi.router',
                            networkAddress: 6540,
                            type: 'Router',
                        },
                        {
                            definition: {description: 'external', model: 'external_converter_device', supports: 'linkquality', vendor: 'external'},
                            friendlyName: '0x0017880104e45511',
                            ieeeAddr: '0x0017880104e45511',
                            lastSeen: 1000,
                            modelID: 'external_converter_device',
                            networkAddress: 1114,
                            type: 'EndDevice',
                        },
                    ],
                },
            },
            status: 'ok',
        };
        const actual = JSON.parse(mockMQTTPublishAsync.mock.calls[0][1]);
        expect(actual).toStrictEqual(expected);
    });

    it('Output graphviz networkmap', async () => {
        mock();
        const device = devices.bulb_color;
        device.lastSeen = undefined;
        const endpoint = device.getEndpoint(1);
        const data = {modelID: 'test'};
        const payload = {data, cluster: 'genOnOff', device, endpoint, type: 'readResponse', linkquality: 10};
        await mockZHEvents.message(payload);
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/networkmap', stringify({type: 'graphviz', routes: true}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/response/networkmap');

        const expected = `digraph G {
            node[shape=record];
              "0x00124b00120144ae" [style="bold, filled", fillcolor="#e04e5d", fontcolor="#ffffff", label="{Coordinator|0x00124b00120144ae (0x0000)|0 seconds ago}"];
              "0x000b57fffec6a5b2" [style="rounded, filled", fillcolor="#4ea3e0", fontcolor="#ffffff", label="{bulb|0x000b57fffec6a5b2 (0x9db1)|IKEA TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm (LED1545G12)|9 seconds ago}"];
              "0x000b57fffec6a5b2" -> "0x00124b00120144ae" [penwidth=2, weight=1, color="#009900", label="92 (routes: 0x198c)"]
              "0x000b57fffec6a5b3" [style="rounded, filled", fillcolor="#4ea3e0", fontcolor="#ffffff", label="{bulb_color|0x000b57fffec6a5b3 (0x9dcf)|Philips Hue Go (7146060PH)|unknown}"];
              "0x000b57fffec6a5b3" -> "0x00124b00120144ae" [penwidth=0.5, weight=0, color="#994444", label="120"]
              "0x000b57fffec6a5b3" -> "0x000b57fffec6a5b2" [penwidth=0.5, weight=0, color="#994444", label="110"]
              "0x0017880104e45521" [style="rounded, dashed, filled", fillcolor="#fff8ce", fontcolor="#000000", label="{button_double_key|0x0017880104e45521 (0x198a)|Aqara Wireless remote switch (double rocker), 2016 model (WXKG02LM_rev1)|9 seconds ago}"];
              "0x0017880104e45521" -> "0x0017880104e45559" [penwidth=1, weight=0, color="#994444", label="130"]
              "0x0017880104e45525" [style="rounded, filled", fillcolor="#4ea3e0", fontcolor="#ffffff", label="{0x0017880104e45525|0x0017880104e45525 (0x1988)failed: lqi,routingTable|Boef Automatically generated definition (notSupportedModelID)|9 seconds ago}"];
              "0x0017880104e45559" [style="rounded, filled", fillcolor="#4ea3e0", fontcolor="#ffffff", label="{cc2530_router|0x0017880104e45559 (0x198c)|Custom devices (DiY) CC2530 router (CC2530.ROUTER)|9 seconds ago}"];
              "0x0017880104e45559" -> "0x000b57fffec6a5b2" [penwidth=0.5, weight=0, color="#994444", label="100"]
              "0x0017880104e45511" [style="rounded, dashed, filled", fillcolor="#fff8ce", fontcolor="#000000", label="{0x0017880104e45511|0x0017880104e45511 (0x045a)|external external (external_converter_device)|9 seconds ago}"];
              "0x0017880104e45511" -> "0x00124b00120144ae" [penwidth=1, weight=0, color="#994444", label="92"]
            }`;

        const expectedLines = expected.split('\n');
        const actualLines = JSON.parse(mockMQTTPublishAsync.mock.calls[0][1]).data.value.split('\n');

        for (let i = 0; i < expectedLines.length; i++) {
            expect(actualLines[i].trim()).toStrictEqual(expectedLines[i].trim());
        }
    });

    it('Output plantuml networkmap', async () => {
        mock();
        const device = devices.bulb_color;
        device.lastSeen = undefined;
        const endpoint = device.getEndpoint(1);
        const data = {modelID: 'test'};
        const payload = {data, cluster: 'genOnOff', device, endpoint, type: 'readResponse', linkquality: 10};
        await mockZHEvents.message(payload);
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/networkmap', stringify({type: 'plantuml', routes: true}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/response/networkmap');

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
        Boef Automatically generated definition (notSupportedModelID)
        ---
        9 seconds ago
        ]

        card 0x000b57fffec6a5b2 [
        bulb
        ---
        0x000b57fffec6a5b2 (0x9db1)
        ---
        IKEA TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm (LED1545G12)
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
        Aqara Wireless remote switch (double rocker), 2016 model (WXKG02LM_rev1)
        ---
        9 seconds ago
        ]

        card 0x0017880104e45559 [
        cc2530_router
        ---
        0x0017880104e45559 (0x198c)
        ---
        Custom devices (DiY) CC2530 router (CC2530.ROUTER)
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
        const actualLines = JSON.parse(mockMQTTPublishAsync.mock.calls[0][1]).data.value.split('\n');

        for (let i = 0; i < expectedLines.length; i++) {
            expect(actualLines[i].trim()).toStrictEqual(expectedLines[i].trim());
        }
    });

    it('Should throw error when requesting invalid type', async () => {
        mock();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/networkmap', 'not_existing');
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/networkmap',
            stringify({data: {}, status: 'error', error: "Type 'not_existing' not supported, allowed are: raw,graphviz,plantuml"}),
            {retain: false, qos: 0},
        );
    });

    it('Should exclude disabled devices from networkmap', async () => {
        settings.set(['devices', '0x000b57fffec6a5b2', 'disabled'], true);
        mock();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/networkmap', stringify({type: 'raw', routes: true}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/response/networkmap');

        const expected = {
            data: {
                routes: true,
                type: 'raw',
                value: {
                    links: [
                        {
                            depth: 1,
                            linkquality: 120,
                            lqi: 120,
                            relationship: 2,
                            routes: [],
                            source: {ieeeAddr: '0x000b57fffec6a5b3', networkAddress: 40399},
                            sourceIeeeAddr: '0x000b57fffec6a5b3',
                            sourceNwkAddr: 40399,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 1,
                            linkquality: 92,
                            lqi: 92,
                            relationship: 2,
                            routes: [{destinationAddress: 6540, nextHop: 40369, status: 'ACTIVE'}],
                            source: {ieeeAddr: '0x000b57fffec6a5b2', networkAddress: 40369},
                            sourceIeeeAddr: '0x000b57fffec6a5b2',
                            sourceNwkAddr: 40369,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 1,
                            linkquality: 92,
                            lqi: 92,
                            relationship: 2,
                            routes: [],
                            source: {ieeeAddr: '0x0017880104e45511', networkAddress: 1114},
                            sourceIeeeAddr: '0x0017880104e45511',
                            sourceNwkAddr: 1114,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 2,
                            linkquality: 130,
                            lqi: 130,
                            relationship: 1,
                            routes: [],
                            source: {ieeeAddr: '0x0017880104e45521', networkAddress: 6538},
                            sourceIeeeAddr: '0x0017880104e45521',
                            sourceNwkAddr: 6538,
                            target: {ieeeAddr: '0x0017880104e45559', networkAddress: 6540},
                            targetIeeeAddr: '0x0017880104e45559',
                        },
                    ],
                    nodes: [
                        {
                            failed: [],
                            friendlyName: 'Coordinator',
                            ieeeAddr: '0x00124b00120144ae',
                            lastSeen: 1000,
                            networkAddress: 0,
                            type: 'Coordinator',
                        },
                        {
                            definition: {
                                description: 'Hue Go',
                                model: '7146060PH',
                                supports:
                                    'light (state, brightness, color_temp, color_temp_startup, color_xy, color_hs), power_on_behavior, effect, linkquality',
                                vendor: 'Philips',
                            },
                            failed: [],
                            friendlyName: 'bulb_color',
                            ieeeAddr: '0x000b57fffec6a5b3',
                            lastSeen: 1000,
                            modelID: 'LLC020',
                            networkAddress: 40399,
                            type: 'Router',
                        },
                        {
                            definition: {
                                description: 'Wireless remote switch (double rocker), 2016 model',
                                model: 'WXKG02LM_rev1',
                                supports: 'battery, voltage, power_outage_count, action, linkquality',
                                vendor: 'Aqara',
                            },
                            friendlyName: 'button_double_key',
                            ieeeAddr: '0x0017880104e45521',
                            lastSeen: 1000,
                            modelID: 'lumi.sensor_86sw2.es1',
                            networkAddress: 6538,
                            type: 'EndDevice',
                        },
                        {
                            definition: {
                                description: 'Automatically generated definition',
                                model: 'notSupportedModelID',
                                supports: 'action, linkquality',
                                vendor: 'Boef',
                            },
                            failed: ['lqi', 'routingTable'],
                            friendlyName: '0x0017880104e45525',
                            ieeeAddr: '0x0017880104e45525',
                            lastSeen: 1000,
                            manufacturerName: 'Boef',
                            modelID: 'notSupportedModelID',
                            networkAddress: 6536,
                            type: 'Router',
                        },
                        {
                            definition: {
                                description: 'CC2530 router',
                                model: 'CC2530.ROUTER',
                                supports: 'led, linkquality',
                                vendor: 'Custom devices (DiY)',
                            },
                            failed: [],
                            friendlyName: 'cc2530_router',
                            ieeeAddr: '0x0017880104e45559',
                            lastSeen: 1000,
                            modelID: 'lumi.router',
                            networkAddress: 6540,
                            type: 'Router',
                        },
                        {
                            definition: {description: 'external', model: 'external_converter_device', supports: 'linkquality', vendor: 'external'},
                            friendlyName: '0x0017880104e45511',
                            ieeeAddr: '0x0017880104e45511',
                            lastSeen: 1000,
                            modelID: 'external_converter_device',
                            networkAddress: 1114,
                            type: 'EndDevice',
                        },
                    ],
                },
            },
            status: 'ok',
        };
        const actual = JSON.parse(mockMQTTPublishAsync.mock.calls[0][1]);
        expect(actual).toStrictEqual(expected);
    });

    it('Handles retrying request when first attempt fails', async () => {
        settings.set(['devices', '0x000b57fffec6a5b2', 'disabled'], true);
        mock();
        devices.bulb.lqi.mockRejectedValueOnce('failed');
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/networkmap', stringify({type: 'raw', routes: true}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/response/networkmap');

        const expected = {
            data: {
                routes: true,
                type: 'raw',
                value: {
                    links: [
                        {
                            depth: 1,
                            linkquality: 120,
                            lqi: 120,
                            relationship: 2,
                            routes: [],
                            source: {ieeeAddr: '0x000b57fffec6a5b3', networkAddress: 40399},
                            sourceIeeeAddr: '0x000b57fffec6a5b3',
                            sourceNwkAddr: 40399,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 1,
                            linkquality: 92,
                            lqi: 92,
                            relationship: 2,
                            routes: [{destinationAddress: 6540, nextHop: 40369, status: 'ACTIVE'}],
                            source: {ieeeAddr: '0x000b57fffec6a5b2', networkAddress: 40369},
                            sourceIeeeAddr: '0x000b57fffec6a5b2',
                            sourceNwkAddr: 40369,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 1,
                            linkquality: 92,
                            lqi: 92,
                            relationship: 2,
                            routes: [],
                            source: {ieeeAddr: '0x0017880104e45511', networkAddress: 1114},
                            sourceIeeeAddr: '0x0017880104e45511',
                            sourceNwkAddr: 1114,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 2,
                            linkquality: 130,
                            lqi: 130,
                            relationship: 1,
                            routes: [],
                            source: {ieeeAddr: '0x0017880104e45521', networkAddress: 6538},
                            sourceIeeeAddr: '0x0017880104e45521',
                            sourceNwkAddr: 6538,
                            target: {ieeeAddr: '0x0017880104e45559', networkAddress: 6540},
                            targetIeeeAddr: '0x0017880104e45559',
                        },
                    ],
                    nodes: [
                        {
                            failed: [],
                            friendlyName: 'Coordinator',
                            ieeeAddr: '0x00124b00120144ae',
                            lastSeen: 1000,
                            networkAddress: 0,
                            type: 'Coordinator',
                        },
                        {
                            definition: {
                                description: 'Hue Go',
                                model: '7146060PH',
                                supports:
                                    'light (state, brightness, color_temp, color_temp_startup, color_xy, color_hs), power_on_behavior, effect, linkquality',
                                vendor: 'Philips',
                            },
                            failed: [],
                            friendlyName: 'bulb_color',
                            ieeeAddr: '0x000b57fffec6a5b3',
                            lastSeen: 1000,
                            modelID: 'LLC020',
                            networkAddress: 40399,
                            type: 'Router',
                        },
                        {
                            definition: {
                                description: 'Wireless remote switch (double rocker), 2016 model',
                                model: 'WXKG02LM_rev1',
                                supports: 'battery, voltage, power_outage_count, action, linkquality',
                                vendor: 'Aqara',
                            },
                            friendlyName: 'button_double_key',
                            ieeeAddr: '0x0017880104e45521',
                            lastSeen: 1000,
                            modelID: 'lumi.sensor_86sw2.es1',
                            networkAddress: 6538,
                            type: 'EndDevice',
                        },
                        {
                            definition: {
                                description: 'Automatically generated definition',
                                model: 'notSupportedModelID',
                                supports: 'action, linkquality',
                                vendor: 'Boef',
                            },
                            failed: ['lqi', 'routingTable'],
                            friendlyName: '0x0017880104e45525',
                            ieeeAddr: '0x0017880104e45525',
                            lastSeen: 1000,
                            manufacturerName: 'Boef',
                            modelID: 'notSupportedModelID',
                            networkAddress: 6536,
                            type: 'Router',
                        },
                        {
                            definition: {
                                description: 'CC2530 router',
                                model: 'CC2530.ROUTER',
                                supports: 'led, linkquality',
                                vendor: 'Custom devices (DiY)',
                            },
                            failed: [],
                            friendlyName: 'cc2530_router',
                            ieeeAddr: '0x0017880104e45559',
                            lastSeen: 1000,
                            modelID: 'lumi.router',
                            networkAddress: 6540,
                            type: 'Router',
                        },
                        {
                            definition: {description: 'external', model: 'external_converter_device', supports: 'linkquality', vendor: 'external'},
                            friendlyName: '0x0017880104e45511',
                            ieeeAddr: '0x0017880104e45511',
                            lastSeen: 1000,
                            modelID: 'external_converter_device',
                            networkAddress: 1114,
                            type: 'EndDevice',
                        },
                    ],
                },
            },
            status: 'ok',
        };
        const actual = JSON.parse(mockMQTTPublishAsync.mock.calls[0][1]);
        expect(actual).toStrictEqual(expected);
    });
});
