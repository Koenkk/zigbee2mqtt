import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import {rimrafSync} from "rimraf";
import winston from "winston";
import * as settings from "./settings";
import {formatTimestamp} from "./utils";

const NAMESPACE_SEPARATOR = ":";

class Logger {
    // @ts-expect-error initalized in `init`
    private level: settings.LogLevel;
    // @ts-expect-error initalized in `init`
    private output: string[];
    // @ts-expect-error initalized in `init`
    private directory: string;
    // @ts-expect-error initalized in `init`
    private logger: winston.Logger;
    // @ts-expect-error initalized in `init`
    private fileTransport: winston.transports.FileTransportInstance;
    private debugNamespaceIgnoreRegex?: RegExp;
    // @ts-expect-error initalized in `init`
    private namespacedLevels: Record<string, settings.LogLevel>;
    // @ts-expect-error initalized in `init`
    private cachedNamespacedLevels: Record<string, settings.LogLevel>;

    public init(): void {
        // What transports to enable
        this.output = settings.get().advanced.log_output;
        // Directory to log to
        const timestamp = formatTimestamp(new Date(), "YYYY-MM-DD.HH-mm-ss");
        this.directory = settings.get().advanced.log_directory.replace("%TIMESTAMP%", timestamp);
        const logFilename = settings.get().advanced.log_file.replace("%TIMESTAMP%", timestamp);
        this.level = settings.get().advanced.log_level;
        this.namespacedLevels = settings.get().advanced.log_namespaced_levels;
        this.cachedNamespacedLevels = Object.assign({}, this.namespacedLevels);

        assert(settings.LOG_LEVELS.includes(this.level), `'${this.level}' is not valid log_level, use one of '${settings.LOG_LEVELS.join(", ")}'`);

        const timestampFormat = (): string => formatTimestamp(new Date(), settings.get().advanced.timestamp_format);

        this.logger = winston.createLogger({
            level: "debug",
            format: winston.format.combine(winston.format.errors({stack: true}), winston.format.timestamp({format: timestampFormat})),
            levels: winston.config.syslog.levels,
        });

        const consoleSilenced = !this.output.includes("console");
        // Print to user what logging is active
        let logging = `Logging to console${consoleSilenced ? " (silenced)" : ""}`;

        // Setup default console logger
        this.logger.add(
            new winston.transports.Console({
                silent: consoleSilenced,
                format: settings.get().advanced.log_console_json
                    ? winston.format.json()
                    : winston.format.combine(
                          // winston.config.syslog.levels sets 'warning' as 'red'
                          winston.format.colorize({colors: {debug: "blue", info: "green", warning: "yellow", error: "red"}}),
                          winston.format.printf((info) => {
                              return `[${info.timestamp}] ${info.level}: \t${info.message}`;
                          }),
                      ),
            }),
        );

        if (this.output.includes("file")) {
            logging += `, file (filename: ${logFilename})`;

            // Make sure that log directory exists when not logging to stdout only
            fs.mkdirSync(this.directory, {recursive: true});

            if (settings.get().advanced.log_symlink_current) {
                const current = settings.get().advanced.log_directory.replace("%TIMESTAMP%", "current");
                const actual = `./${timestamp}`;

                /* v8 ignore start */
                if (fs.existsSync(current)) {
                    fs.unlinkSync(current);
                }
                /* v8 ignore stop */

                fs.symlinkSync(actual, current);
            }

            // Add file logger when enabled
            // NOTE: the initiation of the logger even when not added as transport tries to create the logging directory
            const transportFileOptions: winston.transports.FileTransportOptions = {
                filename: path.join(this.directory, logFilename),
                format: winston.format.printf((info) => {
                    return `[${info.timestamp}] ${info.level}: \t${info.message}`;
                }),
            };

            if (settings.get().advanced.log_rotation) {
                transportFileOptions.tailable = true;
                transportFileOptions.maxFiles = 3; // Keep last 3 files
                transportFileOptions.maxsize = 10000000; // 10MB
            }

            this.fileTransport = new winston.transports.File(transportFileOptions);
            this.logger.add(this.fileTransport);
            this.cleanup();
        }

        /* v8 ignore start */
        if (this.output.includes("syslog")) {
            logging += ", syslog";
            require("winston-syslog").Syslog;

            const options: KeyValue = {
                app_name: "Zigbee2MQTT",
                format: winston.format.printf((info) => info.message as string),
                ...settings.get().advanced.log_syslog,
            };

            if (options.type !== undefined) {
                options.type = options.type.toString();
            }

            // @ts-expect-error untyped transport
            this.logger.add(new winston.transports.Syslog(options));
        }
        /* v8 ignore stop */

        this.setDebugNamespaceIgnore(settings.get().advanced.log_debug_namespace_ignore);

        this.info(logging);
    }

