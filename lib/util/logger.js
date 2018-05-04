const winston = require('winston');

const logger = new (winston.Logger)({
    transports: [
        new (winston.transports.File)({
            filename: 'data/log.txt',
            json: false,
            level: winston.level.info,
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
            }
        })
    ]
});

module.exports = logger;
