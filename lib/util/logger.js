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

// Custom level
const levels = {
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3,
        trace: 4,
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        info: 'green',
        debug: 'blue',
        trace: 'magenta',
    },
};

// Create logger
const logger = new winston.Logger({
    levels: levels.levels,
    transports: [
        new winston.transports.File({
            filename: path.join(directory, 'log.txt'),
            json: false,
            level,
            maxFiles: 3, // Keep last 3 files
            maxsize: 10000000, // 10MB
            timestamp: () => new Date().toLocaleString(),
        }),
        new winston.transports.Console({
            timestamp: () => new Date().toLocaleString(),
            formatter: (options) =>
                winston.config.colorize(options.level, '  zigbee2mqtt:' + options.level.toLowerCase()) + ' ' +
                options.timestamp() + ' ' + (options.message ? options.message : '') +
                (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' ),
        }),
    ],
});

// Add colors
winston.addColors(levels.colors);

logger.transports.console.level = level;

// Cleanup any old log directory.
function cleanup() {
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
}

logger.cleanup = cleanup;
logger.directory = directory;

module.exports = logger;
