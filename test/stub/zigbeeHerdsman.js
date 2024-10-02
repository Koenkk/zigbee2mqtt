const events = {};
const assert = require('assert');

function getKeyByValue(object, value, fallback) {
    const key = Object.keys(object).find((k) => object[k] === value);
    return key != null ? key : fallback;
}

class Group {
    constructor(groupID, members) {
        this.groupID = groupID;
        this.command = jest.fn();
        this.meta = {};
        this.members = members;
        this.removeFromDatabase = jest.fn();
        this.removeFromNetwork = jest.fn();
        this.hasMember = (endpoint) => this.members.includes(endpoint);
    }
}

const clusters = {
    genBasic: 0,
    genOta: 25,
    genScenes: 5,
    genOnOff: 6,
    genLevelCtrl: 8,
    lightingColorCtrl: 768,
    closuresWindowCovering: 258,
    hvacThermostat: 513,
    msIlluminanceMeasurement: 1024,
    msTemperatureMeasurement: 1026,
    msRelativeHumidity: 1029,
    msSoilMoisture: 1032,
    msCO2: 1037,
};

const custom_clusters = {
    custom_1: {
        ID: 64672,
        manufacturerCode: 4617,
        attributes: {
            attribute_0: {ID: 0, type: 49},
        },
        commands: {
            command_0: {ID: 0, response: 0, parameters: [{name: 'reset', type: 40}]},
        },
        commandsResponse: {},
    },
};

const customClusterBTHRA = {
    custom_1: {
        ID: 513,
        attributes: {
            attribute_0: {ID: 16391, type: 48, manufacturerCode: 4617},
            attribute_1: {ID: 16416, type: 48, manufacturerCode: 4617},
            attribute_2: {ID: 16418, type: 48, manufacturerCode: 4617},
            attribute_3: {ID: 16448, type: 41, manufacturerCode: 4617},
            attribute_4: {ID: 16450, type: 48, manufacturerCode: 4617},
            attribute_5: {ID: 16451, type: 48, manufacturerCode: 4617},
        },
        commands: {},
        commandsResponse: {},
    },
    custom_2: {
        ID: 516,
        attributes: {
            attribute_0: {ID: 16395, type: 32, manufacturerCode: 4617},
            attribute_1: {ID: 16441, type: 48, manufacturerCode: 4617},
            attribute_2: {ID: 16442, type: 48, manufacturerCode: 4617},
            attribute_3: {ID: 16443, type: 48, manufacturerCode: 4617},
        },
        commands: {},
        commandsResponse: {},
    },
};

class Endpoint {
    constructor(
        ID,
        inputClusters,
        outputClusters,
        deviceIeeeAddress,
        binds = [],
        clusterValues = {},
        configuredReportings = [],
        profileID = null,
        deviceID = null,
        meta = {},
    ) {
        this.deviceIeeeAddress = deviceIeeeAddress;
        this.clusterValues = clusterValues;
        this.ID = ID;
        this.inputClusters = inputClusters;
        this.outputClusters = outputClusters;
        this.command = jest.fn();
        this.commandResponse = jest.fn();
        this.read = jest.fn();
        this.write = jest.fn();
        this.bind = jest.fn();
        this.unbind = jest.fn();
        this.save = jest.fn();
        this.configureReporting = jest.fn();
        this.meta = meta;
        this.binds = binds;
        this.profileID = profileID;
        this.deviceID = deviceID;
        this.configuredReportings = configuredReportings;
        this.getInputClusters = () =>
            inputClusters
                .map((c) => {
                    return {ID: c, name: getKeyByValue(clusters, c)};
                })
                .filter((c) => c.name);

        this.getOutputClusters = () =>
            outputClusters
                .map((c) => {
                    return {ID: c, name: getKeyByValue(clusters, c)};
                })
                .filter((c) => c.name);

        this.supportsInputCluster = (cluster) => {
            assert(clusters[cluster] !== undefined, `Undefined '${cluster}'`);
            return this.inputClusters.includes(clusters[cluster]);
        };

        this.supportsOutputCluster = (cluster) => {
            assert(clusters[cluster], `Undefined '${cluster}'`);
            return this.outputClusters.includes(clusters[cluster]);
        };

        this.addToGroup = jest.fn();
        this.addToGroup.mockImplementation((group) => {
            if (!group.members.includes(this)) group.members.push(this);
        });

        this.getDevice = () => {
            return Object.values(devices).find((d) => d.ieeeAddr === deviceIeeeAddress);
        };

        this.removeFromGroup = jest.fn();
        this.removeFromGroup.mockImplementation((group) => {
            const index = group.members.indexOf(this);
            if (index != -1) {
                group.members.splice(index, 1);
            }
        });

        this.removeFromAllGroups = () => {
            Object.values(groups).forEach((g) => this.removeFromGroup(g));
        };

        this.getClusterAttributeValue = jest.fn();
        this.getClusterAttributeValue.mockImplementation((cluster, value) => {
            if (!(cluster in this.clusterValues)) return undefined;
            return this.clusterValues[cluster][value];
        });
    }
}

