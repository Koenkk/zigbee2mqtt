import fs from 'node:fs';
import path from 'node:path';

import utils from '../lib/util/utils';

const mockGetLastCommit = vi.fn<() => [boolean, {shortHash: string} | null]>(() => [false, {shortHash: '123'}]);

vi.mock('git-last-commit', () => ({
    getLastCommit: vi.fn((cb) => cb(...mockGetLastCommit())),
}));

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
        const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;

        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({commitHash: '123', version: version});

        mockGetLastCommit.mockReturnValueOnce([true, null]);
        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({commitHash: expect.any(String), version: version});
    });

    it('Check dependency version', async () => {
        const versionHerdsman = JSON.parse(
            fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'zigbee-herdsman', 'package.json'), 'utf8'),
        ).version;
        const versionHerdsmanConverters = JSON.parse(
            fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'zigbee-herdsman-converters', 'package.json'), 'utf8'),
        ).version;
        expect(await utils.getDependencyVersion('zigbee-herdsman')).toStrictEqual({version: versionHerdsman});
        expect(await utils.getDependencyVersion('zigbee-herdsman-converters')).toStrictEqual({version: versionHerdsmanConverters});
    });

    it('To local iso string', async () => {
        const date = new Date('August 19, 1975 23:15:30 UTC+00:00').getTime();
        const getTzOffsetSpy = vi.spyOn(Date.prototype, 'getTimezoneOffset');
        getTzOffsetSpy.mockReturnValueOnce(60);
        expect(utils.formatDate(date, 'ISO_8601_local').toString().endsWith('-01:00')).toBeTruthy();
        getTzOffsetSpy.mockReturnValueOnce(-60);
        expect(utils.formatDate(date, 'ISO_8601_local').toString().endsWith('+01:00')).toBeTruthy();
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
