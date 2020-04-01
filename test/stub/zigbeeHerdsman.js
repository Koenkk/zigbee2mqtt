const events = {};
const assert = require('assert');

class Group {
    constructor(groupID, members) {
        this.groupID = groupID;
        this.command = jest.fn();
        this.meta = {};
        this.members = members;
        this.removeFromDatabase = jest.fn();
        this.hasMember = (endpoint) => this.members.includes(endpoint);
    }
}

const clusters = {
    'genBasic': 0,
    'genOta': 25,
    'genScenes': 5,
    'genOnOff': 6,
    'genLevelCtrl': 8,
    'lightingColorCtrl': 768,
    'closuresWindowCovering': 258,
}

class Endpoint {
    constructor(ID, inputClusters, outputClusters, deviceIeeeAddress, binds=[], clusterValues={}) {
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
        this.configureReporting = jest.fn();
        this.binds = binds;
        this.supportsInputCluster = (cluster) => {
            assert(clusters[cluster] !== undefined, `Undefined '${cluster}'`);
            return this.inputClusters.includes(clusters[cluster]);
        }

        this.supportsOutputCluster = (cluster) => {
            assert(clusters[cluster], `Undefined '${cluster}'`);
            return this.outputClusters.includes(clusters[cluster]);
        }

        this.addToGroup = (group) => {
            if (!group.members.includes(this)) group.members.push(this);
        }

        this.getDevice = () => {
            return Object.values(devices).find(d => d.ieeeAddr === deviceIeeeAddress);
        }

        this.removeFromGroup = (group) => {
            const index = group.members.indexOf(this);
            if (index != -1) {
                group.members.splice(index, 1);
            }
        }

        this.removeFromAllGroups = () => {
            Object.values(groups).forEach((g) => this.removeFromGroup(g))
        }

        this.getClusterAttributeValue = (cluster, value) => {
            return this.clusterValues[cluster][value];
        }
    }
}

class Device {
    constructor(type, ieeeAddr, networkAddress, manufacturerID, endpoints, interviewCompleted, powerSource = null, modelID = null, interviewing=false, manufacturerName, dateCode= null) {
        this.type = type;
        this.ieeeAddr = ieeeAddr;
        this.dateCode = dateCode;
        this.networkAddress = networkAddress;
        this.manufacturerID = manufacturerID;
        this.endpoints = endpoints;
        this.powerSource = powerSource;
        this.interviewCompleted = interviewCompleted;
        this.modelID = modelID;
        this.interviewing = interviewing;
        this.meta = {};
        this.ping = jest.fn();
        this.removeFromNetwork = jest.fn();
        this.removeFromDatabase = jest.fn();
        this.save = jest.fn();
        this.manufacturerName = manufacturerName;
        this.lastSeen = 1000;
    }

    getEndpoint(ID) {
        return this.endpoints.find((e) => e.ID === ID);
    }
}

const returnDevices = [];

const bulb_color = new Device('Router', '0x000b57fffec6a5b3', 40399, 4107, [new Endpoint(1, [0,3,4,5,6,8,768,2821,4096], [5,25,32,4096], '0x000b57fffec6a5b3', [], {lightingColorCtrl: {colorCapabilities: 254}})], true, "Mains (single phase)", "LLC020");
const bulb_color_2 = new Device('Router', '0x000b57fffec6a5b4', 401292, 4107, [new Endpoint(1, [0,3,4,5,6,8,768,2821,4096], [5,25,32,4096], '0x000b57fffec6a5b4')], true, "Mains (single phase)", "LLC020");
const bulb_2 =  new Device('Router', '0x000b57fffec6a5b7', 40369, 4476, [new Endpoint(1, [0,3,4,5,6,8,768,2821,4096], [5,25,32,4096], '0x000b57fffec6a5b7')], true, "Mains (single phase)", "TRADFRI bulb E27 WS opal 980lm");