class Device {
    constructor(
        type,
        ieeeAddr,
        networkAddress,
        manufacturerID,
        endpoints,
        interviewCompleted,
        powerSource = null,
        modelID = null,
        interviewing = false,
        manufacturerName,
        dateCode = null,
        softwareBuildID = null,
        customClusters = {},
    ) {
        this.type = type;
        this.ieeeAddr = ieeeAddr;
        this.dateCode = dateCode;
        this.networkAddress = networkAddress;
        this.manufacturerID = manufacturerID;
        this.endpoints = endpoints;
        this.powerSource = powerSource;
        this.softwareBuildID = softwareBuildID;
        this.interviewCompleted = interviewCompleted;
        this.modelID = modelID;
        this.interview = jest.fn();
        this.interviewing = interviewing;
        this.meta = {};
        this.ping = jest.fn();
        this.removeFromNetwork = jest.fn();
        this.removeFromDatabase = jest.fn();
        this.customClusters = customClusters;
        this.addCustomCluster = jest.fn();
        this.save = jest.fn();
        this.manufacturerName = manufacturerName;
        this.lastSeen = 1000;
    }

    getEndpoint(ID) {
        return this.endpoints.find((e) => e.ID === ID);
    }
}

const returnDevices = [];

const bulb_color = new Device(
    'Router',
    '0x000b57fffec6a5b3',
    40399,
    4107,
    [
        new Endpoint(1, [0, 3, 4, 5, 6, 8, 768, 2821, 4096], [5, 25, 32, 4096], '0x000b57fffec6a5b3', [], {
            lightingColorCtrl: {colorCapabilities: 254},
        }),
    ],
    true,
    'Mains (single phase)',
    'LLC020',
);
const bulb_color_2 = new Device(
    'Router',
    '0x000b57fffec6a5b4',
    401292,
    4107,
    [
        new Endpoint(
            1,
            [0, 3, 4, 5, 6, 8, 768, 2821, 4096],
            [5, 25, 32, 4096],
            '0x000b57fffec6a5b4',
            [],
            {lightingColorCtrl: {colorCapabilities: 254}},
            [],
            null,
            null,
            {scenes: {'1_0': {name: 'Chill scene', state: {state: 'ON'}}, '4_9': {state: {state: 'OFF'}}}},
        ),
    ],
    true,
    'Mains (single phase)',
    'LLC020',
    false,
    'Philips',
    '2019.09',
    '5.127.1.26581',
);
const bulb_2 = new Device(
    'Router',
    '0x000b57fffec6a5b7',
    40369,
    4476,
    [new Endpoint(1, [0, 3, 4, 5, 6, 8, 768, 2821, 4096], [5, 25, 32, 4096], '0x000b57fffec6a5b7', [], {lightingColorCtrl: {colorCapabilities: 17}})],
    true,
    'Mains (single phase)',
    'TRADFRI bulb E27 WS opal 980lm',
);
const TS0601_thermostat = new Device(
    'EndDevice',
    '0x0017882104a44559',
    6544,
    4151,
    [new Endpoint(1, [], [], '0x0017882104a44559')],
    true,
    'Mains (single phase)',
    'kud7u2l',
);
const TS0601_switch = new Device(
    'EndDevice',
    '0x0017882104a44560',
    6544,
    4151,
    [new Endpoint(1, [], [], '0x0017882104a44560')],
    true,
    'Mains (single phase)',
    'kjintbl',
);
const TS0601_cover_switch = new Device(
    'EndDevice',
    '0x0017882104a44562',
    6544,
    4151,
    [new Endpoint(1, [], [], '0x0017882104a44562')],
    true,
    'Mains (single phase)',
    'TS0601',
    false,
    '_TZE200_5nldle7w',
);
const ZNCZ02LM = new Device(
    'Router',
    '0x0017880104e45524',
    6540,
    4151,
    [new Endpoint(1, [0, 6], [], '0x0017880104e45524')],
    true,
    'Mains (single phase)',
    'lumi.plug',
);
const GLEDOPTO_2ID = new Device(
    'Router',
    '0x0017880104e45724',
    6540,
    4151,
    [
        new Endpoint(11, [0, 3, 4, 5, 6, 8, 768], [], '0x0017880104e45724', [], {}, [], 49246, 528),
        new Endpoint(12, [0, 3, 4, 5, 6, 8, 768], [], '0x0017880104e45724', [], {}, [], 260, 258),
        new Endpoint(13, [4096], [4096], '0x0017880104e45724', [], {}, [], 49246, 57694),
        new Endpoint(15, [0, 3, 4, 5, 6, 8, 768], [], '0x0017880104e45724', [], {}, [], 49246, 256),
    ],
    true,
    'Mains (single phase)',
    'GL-C-007',
    false,
    'GLEDOPTO',
);
const QBKG03LM = new Device(
    'Router',
    '0x0017880104e45542',
    6540,
    4151,
    [
        new Endpoint(1, [0], [], '0x0017880104e45542'),
        new Endpoint(2, [0, 6], [], '0x0017880104e45542'),
        new Endpoint(3, [0, 6], [], '0x0017880104e45542'),
    ],
    true,
    'Mains (single phase)',
    'lumi.ctrl_neutral2',
);
const zigfred_plus = new Device(
    'Router',
    '0xf4ce368a38be56a1',
    6589,
    0x129c,
    [
        new Endpoint(5, [0, 3, 4, 5, 6, 8, 0x0300, 0xfc42], [0xfc42], '0xf4ce368a38be56a1'),
        new Endpoint(7, [0, 3, 4, 5, 6, 8], [], '0xf4ce368a38be56a1'),
        new Endpoint(8, [0, 3, 4, 5, 6, 8], [], '0xf4ce368a38be56a1'),
        new Endpoint(9, [0, 3, 4, 5, 6, 8], [], '0xf4ce368a38be56a1'),
        new Endpoint(10, [0, 3, 4, 5, 6, 8], [], '0xf4ce368a38be56a1'),
        new Endpoint(11, [0, 3, 4, 5, 0x0102], [], '0xf4ce368a38be56a1'),
        new Endpoint(12, [0, 3, 4, 5, 0x0102], [], '0xf4ce368a38be56a1'),
    ],
    true,
    'Mains (single phase)',
    'zigfred plus',
    false,
    'Siglis',
);

