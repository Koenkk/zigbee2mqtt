let level = 'info';

const mock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    cleanup: jest.fn(),
    setLevel: (newLevel) => {level = newLevel},
    getLevel: () => level,
};

jest.mock('../../lib/util/logger', () => (mock));

module.exports = {...mock};
