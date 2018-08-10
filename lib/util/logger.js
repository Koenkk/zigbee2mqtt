const winston = require('winston');
const data = require('./data');
const settings = require('./settings');

let logLevel = '';
if (process.env.DEBUG) {
    logLevel = 'debug';
} else if (settings.get().advanced && settings.get().advanced.log_level) {
    logLevel = settings.get().advanced.log_level;
} else {
    logLevel = winston.level.info;
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
                return winston.config.colorize(options.level, '  zigbee2mqtt:' + options.level.toLowerCase()) + ' ' +
                    options.timestamp() + ' ' + (options.message ? options.message : '') +
                    (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' );
            },
        }),
    ],
});

logger.transports.console.level = logLevel;

module.exports = logger;
