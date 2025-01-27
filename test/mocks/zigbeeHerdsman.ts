import type {Mock} from 'vitest';
import type {AdapterTypes} from 'zigbee-herdsman';

import assert from 'node:assert';

import {Zcl} from 'zigbee-herdsman';

import {EventHandler} from './utils';

type ZHConfiguredReporting = {
    cluster: {name: string};
    attribute: {name: string | undefined; ID?: number};
    minimumReportInterval: number;
    maximumReportInterval: number;
    reportableChange: number;
};
type ZHEndpointCluster = {
    ID?: number;
    name: string;
};
type ZHBind = {
    target: Endpoint | Group;
    cluster: ZHEndpointCluster;
};

const CLUSTERS = {
    genBasic: Zcl.Clusters.genBasic.ID,
    genOta: Zcl.Clusters.genOta.ID,
    genScenes: Zcl.Clusters.genScenes.ID,
    genOnOff: Zcl.Clusters.genOnOff.ID,
    genLevelCtrl: Zcl.Clusters.genLevelCtrl.ID,
    lightingColorCtrl: Zcl.Clusters.lightingColorCtrl.ID,
    closuresWindowCovering: Zcl.Clusters.closuresWindowCovering.ID,
    hvacThermostat: Zcl.Clusters.hvacThermostat.ID,
    msIlluminanceMeasurement: Zcl.Clusters.msIlluminanceMeasurement.ID,
    msTemperatureMeasurement: Zcl.Clusters.msTemperatureMeasurement.ID,
    msRelativeHumidity: Zcl.Clusters.msRelativeHumidity.ID,
    msSoilMoisture: Zcl.Clusters.msSoilMoisture.ID,
    msCO2: Zcl.Clusters.msCO2.ID,
};

