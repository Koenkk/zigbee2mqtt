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

class Logger {
    private level: LogLevel;
    private readonly output: string[];
    private readonly directory: string;
    private readonly logger: winston.Logger;
    private readonly fileTransport: winston.transports.FileTransportInstance;
    private debugNamespaceIgnoreRegex?: RegExp;

    constructor() {
        // What transports to enable
        this.output = settings.get().advanced.log_output;
        // Directory to log to
        const timestamp = moment(Date.now()).format('YYYY-MM-DD.HH-mm-ss');
        this.directory = settings.get().advanced.log_directory.replace('%TIMESTAMP%', timestamp);
        const logFilename = settings.get().advanced.log_file.replace('%TIMESTAMP%', timestamp);
        // Determine the log level.
        const settingLevel = settings.get().advanced.log_level;
        // workaround for syslog<>npm level conflict
        this.level = settingLevel === 'warn' ? 'warning' : settingLevel;

        assert(
            LOG_LEVELS.includes(this.level),
            `'${this.level}' is not valid log_level, use one of '${LOG_LEVELS.join(', ')}'`,
        );

        const timestampFormat = (): string => moment().format(settings.get().advanced.timestamp_format);

        this.logger = winston.createLogger({
            level: this.level,
            format: winston.format.combine(
                winston.format.errors({stack: true}),
                winston.format.timestamp({format: timestampFormat}),
            ),
            levels: winston.config.syslog.levels,
        });

        const consoleSilenced = !this.output.includes('console');
        // Print to user what logging is active
        let logging = `Logging to console${consoleSilenced ? ' (silenced)' : ''}`;

        // Setup default console logger
        this.logger.add(new winston.transports.Console({
            silent: consoleSilenced,
            // winston.config.syslog.levels sets 'warning' as 'red'
            format: winston.format.combine(
                winston.format.colorize({colors: {debug: 'blue', info: 'green', warning: 'yellow', error: 'red'}}),
                winston.format.printf(/* istanbul ignore next */(info) => {
                    return `[${info.timestamp}] ${info.level}: \t${info.namespace}: ${info.message}`;
                }),
            ),
        }));

        if (this.output.includes('file')) {
            logging += `, file (filename: ${logFilename})`;

            // Make sure that log directory exists when not logging to stdout only
            fx.mkdirSync(this.directory);

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
            // eslint-disable-next-line max-len
            // NOTE: the initiation of the logger even when not added as transport tries to create the logging directory
            const transportFileOptions: KeyValue = {
                filename: path.join(this.directory, logFilename),
                json: false,
                format: winston.format.printf(/* istanbul ignore next */(info) => {
                    return `[${info.timestamp}] ${info.level}: \t${info.namespace}: ${info.message}`;
                }),
            };

            if (settings.get().advanced.log_rotation) {
                transportFileOptions.tailable = true;
                transportFileOptions.maxFiles = 3; // Keep last 3 files
                transportFileOptions.maxsize = 10000000; // 10MB
            }

            this.fileTransport = new winston.transports.File(transportFileOptions);
            this.logger.add(this.fileTransport);
        }

        /* istanbul ignore next */
        if (this.output.includes('syslog')) {
            logging += `, syslog`;
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

            // @ts-expect-error untyped transport
            this.logger.add(new winston.transports.Syslog(options));
        }

        this.setDebugNamespaceIgnore(settings.get().advanced.log_debug_namespace_ignore);

        this.info(logging);
    }

    get winston(): winston.Logger {
        return this.logger;
    }

    public addTransport(transport: winston.transport): void {
        transport.level = this.level;
        this.logger.add(transport);
    }

    public removeTransport(transport: winston.transport): void {
        this.logger.remove(transport);
    }

    public getDebugNamespaceIgnore(): string {
        return this.debugNamespaceIgnoreRegex?.toString().slice(1, -1)/* remove slashes */ ?? '';
    }

    public setDebugNamespaceIgnore(value: string): void {
        this.debugNamespaceIgnoreRegex = value != '' ? new RegExp(value) : undefined;
    }

    // TODO refactor Z2M level to 'warning' to simplify logic
    public getLevel(): LogLevel | 'warn' {
        return this.level === 'warning' ? 'warn' : this.level;
    }

    public setLevel(level: LogLevel | 'warn'): void {
        if (level === 'warn') {
            level = 'warning';
        }

        this.level = level;
        this.logger.transports.forEach((transport) => transport.level = this.level);
    }

    public warning(message: string, namespace: string = 'z2m'): void {
        this.logger.warning(message, {namespace});
    }

    public info(message: string, namespace: string = 'z2m'): void {
        this.logger.info(message, {namespace});
    }

    public debug(message: string, namespace: string = 'z2m'): void {
        if (this.level !== 'debug') {
            return;
        }
        if (this.debugNamespaceIgnoreRegex?.test(namespace)) {
            return;
        }

        this.logger.debug(message, {namespace});
    }

    public error(message: string, namespace: string = 'z2m'): void {
        this.logger.error(message, {namespace});
    }

    // Cleanup any old log directory.
    public cleanup(): void {
        if (settings.get().advanced.log_directory.includes('%TIMESTAMP%')) {
            const rootDirectory = path.join(this.directory, '..');

            let directories = fs.readdirSync(rootDirectory).map((d) => {
                d = path.join(rootDirectory, d);
                return {path: d, birth: fs.statSync(d).mtime};
            });

            directories.sort((a: KeyValue, b: KeyValue) => b.birth - a.birth);
            directories = directories.slice(10, directories.length);
            directories.forEach((dir) => {
                this.debug(`Removing old log directory '${dir.path}'`);
                rimrafSync(dir.path);
            });
        }
    }

    // Workaround for https://github.com/winstonjs/winston/issues/1629.
    // https://github.com/Koenkk/zigbee2mqtt/pull/10905
    /* istanbul ignore next */
    public async end(): Promise<void> {
        this.logger.end();

        await new Promise<void>((resolve) => {
            if (!this.fileTransport) {
                process.nextTick(resolve);
            } else {
                // @ts-expect-error workaround
                if (this.fileTransport._dest) {
                    // @ts-expect-error workaround
                    this.fileTransport._dest.on('finish', resolve);
                } else {
                    // @ts-expect-error workaround
                    this.fileTransport.on('open', () => this.fileTransport._dest.on('finish', resolve));
                }
            }
        });
    }
}

export default new Logger();
