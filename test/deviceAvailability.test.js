const chai = require('chai');
const sinon = require('sinon');
const DeviceAvailability = require('../lib/extension/deviceAvailability');
const settings = require('../lib/util/settings');
const utils = require('./utils');
const sandbox = sinon.createSandbox();

describe('DeviceAvailability', () => {
    let deviceAvailability;

    beforeEach(() => {
        utils.stubLogger(sandbox);
        deviceAvailability = new DeviceAvailability(null, null, null, () => {});
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('Determine pingable devices', () => {
        it('Router device should be a pingable device', () => {
            const device = {
                powerSource: 'Mains (single phase)',
                type: 'Router'
            }

            chai.assert.isTrue(deviceAvailability.isPingable(device));
        });

        it('Battery device should not be a pingable device', () => {
            const device = {
                powerSource: 'Battery',
                type: 'EndDevice'
            }

            chai.assert.isFalse(deviceAvailability.isPingable(device));
        });

        it('E11-G13 should be a pingable device', () => {
            const device = {
                powerSource: 'Mains (single phase)',
                type: 'EndDevice',
                modelId: 'E11-G13',
                manufId: 4448,
            }

            chai.assert.isTrue(deviceAvailability.isPingable(device));
        });
    });
});
