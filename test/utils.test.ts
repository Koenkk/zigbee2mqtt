import {exec} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import utils from '../lib/util/utils';

// keep the implementations, just spy
vi.mock('node:child_process', {spy: true});

describe('Utils', () => {
    it('Object is empty', () => {
        expect(utils.objectIsEmpty({})).toBeTruthy();
        expect(utils.objectIsEmpty({a: 1})).toBeFalsy();
    });

    it('Object has properties', () => {
        expect(utils.objectHasProperties({a: 1, b: 2, c: 3}, ['a', 'b'])).toBeTruthy();
        expect(utils.objectHasProperties({a: 1, b: 2, c: 3}, ['a', 'b', 'd'])).toBeFalsy();
    });

    it('get Z2M version', async () => {
        const readFileSyncSpy = vi.spyOn(fs, 'readFileSync');
        const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;

        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({commitHash: expect.stringMatching(/^(?!unknown)[a-z0-9]{8}$/), version});
        expect(exec).toHaveBeenCalledTimes(1);

        // @ts-expect-error mock spy
        exec.mockImplementationOnce((cmd, cb) => {
            cb(null, 'abcd1234');
        });
        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({commitHash: 'abcd1234', version});

        // @ts-expect-error mock spy
        exec.mockImplementationOnce((cmd, cb) => {
            cb(null, '');
        });
        // hash file may or may not be present during testing, don't failing matching if not
        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({commitHash: expect.stringMatching(/^(unknown|([a-z0-9]{8}))$/), version});

        readFileSyncSpy.mockImplementationOnce(() => {
            throw new Error('no hash file');
        });
        // @ts-expect-error mock spy
        exec.mockImplementationOnce((cmd, cb) => {
            cb(null, '');
        });
        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({commitHash: 'unknown', version});

        readFileSyncSpy.mockImplementationOnce(() => {
            throw new Error('no hash file');
        });
        // @ts-expect-error mock spy
        exec.mockImplementationOnce((cmd, cb) => {
            cb(new Error('invalid'), '');
        });
        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({commitHash: 'unknown', version});
        expect(exec).toHaveBeenCalledTimes(5);
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
        // XXX: testing this properly?
        const date = new Date('August 19, 1975 23:15:30.452 UTC+00:00');
        const time = date.getTime();
        const tzOffset = -date.getTimezoneOffset();
        const plusOrMinus = tzOffset >= 0 ? '+' : '-';
        const tz = `${plusOrMinus + (tzOffset / 60).toString().padStart(2, '0')}:${(tzOffset % 60).toString().padStart(2, '0')}`;

        const fDate = utils.formatDate(time, 'ISO_8601_local');

        expect(fDate).toMatch(/1975-08-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:30.452(\+|-)[0-1][0-9]:[0-5][0-9]/);
        expect((fDate as string).endsWith(tz)).toBeTruthy();
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
