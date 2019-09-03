const events = {};
const assert = require('assert');

class Group {
    constructor(groupID) {
        this.groupID = groupID;
        this.command = jest.fn();
        this.meta = {};
    }
}

const clusters = {
    'genScenes': 5,
    'genOnOff': 6,
    'genLevelCtrl': 8,
    'lightingColorCtrl': 768,
    'closuresWindowCovering': 9999, // todo
}

class Endpoint {
    constructor(ID, inputClusters, outputClusters) {
        this.ID = ID;
        this.inputClusters = inputClusters;
        this.outputClusters = outputClusters;
        this.command = jest.fn();
        this.read = jest.fn();
        this.write = jest.fn();
        this.bind = jest.fn();
        this.unbind = jest.fn();
        this.configureReporting = jest.fn();
        this.supportsInputCluster = (cluster) => {
            assert(clusters[cluster], `Undefined '${cluster}'`);
            return this.inputClusters.includes(clusters[cluster]);
        }

        this.supportsOutputCluster = (cluster) => {
            assert(clusters[cluster], `Undefined '${cluster}'`);
            return this.outputClusters.includes(clusters[cluster]);
        }
    }
}

class Device {
    constructor(type, ieeeAddr, networkAddress, manufacturerID, endpoints, interviewCompleted, powerSource = null, modelID = null, interviewing=false) {
        this.type = type;
        this.ieeeAddr = ieeeAddr;
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
        this.save = jest.fn();
    }

    getEndpoint(ID) {
        return this.endpoints.find((e) => e.ID === ID);
    }

    getEndpoints() {
        return this.endpoints;
    }

    isType(type) {
        return type === 'device';
    }
}

const returnDevices = [];

const devices = {
    'coordinator': new Device('Coordinator', '0x00124b00120144ae', 0, 0, [new Endpoint(1, [], [])], false),
    'bulb': new Device('Router', '0x000b57fffec6a5b2', 40369, 4476, [new Endpoint(1, [0,3,4,5,6,8,768,2821,4096], [5,25,32,4096])], true, "Mains (single phase)", "TRADFRI bulb E27 WS opal 980lm"),
    'bulb_color': new Device('Router', '0x000b57fffec6a5b3', 40399, 6535, [new Endpoint(1, [0,3,4,5,6,8,768,2821,4096], [5,25,32,4096])], true, "Mains (single phase)", "LLC020"),
    'remote': new Device('EndDevice', '0x0017880104e45517', 6535, 4107, [new Endpoint(1, [0], [0,3,4,6,8,5]), new Endpoint(2, [0,1,3,15,64512], [25, 6])], true, "Battery", "RWL021"),
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
    'QBKG04LM': new Device('Router', '0x0017880104e45541', 6540,4151, [new Endpoint(1, [0], []), new Endpoint(2, [0], [])], true, "Mains (single phase)", 'lumi.ctrl_neutral1'),
    'QBKG03LM':new Device('Router', '0x0017880104e45542', 6540,4151, [new Endpoint(1, [0], []), new Endpoint(2, [0, 6], []), new Endpoint(3, [0, 6], [])], true, "Mains (single phase)", 'lumi.ctrl_neutral2'),
    'GLEDOPTO1112': new Device('Router', '0x0017880104e45543', 6540,4151, [new Endpoint(11, [0], []), new Endpoint(13, [0], [])], true, "Mains (single phase)", 'GLEDOPTO'),
    'GLEDOPTO111213': new Device('Router', '0x0017880104e45544', 6540,4151, [new Endpoint(11, [0], []), new Endpoint(13, [0], []), new Endpoint(12, [0], [])], true, "Mains (single phase)", 'GLEDOPTO'),
    'HGZB04D': new Device('Router', '0x0017880104e45545', 6540,4151, [new Endpoint(1, [0], [])], true, "Mains (single phase)", 'FB56+ZSC05HG1.0'),
    'ZNCLDJ11LM': new Device('Router', '0x0017880104e45547', 6540,4151, [new Endpoint(1, [0], []), new Endpoint(2, [0], [])], true, "Mains (single phase)", 'lumi.curtain'),
    'HAMPTON99432':  new Device('Router', '0x0017880104e45548', 6540,4151, [new Endpoint(1, [0], []), new Endpoint(2, [0], [])], true, "Mains (single phase)", 'HDC52EastwindFan'),
    'HS2WD': new Device('Router', '0x0017880104e45549', 6540,4151, [new Endpoint(1, [0], [])], true, "Mains (single phase)", 'WarningDevice'),
    '1TST_EU': new Device('Router', '0x0017880104e45550', 6540,4151, [new Endpoint(1, [0], [])], true, "Mains (single phase)", 'Thermostat'),
    'SV01': new Device('Router', '0x0017880104e45551', 6540,4151, [new Endpoint(1, [0], [])], true, "Mains (single phase)", 'SV01-410-MP-1.0'),
    'J1': new Device('Router', '0x0017880104e45552', 6540,4151, [new Endpoint(1, [0], [])], true, "Mains (single phase)", 'J1 (5502)'),
    'E11_G13': new Device('EndDevice', '0x0017880104e45553', 6540,4151, [new Endpoint(1, [0, 6], [])], true, "Mains (single phase)", 'E11-G13'),
    'nomodel': new Device('Router', '0x0017880104e45535', 6536, 0, [new Endpoint(1, [0], [0,3,4,6,8,5])], true, "Mains (single phase)", undefined, true),
    'unsupported_router': new Device('Router', '0x0017880104e45525', 6536, 0, [new Endpoint(1, [0], [0,3,4,6,8,5])], true, "Mains (single phase)", "notSupportedModelID"),
    'CC2530_ROUTER': new Device('Router', '0x0017880104e45559', 6540,4151, [new Endpoint(1, [0, 6], [])], true, "Mains (single phase)", 'lumi.router'),
}

const groups = {
    'group_1': new Group(1),
}

const mock = {
    start: jest.fn(),
    permitJoin: jest.fn(),
    getCoordinatorVersion: jest.fn().mockReturnValue({type: 'z-Stack', meta: {version: 1}}),
    getNetworkParameters: jest.fn().mockReturnValue({panID: 0x162a, extendedPanID: [0, 11, 22], channel: 15}),
    on: (type, handler) => {
        events[type] = handler;
    },
    stop: jest.fn(),
    disableLED: jest.fn(),
    getDevices: jest.fn().mockImplementation((query) => {
        return Object.values(devices).filter((d) => returnDevices.length === 0 || returnDevices.includes(d.ieeeAddr))
    }),
    getDevice: jest.fn().mockImplementation((query) => {
       return Object.values(devices).filter((d) => returnDevices.length === 0 || returnDevices.includes(d.ieeeAddr))
        .find((d) => {
           return (!query.hasOwnProperty('ieeeAddr') || query.ieeeAddr === d.ieeeAddr) &&
            (!query.hasOwnProperty('type') || query.type === d.type);
       })
    }),
    getGroups: jest.fn().mockImplementation((query) => {
        return Object.values(groups);
    }),
    getGroup: jest.fn().mockImplementation((query) => {
       return Object.values(groups).find((g) => {
           return (!query.hasOwnProperty('groupID') || g.groupID === query.groupID);
       })
    }),
    getPermitJoin: jest.fn().mockReturnValue(false),
    softReset: jest.fn(),
};

const mockConstructor = jest.fn().mockImplementation(() => mock);

jest.mock('zigbee-herdsman', () => ({
    Controller: mockConstructor,
}));

module.exports = {
    events, ...mock, constructor: mockConstructor, devices, groups, returnDevices
};
