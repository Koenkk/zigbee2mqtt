const chai = require('chai');
const sinon = require('sinon');
const Availability = require('../lib/extension/availability');
const utils = require('./utils');
const sandbox = sinon.createSandbox();

describe('Availability', () => {
    let availability;

    beforeEach(() => {
        utils.stubLogger(sandbox);
        availability = new Availability(null, null, null, () => {});
    });

    afterEach(() => {
        sandbox.restore();
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
