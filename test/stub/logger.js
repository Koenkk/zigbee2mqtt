jest.mock('../../lib/util/logger', () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    trace: () => {},
    cleanup: () => {},
}));

module.exports = {};
