import winston from 'winston';
import moment from 'moment';
import * as settings from './settings';
import path from 'path';
import fs from 'fs';
// @ts-ignore
import fx from 'mkdir-recursive';
import rimraf from 'rimraf';
import assert from 'assert';

const colorizer = winston.format.colorize();

// What transports to enable
const output = settings.get().advanced.log_output;

// Directory to log to
const timestamp = moment(Date.now()).format('YYYY-MM-DD.HH-mm-ss');
const directory = settings.get().advanced.log_directory.replace('%TIMESTAMP%', timestamp);
const logFilename = settings.get().advanced.log_file.replace('%TIMESTAMP%', timestamp);

// Make sure that log directoy exsists when not logging to stdout only
if (output.includes('file')) {
    fx.mkdirSync(directory);

    if (settings.get().advanced.log_symlink_current) {
        const current = settings.get().advanced.log_directory.replace('%TIMESTAMP%', 'current');
        const actual = './' + timestamp;
        if (fs.existsSync(current)) {
            fs.unlinkSync(current);
        }
        fs.symlinkSync(actual, current);
    }
}

const z2mToWinstonLevel = (level: string): string => level === 'warn' ? 'warning' : level;
const winstonToZ2mLevel = (level: string): string => level === 'warning' ? 'warn' : level;

// Determine the log level.
let level = settings.get().advanced.log_level;
const validLevels = ['info', 'error', 'warn', 'debug'];
assert(validLevels.includes(level), `'${level}' is not a valid log_level, use one of '${validLevels.join(', ')}'`);
// @ts-ignore
level = z2mToWinstonLevel(level);

const levelWithCompensatedLength: {[s: string]: string} = {
    'info': 'info ',
    'error': 'error',
    'warn': 'warn ',
    'debug': 'debug',
};

/* istanbul ignore next */
const timestampFormat = (): string => moment().format(settings.get().advanced.timestamp_format);

// Setup default console logger
const transportsToUse = [
    new winston.transports.Console({
        level,
        silent: !output.includes('console'),
        format: winston.format.combine(
            winston.format.timestamp({format: timestampFormat}),
            winston.format.printf(/* istanbul ignore next */(info) => {
                let {timestamp, level, message} = info;
                level = winstonToZ2mLevel(level);
                const prefix = colorizer.colorize(level, `Zigbee2MQTT:${levelWithCompensatedLength[level]}`);
                return `${prefix} ${timestamp.split('.')[0]}: ${message}`;
            }),
        ),
    }),
];

// Add file logger when enabled
// NOTE: the initiation of the logger, even when not added as transport tries to create the logging directory
const transportFileOptions: KeyValue = {
    filename: path.join(directory, logFilename),
    json: false,
    level,
    format: winston.format.combine(
        winston.format.timestamp({format: timestampFormat}),
        winston.format.printf(/* istanbul ignore next */(info) => {
            let {timestamp, level, message} = info;
            level = winstonToZ2mLevel(level);
            return `${levelWithCompensatedLength[level]} ${timestamp.split('.')[0]}: ${message}`;
        }),
    ),
};

if (settings.get().advanced.log_rotation) {
    transportFileOptions.tailable = true;
    transportFileOptions.maxFiles = 3; // Keep last 3 files
    transportFileOptions.maxsize = 10000000; // 10MB
}

if (output.includes('file')) {
    // @ts-ignore
    transportsToUse.push(new winston.transports.File(transportFileOptions));
}

/* istanbul ignore next */
if (output.includes('syslog')) {
    // eslint-disable-next-line
    require('winston-syslog').Syslog;
    const options: KeyValue = {
        app_name: 'Zigbee2MQTT',
        format: winston.format.printf(/* istanbul ignore next */(info) => {
            return `${info.message}`;
        }),
        ...settings.get().advanced.log_syslog,
    };
    if (options.hasOwnProperty('type')) options.type = options.type.toString();
    // @ts-ignore
    transportsToUse.push(new winston.transports.Syslog(options));
}

// Create logger
const logger = winston.createLogger({transports: transportsToUse, levels: winston.config.syslog.levels});

// Cleanup any old log directory.
function cleanup(): void {
    if (settings.get().advanced.log_directory.includes('%TIMESTAMP%')) {
        const rootDirectory = path.join(directory, '..');

        let directories = fs.readdirSync(rootDirectory).map((d) => {
            d = path.join(rootDirectory, d);
            return {path: d, birth: fs.statSync(d).mtime};
        });

        directories.sort((a: KeyValue, b: KeyValue) => b.birth - a.birth);
        directories = directories.slice(10, directories.length);
        directories.forEach((dir) => {
            logger.debug(`Removing old log directory '${dir.path}'`);
            rimraf.sync(dir.path);
        });
    }
}

// Print to user what logging is enabled
function logOutput(): void {
    if (output.includes('file')) {
        if (output.includes('console')) {
            logger.info(`Logging to console and directory: '${directory}' filename: ${logFilename}`);
        } else {
            logger.info(`Logging to directory: '${directory}' filename: ${logFilename}`);
        }
        // @ts-ignore
        logger.cleanup();
    } else if (output.includes('console')) {
        logger.info(`Logging to console only'`);
    }
}

// @ts-ignore
logger.addTransport = (transport): void => {
    transport.level = transportsToUse[0].level;
    logger.add(transport);
};
// @ts-ignore
logger.cleanup = cleanup;
// @ts-ignore
logger.logOutput = logOutput;
// @ts-ignore
logger.getLevel = (): void => winstonToZ2mLevel(transportsToUse[0].level);
// @ts-ignore
logger.setLevel = (level): void => {
    level = z2mToWinstonLevel(level);
    logger.transports.forEach((transport) => transport.level = level);
};

// winston.config.syslog.levels doesnt have warn, but is required for syslog.
/* istanbul ignore next */
// @ts-ignore
logger.warn = (message): void => logger.warning(message);

export default logger;
