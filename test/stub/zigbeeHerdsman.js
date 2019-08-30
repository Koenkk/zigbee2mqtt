const events = {};

const mock = {
    start: jest.fn(),
    permitJoin: jest.fn(),
    getCoordinatorVersion: jest.fn().mockReturnValue({type: 'z-Stack', meta: {version: 1}}),
    getDevices: jest.fn().mockReturnValue([]),
    getNetworkParameters: jest.fn().mockReturnValue({panID: 0x162a, extendedPanID: [0,11,22], channel: 15}),
    on: (type, handler) => {events[type] = handler},
}

jest.mock('zigbee-herdsman', () => ({
    Controller: jest.fn().mockImplementation(() => mock)
}));

module.exports = {
    events, mock
};