export const CUSTOM_CLUSTERS = {
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

const CUSTOM_CLUSTER_BTHRA = {
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

function getClusterKey(value: unknown): string | undefined {
    for (const key in CLUSTERS) {
        if (CLUSTERS[key as keyof typeof CLUSTERS] === value) {
            return key;
        }
    }

    return undefined;
}

export class Endpoint {
    deviceIeeeAddress: string;
    clusterValues: Record<string, Record<string, unknown>>;
    ID: number;
    inputClusters: number[];
    outputClusters: number[];
    command: Mock;
    commandResponse: Mock;
    read: Mock;
    write: Mock;
    bind: Mock;
    unbind: Mock;
    save: Mock;
    configureReporting: Mock;
    meta: Record<string, unknown>;
    binds: ZHBind[];
    profileID: number | undefined;
    deviceID: number | undefined;
    configuredReportings: ZHConfiguredReporting[];
    addToGroup: Mock;
    removeFromGroup: Mock;
    getClusterAttributeValue: Mock;

    constructor(
        ID: number,
        inputClusters: number[],
        outputClusters: number[],
        deviceIeeeAddress: string,
        binds: ZHBind[] = [],
        clusterValues: Record<string, Record<string, unknown>> = {},
        configuredReportings: ZHConfiguredReporting[] = [],
        profileID: number | undefined = undefined,
        deviceID: number | undefined = undefined,
        meta: Record<string, unknown> = {},
    ) {
        this.deviceIeeeAddress = deviceIeeeAddress;
        this.clusterValues = clusterValues;
        this.ID = ID;
        this.inputClusters = inputClusters;
        this.outputClusters = outputClusters;
        this.command = vi.fn();
        this.commandResponse = vi.fn();
        this.read = vi.fn();
        this.write = vi.fn();
        this.bind = vi.fn();
        this.unbind = vi.fn();
        this.save = vi.fn();
        this.configureReporting = vi.fn();
        this.meta = meta;
        this.binds = binds;
        this.profileID = profileID;
        this.deviceID = deviceID;
        this.configuredReportings = configuredReportings;

        this.addToGroup = vi.fn((group: Group) => {
            if (!group.members.includes(this)) {
                group.members.push(this);
            }
        });
        this.removeFromGroup = vi.fn((group: Group) => {
            const index = group.members.indexOf(this);
            if (index != -1) {
                group.members.splice(index, 1);
            }
        });

        this.getClusterAttributeValue = vi.fn((cluster: string, value: string) =>
            !(cluster in this.clusterValues) ? undefined : this.clusterValues[cluster][value],
        );
    }

    getInputClusters(): ZHEndpointCluster[] {
        const clusters: ZHEndpointCluster[] = [];

        for (const clusterId of this.inputClusters) {
            const name = getClusterKey(clusterId);

            if (name) {
                clusters.push({ID: clusterId, name});
            }
        }

        return clusters;
    }

    getOutputClusters(): ZHEndpointCluster[] {
        const clusters: ZHEndpointCluster[] = [];

        for (const clusterId of this.outputClusters) {
            const name = getClusterKey(clusterId);

            if (name) {
                clusters.push({ID: clusterId, name});
            }
        }

        return clusters;
    }

    supportsInputCluster(cluster: keyof typeof CLUSTERS): boolean {
        assert(CLUSTERS[cluster] !== undefined, `Undefined '${cluster}'`);
        return this.inputClusters.includes(CLUSTERS[cluster]);
    }

    supportsOutputCluster(cluster: keyof typeof CLUSTERS): boolean {
        assert(CLUSTERS[cluster], `Undefined '${cluster}'`);
        return this.outputClusters.includes(CLUSTERS[cluster]);
    }

    getDevice(): Device | undefined {
        return Object.values(devices).find((d) => d.ieeeAddr === this.deviceIeeeAddress);
    }

    removeFromAllGroups(): void {
        Object.values(groups).forEach((g) => this.removeFromGroup(g));
    }

    mockClear(): void {
        this.command.mockClear();
        this.commandResponse.mockClear();
        this.read.mockClear();
        this.write.mockClear();
        this.bind.mockClear();
        this.unbind.mockClear();
        this.save.mockClear();
        this.configureReporting.mockClear();
        this.addToGroup.mockClear();
        this.removeFromGroup.mockClear();
        this.getClusterAttributeValue.mockClear();
    }
}

export class Device {
    type: string;
    ieeeAddr: string;
    dateCode: string | undefined;
    networkAddress: number;
    manufacturerID: number;
    endpoints: Endpoint[];
    powerSource: string | undefined;
    softwareBuildID: string | undefined;
    interviewCompleted: boolean;
    modelID: string | undefined;
    interview: Mock;
    interviewing: boolean;
    meta: Record<string, unknown>;
    ping: Mock;
    removeFromNetwork: Mock;
    removeFromDatabase: Mock;
    customClusters: Record<string, unknown>;
    addCustomCluster: Mock;
    save: Mock;
    manufacturerName: string | undefined;
    lastSeen: number | undefined;
    isDeleted: boolean;
    linkquality?: number;
    lqi: Mock;
    routingTable: Mock;

    constructor(
        type: string,
        ieeeAddr: string,
        networkAddress: number,
        manufacturerID: number,
        endpoints: Endpoint[],
        interviewCompleted: boolean,
        powerSource: string | undefined = undefined,
        modelID: string | undefined = undefined,
        interviewing: boolean = false,
        manufacturerName: string | undefined = undefined,
        dateCode: string | undefined = undefined,
        softwareBuildID: string | undefined = undefined,
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
        this.interview = vi.fn();
        this.interviewing = interviewing;
        this.meta = {};
        this.ping = vi.fn();
        this.removeFromNetwork = vi.fn();
        this.removeFromDatabase = vi.fn();
        this.customClusters = customClusters;
        this.addCustomCluster = vi.fn();
        this.save = vi.fn();
        this.manufacturerName = manufacturerName;
        this.lastSeen = 1000;
        this.isDeleted = false;
        this.lqi = vi.fn(() => ({neighbors: []}));
        this.routingTable = vi.fn(() => ({table: []}));
    }

    getEndpoint(ID: number): Endpoint | undefined {
        return this.endpoints.find((e) => e.ID === ID);
    }

    mockClear(): void {
        this.interview.mockClear();
        this.ping.mockClear();
        this.removeFromNetwork.mockClear();
        this.removeFromDatabase.mockClear();
        this.addCustomCluster.mockClear();
        this.save.mockClear();
        this.lqi.mockClear();
        this.routingTable.mockClear();
        this.meta = {};

        this.endpoints.forEach((e) => e.mockClear());
    }
}

export class Group {
    groupID: number;
    command: Mock;
    meta: Record<string, unknown>;
    members: Endpoint[];
    removeFromDatabase: Mock;
    removeFromNetwork: Mock;

    constructor(groupID: number, members: Endpoint[]) {
        this.groupID = groupID;
        this.command = vi.fn();
        this.meta = {};
        this.members = members;
        this.removeFromDatabase = vi.fn();
        this.removeFromNetwork = vi.fn();
    }

    hasMember(endpoint: Endpoint): boolean {
        return this.members.includes(endpoint);
    }
}

export const events: Record<string, EventHandler> = {};
export const returnDevices: string[] = [];

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
            undefined,
            undefined,
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
const hue_twilight = new Device(
    'Router',
    '0x000b57cdfec6a5b3',
    40399,
    4107,
    [
        new Endpoint(1, [0, 3, 4, 5, 6, 8, 768, 2821, 4096], [5, 25, 32, 4096], '0x000b57cdfec6a5b3', [], {
            lightingColorCtrl: {colorCapabilities: 254},
        }),
        new Endpoint(11, [0, 3, 4, 5, 6, 8, 768, 2821, 4096], [5, 25, 32, 4096], '0x000b57cdfec6a5b3', [], {
            lightingColorCtrl: {colorCapabilities: 254},
        }),
        new Endpoint(12, [0, 3, 4, 5, 6, 8, 768, 2821, 4096], [5, 25, 32, 4096], '0x000b57cdfec6a5b3', [], {
            lightingColorCtrl: {colorCapabilities: 254},
        }),
    ],
    true,
    'Mains (single phase)',
    'LGT003',
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

export const groups = {
    group_1: new Group(1, []),
    group_2: new Group(2, []),
    group_tradfri_remote: new Group(15071, [bulb_color_2.endpoints[0], bulb_2.endpoints[0]]),
    'group/with/slashes': new Group(99, []),
    group_with_tradfri: new Group(11, [bulb_2.endpoints[0]]),
    thermostat_group: new Group(12, [TS0601_thermostat.endpoints[0]]),
    group_with_switch: new Group(14, [ZNCZ02LM.endpoints[0], bulb_2.endpoints[0]]),
    gledopto_group: new Group(21, [GLEDOPTO_2ID.endpoints[3]]),
    default_bind_group: new Group(901, []),
    ha_discovery_group: new Group(9, [bulb_color_2.endpoints[0], bulb_2.endpoints[0], QBKG03LM.endpoints[2]]),
    hue_twilight_group: new Group(19, [hue_twilight.endpoints[1]]),
};

const groupMembersBackup = Object.fromEntries(Object.entries(groups).map((v) => [v[0], [...v[1].members]]));

export function resetGroupMembers(): void {
    for (const key in groupMembersBackup) {
        groups[key as keyof typeof groups].members = [...groupMembersBackup[key]];
    }
}

export const devices = {
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
        CUSTOM_CLUSTER_BTHRA,
    ),
    bulb_color: bulb_color,
    bulb_2: bulb_2,
    hue_twilight,
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
            new Endpoint(2, [0, 1, 3, 15, 64512], [25, 6], '0x0017880104e45517'),
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
        [new Endpoint(1, [0], [0, 3, 4, 6, 8, 5], '0x0017880104e45518')],
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
        [new Endpoint(1, [0], [0, 3, 4, 6, 8, 5], '0x0017880104e45529')],
        true,
        'Battery',
        'notSupportedModelID',
    ),
    interviewing: new Device(
        'EndDevice',
        '0x0017880104e45530',
        6536,
        0,
        [new Endpoint(1, [0], [0, 3, 4, 6, 8, 5], '0x0017880104e45530')],
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
        [new Endpoint(1, [0], [0, 3, 4, 6, 8, 5], '0x0017880104e45519')],
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
        [new Endpoint(1, [0], [], '0x0017880104e45521'), new Endpoint(2, [0], [], '0x0017880104e45521')],
        true,
        'Battery',
        'lumi.sensor_86sw2.es1',
    ),
    WSDCGQ11LM: new Device(
        'EndDevice',
        '0x0017880104e45522',
        6539,
        4151,
        [new Endpoint(1, [0], [], '0x0017880104e45522')],
        true,
        'Battery',
        'lumi.weather',
    ),
    // This are not a real spammer device, just copy of previous to test the throttle filter
    SPAMMER: new Device(
        'EndDevice',
        '0x0017880104e455fe',
        6539,
        4151,
        [new Endpoint(1, [0], [], '0x0017880104e455fe')],
        true,
        'Battery',
        'lumi.weather',
    ),
    RTCGQ11LM: new Device(
        'EndDevice',
        '0x0017880104e45523',
        6540,
        4151,
        [new Endpoint(1, [0], [], '0x0017880104e45523')],
        true,
        'Battery',
        'lumi.sensor_motion.aq2',
    ),
    ZNCZ02LM: ZNCZ02LM,
    E1743: new Device(
        'Router',
        '0x0017880104e45540',
        6540,
        4476,
        [new Endpoint(1, [0], [], '0x0017880104e45540')],
        true,
        'Mains (single phase)',
        'TRADFRI on/off switch',
    ),
    QBKG04LM: new Device(
        'Router',
        '0x0017880104e45541',
        6549,
        4151,
        [new Endpoint(1, [0], [25], '0x0017880104e45541'), new Endpoint(2, [0, 6], [], '0x0017880104e45541')],
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
        [
            new Endpoint(11, [0], [], '0x0017880104e45544'),
            new Endpoint(13, [0], [], '0x0017880104e45544'),
            new Endpoint(12, [0], [], '0x0017880104e45544'),
        ],
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
        [new Endpoint(1, [0], [], '0x0017880104e45547'), new Endpoint(2, [0], [], '0x0017880104e45547')],
        true,
        'Mains (single phase)',
        'lumi.curtain',
    ),
    HAMPTON99432: new Device(
        'Router',
        '0x0017880104e45548',
        6540,
        4151,
        [new Endpoint(1, [0], [], '0x0017880104e45548'), new Endpoint(2, [0], [], '0x0017880104e45548')],
        true,
        'Mains (single phase)',
        'HDC52EastwindFan',
    ),
    HS2WD: new Device(
        'Router',
        '0x0017880104e45549',
        6540,
        4151,
        [new Endpoint(1, [0], [], '0x0017880104e45549')],
        true,
        'Mains (single phase)',
        'WarningDevice',
    ),
    '1TST_EU': new Device(
        'Router',
        '0x0017880104e45550',
        6540,
        4151,
        [new Endpoint(1, [0], [], '0x0017880104e45550')],
        true,
        'Mains (single phase)',
        'Thermostat',
    ),
    SV01: new Device(
        'Router',
        '0x0017880104e45551',
        6540,
        4151,
        [new Endpoint(1, [0], [], '0x0017880104e45551')],
        true,
        'Mains (single phase)',
        'SV01-410-MP-1.0',
    ),
    J1: new Device(
        'Router',
        '0x0017880104e45552',
        6540,
        4151,
        [new Endpoint(1, [0], [], '0x0017880104e45552')],
        true,
        'Mains (single phase)',
        'J1 (5502)',
    ),
    E11_G13: new Device(
        'EndDevice',
        '0x0017880104e45553',
        6540,
        4151,
        [new Endpoint(1, [0, 6], [], '0x0017880104e45553')],
        true,
        'Mains (single phase)',
        'E11-G13',
    ),
    nomodel: new Device(
        'Router',
        '0x0017880104e45535',
        6536,
        0,
        [new Endpoint(1, [0], [0, 3, 4, 6, 8, 5], '0x0017880104e45535')],
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
        [new Endpoint(1, [0], [0, 3, 4, 6, 8, 5], '0x0017880104e45525')],
        true,
        'Mains (single phase)',
        'notSupportedModelID',
        false,
        'Boef',
    ),
    CC2530_ROUTER: new Device(
        'Router',
        '0x0017880104e45559',
        6540,
        4151,
        [new Endpoint(1, [0, 6], [], '0x0017880104e45559')],
        true,
        'Mains (single phase)',
        'lumi.router',
    ),
    LIVOLO: new Device(
        'Router',
        '0x0017880104e45560',
        6541,
        4152,
        [new Endpoint(6, [0, 6], [], '0x0017880104e45560')],
        true,
        'Mains (single phase)',
        'TI0001          ',
    ),
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
    J1_cover: new Device(
        'Router',
        '0x0017880104a44559',
        6543,
        4151,
        [new Endpoint(1, [], [], '0x0017880104a44559')],
        true,
        'Mains (single phase)',
        'J1 (5502)',
    ),
    TS130F_DUAL_COVER_SWITCH: new Device(
        'Router',
        '0xa4c138018cf95021',
        46163,
        4417,
        [
            new Endpoint(1, [0, 4, 5, 6, 258, 57345], [10, 25], '0xa4c138018cf95021'),
            new Endpoint(2, [0, 4, 5, 6, 258, 57345], [10, 25], '0xa4c138018cf95021'),
        ],
        true,
        'Mains (single phase)',
        'TS130F',
        false,
        '_TZ3000_j1xl73iw',
    ),
    TS0601_thermostat: TS0601_thermostat,
    TS0601_switch: TS0601_switch,
    TS0601_cover_switch: TS0601_cover_switch,
    external_converter_device: new Device(
        'EndDevice',
        '0x0017880104e45511',
        1114,
        0xffff,
        [new Endpoint(1, [], [], '0x0017880104e45511')],
        false,
        undefined,
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
        [new Endpoint(1, [0, 3, 4, 1026], [], '0x0017880104e45561')],
        true,
        'Battery',
        'temperature.sensor',
    ),
    heating_actuator: new Device(
        'Router',
        '0x0017880104e45562',
        6545,
        4151,
        [new Endpoint(1, [0, 3, 4, 513], [1026], '0x0017880104e45562')],
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
        undefined,
        undefined,
        undefined,
        CUSTOM_CLUSTERS,
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
        undefined,
        undefined,
        undefined,
        CUSTOM_CLUSTERS,
    ),
    InovelliVZM31SN: new Device(
        'Router',
        '0xb43a31fffe2f1f6a',
        59545,
        4655,
        [
            new Endpoint(1, [], [], '0xb43a31fffe2f1f6a', [], {}, [], 1, 1, {multiEndpointSkip: ['state', 'power', 'energy', 'brightness']}),
            new Endpoint(2, [], [], '0xb43a31fffe2f1f6a', [], {}, [], 1, 1, {multiEndpointSkip: ['state', 'power', 'energy', 'brightness']}),
            new Endpoint(3, [], [], '0xb43a31fffe2f1f6a', [], {}, [], 1, 1, {multiEndpointSkip: ['state', 'power', 'energy', 'brightness']}),
        ],
        true,
        'Mains (single phase)',
        'VZM31-SN',
        false,
        undefined,
        undefined,
        undefined,
        CUSTOM_CLUSTERS,
    ),
};

export const mockController = {
    on: (type: string, handler: EventHandler): void => {
        events[type] = handler;
    },
    start: vi.fn((): Promise<AdapterTypes.StartResult> => Promise.resolve('reset')),
    stop: vi.fn(),
    touchlinkIdentify: vi.fn(),
    touchlinkScan: vi.fn(),
    touchlinkFactoryReset: vi.fn(),
    touchlinkFactoryResetFirst: vi.fn(),
    addInstallCode: vi.fn(),
    permitJoin: vi.fn(),
    getPermitJoin: vi.fn((): boolean => false),
    getPermitJoinEnd: vi.fn((): number | undefined => undefined),
    isStopping: vi.fn((): boolean => false),
    backup: vi.fn(),
    coordinatorCheck: vi.fn(),
    getCoordinatorVersion: vi.fn(
        (): Promise<AdapterTypes.CoordinatorVersion> => Promise.resolve({type: 'z-Stack', meta: {version: 1, revision: 20190425}}),
    ),
    getNetworkParameters: vi.fn(
        (): Promise<AdapterTypes.NetworkParameters> => Promise.resolve({panID: 0x162a, extendedPanID: '0x64c5fd698daf0c00', channel: 15}),
    ),
    getDevices: vi.fn((): Device[] => []),
    getDevicesIterator: vi.fn(function* (predicate?: (value: Device) => boolean): Generator<Device> {
        for (const key in devices) {
            const device = devices[key as keyof typeof devices];

            if ((returnDevices.length === 0 || returnDevices.includes(device.ieeeAddr)) && !device.isDeleted && (!predicate || predicate(device))) {
                yield device;
            }
        }
    }),
    getDevicesByType: vi.fn((type: AdapterTypes.DeviceType): Device[] =>
        Object.values(devices)
            .filter((d) => returnDevices.length === 0 || returnDevices.includes(d.ieeeAddr))
            .filter((d) => d.type === type),
    ),
    getDeviceByIeeeAddr: vi.fn((ieeeAddr: string): Device | undefined =>
        Object.values(devices)
            .filter((d) => returnDevices.length === 0 || returnDevices.includes(d.ieeeAddr))
            .find((d) => d.ieeeAddr === ieeeAddr),
    ),
    getDeviceByNetworkAddress: vi.fn((networkAddress: number): Device | undefined =>
        Object.values(devices)
            .filter((d) => returnDevices.length === 0 || returnDevices.includes(d.ieeeAddr))
            .find((d) => d.networkAddress === networkAddress),
    ),
    getGroupByID: vi.fn((groupID: number): Group | undefined => Object.values(groups).find((g) => g.groupID === groupID)),
    getGroups: vi.fn((): Group[] => []),
    getGroupsIterator: vi.fn(function* (predicate?: (value: Group) => boolean): Generator<Group> {
        for (const key in groups) {
            const group = groups[key as keyof typeof groups];

            if (!predicate || predicate(group)) {
                yield group;
            }
        }
    }),
    createGroup: vi.fn((groupID: number): Group => {
        const group = new Group(groupID, []);
        groups[`group_${groupID}` as keyof typeof groups] = group;
        return group;
    }),
};

vi.mock('zigbee-herdsman', async (importOriginal) => ({
    ...(await importOriginal()),
    Controller: vi.fn().mockImplementation(() => mockController),
}));
