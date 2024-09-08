const logger = require('./stub/logger');
const data = require('../lib/util/data').default;
const path = require('path');
const tmp = require('tmp');
const fs = require('fs');

describe('Data', () => {
    describe('Get path', () => {
        it('Should return correct path', () => {
            const expected = path.normalize(path.join(__dirname, '..', 'data'));
            const actual = data.getPath();
            expect(actual).toBe(expected);
        });

        it('Should return correct path when ZIGBEE2MQTT_DATA set', () => {
            const expected = tmp.dirSync().name;
            process.env.ZIGBEE2MQTT_DATA = expected;
            data._testReload();
            const actual = data.getPath();
            expect(actual).toBe(expected);
            expect(data.joinPath('test')).toStrictEqual(path.join(expected, 'test'));
            expect(data.joinPath('/test')).toStrictEqual(path.resolve(expected, '/test'));
            delete process.env.ZIGBEE2MQTT_DATA;
            data._testReload();
        });
    });
});
