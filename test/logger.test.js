const tmp = require('tmp');
const dir = tmp.dirSync();
const data = require('./stub/data');
const settings = require('../lib/util/settings');
settings.set(['advanced', 'log_directory'], dir.name + '/%TIMESTAMP%');
const logger = require('../lib/util/logger.js');
const fs = require('fs');
const path = require('path');

describe('onlythis Logger', () => {
    it('Create log directory', () => {
        const dirs = fs.readdirSync(dir.name);
        expect(dirs.length).toBe(1);
    });

    it('Should cleanup', () => {
        for (let i = 0; i < 20; i++) {
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
        expect(fs.readdirSync(dir.name).length).toBe(20);
        logger.cleanup();
        expect(fs.readdirSync(dir.name).length).toBe(20);
    })
});
