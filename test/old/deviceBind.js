const DeviceBind = require('../lib/extension/deviceBind');
const utils = require('./utils');
const settings = require('../lib/util/settings');

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
    occupancy_sensor: {
        getSimpleDesc: () => {
            return {outClusterList: [5, 6]};
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
        if (ID === 'bulb' || ID === '0x002') {
            return devices.bulb;
        } else if (ID === 'remote' || ID === '0x001') {
            return devices.remote;
        } else if (ep == 2 && ID === 'switch_ep2') {
            return devices.switch_ep2;
        } else if (ep == 3 && ID === 'switch_ep3') {
            return devices.switch_ep3;
        } else if (ep == 2 && ID == 'occupancy_sensor') {
            return devices.occupancy_sensor;
        }

        throw new Error(`No mock for ${ID} and ep ${ep}`);
    },
    getDevice: (ID) => {
        const lookup = {
            'occupancy_sensor': 'SML002',
            'switch_ep2': 'lumi.sensor_86sw2.es1',
            'switch_ep3': 'DNCKAT_S003',
            'bulb': 'TRADFRI bulb E27 WS opal 980lm',
            'remote': 'TRADFRI remote control',
            '0x002': 'TRADFRI bulb E27 WS opal 980lm',
            '0x001': 'TRADFRI remote control',
        };

        if (lookup.hasOwnProperty(ID)) {
            return {modelId: lookup[ID]};
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

        it('Bind by friendly name', async () => {
            jest.spyOn(settings, 'getIeeeAddrByFriendlyName').mockImplementation((friendlyName) => {
                const lookup = {
                    remote: '0x001',
                    bulb: '0x002',
                };

                return lookup[friendlyName];
            });

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

        it('Bind default ep when mapped', async () => {
            deviceBind.onMQTTMessage('zigbee2mqtt/bridge/bind/occupancy_sensor', 'bulb');
            expect(zigbee.bind).toHaveBeenCalledTimes(1);
            expect(zigbee.bind).toHaveBeenNthCalledWith(1,
                devices.occupancy_sensor,
                6,
                devices.bulb,
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
