import * as data from './mocks/data';

import type {MockInstance} from 'vitest';

import fs from 'node:fs';
import {platform} from 'node:os';
import path from 'node:path';

import {rimrafSync} from 'rimraf';
import tmp from 'tmp';
import Transport from 'winston-transport';

import logger from '../lib/util/logger';
import * as settings from '../lib/util/settings';

describe('Logger', () => {
    let consoleWriteSpy: MockInstance;
    const dir = tmp.dirSync();

    const getCachedNamespacedLevels = (): Record<string, string> => {
        // @ts-expect-error private
        return logger.cachedNamespacedLevels;
    };

    beforeAll(() => {
        // @ts-expect-error private
        consoleWriteSpy = vi.spyOn(console._stdout, 'write').mockImplementation(() => {});
    });

    afterAll(() => {
        consoleWriteSpy.mockRestore();
    });

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings.reRead();
        settings.set(['advanced', 'log_directory'], dir.name + '/%TIMESTAMP%');
        logger.init();
        consoleWriteSpy.mockClear();
    });

    afterEach(async () => {});

    it('Create log directory', () => {
        const dirs = fs.readdirSync(dir.name);
        expect(dirs.length).toBe(1);
    });

    it('Should cleanup', () => {
        for (const d of fs.readdirSync(dir.name)) {
            rimrafSync(path.join(dir.name, d));
        }

        for (let i = 0; i < 20; i++) {
            fs.mkdirSync(path.join(dir.name, `log_${i}`));
        }

        expect(fs.readdirSync(dir.name).length).toBe(20);
        logger.init();
        expect(fs.readdirSync(dir.name).length).toBe(10);
    });

    it('Should not cleanup when there is no timestamp set', () => {
        for (const d of fs.readdirSync(dir.name)) {
            rimrafSync(path.join(dir.name, d));
        }

        for (let i = 30; i < 50; i++) {
            fs.mkdirSync(path.join(dir.name, `log_${i}`));
        }

        settings.set(['advanced', 'log_directory'], dir.name + '/bla');
        expect(fs.readdirSync(dir.name).length).toBe(20);
        logger.init();
        expect(fs.readdirSync(dir.name).length).toBe(21);
    });

    it('Set and get log level', () => {
        logger.setLevel('debug');
        expect(logger.getLevel()).toBe('debug');
        logger.setLevel('info');
        expect(logger.getLevel()).toBe('info');
        logger.setLevel('warning');
        expect(logger.getLevel()).toBe('warning');
        logger.setLevel('error');
        expect(logger.getLevel()).toBe('error');

        // winston level always stays at 'debug', logic handled by custom logger
        expect(logger.winston.level).toStrictEqual('debug');
        for (const transport of logger.winston.transports) {
            expect(transport.level).toStrictEqual(undefined);
        }
    });

    it('Add/remove transport', () => {
        class DummyTransport extends Transport {
            log(): void {}
        }

        expect(logger.winston.transports.length).toBe(2);
        const transport = new DummyTransport();
        logger.addTransport(transport);
        expect(logger.winston.transports.length).toBe(3);
        logger.removeTransport(transport);
        expect(logger.winston.transports.length).toBe(2);
    });

    it('Logger should be console and file by default', () => {
        // @ts-expect-error private
        const pipes = logger.winston._readableState.pipes;
        expect(pipes.length).toBe(2);
        expect(pipes[0].constructor.name).toBe('Console');
        expect(pipes[0].silent).toBe(false);
        expect(pipes[1].constructor.name).toBe('File');
        expect(pipes[1].dirname.startsWith(dir.name)).toBeTruthy();
    });

    it('Logger can be file only', () => {
        settings.set(['advanced', 'log_output'], ['file']);
        logger.init();
        // @ts-expect-error private
        const pipes = logger.winston._readableState.pipes;
        expect(pipes.length).toBe(2);
        expect(pipes[0].constructor.name).toBe('Console');
        expect(pipes[0].silent).toBe(true);
        expect(pipes[1].constructor.name).toBe('File');
        expect(pipes[1].dirname.startsWith(dir.name)).toBeTruthy();
    });

    it('Logger can be console only', () => {
        settings.set(['advanced', 'log_output'], ['console']);
        logger.init();
        // @ts-expect-error private
        const pipes = logger.winston._readableState.pipes;
        expect(pipes.constructor.name).toBe('Console');
        expect(pipes.silent).toBe(false);
    });

    it('Logger can be nothing', () => {
        settings.set(['advanced', 'log_output'], []);
        logger.init();
        // @ts-expect-error private
        const pipes = logger.winston._readableState.pipes;
        expect(pipes.constructor.name).toBe('Console');
        expect(pipes.silent).toBe(true);
    });

    it('Should allow to disable log rotation', () => {
        settings.set(['advanced', 'log_rotation'], false);
        logger.init();
        // @ts-expect-error private
        const pipes = logger.winston._readableState.pipes;
        expect(pipes[1].constructor.name).toBe('File');
        expect(pipes[1].maxFiles).toBeNull();
        expect(pipes[1].tailable).toBeFalsy();
        expect(pipes[1].maxsize).toBeNull();
    });

    it('Should allow to symlink logs to current directory', () => {
        try {
            settings.set(['advanced', 'log_symlink_current'], true);
            logger.init();
            expect(fs.readdirSync(dir.name).includes('current')).toBeTruthy();
        } catch (error) {
            if (platform() !== 'win32' || !(error as Error).message.startsWith('EPERM')) {
                throw error;
            }

            // ignore 'operation not permitted' failure on Windows
        }
    });

    it.each([
        ['debug', {higher: ['info', 'warning', 'error'], lower: []}],
        ['info', {higher: ['warning', 'error'], lower: ['debug']}],
        ['warning', {higher: ['error'], lower: ['debug', 'info']}],
        ['error', {higher: [], lower: ['debug', 'info', 'warning']}],
    ])('Logs relevant levels for %s', (level, otherLevels) => {
        logger.setLevel(level as settings.LogLevel);

        const logSpy = vi.spyOn(logger.winston, 'log');
        consoleWriteSpy.mockClear();
        let i = 1;

        // @ts-expect-error dynamic
        logger[level]('msg');
        expect(logSpy).toHaveBeenLastCalledWith(level, 'z2m: msg');
        expect(consoleWriteSpy).toHaveBeenCalledTimes(i++);
        // @ts-expect-error dynamic
        logger[level]('msg', 'abcd');
        expect(logSpy).toHaveBeenLastCalledWith(level, 'abcd: msg');
        expect(consoleWriteSpy).toHaveBeenCalledTimes(i++);
        // @ts-expect-error dynamic
        logger[level](() => 'func msg', 'abcd');
        expect(logSpy).toHaveBeenLastCalledWith(level, 'abcd: func msg');
        expect(consoleWriteSpy).toHaveBeenCalledTimes(i++);

        for (const higherLevel of otherLevels.higher) {
            // @ts-expect-error dynamic
            logger[higherLevel]('higher msg');
            expect(logSpy).toHaveBeenLastCalledWith(higherLevel, 'z2m: higher msg');
            expect(consoleWriteSpy).toHaveBeenCalledTimes(i++);
            // @ts-expect-error dynamic
            logger[higherLevel]('higher msg', 'abcd');
            expect(logSpy).toHaveBeenLastCalledWith(higherLevel, 'abcd: higher msg');
            expect(consoleWriteSpy).toHaveBeenCalledTimes(i++);
        }

        logSpy.mockClear();
        consoleWriteSpy.mockClear();

        for (const lowerLevel of otherLevels.lower) {
            // @ts-expect-error dynamic
            logger[lowerLevel]('lower msg');
            expect(logSpy).not.toHaveBeenCalled();
            expect(consoleWriteSpy).not.toHaveBeenCalled();
            // @ts-expect-error dynamic
            logger[lowerLevel]('lower msg', 'abcd');
            expect(logSpy).not.toHaveBeenCalled();
            expect(consoleWriteSpy).not.toHaveBeenCalled();
        }
    });

    it.each([
        [
            '^zhc:legacy:fz:(tuya|moes)',
            new RegExp(/^zhc:legacy:fz:(tuya|moes)/),
            [
                {ns: 'zhc:legacy:fz:tuya_device12', match: true},
                {ns: 'zhc:legacy:fz:moes_dimmer', match: true},
                {ns: 'zhc:legacy:fz:not_moes', match: false},
                {ns: 'zhc:legacy:fz', match: false},
                {ns: 'zhc:legacy:fz:', match: false},
                {ns: '1zhc:legacy:fz:tuya_device12', match: false},
            ],
        ],
        [
            '^zhc:legacy:fz:(tuya|moes)|^zh:ember:uart:|^zh:controller',
            new RegExp(/^zhc:legacy:fz:(tuya|moes)|^zh:ember:uart:|^zh:controller/),
            [
                {ns: 'zh:ember:uart:ash', match: true},
                {ns: 'zh:ember:uart', match: false},
                {ns: 'zh:controller', match: true},
                {ns: 'zh:controller:', match: true},
                {ns: 'azh:controller:', match: false},
            ],
        ],
        [
            '',
            undefined,
            [
                {ns: 'zhc:legacy:fz:tuya_device12', match: false},
                {ns: 'zhc:legacy:fz:moes_dimmer', match: false},
                {ns: 'zhc:legacy:fz:not_moes', match: false},
                {ns: 'zhc:legacy:fz', match: false},
                {ns: 'zhc:legacy:fz:', match: false},
                {ns: '1zhc:legacy:fz:tuya_device12', match: false},
                {ns: 'zh:ember:uart:ash', match: false},
                {ns: 'zh:ember:uart', match: false},
                {ns: 'zh:controller', match: false},
                {ns: 'zh:controller:', match: false},
                {ns: 'azh:controller:', match: false},
            ],
        ],
    ])('Sets namespace ignore for debug level %s', (ignore, expected, tests) => {
        logger.setLevel('debug');
        const logSpy = vi.spyOn(logger.winston, 'log');
        logger.setDebugNamespaceIgnore(ignore);
        // @ts-expect-error private
        expect(logger.debugNamespaceIgnoreRegex).toStrictEqual(expected);
        expect(logger.getDebugNamespaceIgnore()).toStrictEqual(ignore);

        for (const test of tests) {
            logger.debug('Test message', test.ns);

            if (test.match) {
                expect(logSpy).not.toHaveBeenCalled();
            } else {
                expect(logSpy).toHaveBeenLastCalledWith('debug', `${test.ns}: Test message`);
            }

            logSpy.mockClear();
        }
    });

    it('Logs with namespaced levels or default - higher', () => {
        settings.set(['advanced', 'log_namespaced_levels'], {
            'z2m:mqtt': 'warning',
        });
        logger.init();
        logger.setLevel('debug');
        expect(logger.getNamespacedLevels()).toStrictEqual({'z2m:mqtt': 'warning'});
        expect(logger.getLevel()).toStrictEqual('debug');

        const logSpy = vi.spyOn(logger.winston, 'log');

        consoleWriteSpy.mockClear();
        logger.info(`MQTT publish: topic 'abcd/efgh', payload '{"my": {"payload": "injson"}}'`, 'z2m:mqtt');
        expect(logSpy).toHaveBeenCalledTimes(0);
        expect(consoleWriteSpy).toHaveBeenCalledTimes(0);
        logger.error(`Not connected to MQTT server!`, 'z2m:mqtt');
        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(consoleWriteSpy).toHaveBeenCalledTimes(1);
        logger.info(`Just another info message`, 'z2m:notmqtt');
        expect(logSpy).toHaveBeenCalledTimes(2);
        expect(consoleWriteSpy).toHaveBeenCalledTimes(2);
    });

    it('Logs with namespaced levels or default - lower', () => {
        expect(logger.getNamespacedLevels()).toStrictEqual({});
        logger.setNamespacedLevels({'z2m:mqtt': 'info'});
        logger.setLevel('warning');
        expect(logger.getNamespacedLevels()).toStrictEqual({'z2m:mqtt': 'info'});
        expect(logger.getLevel()).toStrictEqual('warning');

        const logSpy = vi.spyOn(logger.winston, 'log');

        consoleWriteSpy.mockClear();
        logger.info(`MQTT publish: topic 'abcd/efgh', payload '{"my": {"payload": "injson"}}'`, 'z2m:mqtt');
        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(consoleWriteSpy).toHaveBeenCalledTimes(1);
        logger.error(`Not connected to MQTT server!`, 'z2m:mqtt');
        expect(logSpy).toHaveBeenCalledTimes(2);
        expect(consoleWriteSpy).toHaveBeenCalledTimes(2);
        logger.info(`Just another info message`, 'z2m:notmqtt');
        expect(logSpy).toHaveBeenCalledTimes(2);
        expect(consoleWriteSpy).toHaveBeenCalledTimes(2);
        logger.warning(`Just another warning message`, 'z2m:notmqtt');
        expect(logSpy).toHaveBeenCalledTimes(3);
        expect(consoleWriteSpy).toHaveBeenCalledTimes(3);
    });

    it('Logs with namespaced levels hierarchy', () => {
        const nsLevels = {'zh:zstack': 'debug' as const, 'zh:zstack:unpi:writer': 'error' as const};
        let cachedNSLevels;
        cachedNSLevels = Object.assign({}, nsLevels);
        logger.setNamespacedLevels(nsLevels);
        logger.setLevel('warning');

        consoleWriteSpy.mockClear();
        logger.debug(`--- parseNext [] debug picked from hierarchy`, 'zh:zstack:unpi:parser');
        expect(getCachedNamespacedLevels()).toStrictEqual(Object.assign(cachedNSLevels, {'zh:zstack:unpi:parser': 'debug'}));
        expect(consoleWriteSpy).toHaveBeenCalledTimes(1);
        logger.warning(`--> frame [36,15] warning explicitely supressed`, 'zh:zstack:unpi:writer');
        expect(getCachedNamespacedLevels()).toStrictEqual(cachedNSLevels);
        expect(consoleWriteSpy).toHaveBeenCalledTimes(1);
        logger.warning(`Another supressed warning message in a sub namespace`, 'zh:zstack:unpi:writer:sub:ns');
        expect(getCachedNamespacedLevels()).toStrictEqual(Object.assign(cachedNSLevels, {'zh:zstack:unpi:writer:sub:ns': 'error'}));
        expect(consoleWriteSpy).toHaveBeenCalledTimes(1);
        logger.error(`but error should go through`, 'zh:zstack:unpi:writer:another:sub:ns');
        expect(getCachedNamespacedLevels()).toStrictEqual(Object.assign(cachedNSLevels, {'zh:zstack:unpi:writer:another:sub:ns': 'error'}));
        expect(consoleWriteSpy).toHaveBeenCalledTimes(2);
        logger.warning(`new unconfigured namespace warning`, 'z2m:mqtt');
        expect(getCachedNamespacedLevels()).toStrictEqual(Object.assign(cachedNSLevels, {'z2m:mqtt': 'warning'}));
        expect(consoleWriteSpy).toHaveBeenCalledTimes(3);
        logger.info(`cached unconfigured namespace info should be supressed`, 'z2m:mqtt');
        expect(getCachedNamespacedLevels()).toStrictEqual(cachedNSLevels);
        expect(consoleWriteSpy).toHaveBeenCalledTimes(3);

        logger.setLevel('info');
        expect(getCachedNamespacedLevels()).toStrictEqual((cachedNSLevels = Object.assign({}, nsLevels)));
        logger.info(`unconfigured namespace info should now pass after default level change and cache reset`, 'z2m:mqtt');
        expect(getCachedNamespacedLevels()).toStrictEqual(Object.assign(cachedNSLevels, {'z2m:mqtt': 'info'}));
        expect(consoleWriteSpy).toHaveBeenCalledTimes(4);
        logger.error(`configured namespace hierachy should still work after the cache reset`, 'zh:zstack:unpi:writer:another:sub:ns');
        expect(getCachedNamespacedLevels()).toStrictEqual(Object.assign(cachedNSLevels, {'zh:zstack:unpi:writer:another:sub:ns': 'error'}));
        expect(consoleWriteSpy).toHaveBeenCalledTimes(5);

        logger.setNamespacedLevels({'zh:zstack': 'warning'});
        expect(getCachedNamespacedLevels()).toStrictEqual((cachedNSLevels = {'zh:zstack': 'warning'}));
        logger.error(`error logged`, 'zh:zstack:unpi:writer');
        expect(getCachedNamespacedLevels()).toStrictEqual(Object.assign(cachedNSLevels, {'zh:zstack:unpi:writer': 'warning'}));
        expect(consoleWriteSpy).toHaveBeenCalledTimes(6);
        logger.debug(`debug suppressed`, 'zh:zstack:unpi');
        expect(getCachedNamespacedLevels()).toStrictEqual(Object.assign(cachedNSLevels, {'zh:zstack:unpi': 'warning'}));
        expect(consoleWriteSpy).toHaveBeenCalledTimes(6);
        logger.warning(`warning logged`, 'zh:zstack');
        expect(getCachedNamespacedLevels()).toStrictEqual(Object.assign(cachedNSLevels, {'zh:zstack': 'warning'}));
        expect(consoleWriteSpy).toHaveBeenCalledTimes(7);
        logger.info(`unconfigured namespace`, 'z2m:mqtt');
        expect(getCachedNamespacedLevels()).toStrictEqual(Object.assign(cachedNSLevels, {'z2m:mqtt': 'info'}));
        expect(consoleWriteSpy).toHaveBeenCalledTimes(8);
    });

    it('Ignores SPLAT chars', () => {
        logger.setLevel('debug');

        const logSpy = vi.spyOn(logger.winston, 'log');
        consoleWriteSpy.mockClear();

        let splatChars = '%d';
        logger.debug(splatChars, 'z2m:mqtt');
        expect(logSpy).toHaveBeenLastCalledWith('debug', `z2m:mqtt: ${splatChars}`);
        expect(consoleWriteSpy.mock.calls[0][0]).toMatch(new RegExp(`^.*\tz2m:mqtt: ${splatChars}`));
        splatChars = 'anything %s goes here';
        logger.debug(splatChars, 'z2m:test');
        expect(logSpy).toHaveBeenLastCalledWith('debug', `z2m:test: ${splatChars}`);
        expect(consoleWriteSpy.mock.calls[1][0]).toMatch(new RegExp(`^.*\tz2m:test: ${splatChars}`));
    });

    it('Logs to console in JSON when configured', () => {
        settings.set(['advanced', 'log_console_json'], true);
        logger.init();

        consoleWriteSpy.mockClear();
        logger.info(`Test JSON message`, 'z2m');

        const outputJSON = JSON.parse(consoleWriteSpy.mock.calls[0][0]);
        expect(outputJSON).toStrictEqual({
            level: 'info',
            message: 'z2m: Test JSON message',
            timestamp: expect.any(String),
        });

        settings.set(['advanced', 'log_console_json'], false);
        logger.init();

        consoleWriteSpy.mockClear();
        logger.info(`Test JSON message`, 'z2m');

        const outputStr: string = consoleWriteSpy.mock.calls[0][0];
        expect(outputStr.trim().endsWith('\u001b[32minfo\u001b[39m: \tz2m: Test JSON message')).toStrictEqual(true);
    });
});