const devices = {
    'coordinator': new Device('Coordinator', '0x00124b00120144ae', 0, 0, [new Endpoint(1, [], [])], false),
    'bulb': new Device('Router', '0x000b57fffec6a5b2', 40369, 4476, [new Endpoint(1, [0,3,4,5,6,8,768,2821,4096], [5,25,32,4096], '0x000b57fffec6a5b2', [], {lightingColorCtrl: {colorCapabilities: 17}})], true, "Mains (single phase)", "TRADFRI bulb E27 WS opal 980lm"),
    'bulb_color': bulb_color,
    'bulb_2': bulb_2,
    'bulb_color_2': bulb_color_2,
    'remote': new Device('EndDevice', '0x0017880104e45517', 6535, 4107, [new Endpoint(1, [0], [0,3,4,6,8,5], '0x0017880104e45517', [{target: bulb_color.endpoints[0]}]), new Endpoint(2, [0,1,3,15,64512], [25, 6])], true, "Battery", "RWL021"),
    'unsupported': new Device('EndDevice', '0x0017880104e45518', 6536, 0, [new Endpoint(1, [0], [0,3,4,6,8,5])], true, "Battery", "notSupportedModelID"),
    'unsupported2': new Device('EndDevice', '0x0017880104e45529', 6536, 0, [new Endpoint(1, [0], [0,3,4,6,8,5])], true, "Battery", "notSupportedModelID"),
    'interviewing': new Device('EndDevice', '0x0017880104e45530', 6536, 0, [new Endpoint(1, [0], [0,3,4,6,8,5])], true, "Battery", undefined, true),
    'notInSettings': new Device('EndDevice', '0x0017880104e45519', 6537, 0, [new Endpoint(1, [0], [0,3,4,6,8,5])], true, "Battery", "lumi.sensor_switch.aq2"),
    'WXKG11LM': new Device('EndDevice', '0x0017880104e45520', 6537,4151, [new Endpoint(1, [0], [0,3,4,6,8,5])], true, "Battery", "lumi.sensor_switch.aq2"),
    'WXKG02LM': new Device('EndDevice', '0x0017880104e45521', 6538,4151, [new Endpoint(1, [0], []), new Endpoint(2, [0], [])], true, "Battery", "lumi.sensor_86sw2.es1"),
    'WSDCGQ11LM': new Device('EndDevice', '0x0017880104e45522', 6539,4151, [new Endpoint(1, [0], [])], true, "Battery", "lumi.weather"),
    'RTCGQ11LM': new Device('EndDevice', '0x0017880104e45523', 6540,4151, [new Endpoint(1, [0], [])], true, "Battery", "lumi.sensor_motion.aq2"),
    'ZNCZ02LM': new Device('Router', '0x0017880104e45524', 6540,4151, [new Endpoint(1, [0], [])], true, "Mains (single phase)", "lumi.plug"),
    'E1743': new Device('Router', '0x0017880104e45540', 6540,4476, [new Endpoint(1, [0], [])], true, "Mains (single phase)", 'TRADFRI on/off switch'),
    'QBKG04LM': new Device('Router', '0x0017880104e45541', 6549,4151, [new Endpoint(1, [0], [25]), new Endpoint(2, [0, 6], [])], true, "Mains (single phase)", 'lumi.ctrl_neutral1'),
    'QBKG03LM':new Device('Router', '0x0017880104e45542', 6540,4151, [new Endpoint(1, [0], [], '0x0017880104e45542'), new Endpoint(2, [0, 6], [], '0x0017880104e45542'), new Endpoint(3, [0, 6], [], '0x0017880104e45542')], true, "Mains (single phase)", 'lumi.ctrl_neutral2'),
    'GLEDOPTO1112': new Device('Router', '0x0017880104e45543', 6540, 4151, [new Endpoint(11, [0], [], '0x0017880104e45543'), new Endpoint(13, [0], [], '0x0017880104e45543')], true, "Mains (single phase)", 'GL-C-008'),
    'GLEDOPTO111213': new Device('Router', '0x0017880104e45544', 6540,4151, [new Endpoint(11, [0], []), new Endpoint(13, [0], []), new Endpoint(12, [0], [])], true, "Mains (single phase)", 'GL-C-008'),
    'HGZB04D': new Device('Router', '0x0017880104e45545', 6540,4151, [new Endpoint(1, [0], [])], true, "Mains (single phase)", 'FB56+ZSC05HG1.0'),
    'ZNCLDJ11LM': new Device('Router', '0x0017880104e45547', 6540,4151, [new Endpoint(1, [0], []), new Endpoint(2, [0], [])], true, "Mains (single phase)", 'lumi.curtain'),
    'HAMPTON99432':  new Device('Router', '0x0017880104e45548', 6540,4151, [new Endpoint(1, [0], []), new Endpoint(2, [0], [])], true, "Mains (single phase)", 'HDC52EastwindFan'),
    'HS2WD': new Device('Router', '0x0017880104e45549', 6540,4151, [new Endpoint(1, [0], [])], true, "Mains (single phase)", 'WarningDevice'),
    '1TST_EU': new Device('Router', '0x0017880104e45550', 6540,4151, [new Endpoint(1, [0], [])], true, "Mains (single phase)", 'Thermostat'),
    'SV01': new Device('Router', '0x0017880104e45551', 6540,4151, [new Endpoint(1, [0], [])], true, "Mains (single phase)", 'SV01-410-MP-1.0'),
    'J1': new Device('Router', '0x0017880104e45552', 6540,4151, [new Endpoint(1, [0], [])], true, "Mains (single phase)", 'J1 (5502)'),
    'E11_G13': new Device('EndDevice', '0x0017880104e45553', 6540,4151, [new Endpoint(1, [0, 6], [])], true, "Mains (single phase)", 'E11-G13'),
    'nomodel': new Device('Router', '0x0017880104e45535', 6536, 0, [new Endpoint(1, [0], [0,3,4,6,8,5])], true, "Mains (single phase)", undefined, true),
    'unsupported_router': new Device('Router', '0x0017880104e45525', 6536, 0, [new Endpoint(1, [0], [0,3,4,6,8,5])], true, "Mains (single phase)", "notSupportedModelID", false, "Boef"),
    'CC2530_ROUTER': new Device('Router', '0x0017880104e45559', 6540,4151, [new Endpoint(1, [0, 6], [])], true, "Mains (single phase)", 'lumi.router'),
    'LIVOLO': new Device('Router', '0x0017880104e45560', 6541,4152, [new Endpoint(6, [0, 6], [])], true, "Mains (single phase)", 'TI0001          '),
    'tradfri_remote': new Device('EndDevice', '0x90fd9ffffe4b64ae', 33906, 4476, [new Endpoint(1, [0], [0,3,4,6,8,5], '0x90fd9ffffe4b64ae')], true, "Battery", "TRADFRI remote control"),
    'roller_shutter': new Device('EndDevice', '0x90fd9ffffe4b64af', 33906, 4476, [new Endpoint(1, [0], [0,3,4,6,8,5], '0x90fd9ffffe4b64af')], true, "Battery", "SCM-R_00.00.03.15TC"),
    'ZNLDP12LM': new Device('Router', '0x90fd9ffffe4b64ax', 33901, 4476, [new Endpoint(1, [0,4,3,5,10,258,13,19,6,1,1030,8,768,1027,1029,1026], [0,3,4,6,8,5], '0x90fd9ffffe4b64ax', [], {lightingColorCtrl: {colorCapabilities: 254}})], true, "Mains (single phase)", "lumi.light.aqcn02"),
    'SP600_OLD': new Device('Router', '0x90fd9ffffe4b64aa', 33901, 4476, [new Endpoint(1, [0,4,3,5,10,258,13,19,6,1,1030,8,768,1027,1029,1026], [0,3,4,6,8,5], '0x90fd9ffffe4b64aa', [], {seMetering: {"multiplier":1,"divisor":10000}})], true, "Mains (single phase)", "SP600", false, 'Salus', '20160120'),
    'SP600_NEW': new Device('Router', '0x90fd9ffffe4b64ab', 33901, 4476, [new Endpoint(1, [0,4,3,5,10,258,13,19,6,1,1030,8,768,1027,1029,1026], [0,3,4,6,8,5], '0x90fd9ffffe4b64aa', [], {seMetering: {"multiplier":1,"divisor":10000}})], true, "Mains (single phase)", "SP600", false, 'Salus', '20170220'),
    'MKS-CM-W5': new Device('Router', '0x90fd9ffffe4b64ac', 33901, 4476, [new Endpoint(1, [0,4,3,5,10,258,13,19,6,1,1030,8,768,1027,1029,1026], [0,3,4,6,8,5], '0x90fd9ffffe4b64aa', [], {})], true, "Mains (single phase)", "qnazj70", false),
    'GL-S-007ZS': new Device('Router', '0x0017880104e45526', 6540,4151, [new Endpoint(1, [0], [], '0x0017880104e45526')], true, "Mains (single phase)", 'GL-S-007ZS'),
    'U202DST600ZB': new Device('Router', '0x0017880104e43559', 6540,4151, [new Endpoint(10, [0, 6], [], '0x0017880104e43559'), new Endpoint(11, [0, 6], [], '0x0017880104e43559')], true, "Mains (single phase)", 'U202DST600ZB'),
    '3157100': new Device('Router', '0x0017880104e44559', 6542,4151, [new Endpoint(1, [], [], '0x0017880104e44559')], true, "Mains (single phase)", '3157100'),
}

