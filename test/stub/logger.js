const mock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    cleanup: jest.fn(),
    transports: {console: {level: 1}}
};

jest.mock('../../lib/util/logger', () => (mock));

module.exports = {...mock};
