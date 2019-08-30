const events = {};

class Endpoint {
    constructor(ID, inputClusters, outputClusters) {
        this.ID = ID;
        this.inputClusters = inputClusters;
        this.outputClusters = outputClusters;
    }
}

class Device {
    constructor(type, ieeeAddr, networkAddress, manufacturerID, endpoints, interviewCompleted, powerSource = null, modelID = null) {
        this.type = type;
        this.ieeeAddr = ieeeAddr;
        this.networkAddress = networkAddress;
        this.manufacturerID = manufacturerID;
        this.endpoints = endpoints;
        this.powerSource = powerSource;
        this.interviewCompleted = interviewCompleted;
        this.modelID = modelID;
    }

    getEndpoint(ID) {
        return this.endpoints.find((e) => e.ID === ID);
    }
}

const devices = {
    'coordinator': new Device('Coordinator', '0x00124b00120144ae', 0, 0, [new Endpoint(1, [], [])], false),
    'bulb': new Device('Router', '0x000b57fffec6a5b2', 40369, 4476, [new Endpoint(1, [0,3,4,5,6,8,768,2821,4096], [5,25,32,4096])], true, "Mains (single phase)", "TRADFRI bulb E27 WS opal 980lm"),
    'remote': new Device('EndDevice', '0x0017880104e45517', 6535, 4107, [new Endpoint(1, [0], [0,3,4,6,8,5]), new Endpoint(2, [0,1,3,15,64512], [25])], true, "Battery", "RWL021"),
    'unsupported': new Device('EndDevice', '0x0017880104e45518', 6536, 0, [new Endpoint(1, [0], [0,3,4,6,8,5])], true, "Battery", "notSupportedModelID"),
    'notInSettings': new Device('EndDevice', '0x0017880104e45519', 6537, 0, [new Endpoint(1, [0], [0,3,4,6,8,5])], true, "Battery", "lumi.sensor_switch.aq2"),
    'WXKG11LM': new Device('EndDevice', '0x0017880104e45520', 6537, 0, [new Endpoint(1, [0], [0,3,4,6,8,5])], true, "Battery", "lumi.sensor_switch.aq2"),

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
        return Object.values(devices);
    }),
    getDevice: jest.fn().mockImplementation((query) => {
       return Object.values(devices).find((d) => {
           return (!query.hasOwnProperty('ieeeAddr') || query.ieeeAddr === d.ieeeAddr) &&
            (!query.hasOwnProperty('type') || query.type === d.type);
       })
    }),
};

const mockConstructor = jest.fn().mockImplementation(() => mock);

jest.mock('zigbee-herdsman', () => ({
    Controller: mockConstructor,
}));

module.exports = {
    events, ...mock, constructor: mockConstructor, devices,
};