const groups = {
    group_1: new Group(1, []),
    group_tradfri_remote: new Group(15071, [bulb_color_2.endpoints[0], bulb_2.endpoints[0]]),
    'group/with/slashes': new Group(99, []),
    group_with_tradfri: new Group(11, [bulb_2.endpoints[0]]),
    thermostat_group: new Group(12, [TS0601_thermostat.endpoints[0]]),
    group_with_switch: new Group(14, [ZNCZ02LM.endpoints[0], bulb_2.endpoints[0]]),
    gledopto_group: new Group(21, [GLEDOPTO_2ID.endpoints[3]]),
    default_bind_group: new Group(901, []),
    ha_discovery_group: new Group(9, [bulb_color_2.endpoints[0], bulb_2.endpoints[0], QBKG03LM.endpoints[1]]),
};

const devices = {
    coordinator: new Device('Coordinator', '0x00124b00120144ae', 0, 0, [new Endpoint(1, [], [], '0x00124b00120144ae')], false),
    bulb: new Device(
        'Router',
        '0x000b57fffec6a5b2',
        40369,
        4476,
        [
            new Endpoint(
                1,
                [0, 3, 4, 5, 6, 8, 768, 2821, 4096],
                [5, 25, 32, 4096],
                '0x000b57fffec6a5b2',
                [],
                {lightingColorCtrl: {colorCapabilities: 17}},
                [
                    {
                        cluster: {name: 'genOnOff'},
                        attribute: {name: 'onOff'},
                        minimumReportInterval: 1,
                        maximumReportInterval: 10,
                        reportableChange: 20,
                    },
                ],
            ),
        ],
        true,
        'Mains (single phase)',
        'TRADFRI bulb E27 WS opal 980lm',
    ),
    'RBSH-TRV0-ZB-EU': new Device(
        'EndDevice',
        '0x18fc2600000d7ae2',
        35902,
        4617, // 0x1209,
        [new Endpoint(1, [0, 1, 3, 4, 32, 513, 516, 2821], [10, 25], '0x18fc2600000d7ae2')],
        true,
        'Battery',
        'RBSH-TRV0-ZB-EU',
        false,
        'BOSCH',
        '20231122',
        '3.05.09',
        customClusterBTHRA,
    ),
    bulb_color: bulb_color,
    bulb_2: bulb_2,
    bulb_color_2: bulb_color_2,
    remote: new Device(
        'EndDevice',
        '0x0017880104e45517',
        6535,
        4107,
        [
            new Endpoint(1, [0], [0, 3, 4, 6, 8, 5], '0x0017880104e45517', [
                {target: bulb_color.endpoints[0], cluster: {ID: 8, name: 'genLevelCtrl'}},
                {target: bulb_color.endpoints[0], cluster: {ID: 6, name: 'genOnOff'}},
                {target: bulb_color.endpoints[0], cluster: {ID: 768, name: 'lightingColorCtrl'}},
                {target: groups.group_1, cluster: {ID: 6, name: 'genOnOff'}},
                {target: groups.group_1, cluster: {ID: 6, name: 'genLevelCtrl'}},
            ]),
            new Endpoint(2, [0, 1, 3, 15, 64512], [25, 6]),
        ],
        true,
        'Battery',
        'RWL021',
    ),
    unsupported: new Device(
        'EndDevice',
        '0x0017880104e45518',
        6536,
        0,
        [new Endpoint(1, [0], [0, 3, 4, 6, 8, 5])],
        true,
        'Battery',
        'notSupportedModelID',
        false,
        'notSupportedMfg',
    ),
    unsupported2: new Device(
        'EndDevice',
        '0x0017880104e45529',
        6536,
        0,
        [new Endpoint(1, [0], [0, 3, 4, 6, 8, 5])],
        true,
        'Battery',
        'notSupportedModelID',
    ),
    interviewing: new Device(
        'EndDevice',
        '0x0017880104e45530',
        6536,
        0,
        [new Endpoint(1, [0], [0, 3, 4, 6, 8, 5])],
        true,
        'Battery',
        undefined,
        true,
    ),
    notInSettings: new Device(
        'EndDevice',
        '0x0017880104e45519',
        6537,
        0,
        [new Endpoint(1, [0], [0, 3, 4, 6, 8, 5])],
        true,
        'Battery',
        'lumi.sensor_switch.aq2',
    ),
    WXKG11LM: new Device(
        'EndDevice',
        '0x0017880104e45520',
        6537,
        4151,
        [
            new Endpoint(1, [0], [0, 3, 4, 6, 8, 5], '0x0017880104e45520', [], {}, [
                {
                    cluster: {name: 'genOnOff'},
                    attribute: {name: undefined, ID: 1337},
                    minimumReportInterval: 1,
                    maximumReportInterval: 10,
                    reportableChange: 20,
                },
            ]),
        ],
        true,
        'Battery',
        'lumi.sensor_switch.aq2',
    ),
    WXKG02LM_rev1: new Device(
        'EndDevice',
        '0x0017880104e45521',
        6538,
        4151,
        [new Endpoint(1, [0], []), new Endpoint(2, [0], [])],
        true,
        'Battery',
        'lumi.sensor_86sw2.es1',
    ),
    WSDCGQ11LM: new Device('EndDevice', '0x0017880104e45522', 6539, 4151, [new Endpoint(1, [0], [])], true, 'Battery', 'lumi.weather'),
    // This are not a real spammer device, just copy of previous to test the throttle filter
    SPAMMER: new Device('EndDevice', '0x0017880104e455fe', 6539, 4151, [new Endpoint(1, [0], [])], true, 'Battery', 'lumi.weather'),
    RTCGQ11LM: new Device('EndDevice', '0x0017880104e45523', 6540, 4151, [new Endpoint(1, [0], [])], true, 'Battery', 'lumi.sensor_motion.aq2'),
    ZNCZ02LM: ZNCZ02LM,
    E1743: new Device('Router', '0x0017880104e45540', 6540, 4476, [new Endpoint(1, [0], [])], true, 'Mains (single phase)', 'TRADFRI on/off switch'),
    QBKG04LM: new Device(
        'Router',
        '0x0017880104e45541',
        6549,
        4151,
        [new Endpoint(1, [0], [25]), new Endpoint(2, [0, 6], [])],
        true,
        'Mains (single phase)',
        'lumi.ctrl_neutral1',
    ),
    QBKG03LM: QBKG03LM,
    GLEDOPTO1112: new Device(
        'Router',
        '0x0017880104e45543',
        6540,
        4151,
        [new Endpoint(11, [0], [], '0x0017880104e45543'), new Endpoint(13, [0], [], '0x0017880104e45543')],
        true,
        'Mains (single phase)',
        'GL-C-008',
    ),
    GLEDOPTO111213: new Device(
        'Router',
        '0x0017880104e45544',
        6540,
        4151,
        [new Endpoint(11, [0], []), new Endpoint(13, [0], []), new Endpoint(12, [0], [])],
        true,
        'Mains (single phase)',
        'GL-C-008',
    ),
    GLEDOPTO_2ID: GLEDOPTO_2ID,
    HGZB04D: new Device(
        'Router',
        '0x0017880104e45545',
        6540,
        4151,
        [new Endpoint(1, [0], [25], '0x0017880104e45545')],
        true,
        'Mains (single phase)',
        'FB56+ZSC05HG1.0',
    ),
    ZNCLDJ11LM: new Device(
        'Router',
        '0x0017880104e45547',
        6540,
        4151,
        [new Endpoint(1, [0], []), new Endpoint(2, [0], [])],
        true,
        'Mains (single phase)',
        'lumi.curtain',
    ),
    HAMPTON99432: new Device(
        'Router',
        '0x0017880104e45548',
        6540,
        4151,
        [new Endpoint(1, [0], []), new Endpoint(2, [0], [])],
        true,
        'Mains (single phase)',
        'HDC52EastwindFan',
    ),
    HS2WD: new Device('Router', '0x0017880104e45549', 6540, 4151, [new Endpoint(1, [0], [])], true, 'Mains (single phase)', 'WarningDevice'),
    '1TST_EU': new Device('Router', '0x0017880104e45550', 6540, 4151, [new Endpoint(1, [0], [])], true, 'Mains (single phase)', 'Thermostat'),
    SV01: new Device('Router', '0x0017880104e45551', 6540, 4151, [new Endpoint(1, [0], [])], true, 'Mains (single phase)', 'SV01-410-MP-1.0'),
    J1: new Device('Router', '0x0017880104e45552', 6540, 4151, [new Endpoint(1, [0], [])], true, 'Mains (single phase)', 'J1 (5502)'),
    E11_G13: new Device('EndDevice', '0x0017880104e45553', 6540, 4151, [new Endpoint(1, [0, 6], [])], true, 'Mains (single phase)', 'E11-G13'),
    nomodel: new Device(
        'Router',
        '0x0017880104e45535',
        6536,
        0,
        [new Endpoint(1, [0], [0, 3, 4, 6, 8, 5])],
        true,
        'Mains (single phase)',
        undefined,
        true,
    ),
    unsupported_router: new Device(
        'Router',
        '0x0017880104e45525',
        6536,
        0,
        [new Endpoint(1, [0], [0, 3, 4, 6, 8, 5])],
        true,
        'Mains (single phase)',
        'notSupportedModelID',
        false,
        'Boef',
    ),
    CC2530_ROUTER: new Device('Router', '0x0017880104e45559', 6540, 4151, [new Endpoint(1, [0, 6], [])], true, 'Mains (single phase)', 'lumi.router'),
    LIVOLO: new Device('Router', '0x0017880104e45560', 6541, 4152, [new Endpoint(6, [0, 6], [])], true, 'Mains (single phase)', 'TI0001          '),
    tradfri_remote: new Device(
        'EndDevice',
        '0x90fd9ffffe4b64ae',
        33906,
        4476,
        [new Endpoint(1, [0], [0, 3, 4, 6, 8, 5], '0x90fd9ffffe4b64ae')],
        true,
        'Battery',
        'TRADFRI remote control',
    ),
    roller_shutter: new Device(
        'EndDevice',
        '0x90fd9ffffe4b64af',
        33906,
        4476,
        [new Endpoint(1, [0], [0, 3, 4, 6, 8, 5], '0x90fd9ffffe4b64af')],
        true,
        'Battery',
        'SCM-R_00.00.03.15TC',
    ),
    ZNLDP12LM: new Device(
        'Router',
        '0x90fd9ffffe4b64ax',
        33901,
        4476,
        [
            new Endpoint(1, [0, 4, 3, 5, 10, 258, 13, 19, 6, 1, 1030, 8, 768, 1027, 1029, 1026], [0, 3, 4, 6, 8, 5], '0x90fd9ffffe4b64ax', [], {
                lightingColorCtrl: {colorCapabilities: 254},
            }),
        ],
        true,
        'Mains (single phase)',
        'lumi.light.aqcn02',
    ),
    SP600_OLD: new Device(
        'Router',
        '0x90fd9ffffe4b64aa',
        33901,
        4476,
        [
            new Endpoint(1, [0, 4, 3, 5, 10, 258, 13, 19, 6, 1, 1030, 8, 768, 1027, 1029, 1026], [0, 3, 4, 6, 8, 5], '0x90fd9ffffe4b64aa', [], {
                seMetering: {multiplier: 1, divisor: 10000},
            }),
        ],
        true,
        'Mains (single phase)',
        'SP600',
        false,
        'Salus',
        '20160120',
    ),
    SP600_NEW: new Device(
        'Router',
        '0x90fd9ffffe4b64ab',
        33901,
        4476,
        [
            new Endpoint(1, [0, 4, 3, 5, 10, 258, 13, 19, 6, 1, 1030, 8, 768, 1027, 1029, 1026], [0, 3, 4, 6, 8, 5], '0x90fd9ffffe4b64aa', [], {
                seMetering: {multiplier: 1, divisor: 10000},
            }),
        ],
        true,
        'Mains (single phase)',
        'SP600',
        false,
        'Salus',
        '20170220',
    ),
    'MKS-CM-W5': new Device(
        'Router',
        '0x90fd9ffffe4b64ac',
        33901,
        4476,
        [new Endpoint(1, [0, 4, 3, 5, 10, 258, 13, 19, 6, 1, 1030, 8, 768, 1027, 1029, 1026], [0, 3, 4, 6, 8, 5], '0x90fd9ffffe4b64aa', [], {})],
        true,
        'Mains (single phase)',
        'qnazj70',
        false,
    ),
    'GL-S-007ZS': new Device(
        'Router',
        '0x0017880104e45526',
        6540,
        4151,
        [new Endpoint(1, [0], [], '0x0017880104e45526')],
        true,
        'Mains (single phase)',
        'GL-S-007ZS',
    ),
    U202DST600ZB: new Device(
        'Router',
        '0x0017880104e43559',
        6540,
        4151,
        [new Endpoint(10, [0, 6], [], '0x0017880104e43559'), new Endpoint(11, [0, 6], [], '0x0017880104e43559')],
        true,
        'Mains (single phase)',
        'U202DST600ZB',
    ),
    zigfred_plus: zigfred_plus,
    3157100: new Device(
        'Router',
        '0x0017880104e44559',
        6542,
        4151,
        [new Endpoint(1, [], [], '0x0017880104e44559')],
        true,
        'Mains (single phase)',
        '3157100',
        false,
        'Centralite',
    ),
    J1: new Device(
        'Router',
        '0x0017880104a44559',
        6543,
        4151,
        [new Endpoint(1, [], [], '0x0017880104a44559')],
        true,
        'Mains (single phase)',
        'J1 (5502)',
    ),
    TS0601_thermostat: TS0601_thermostat,
    TS0601_switch: TS0601_switch,
    TS0601_cover_switch: TS0601_cover_switch,
    external_converter_device: new Device(
        'EndDevice',
        '0x0017880104e45511',
        1114,
        'external',
        [new Endpoint(1, [], [], '0x0017880104e45511')],
        false,
        null,
        'external_converter_device',
    ),
    QS_Zigbee_D02_TRIAC_2C_LN: new Device(
        'Router',
        '0x0017882194e45543',
        6549,
        4151,
        [new Endpoint(1, [0], [], '0x0017882194e45543'), new Endpoint(2, [0, 6], [], '0x0017882194e45543')],
        true,
        'Mains (single phase)',
        'TS110F',
        false,
        '_TYZB01_v8gtiaed',
    ),
    unknown: new Device('Router', '0x0017980134e45545', 6540, 4151, [], true, 'Mains (single phase)'),
    temperature_sensor: new Device(
        'EndDevice',
        '0x0017880104e45561',
        6544,
        4151,
        [new Endpoint(1, [0, 3, 4, 1026], [])],
        true,
        'Battery',
        'temperature.sensor',
    ),
    heating_actuator: new Device(
        'Router',
        '0x0017880104e45562',
        6545,
        4151,
        [new Endpoint(1, [0, 3, 4, 513], [1026])],
        true,
        'Mains (single phase)',
        'heating.actuator',
    ),
    bj_scene_switch: new Device(
        'EndDevice',
        '0xd85def11a1002caa',
        50117,
        4398,
        [
            new Endpoint(10, [0, 4096], [3, 4, 5, 6, 8, 25, 768, 4096], '0xd85def11a1002caa', [
                {target: bulb_color_2.endpoints[0], cluster: {ID: 8, name: 'genLevelCtrl'}},
                {target: bulb_color_2.endpoints[0], cluster: {ID: 6, name: 'genOnOff'}},
                {target: bulb_color_2.endpoints[0], cluster: {ID: 768, name: 'lightingColorCtrl'}},
            ]),
            new Endpoint(11, [0, 4096], [3, 4, 5, 6, 8, 25, 768, 4096], '0xd85def11a1002caa'),
        ],
        true,
        'Battery',
        'RB01',
        false,
        'Busch-Jaeger',
        '20161222',
        '1.2.0',
    ),
    'GW003-AS-IN-TE-FC': new Device(
        'Router',
        '0x0017548104a44669',
        6545,
        4699,
        [new Endpoint(1, [3], [0, 3, 513, 514], '0x0017548104a44669')],
        true,
        'Mains (single phase)',
        'Adapter Zigbee FUJITSU',
    ),
    'BMCT-SLZ': new Device(
        'Router',
        '0x18fc26000000cafe',
        6546,
        4617,
        [new Endpoint(1, [0, 3, 4, 5, 258, 1794, 2820, 2821, 64672], [10, 25], '0x18fc26000000cafe')],
        true,
        'Mains (single phase)',
        'RBSH-MMS-ZB-EU',
    ),
    BMCT_SLZ: new Device(
        'Router',
        '0x0026decafe000473',
        6546,
        4617,
        [new Endpoint(1, [0, 3, 4, 5, 258, 1794, 2820, 2821, 64672], [10, 25], '0x0026decafe000473')],
        true,
        'Mains (single phase)',
        'RBSH-MMS-ZB-EU',
        false,
        null,
        null,
        null,
        custom_clusters,
    ),
    bulb_custom_cluster: new Device(
        'Router',
        '0x000b57fffec6a5c2',
        40369,
        4476,
        [new Endpoint(1, [0, 3, 4, 5, 6, 8, 768, 2821, 4096], [5, 25, 32, 4096], '0x000b57fffec6a5c2')],
        true,
        'Mains (single phase)',
        'TRADFRI bulb E27 WS opal 980lm',
        false,
        null,
        null,
        null,
        custom_clusters,
    ),
};

