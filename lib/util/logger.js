const winston = require('winston');
const moment = require('moment');
const settings = require('./settings');
const path = require('path');
const fs = require('fs');
const fx = require('mkdir-recursive');
const rimraf = require('rimraf');
const colorizer = winston.format.colorize();
const assert = require('assert');

// What transports to enable
const output = settings.get().advanced.log_output;

// Directory to log to
const timestamp = moment(Date.now()).format('YYYY-MM-DD.HH-mm-ss');
const directory = settings.get().advanced.log_directory.replace('%TIMESTAMP%', timestamp);
const logFilename = settings.get().advanced.log_file.replace('%TIMESTAMP%', timestamp);

// Make sure that log directoy exsists when not logging to stdout only
if (output.includes('file')) {
    fx.mkdirSync(directory);
}

// Determine the log level.
const level = settings.get().advanced.log_level;
const validLevels = ['info', 'error', 'warn', 'debug'];
assert(validLevels.includes(level), `'${level}' is not a valid log_level, use one of '${validLevels.join(', ')}'`);

const levelWithCompensatedLength = {
    'info': 'info ',
    'error': 'error',
    'warn': 'warn ',
    'debug': 'debug',
};

/* istanbul ignore next */
const timestampFormat = () => moment().format(settings.get().advanced.timestamp_format);

// Setup default console logger
const transportsToUse = [
    new winston.transports.Console({
        level,
        silent: !output.includes('console'),
        format: winston.format.combine(
            winston.format.timestamp({format: timestampFormat}),
            winston.format.printf(/* istanbul ignore next */(info) => {
                const {timestamp, level, message} = info;
                const prefix = colorizer.colorize(level, `zigbee2mqtt:${levelWithCompensatedLength[level]}`);
                return `${prefix} ${timestamp.split('.')[0]}: ${message}`;
            }),
        ),
    }),
];

// Add file logger when enabled
// NOTE: the initiation of the logger, even when not added as transport tries to create the logging directory
if (output.includes('file')) {
    transportsToUse.push(new winston.transports.File({
        filename: path.join(directory, logFilename),
        json: false,
        level,
        tailable: true,
        maxFiles: 3, // Keep last 3 files
        maxsize: 10000000, // 10MB
        format: winston.format.combine(
            winston.format.timestamp({format: timestampFormat}),
            winston.format.printf(/* istanbul ignore next */(info) => {
                const {timestamp, level, message} = info;
                return `${levelWithCompensatedLength[level]} ${timestamp.split('.')[0]}: ${message}`;
            }),
        ),
    }));
}

// Create logger
const logger = winston.createLogger({transports: transportsToUse});

// Cleanup any old log directory.
function cleanup() {
    if (settings.get().advanced.log_directory.includes('%TIMESTAMP%')) {
        const rootDirectory = path.join(directory, '..');

        let directories = fs.readdirSync(rootDirectory).map((d) => {
            d = path.join(rootDirectory, d);
            return {path: d, birth: fs.statSync(d).mtime};
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
logger.getLevel = () => transportsToUse[0].level;
logger.setLevel = (level) => {
    transportsToUse.forEach((transport) => transport.level = level);
};

// Print to user what logging is enabled
if (output.includes('file')) {
    if (output.includes('console')) {
        logger.info(`Logging to console and directory: '${directory}' filename: ${logFilename}`);
    } else {
        logger.info(`Logging to directory: '${directory}' filename: ${logFilename}`);
    }
    logger.cleanup();
} else if (output.includes('console')) {
    logger.info(`Logging to console only'`);
}

module.exports = logger;
