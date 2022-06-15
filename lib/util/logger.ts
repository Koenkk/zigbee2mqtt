import winston from 'winston';
import moment from 'moment';
import * as settings from './settings';
import path from 'path';
import fs from 'fs';
import fx from 'mkdir-recursive';
import rimraf from 'rimraf';
import assert from 'assert';

const colorizer = winston.format.colorize();

type Z2MLogLevel = 'warn' | 'debug' | 'info' | 'error';
type WinstonLogLevel = 'warning' | 'debug' | 'info' | 'error';

const z2mToWinstonLevel = (level: Z2MLogLevel): WinstonLogLevel => level === 'warn' ? 'warning' : level;
const winstonToZ2mLevel = (level: WinstonLogLevel): Z2MLogLevel => level === 'warning' ? 'warn' : level;

const levelWithCompensatedLength: {[s: string]: string} = {
    'info': 'info ',
    'error': 'error',
    'warn': 'warn ',
    'debug': 'debug',
};

let logger: winston.Logger;
let fileTransport : winston.transport;
let output: string[];
let directory: string;
let logFilename: string;
let transportsToUse: winston.transport[];

function init(): void {
    // What transports to enable
    output = settings.get().advanced.log_output;

    // Directory to log to
    const timestamp = moment(Date.now()).format('YYYY-MM-DD.HH-mm-ss');
    directory = settings.get().advanced.log_directory.replace('%TIMESTAMP%', timestamp);
    logFilename = settings.get().advanced.log_file.replace('%TIMESTAMP%', timestamp);

    // Make sure that log directoy exsists when not logging to stdout only
    if (output.includes('file')) {
        fx.mkdirSync(directory);

        if (settings.get().advanced.log_symlink_current) {
            const current = settings.get().advanced.log_directory.replace('%TIMESTAMP%', 'current');
            const actual = './' + timestamp;
            /* istanbul ignore next */
            if (fs.existsSync(current)) {
                fs.unlinkSync(current);
            }
            fs.symlinkSync(actual, current);
        }
    }

    // Determine the log level.
    const z2mLevel = settings.get().advanced.log_level;
    const validLevels = ['info', 'error', 'warn', 'debug'];
    assert(validLevels.includes(z2mLevel),
        `'${z2mLevel}' is not valid log_level, use one of '${validLevels.join(', ')}'`);
    const level = z2mToWinstonLevel(z2mLevel);

    const timestampFormat = (): string => moment().format(settings.get().advanced.timestamp_format);

    // Setup default console logger
    transportsToUse = [
        new winston.transports.Console({
            level,
            silent: !output.includes('console'),
            format: winston.format.combine(
                winston.format.timestamp({format: timestampFormat}),
                winston.format.printf(/* istanbul ignore next */(info) => {
                    const {timestamp, level, message} = info;
                    const l = winstonToZ2mLevel(level as WinstonLogLevel);

                    const plainPrefix = `Zigbee2MQTT:${levelWithCompensatedLength[l]}`;
                    let prefix = plainPrefix;
                    if (process.stdout.isTTY) {
                        prefix = colorizer.colorize(l, plainPrefix);
                    }
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
                const {timestamp, level, message} = info;
                const l = winstonToZ2mLevel(level as WinstonLogLevel);
                return `${levelWithCompensatedLength[l]} ${timestamp.split('.')[0]}: ${message}`;
            }),
        ),
    };

    if (settings.get().advanced.log_rotation) {
        transportFileOptions.tailable = true;
        transportFileOptions.maxFiles = 3; // Keep last 3 files
        transportFileOptions.maxsize = 10000000; // 10MB
    }

    if (output.includes('file')) {
        fileTransport = new winston.transports.File(transportFileOptions);
        transportsToUse.push(fileTransport);
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

    logger = winston.createLogger({transports: transportsToUse, levels: winston.config.syslog.levels});
}

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
        cleanup();
    } else if (output.includes('console')) {
        logger.info(`Logging to console only'`);
    }
}

function addTransport(transport: winston.transport): void {
    transport.level = transportsToUse[0].level;
    logger.add(transport);
}

function getLevel(): Z2MLogLevel {
    return winstonToZ2mLevel(transportsToUse[0].level as WinstonLogLevel);
}

function setLevel(level: Z2MLogLevel): void {
    logger.transports.forEach((transport) => transport.level = z2mToWinstonLevel(level as Z2MLogLevel));
}

function warn(message: string): void {
    // winston.config.syslog.levels doesnt have warn, but is required for syslog.
    logger.warning(message);
}

function warning(message: string): void {
    logger.warning(message);
}

function info(message: string): void {
    logger.info(message);
}

function debug(message: string): void {
    logger.debug(message);
}

function error(message: string): void {
    logger.error(message);
}

// Workaround for https://github.com/winstonjs/winston/issues/1629.
// https://github.com/Koenkk/zigbee2mqtt/pull/10905
/* istanbul ignore next */
async function end(): Promise<void> {
    logger.end();

    await new Promise<void>((resolve) => {
        if (!fileTransport) {
            process.nextTick(resolve);
        } else {
            // @ts-ignore
            if (fileTransport._dest) {
                // @ts-ignore
                fileTransport._dest.on('finish', resolve);
            } else {
                // @ts-ignore
                fileTransport.on('open', () => fileTransport._dest.on('finish', resolve));
            }
        }
    });
}

export default {
    init, logOutput, warn, warning, error, info, debug, setLevel, getLevel, cleanup, addTransport, end,
    winston: (): winston.Logger => logger,
};
