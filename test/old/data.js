const data = require('../lib/util/data.js');
const path = require('path');
const utils = require('./utils');

describe('Data', () => {
    describe('Get path', () => {
        beforeEach(() => {
            utils.stubLogger(jest);
        });

        it('Should return correct path', () => {
            const expected = path.normalize(path.join(__dirname, '..', 'data'));
            const actual = data.getPath();
            expect(actual).toBe(expected);
        });

        it('Should return correct path when ZIGBEE2MQTT_DATA set', () => {
            const expected = path.join('var', 'zigbee2mqtt');
            process.env.ZIGBEE2MQTT_DATA = expected;
            data._reload();
            const actual = data.getPath();
            expect(actual).toBe(expected);
            delete process.env.ZIGBEE2MQTT_DATA;
            data._reload();
        });
    });
});
