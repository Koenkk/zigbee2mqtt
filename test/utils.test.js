const utils = require('../lib/util/utils.js');

describe('Utils', () => {
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
});
