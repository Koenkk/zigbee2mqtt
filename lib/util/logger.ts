import winston from 'winston';
import moment from 'moment';
import * as settings from './settings';
import path from 'path';
import fs from 'fs';
import fx from 'mkdir-recursive';
import {rimrafSync} from 'rimraf';
import assert from 'assert';

const LOG_LEVELS = ['error', 'warning', 'info', 'debug'] as const;
type LogLevel = typeof LOG_LEVELS[number];

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
    // Determine the log level.
    const settingLevel = settings.get().advanced.log_level;
    // workaround for syslog<>npm level conflict
    const level = settingLevel === 'warn' ? 'warning' : settingLevel;

    assert(LOG_LEVELS.includes(level), `'${level}' is not valid log_level, use one of '${LOG_LEVELS.join(', ')}'`);

    const timestampFormat = (): string => moment().format(settings.get().advanced.timestamp_format);

    // Setup default console logger
    transportsToUse = [
        new winston.transports.Console({
            level,
            silent: !output.includes('console'),
            // winston.config.syslog.levels sets 'warning' as 'red'
            format: winston.format.combine(
                winston.format.colorize({colors: {debug: 'blue', info: 'green', warning: 'yellow', error: 'red'}}),
                winston.format.printf(/* istanbul ignore next */(info) => {
                    return `[${info.timestamp}] ${info.level}: \t${info.namespace}: ${info.message}`;
                }),
            ),
        }),
    ];

    if (output.includes('file')) {
        // Make sure that log directory exists when not logging to stdout only
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

        // Add file logger when enabled
        // NOTE: the initiation of the logger, even when not added as transport tries to create the logging directory
        const transportFileOptions: KeyValue = {
            filename: path.join(directory, logFilename),
            json: false,
            level,
            format: winston.format.printf(/* istanbul ignore next */(info) => {
                return `[${info.timestamp}] ${info.level}: \t${info.namespace}: ${info.message}`;
            }),
        };

        if (settings.get().advanced.log_rotation) {
            transportFileOptions.tailable = true;
            transportFileOptions.maxFiles = 3; // Keep last 3 files
            transportFileOptions.maxsize = 10000000; // 10MB
        }

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
                return `${info.namespace}: ${info.message}`;
            }),
            ...settings.get().advanced.log_syslog,
        };

        if (options.hasOwnProperty('type')) {
            options.type = options.type.toString();
        }

        // @ts-expect-error custom transport
        transportsToUse.push(new winston.transports.Syslog(options));
    }

    logger = winston.createLogger({
        format: winston.format.combine(
            winston.format.errors({stack: true}),
            winston.format.timestamp({format: timestampFormat}),
        ),
        transports: transportsToUse,
        levels: winston.config.syslog.levels,
    });
}

function addTransport(transport: winston.transport): void {
    transport.level = transportsToUse[0].level;
    logger.add(transport);
}

// TODO refactor Z2M level to 'warning' to simplify logic
function getLevel(): LogLevel | 'warn' {
    let level = transportsToUse[0].level;

    if (level === 'warning') {
        level = 'warn';
    }

    return transportsToUse[0].level as LogLevel | 'warn';
}

function setLevel(level: LogLevel | 'warn'): void {
    if (level === 'warn') {
        level = 'warning';
    }

    logger.transports.forEach((transport) => transport.level = level);
}

function warning(message: string, namespace: string = 'z2m'): void {
    logger.warning(message, {namespace});
}

function info(message: string, namespace: string = 'z2m'): void {
    logger.info(message, {namespace});
}

function debug(message: string, namespace: string = 'z2m'): void {
    logger.debug(message, {namespace});
}

function error(message: string, namespace: string = 'z2m'): void {
    logger.error(message, {namespace});
}

// Print to user what logging is enabled
function logOutput(): void {
    const filename = output.includes('file') ? ` (filename: ${logFilename})` : ``;
    info(`Logging to ${output.join(', ')}${filename}.`);
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
            debug(`Removing old log directory '${dir.path}'`);
            rimrafSync(dir.path);
        });
    }
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
    init, logOutput, warning, error, info, debug, setLevel, getLevel, cleanup, addTransport, end,
    winston: (): winston.Logger => logger,
};
