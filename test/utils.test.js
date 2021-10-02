const utils = require('../lib/util/utils').default;
const version = require('../package.json').version;
const versionHerdsman = require('../node_modules/zigbee-herdsman/package.json').version;

describe('Utils', () => {
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
        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({"commitHash": "123", "version": version});

        mockReturnValue = [true, null]
        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({"commitHash": expect.any(String), "version": version});
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
});
