const chai = require('chai');
const sinon = require('sinon');
const Availability = require('../lib/extension/deviceAvailability');
const utils = require('./utils');

describe('Availability', () => {
    let availability;

    beforeEach(() => {
        utils.stubLogger(sinon);
        availability = new Availability(null, null, null, () => {});
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Determine pingable devices', () => {
        it('Router device should be a pingable device', () => {
            const device = {
                powerSource: 'Mains (single phase)',
                type: 'Router',
            };

            chai.assert.isTrue(availability.isPingable(device));
        });

        it('Battery device should not be a pingable device', () => {
            const device = {
                powerSource: 'Battery',
                type: 'EndDevice',
            };

            chai.assert.isFalse(availability.isPingable(device));
        });

        it('E11-G13 should be a pingable device', () => {
            const device = {
                powerSource: 'Mains (single phase)',
                type: 'EndDevice',
                modelId: 'E11-G13',
                manufId: 4448,
            };

            chai.assert.isTrue(availability.isPingable(device));
        });
    });
});
