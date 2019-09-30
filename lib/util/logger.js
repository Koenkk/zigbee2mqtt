const winston = require('winston');
const moment = require('moment');
const settings = require('./settings');
const path = require('path');
const fs = require('fs');
const fx = require('mkdir-recursive');
const rimraf = require('rimraf');
const colorizer = winston.format.colorize();

// What transports to enable
const output = settings.get().advanced.log_output;

// Directory to log to
const timestamp = moment(Date.now()).format('YYYY-MM-DD.HH-mm-ss');
const directory = settings.get().advanced.log_directory.replace('%TIMESTAMP%', timestamp);

// Make sure that log directoy exsists when not logging to stdout only
if (output.includes('file')) {
  fx.mkdirSync(directory);
}

// Determine the log level.
const level = settings.get().advanced.log_level;

const levelWithCompensatedLength = {
    'info': 'info ',
    'error': 'error',
    'warn': 'warn ',
    'debug': 'debug',
};

/* istanbul ignore next */
const timestampFormat = () => moment().format(settings.get().advanced.timestamp_format);

// Create logger
const transports = {
    file: new winston.transports.File({
        filename: path.join(directory, 'log.txt'),
        json: false,
        level,
        maxFiles: 3, // Keep last 3 files
        maxsize: 10000000, // 10MB
        format: winston.format.combine(
            winston.format.timestamp({format: timestampFormat}),
            winston.format.printf(/* istanbul ignore next */(info) => {
                const {timestamp, level, message} = info;
                return `${levelWithCompensatedLength[level]} ${timestamp.split('.')[0]}: ${message}`;
            }),
        ),
    }),
    console: new winston.transports.Console({
        level,
        format: winston.format.combine(
            winston.format.timestamp({format: timestampFormat}),
            winston.format.printf(/* istanbul ignore next */(info) => {
                const {timestamp, level, message} = info;
                const prefix = colorizer.colorize(level, `zigbee2mqtt:${levelWithCompensatedLength[level]}`);
                return `${prefix} ${timestamp.split('.')[0]}: ${message}`;
            }),
        ),
    }),
};

// Create logger without transports
const logger = winston.createLogger();

// Add enabled transports
if (output.includes('console')) {
  logger.add(transports.console);
}
if (output.includes('file')) {
  logger.add(transports.file);
}

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
logger.directory = directory;
logger.getLevel = () => transports.console.level;
logger.setLevel = (level) => {
    transports.console.level = level;
    transports.file.level = level;
};

module.exports = logger;
