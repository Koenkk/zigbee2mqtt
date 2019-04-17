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
    });
});
