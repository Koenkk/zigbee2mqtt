const Availability = require('../lib/extension/deviceAvailability');
const utils = require('./utils');

describe('Availability', () => {
    let availability;

    beforeEach(() => {
        utils.stubLogger(jest);
        availability = new Availability(null, null, null, () => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Determine pingable devices', () => {
        it('Router device should be a pingable device', () => {
            const device = {
                powerSource: 'Mains (single phase)',
                type: 'Router',
            };

            expect(availability.isPingable(device)).toBe(true);
        });

        it('Battery device should not be a pingable device', () => {
            const device = {
                powerSource: 'Battery',
                type: 'EndDevice',
            };

            expect(availability.isPingable(device)).toBe(false);
        });

        it('E11-G13 should be a pingable device', () => {
            const device = {
                powerSource: 'Mains (single phase)',
                type: 'EndDevice',
                modelId: 'E11-G13',
                manufId: 4448,
            };

            expect(availability.isPingable(device)).toBe(true);
        });
    });
});
