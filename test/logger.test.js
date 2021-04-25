const tmp = require('tmp');
const dir = tmp.dirSync();
let settings;
const fs = require('fs');
const path = require('path');
const data = require('./stub/data');
let stdOutWriteOriginal;
const rimraf = require('rimraf');
const Transport = require('winston-transport');

describe('Logger', () => {
    beforeEach(async () => {
        data.writeDefaultConfiguration();
        jest.resetModules();
        settings = require('../lib/util/settings');
        settings.set(['advanced', 'log_directory'], dir.name + '/%TIMESTAMP%');
        settings.reRead();
        stdOutWriteOriginal = console._stdout.write;
        console._stdout.write = () => {};
    });

    afterEach(async () => {
        console._stdout.write = stdOutWriteOriginal;
    });

    it('Create log directory', () => {
        const logger = require('../lib/util/logger.js');
        logger.logOutput();
        const dirs = fs.readdirSync(dir.name);
        expect(dirs.length).toBe(1);
    });

    it('Should cleanup', () => {
        const logger = require('../lib/util/logger.js');
        logger.logOutput();

        for (const d of fs.readdirSync(dir.name)) {
            rimraf.sync(path.join(dir.name, d));
        }

        for (let i = 0; i < 21; i++) {
            fs.mkdirSync(path.join(dir.name, `log_${i}`));
        }

        expect(fs.readdirSync(dir.name).length).toBe(21);
        logger.cleanup();
        expect(fs.readdirSync(dir.name).length).toBe(10);
    })

    it('Should not cleanup when there is no timestamp set', () => {
        const logger = require('../lib/util/logger.js');
        logger.logOutput();
        for (let i = 30; i < 40; i++) {
            fs.mkdirSync(path.join(dir.name, `log_${i}`));
        }

        settings.set(['advanced', 'log_directory'], dir.name + '/bla');
        expect(fs.readdirSync(dir.name).length).toBe(20);
        logger.cleanup();
        expect(fs.readdirSync(dir.name).length).toBe(20);
    })

    it('Set and get log level', () => {
        const logger = require('../lib/util/logger.js');
        logger.logOutput();
        logger.setLevel('debug');
        expect(logger.getLevel()).toBe('debug');
    });

    it('Add transport', () => {
        class DummyTransport extends Transport {
            log(info, callback) {
            }
        }

        const logger = require('../lib/util/logger.js');
        expect(logger.transports.length).toBe(2);
        logger.addTransport(new DummyTransport());
        expect(logger.transports.length).toBe(3);
    });

    it('Set and get log level warn <-> warning', () => {
        const logger = require('../lib/util/logger.js');
        logger.logOutput();
        logger.setLevel('warn');
        expect(logger.transports[0].level).toBe('warning');
        expect(logger.getLevel()).toBe('warn');
    });

    it('Logger should be console and file by default', () => {
        const logger = require('../lib/util/logger.js');
        logger.logOutput();
        const pipes = logger._readableState.pipes;
        expect(pipes.length).toBe(2);
        expect(pipes[0].constructor.name).toBe('Console');
        expect(pipes[0].silent).toBe(false);
        expect(pipes[1].constructor.name).toBe('File');
        expect(pipes[1].dirname.startsWith(dir.name)).toBeTruthy();
    });

    it('Logger can be file only', () => {
        settings.set(['advanced', 'log_output'], ['file']);
        const logger = require('../lib/util/logger.js');
        logger.logOutput();
        const pipes = logger._readableState.pipes;
        expect(pipes.length).toBe(2);
        expect(pipes[0].constructor.name).toBe('Console');
        expect(pipes[0].silent).toBe(true);
        expect(pipes[1].constructor.name).toBe('File');
        expect(pipes[1].dirname.startsWith(dir.name)).toBeTruthy();
    });

    it('Logger can be console only', () => {
        settings.set(['advanced', 'log_output'], ['console']);
        const logger = require('../lib/util/logger.js');
        logger.logOutput();
        const pipes = logger._readableState.pipes;
        expect(pipes.constructor.name).toBe('Console');
        expect(pipes.silent).toBe(false);
    });

    it('Logger can be nothing', () => {
        settings.set(['advanced', 'log_output'], []);
        const logger = require('../lib/util/logger.js');
        logger.logOutput();
        const pipes = logger._readableState.pipes;
        expect(pipes.constructor.name).toBe('Console');
        expect(pipes.silent).toBe(true);
    });

    it('Should allow to disable log rotation', () => {
        settings.set(['advanced', 'log_rotation'], false);
        const logger = require('../lib/util/logger.js');
        logger.logOutput();
        const pipes = logger._readableState.pipes;
        expect(pipes[1].constructor.name).toBe('File');
        expect(pipes[1].maxFiles).toBeNull();
        expect(pipes[1].tailable).toBeFalsy();
        expect(pipes[1].maxsize).toBeNull();
    });

    it('Should allow to symlink logs to current directory', () => {
        settings.set(['advanced', 'log_symlink_current'], true);
        let logger = require('../lib/util/logger.js');
        logger.logOutput();
        expect(fs.readdirSync(dir.name).includes('current')).toBeTruthy()

        jest.resetModules();
        logger = require('../lib/util/logger.js');
    });
});
