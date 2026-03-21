var winston = require('winston');

var level = process.env.LOG_LEVEL || 'info';

var transports = [
    new winston.transports.Console({
        level: level,
        handleExceptions: true,
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(function(info) {
                return info.timestamp + ' - ' + info.level + ': ' + info.message;
            })
        )
    })
];

// Optional file transport — enabled when LOG_FILE is set in .env
if (process.env.LOG_FILE) {
    transports.push(new winston.transports.File({
        filename: process.env.LOG_FILE,
        level: level,
        handleExceptions: true,
        maxsize: 5 * 1024 * 1024,  // 5 MB per file
        maxFiles: 3,
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(function(info) {
                return info.timestamp + ' - ' + info.level + ': ' + info.message;
            })
        )
    }));
}

var logger = winston.createLogger({
    exitOnError: false,
    transports: transports
});

module.exports = logger;

module.exports.stream = {
    write: function(message) {
        logger.info(message.trimEnd());
    }
};
