const winston = require('winston');
const moment = require('moment');
const settings = require('./settings');
const path = require('path');
const fs = require('fs');
const fx = require('mkdir-recursive');
const rimraf = require('rimraf');

// Determine the log level.
const level = settings.get().advanced.log_level;

// Directoy to log to
const timestamp = moment(Date.now()).format('YYYY-MM-DD.HH-mm-ss');
const directory = settings.get().advanced.log_directory.replace('%TIMESTAMP%', timestamp);

// Make sure that log directoy exsists
fx.mkdirSync(directory);

// Create logger
const logger = new (winston.Logger)({
    transports: [
        new (winston.transports.File)({
            filename: path.join(directory, 'log.txt'),
            json: false,
            level: level,
            maxFiles: 3, // Keep last 3 files
            maxsize: 10000000, // 10MB
            timestamp: () => new Date().toLocaleString(),
        }),
        new (winston.transports.Console)({
            timestamp: () => new Date().toLocaleString(),
            formatter: function(options) {
                return winston.config.colorize(options.level, '  zigbee2mqtt:' + options.level.toLowerCase()) + ' ' +
                    options.timestamp() + ' ' + (options.message ? options.message : '') +
                    (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' );
            },
        }),
    ],
});

logger.info(`Logging to directory: '${directory}'`);

logger.transports.console.level = level;

// Cleanup any old log directory.
if (settings.get().advanced.log_directory.includes('%TIMESTAMP%')) {
    const rootDirectory = path.join(directory, '..');

    let directories = fs.readdirSync(rootDirectory).map((d) => {
        d = path.join(rootDirectory, d);
        return {path: d, birth: fs.statSync(d).birthtimeMs};
    });

    directories.sort((a, b) => b.birth - a.birth);
    directories = directories.slice(10, directories.length);
    directories.forEach((dir) => {
        logger.debug(`Removing old log directory '${dir.path}'`);
        rimraf.sync(dir.path);
    });
}

module.exports = logger;