const groups = {
    'group_1': new Group(1, []),
    'group_tradfri_remote': new Group(15071, [bulb_color_2.endpoints[0], bulb_2.endpoints[0]]),
    'group/with/slashes': new Group(99, []),
    'group_with_tradfri': new Group(11, [bulb_2.endpoints[0]])
}

const mock = {
    setTransmitPower: jest.fn(),
    touchlinkFactoryReset: jest.fn(),
    start: jest.fn(),
    permitJoin: jest.fn(),
    getCoordinatorVersion: jest.fn().mockReturnValue({type: 'z-Stack', meta: {version: 1, revision: 20190425}}),
    getNetworkParameters: jest.fn().mockReturnValue({panID: 0x162a, extendedPanID: [0, 11, 22], channel: 15}),
    on: (type, handler) => {
        events[type] = handler;
    },
    stop: jest.fn(),
    setLED: jest.fn(),
    getDevices: jest.fn().mockImplementation(() => {
        return Object.values(devices).filter((d) => returnDevices.length === 0 || returnDevices.includes(d.ieeeAddr));
    }),
    getDevicesByType: jest.fn().mockImplementation((type) => {
        return Object.values(devices).filter((d) => returnDevices.length === 0 || returnDevices.includes(d.ieeeAddr)).filter((d) => d.type === type);
    }),
    getDeviceByIeeeAddr: jest.fn().mockImplementation((ieeeAddr) => {
        return Object.values(devices).filter((d) => returnDevices.length === 0 || returnDevices.includes(d.ieeeAddr)).find((d) => d.ieeeAddr === ieeeAddr);
    }),
    getGroups: jest.fn().mockImplementation((query) => {
        return Object.values(groups);
    }),
    getGroupByID: jest.fn().mockImplementation((groupID) => {
        return Object.values(groups).find((d) => d.groupID === groupID);
    }),
    getPermitJoin: jest.fn().mockReturnValue(false),
    reset: jest.fn(),
    createGroup: jest.fn().mockImplementation((groupID) => {
        const group = new Group(groupID, []);
        groups[`group_${groupID}`] = group
        return group;
    })
};

const mockConstructor = jest.fn().mockImplementation(() => mock);

jest.mock('zigbee-herdsman', () => ({
    Controller: mockConstructor,
    Zcl: {ManufacturerCode: {Philips: 4107}},
}));

module.exports = {
    events, ...mock, constructor: mockConstructor, devices, groups, returnDevices
};
