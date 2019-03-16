const DeviceBind = require('../lib/extension/deviceBind');
const utils = require('./utils');

const mqtt = {
    subscribe: () => {},
    log: () => {},
};

const devices = {
    bulb: {
        getSimpleDesc: () => {
            return {inClusterList: [6, 8]};
        },
    },
    remote: {
        getSimpleDesc: () => {
            return {outClusterList: [5, 6, 8]};
        },
    },
    switch_ep2: {
        getSimpleDesc: () => {
            return {outClusterList: [5, 6]};
        },
    },
    switch_ep3: {
        getSimpleDesc: () => {
            return {inClusterList: [5, 6]};
        },
    },
};

const zigbee = {
    bind: jest.fn((ep, cluster, target, callback) => {
        callback(false, null);
    }),
    unbind: jest.fn((ep, cluster, target, callback) => {
        callback(false, null);
    }),
    getEndpoint: (ID, ep) => {
        if (ID === 'bulb') {
            return devices.bulb;
        } else if (ID === 'remote') {
            return devices.remote;
        } else if (ep == 2 && ID === 'switch_ep2') {
            return devices.switch_ep2;
        } else if (ep == 3 && ID === 'switch_ep3') {
            return devices.switch_ep3;
        }

        throw new Error(`No mock for ${ID} and ep ${ep}`);
    },
    getDevice: (ID) => {
        if (ID === 'switch_ep2') {
            return {modelId: 'lumi.sensor_86sw2.es1'};
        } else if (ID === 'switch_ep3') {
            return {modelId: 'DNCKAT_S003'};
        } else if (ID === 'bulb') {
            return {modelId: 'TRADFRI bulb E27 WS opal 980lm'};
        } else if (ID === 'remote') {
            return {modelId: 'TRADFRI remote control'};
        }

        throw new Error(`No mock for ${ID}`);
    },
};

describe('DeviceBind', () => {
    let deviceBind;

    beforeEach(() => {
        utils.stubLogger(jest);
        deviceBind = new DeviceBind(zigbee, mqtt, null, null);
    });

    afterEach(() => {
        zigbee.bind.mockClear();
        zigbee.unbind.mockClear();
        jest.restoreAllMocks();
    });

    describe('Bind devices', () => {
        it('Bind', async () => {
            deviceBind.onMQTTMessage('zigbee2mqtt/bridge/bind/remote', 'bulb');
            expect(zigbee.bind).toHaveBeenCalledTimes(2);
            expect(zigbee.bind).toHaveBeenNthCalledWith(1,
                devices.remote,
                6,
                devices.bulb,
                expect.any(Function)
            );
            expect(zigbee.bind).toHaveBeenNthCalledWith(2,
                devices.remote,
                8,
                devices.bulb,
                expect.any(Function)
            );
        });

        it('Bind non default ep', async () => {
            deviceBind.onMQTTMessage('zigbee2mqtt/bridge/bind/switch_ep2/right', 'bulb');
            expect(zigbee.bind).toHaveBeenCalledTimes(1);
            expect(zigbee.bind).toHaveBeenNthCalledWith(1,
                devices.switch_ep2,
                6,
                devices.bulb,
                expect.any(Function)
            );
        });

        it('Bind non default ep to target with non default ep', async () => {
            deviceBind.onMQTTMessage('zigbee2mqtt/bridge/bind/switch_ep2/right', 'switch_ep3/right');
            expect(zigbee.bind).toHaveBeenCalledTimes(2);
            expect(zigbee.bind).toHaveBeenNthCalledWith(1,
                devices.switch_ep2,
                5,
                devices.switch_ep3,
                expect.any(Function)
            );
            expect(zigbee.bind).toHaveBeenNthCalledWith(2,
                devices.switch_ep2,
                6,
                devices.switch_ep3,
                expect.any(Function)
            );
        });
    });

    describe('Unbind devices', () => {
        it('Unbind', async () => {
            deviceBind.onMQTTMessage('zigbee2mqtt/bridge/unbind/remote', 'bulb');
            expect(zigbee.unbind).toHaveBeenCalledTimes(2);
            expect(zigbee.unbind).toHaveBeenNthCalledWith(1,
                devices.remote,
                6,
                devices.bulb,
                expect.any(Function)
            );
            expect(zigbee.unbind).toHaveBeenNthCalledWith(2,
                devices.remote,
                8,
                devices.bulb,
                expect.any(Function)
            );
        });
    });
});
