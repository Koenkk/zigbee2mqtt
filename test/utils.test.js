const utils = require('../lib/util/utils.js');
const version = require('../package.json').version;
const versionHerdsman = require('../node_modules/zigbee-herdsman/package.json').version;

describe('Utils', () => {
    describe('Is xiaomi device', () => {
        it('Identify xiaomi device', () => {
            const device = {type: 'Router', manufacturerID: 4151, manufacturerName: 'Xiaomi'};
            expect(true).toBe(utils.isXiaomiDevice(device));
        });

        it('Identify xiaomi device without manufacturerName', () => {
            const device = {type: 'Router', manufacturerID: 4447};
            expect(true).toBe(utils.isXiaomiDevice(device));
        });

        it('Identify xiaomi device with different manufacturerName', () => {
            const device = {type: 'Router', manufacturerID: 4151, manufacturerName: 'Trust International B.V.\u0000'};
            expect(false).toBe(utils.isXiaomiDevice(device));
        });
    });

    it('Convert milliseconds to seconds', () => {
        expect(utils.millisecondsToSeconds(2000)).toBe(2);
    })

    it('Object has properties', () => {
        expect(utils.objectHasProperties({a: 1, b: 2, c: 3}, ['a', 'b'])).toBeTruthy();
        expect(utils.objectHasProperties({a: 1, b: 2, c: 3}, ['a', 'b', 'd'])).toBeFalsy();
    })

    it('git last commit', async () => {
        let mockReturnValue = [];
        jest.mock('git-last-commit', () => ({
            getLastCommit: (cb) => cb(mockReturnValue[0], mockReturnValue[1])
        }));

        mockReturnValue = [false, {shortHash: '123'}]
        expect(await utils.getZigbee2mqttVersion()).toStrictEqual({"commitHash": "123", "version": version});

        mockReturnValue = [true, null]
        expect(await utils.getZigbee2mqttVersion()).toStrictEqual({"commitHash": "unknown", "version": version});
    })

    it('Check dependency version', async () => {
        var dependency = 'zigbee-herdsman';
        expect(await utils.getDependencyVersion(dependency)).toStrictEqual({"version": versionHerdsman});
    })

    it('To local iso string', async () => {
        var date = new Date('August 19, 1975 23:15:30 UTC+00:00');
        var getTimezoneOffset = Date.prototype.getTimezoneOffset;
        Date.prototype.getTimezoneOffset = () => 60;
        expect(utils.formatDate(date, 'ISO_8601_local').endsWith('-01:00')).toBeTruthy();
        Date.prototype.getTimezoneOffset = () => -60;
        expect(utils.formatDate(date, 'ISO_8601_local').endsWith('+01:00')).toBeTruthy();
        Date.prototype.getTimezoneOffset = getTimezoneOffset;
    })

    it('Throw exception when formating with invalid date', async () => {
        var date = new Date('August 19, 1975 23:15:30 UTC+00:00');
        expect(() => utils.formatDate(date, 'invalid', 1)).toThrowError("Unsupported type 'invalid'")
    })

    it('Get key', async () => {
        expect(utils.getKey({'1': '1'}, '1', 2, null)).toBe('1');
        expect(utils.getKey({'1': '1'}, '2', 2, null)).toBe(2);
        expect(utils.getKey({'1': '1'}, '1', null, () => '3')).toBe('3');
    })
});
