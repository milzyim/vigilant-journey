const { createLogger, format, transports } = require('winston');

const customLevels = {
    levels: {
        fatal: 0,
        error: 1,
        warn: 2,
        info: 3,
        debug: 4,
        trace: 5
    },
    colors: {
        fatal: 'red',
        error: 'red',
        warn: 'yellow',
        info: 'green',
        debug: 'blue',
        trace: 'magenta'
    }
};

const logger = createLogger({
    levels: customLevels.levels,
    format: format.combine(
        format.timestamp(),
        format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level}]: ${message}`;
        })
    ),
    transports: [
        new transports.Console({
            level: 'debug', // Console will log everything from debug and above
            format: format.combine(
                format.colorize(),
                format.printf(({ timestamp, level, message }) => {
                    return `${timestamp} [${level}]: ${message}`;
                })
            )
        }),
        new transports.File({
            filename: 'error.log',
            level: 'error', // File will log only errors and above
        }),
        new transports.File({
            filename: 'combined.log',
            level: 'info', // File will log everything from info and above
        }),
    ],
});

// Apply the colors to the logger
require('winston').addColors(customLevels.colors);

module.exports = logger;