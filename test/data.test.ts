import path from 'node:path';

import tmp from 'tmp';

import data from '../lib/util/data';

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
