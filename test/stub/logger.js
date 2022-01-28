import winston from 'winston';

const logger = winston.createLogger();
logger.add(new winston.transports.Console({ silent: true }));
let transportsEnabled = false;

const mock = {
    info: jest.fn().mockImplementation((msg) => transportsEnabled && logger.info(msg)),
    warn: jest.fn().mockImplementation((msg) => transportsEnabled && logger.warn(msg)),
    error: jest.fn().mockImplementation((msg) => transportsEnabled && logger.error(msg)),
    debug: jest.fn().mockImplementation((msg) => transportsEnabled && logger.debug(msg)),
    cleanup: jest.fn(),
    logOutput: jest.fn(),
    addTransport: (transport) => logger.add(transport),
    setLevel: (level) => logger.level = level,
    getLevel: () => logger.level,
    setTransportsEnabled: (value) => {transportsEnabled = value},
    end: jest.fn(),
};

jest.mock('../../lib/util/logger', () => (mock));

module.exports = {...mock};