const mock = {
    setTransmitPower: jest.fn(),
    touchlinkFactoryReset: jest.fn(),
    touchlinkFactoryResetFirst: jest.fn(),
    touchlinkScan: jest.fn(),
    touchlinkIdentify: jest.fn(),
    start: jest.fn(),
    backup: jest.fn(),
    coordinatorCheck: jest.fn(),
    isStopping: jest.fn(),
    permitJoin: jest.fn(),
    addInstallCode: jest.fn(),
    getCoordinatorVersion: jest.fn().mockReturnValue({type: 'z-Stack', meta: {version: 1, revision: 20190425}}),
    getNetworkParameters: jest.fn().mockReturnValue({panID: 0x162a, extendedPanID: [0, 11, 22], channel: 15}),
    on: (type, handler) => {
        events[type] = handler;
    },
    stop: jest.fn(),
    getDevicesIterator: jest.fn().mockImplementation(function* (predicate) {
        for (const key in devices) {
            const device = devices[key];

            if ((returnDevices.length === 0 || returnDevices.includes(device.ieeeAddr)) && !device.isDeleted && (!predicate || predicate(device))) {
                yield device;
            }
        }
    }),
    getDevicesByType: jest.fn().mockImplementation((type) => {
        return Object.values(devices)
            .filter((d) => returnDevices.length === 0 || returnDevices.includes(d.ieeeAddr))
            .filter((d) => d.type === type);
    }),
    getDeviceByIeeeAddr: jest.fn().mockImplementation((ieeeAddr) => {
        return Object.values(devices)
            .filter((d) => returnDevices.length === 0 || returnDevices.includes(d.ieeeAddr))
            .find((d) => d.ieeeAddr === ieeeAddr);
    }),
    getDeviceByNetworkAddress: jest.fn().mockImplementation((networkAddress) => {
        return Object.values(devices)
            .filter((d) => returnDevices.length === 0 || returnDevices.includes(d.ieeeAddr))
            .find((d) => d.networkAddress === networkAddress);
    }),
    getGroupsIterator: jest.fn().mockImplementation(function* (predicate) {
        for (const key in groups) {
            const group = groups[key];

            if (!predicate || predicate(group)) {
                yield group;
            }
        }
    }),
    getGroupByID: jest.fn().mockImplementation((groupID) => {
        return Object.values(groups).find((d) => d.groupID === groupID);
    }),
    getPermitJoin: jest.fn().mockReturnValue(false),
    getPermitJoinTimeout: jest.fn().mockReturnValue(undefined),
    reset: jest.fn(),
    createGroup: jest.fn().mockImplementation((groupID) => {
        const group = new Group(groupID, []);
        groups[`group_${groupID}`] = group;
        return group;
    }),
};

const mockConstructor = jest.fn().mockImplementation(() => mock);

jest.mock('zigbee-herdsman', () => ({
    ...jest.requireActual('zigbee-herdsman'),
    Controller: mockConstructor,
}));

module.exports = {
    events,
    ...mock,
    constructor: mockConstructor,
    devices,
    groups,
    returnDevices,
    custom_clusters,
};
