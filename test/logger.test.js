const tmp = require('tmp');
const dir = tmp.dirSync();
let settings;
const fs = require('fs');
const path = require('path');
const data = require('./stub/data');
let stdOutWriteOriginal;
const {rimrafSync} = require('rimraf');
const Transport = require('winston-transport');

describe('Logger', () => {
    let logger;

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        jest.resetModules();
        settings = require('../lib/util/settings');
        settings.set(['advanced', 'log_directory'], dir.name + '/%TIMESTAMP%');
        settings.reRead();
        stdOutWriteOriginal = console._stdout.write;
        console._stdout.write = () => {};
        logger = require('../lib/util/logger').default;
        logger.init();
    });

    afterEach(async () => {
        console._stdout.write = stdOutWriteOriginal;
    });

    it('Create log directory', () => {
        const dirs = fs.readdirSync(dir.name);
        expect(dirs.length).toBe(1);
    });

    it('Should cleanup', () => {
        for (const d of fs.readdirSync(dir.name)) {
            rimrafSync(path.join(dir.name, d));
        }

        for (let i = 0; i < 21; i++) {
            fs.mkdirSync(path.join(dir.name, `log_${i}`));
        }

        expect(fs.readdirSync(dir.name).length).toBe(21);
        logger.cleanup();
        expect(fs.readdirSync(dir.name).length).toBe(10);
    })

    it('Should not cleanup when there is no timestamp set', () => {
        for (let i = 30; i < 40; i++) {
            fs.mkdirSync(path.join(dir.name, `log_${i}`));
        }

        settings.set(['advanced', 'log_directory'], dir.name + '/bla');
        expect(fs.readdirSync(dir.name).length).toBe(21);
        logger.cleanup();
        expect(fs.readdirSync(dir.name).length).toBe(21);
    })

    it('Set and get log level', () => {
        logger.setLevel('debug');
        expect(logger.getLevel()).toBe('debug');
        logger.setLevel('info');
        expect(logger.getLevel()).toBe('info');
        logger.setLevel('warning');
        expect(logger.getLevel()).toBe('warning');
        logger.setLevel('error');
        expect(logger.getLevel()).toBe('error');
    });

    it('Add/remove transport', () => {
        class DummyTransport extends Transport {
            log(info, callback) {
            }
        }

        expect(logger.winston.transports.length).toBe(2);
        const transport = new DummyTransport();
        logger.addTransport(transport);
        expect(logger.winston.transports.length).toBe(3);
        logger.removeTransport(transport);
        expect(logger.winston.transports.length).toBe(2);
    });

    it('Logger should be console and file by default', () => {
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
        const pipes = logger.winston._readableState.pipes;
        expect(pipes.constructor.name).toBe('Console');
        expect(pipes.silent).toBe(false);
    });

    it('Logger can be nothing', () => {
        settings.set(['advanced', 'log_output'], []);
        logger.init();
        const pipes = logger.winston._readableState.pipes;
        expect(pipes.constructor.name).toBe('Console');
        expect(pipes.silent).toBe(true);
    });

    it('Should allow to disable log rotation', () => {
        settings.set(['advanced', 'log_rotation'], false);
        logger.init();
        const pipes = logger.winston._readableState.pipes;
        expect(pipes[1].constructor.name).toBe('File');
        expect(pipes[1].maxFiles).toBeNull();
        expect(pipes[1].tailable).toBeFalsy();
        expect(pipes[1].maxsize).toBeNull();
    });

    it('Should allow to symlink logs to current directory', () => {
        settings.set(['advanced', 'log_symlink_current'], true);
        logger.init();
        expect(fs.readdirSync(dir.name).includes('current')).toBeTruthy()

        jest.resetModules();
        logger = require('../lib/util/logger').default;
    });

    it('Log', () => {
        logger.setLevel('debug');

        const logSpy = jest.spyOn(logger.winston, 'log');
        logger.debug('msg');
        expect(logSpy).toHaveBeenLastCalledWith('debug', 'msg', {namespace: 'z2m'});
        logger.debug('msg', 'abcd');
        expect(logSpy).toHaveBeenLastCalledWith('debug', 'msg', {namespace: 'abcd'});

        logger.info('msg');
        expect(logSpy).toHaveBeenLastCalledWith('info', 'msg', {namespace: 'z2m'});
        logger.info('msg', 'abcd');
        expect(logSpy).toHaveBeenLastCalledWith('info', 'msg', {namespace: 'abcd'});

        logger.warning('msg');
        expect(logSpy).toHaveBeenLastCalledWith('warning', 'msg', {namespace: 'z2m'});
        logger.warning('msg', 'abcd');
        expect(logSpy).toHaveBeenLastCalledWith('warning', 'msg', {namespace: 'abcd'});

        logger.error('msg');
        expect(logSpy).toHaveBeenLastCalledWith('error', 'msg', {namespace: 'z2m'});
        logger.error(new Error('msg'));// test for stack=true
        expect(logSpy).toHaveBeenLastCalledWith('error', new Error('msg'), {namespace: 'z2m'});
        logger.error('msg', 'abcd');
        expect(logSpy).toHaveBeenLastCalledWith('error', 'msg', {namespace: 'abcd'});
        expect(logSpy).toHaveBeenCalledTimes(9);
    });

    it.each([
        [
            '^zhc:legacy:fz:(tuya|moes)',
            new RegExp(/^zhc:legacy:fz:(tuya|moes)/),
            [
                { ns: 'zhc:legacy:fz:tuya_device12', match: true },
                { ns: 'zhc:legacy:fz:moes_dimmer', match: true },
                { ns: 'zhc:legacy:fz:not_moes', match: false },
                { ns: 'zhc:legacy:fz', match: false },
                { ns: 'zhc:legacy:fz:', match: false },
                { ns: '1zhc:legacy:fz:tuya_device12', match: false },
            ]
        ],
        [
            '^zhc:legacy:fz:(tuya|moes)|^zh:ember:uart:|^zh:controller',
            new RegExp(/^zhc:legacy:fz:(tuya|moes)|^zh:ember:uart:|^zh:controller/),
            [
                { ns: 'zh:ember:uart:ash', match: true },
                { ns: 'zh:ember:uart', match: false },
                { ns: 'zh:controller', match: true },
                { ns: 'zh:controller:', match: true },
                { ns: 'azh:controller:', match: false },
            ]
        ],
        [
            '',
            undefined,
            [
                { ns: 'zhc:legacy:fz:tuya_device12', match: false },
                { ns: 'zhc:legacy:fz:moes_dimmer', match: false },
                { ns: 'zhc:legacy:fz:not_moes', match: false },
                { ns: 'zhc:legacy:fz', match: false },
                { ns: 'zhc:legacy:fz:', match: false },
                { ns: '1zhc:legacy:fz:tuya_device12', match: false },
                { ns: 'zh:ember:uart:ash', match: false },
                { ns: 'zh:ember:uart', match: false },
                { ns: 'zh:controller', match: false },
                { ns: 'zh:controller:', match: false },
                { ns: 'azh:controller:', match: false },
            ]
        ],
    ])('Sets namespace ignore for debug level %s', (ignore, expected, tests) => {
        logger.setLevel('debug');
        const logSpy = jest.spyOn(logger.winston, 'log');
        logger.setDebugNamespaceIgnore(ignore);
        expect(logger.debugNamespaceIgnoreRegex).toStrictEqual(expected);
        expect(logger.getDebugNamespaceIgnore()).toStrictEqual(ignore);

        for (const test of tests) {
            logger.debug('Test message', test.ns);

            if (test.match) {
                expect(logSpy).not.toHaveBeenCalled();
            } else {
                expect(logSpy).toHaveBeenLastCalledWith('debug', 'Test message', {namespace: test.ns});
            }

            logSpy.mockClear();
        }
    });

    it('Logs with namespaced levels or default', () => {
        settings.set(['advanced', 'log_namespaced_levels'], {
            'z2m:mqtt': 'warning',
        });
        logger.init();
        logger.setLevel('debug');
        const logSpy = jest.spyOn(logger.winston, 'log');

        logger.info(`MQTT publish: topic 'abcd/efgh', payload '{"my": {"payload": "injson"}}'`, 'z2m:mqtt');
        expect(logSpy).toHaveBeenCalledTimes(0);
        logger.error(`Not connected to MQTT server!`, 'z2m:mqtt');
        expect(logSpy).toHaveBeenCalledTimes(1);
        logger.info(`Just another info message`, 'z2m:notmqtt');
        expect(logSpy).toHaveBeenCalledTimes(2);
    });
});
