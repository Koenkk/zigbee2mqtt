const chai = require('chai');
const data = require('../lib/util/data.js');
const path = require('path');

describe('Data', () => {
    describe('Get path', () => {
        it('Should return correct path', () => {
            const expected = path.normalize(path.join(__dirname, '..', 'data'));
            const actual = data.getPath();
            chai.assert.strictEqual(actual, expected);
        });

        it('Should return correct path when ZIGBEE2MQTT_DATA set', () => {
            const expected = path.join('var', 'zigbee2mqtt');
            process.env.ZIGBEE2MQTT_DATA = expected;
            data._reload();
            const actual = data.getPath();
            chai.assert.strictEqual(actual, expected);
            delete process.env.ZIGBEE2MQTT_DATA;
            data._reload();
        });
    });
});