    get winston(): winston.Logger {
        return this.logger;
    }

    public addTransport(transport: winston.transport): void {
        this.logger.add(transport);
    }

    public removeTransport(transport: winston.transport): void {
        this.logger.remove(transport);
    }

    public getDebugNamespaceIgnore(): string {
        return (
            this.debugNamespaceIgnoreRegex
                ?.toString()
                .slice(1, -1) /* remove slashes */ ?? ""
        );
    }

    public setDebugNamespaceIgnore(value: string): void {
        this.debugNamespaceIgnoreRegex = value !== "" ? new RegExp(value) : undefined;
    }

    public getLevel(): settings.LogLevel {
        return this.level;
    }

    public setLevel(level: settings.LogLevel): void {
        this.level = level;
        this.resetCachedNamespacedLevels();
    }

    public getNamespacedLevels(): Record<string, settings.LogLevel> {
        return this.namespacedLevels;
    }

    public setNamespacedLevels(nsLevels: Record<string, settings.LogLevel>): void {
        this.namespacedLevels = nsLevels;
        this.resetCachedNamespacedLevels();
    }

    private resetCachedNamespacedLevels(): void {
        this.cachedNamespacedLevels = Object.assign({}, this.namespacedLevels);
    }

    private cacheNamespacedLevel(namespace: string): string {
        let cached = namespace;

        while (this.cachedNamespacedLevels[namespace] === undefined) {
            const sep = cached.lastIndexOf(NAMESPACE_SEPARATOR);

            if (sep === -1) {
                this.cachedNamespacedLevels[namespace] = this.level;

                return this.level;
            }

            cached = cached.slice(0, sep);
            this.cachedNamespacedLevels[namespace] = this.cachedNamespacedLevels[cached];
        }

        return this.cachedNamespacedLevels[namespace];
    }

    private log(level: settings.LogLevel, messageOrLambda: string | (() => string), namespace: string): void {
        const nsLevel = this.cacheNamespacedLevel(namespace);

        if (settings.LOG_LEVELS.indexOf(level) <= settings.LOG_LEVELS.indexOf(nsLevel)) {
            const message: string = messageOrLambda instanceof Function ? messageOrLambda() : messageOrLambda;
            this.logger.log(level, `${namespace}: ${message}`);
        }
    }

    public error(messageOrLambda: string | (() => string), namespace = "z2m"): void {
        this.log("error", messageOrLambda, namespace);
    }

    public warning(messageOrLambda: string | (() => string), namespace = "z2m"): void {
        this.log("warning", messageOrLambda, namespace);
    }

    public info(messageOrLambda: string | (() => string), namespace = "z2m"): void {
        this.log("info", messageOrLambda, namespace);
    }

    public debug(messageOrLambda: string | (() => string), namespace = "z2m"): void {
        if (this.debugNamespaceIgnoreRegex?.test(namespace)) {
            return;
        }

        this.log("debug", messageOrLambda, namespace);
    }

    // Cleanup any old log directory.
    private cleanup(): void {
        if (settings.get().advanced.log_directory.includes("%TIMESTAMP%")) {
            const rootDirectory = path.join(this.directory, "..");

            let directories = fs.readdirSync(rootDirectory).map((d) => {
                d = path.join(rootDirectory, d);
                return {path: d, birth: fs.statSync(d).mtime};
            });

            directories.sort((a: KeyValue, b: KeyValue) => b.birth - a.birth);
            directories = directories.slice(settings.get().advanced.log_directories_to_keep, directories.length);

            for (const dir of directories) {
                this.debug(`Removing old log directory '${dir.path}'`);
                rimrafSync(dir.path);
            }
        }
    }

    // Workaround for https://github.com/winstonjs/winston/issues/1629.
    // https://github.com/Koenkk/zigbee2mqtt/pull/10905
    /* v8 ignore start */
    public async end(): Promise<void> {
        // Only flush the file transport, don't end logger itself as log() might still be called
        // causing a UnhandledPromiseRejection (`Error: write after end`). Flushing the file transport
        // ensures the log files are written before stopping.
        if (this.fileTransport) {
            await new Promise<void>((resolve) => {
                // @ts-expect-error workaround
                if (this.fileTransport._dest) {
                    // @ts-expect-error workaround
                    this.fileTransport._dest.on("finish", resolve);
                } else {
                    // @ts-expect-error workaround
                    this.fileTransport.on("open", () => this.fileTransport._dest.on("finish", resolve));
                }
                this.fileTransport.end();
            });
        }
    }
    /* v8 ignore stop */
}

export default new Logger();
