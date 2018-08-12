const winston = require('winston');
const moment = require('moment');
const data = require('./data');
const settings = require('./settings');
const path = require('path');
const fs = require('fs');

let logLevel = '';
if (process.env.DEBUG) {
    logLevel = 'debug';
} else if (settings.get().advanced && settings.get().advanced.log_level) {
    logLevel = settings.get().advanced.log_level;
} else {
    logLevel = winston.level.info;
}

const logDirectory = settings.get().advanced && settings.get().advanced.log_directory ?
	settings.get().advanced.log_directory : data.getPath();

if (settings.get().advanced && settings.get().advanced.log_filename) {
	filename = settings.get().advanced.log_filename ?  settings.get().advanced.log_filename : '[log-]%filenamedateformat%';
	filenamedateformat = settings.get().advanced && settings.get().advanced.log_filename_date_format ? settings.get().advanced.log_filename_date_format : 'YYYY-MM-DD';
	completefilename = moment(new Date()).format(filename.replace('%filenamedateformat%', filenamedateformat));
} else {
	filename = 'log';
	completefilename = filename;
}

const logger = new (winston.Logger)({
    transports: [
        new (winston.transports.File)({
            filename: path.join(logDirectory, completefilename + '.txt'),
            json: false,
            level: logLevel,
            maxFiles: 3,
            maxsize: 10000000, // 10MB
            timestamp: () => new Date().toLocaleString(),
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

(function cleanup() {
var wantkeep = 5; // How many files (count) we want to keep ??
fs.readdir(logDirectory, function(err,files){
	if (err) return logger.error(`Some Error on logger-cleanup-function-readdir: ${err}`);
	var filesList = files.filter(function(e){
    return path.extname(e).toLowerCase() === '.txt' // Filter only txt files
	});
	filesList.sort(function(filea, fileb){
		return fs.statSync(logDirectory + '/' + fileb).mtime.getTime() - fs.statSync(logDirectory + '/' + filea).mtime.getTime(); // Filter newest on top
	});
	wantkeep = wantkeep + 1; //Lets be safe and add one more on top.
	if (filesList.length > wantkeep) {
	filesList = filesList.slice(wantkeep); // How many files (count) we want to keep ??
	for (var i = 0; i < filesList.length; i++) {
		logger.info(`actually count to delete: ${filesList.length}`); //counter of files who real would be delete (count-readdir - wantkeep)
		logger.warn(`Want to CleanUp File: ${filesList[i]}`); 
		const unlinkname = filesList[i]; //lets save the filename because after delete ...
		fs.unlink(path.join(logDirectory, filesList[i]), function(err){
			if (err) {
				logger.error(`Failed to delete: ${unlinkname} - ${err}`);
			} else {
				logger.info(`Successfully deleted ${unlinkname}`);
			}
		});
	}
	} else {
		logger.warn(`No need to work on file cleanup because we need more than ${wantkeep} Files (wantkeep-value) to proceed - actually count: ${filesList.length}`);
	}
});
})();

logger.info(`Logging to directory: '${logDirectory}' with filename: '${completefilename}.txt'`);

logger.transports.console.level = logLevel;

module.exports = logger;
