const utils = require('../lib/util/utils').default;
const version = require('../package.json').version;
const versionHerdsman = require('../node_modules/zigbee-herdsman/package.json').version;
const versionHerdsmanConverters = require('../node_modules/zigbee-herdsman-converters/package.json').version;

describe('Utils', () => {
    it('Object is empty', () => {
        expect(utils.objectIsEmpty({})).toBeTruthy();
        expect(utils.objectIsEmpty({a: 1})).toBeFalsy();
    });

    it('Object has properties', () => {
        expect(utils.objectHasProperties({a: 1, b: 2, c: 3}, ['a', 'b'])).toBeTruthy();
        expect(utils.objectHasProperties({a: 1, b: 2, c: 3}, ['a', 'b', 'd'])).toBeFalsy();
    });

    it('git last commit', async () => {
        let mockReturnValue = [];
        jest.mock('git-last-commit', () => ({
            getLastCommit: (cb) => cb(mockReturnValue[0], mockReturnValue[1]),
        }));

        mockReturnValue = [false, {shortHash: '123'}];
        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({commitHash: '123', version: version});

        mockReturnValue = [true, null];
        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({commitHash: expect.any(String), version: version});
    });

    it('Check dependency version', async () => {
        expect(await utils.getDependencyVersion('zigbee-herdsman')).toStrictEqual({version: versionHerdsman});
        expect(await utils.getDependencyVersion('zigbee-herdsman-converters')).toStrictEqual({version: versionHerdsmanConverters});
    });

    it('To local iso string', async () => {
        var date = new Date('August 19, 1975 23:15:30 UTC+00:00');
        var getTimezoneOffset = Date.prototype.getTimezoneOffset;
        Date.prototype.getTimezoneOffset = () => 60;
        expect(utils.formatDate(date, 'ISO_8601_local').endsWith('-01:00')).toBeTruthy();
        Date.prototype.getTimezoneOffset = () => -60;
        expect(utils.formatDate(date, 'ISO_8601_local').endsWith('+01:00')).toBeTruthy();
        Date.prototype.getTimezoneOffset = getTimezoneOffset;
    });
    it('Removes null properties from object', () => {
        const obj1 = {
            ab: 0,
            cd: false,
            ef: null,
            gh: '',
            homeassistant: {
                xyz: 'mock',
                abcd: null,
            },
            nested: {
                homeassistant: {
                    abcd: true,
                    xyz: null,
                },
                abc: {},
                def: null,
            },
        };

        utils.removeNullPropertiesFromObject(obj1);
        expect(obj1).toStrictEqual({
            ab: 0,
            cd: false,
            gh: '',
            homeassistant: {
                xyz: 'mock',
            },
            nested: {
                homeassistant: {
                    abcd: true,
                },
                abc: {},
            },
        });

        const obj2 = {
            ab: 0,
            cd: false,
            ef: null,
            gh: '',
            homeassistant: {
                xyz: 'mock',
                abcd: null,
            },
            nested: {
                homeassistant: {
                    abcd: true,
                    xyz: null,
                },
                abc: {},
                def: null,
            },
        };
        utils.removeNullPropertiesFromObject(obj2, ['homeassistant']);
        expect(obj2).toStrictEqual({
            ab: 0,
            cd: false,
            gh: '',
            homeassistant: {
                xyz: 'mock',
                abcd: null,
            },
            nested: {
                homeassistant: {
                    abcd: true,
                    xyz: null,
                },
                abc: {},
            },
        });
    });
});
