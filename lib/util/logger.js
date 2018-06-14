const winston = require('winston');
const data = require('./data');
const settings = require('./settings');
let logLevel = settings.get().advanced && settings.get().advanced.log_level ?
    settings.get().advanced.log_level : winston.level.info;
if (process.env.DEBUG) {
    logLevel = 'debug';
}
const logger = new (winston.Logger)({
    transports: [
        new (winston.transports.File)({
            filename: data.joinPath('log.txt'),
            json: false,
            level: logLevel,
            maxFiles: 3,
            maxsize: 10000000, // 10MB
        }),
        new (winston.transports.Console)({
            timestamp: () => new Date().toLocaleString(),
            formatter: function(options) {
                return options.timestamp() + ' ' +
                        winston.config.colorize(options.level, options.level.toUpperCase()) + ' ' +
                        (options.message ? options.message : '') +
                        (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' );
            },
        }),
    ],
});
logger.transports.console.level = logLevel;

module.exports = logger;
