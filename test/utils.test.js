const utils = require('../lib/util/utils.js');
const testUtils = require('./utils');

describe('Utils', () => {
    beforeAll(() => {
        testUtils.stubLogger(jest);
    });

    describe('Is xiaomi device', () => {
        it('Identify xiaomi device', () => {
            const device = {type: 'Router', manufId: 4151, manufName: 'Xiaomi'};
            expect(true).toBe(utils.isXiaomiDevice(device));
        });

        it('Identify xiaomi device without manufName', () => {
            const device = {type: 'Router', manufId: 4447};
            expect(true).toBe(utils.isXiaomiDevice(device));
        });

        it('Identify xiaomi device with different manufName', () => {
            const device = {type: 'Router', manufId: 4151, manufName: 'Trust International B.V.\u0000'};
            expect(false).toBe(utils.isXiaomiDevice(device));
        });

        it('Identify QBKG03LM as enddevice', () => {
            const device = {type: 'Router', manufId: 4447, modelId: 'lumi.ctrl_neutral1'};
            expect(false).toBe(utils.isRouter(device));
            expect('EndDevice').toBe(utils.correctDeviceType(device));
        });

        it('Identify QBKG04LM as enddevice', () => {
            const device = {type: 'Router', manufId: 4447, modelId: 'lumi.ctrl_neutral2'};
            expect(false).toBe(utils.isRouter(device));
            expect('EndDevice').toBe(utils.correctDeviceType(device));
        });
    });

    describe('Get endpoint by id', () => {
        it('Pick default ep', () => {
            const zigbee = {
                getDevice: (entityID) => {
                    return {modelId: 'TRADFRI on/off switch'};
                },
                getEndpoint: (entityID, epId) => {
                    return {epId: epId == null ? 1 : 0};
                },
            };
            const endpoint = utils.getEndpointByEntityID(zigbee, '0x12345678', null);
            expect(endpoint.epId).toBe(1);
        });

        it('Pick default ep from mapping when default defined', () => {
            const zigbee = {
                getDevice: (entityID) => {
                    return {modelId: 'SML002'};
                },
                getEndpoint: (entityID, epId) => {
                    return {epId};
                },
            };
            const endpoint = utils.getEndpointByEntityID(zigbee, '0x12345678', null);
            expect(endpoint.epId).toBe(2);
        });

        it('Pick default ep from mapping when not defined', () => {
            const zigbee = {
                getDevice: (entityID) => {
                    return {modelId: 'lumi.sensor_86sw2.es1'};
                },
                getEndpoint: (entityID, epId) => {
                    return {epId: epId == null ? 1 : 0};
                },
            };
            const endpoint = utils.getEndpointByEntityID(zigbee, '0x12345678', null);
            expect(endpoint.epId).toBe(1);
        });
    });
});
