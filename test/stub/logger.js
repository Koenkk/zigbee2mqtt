let level = 'info';

let transports = [];

let transportsEnabled = false;
const callTransports = (level, message, namespace) => {
    if (transportsEnabled) {
        for (const transport of transports) {
            transport.log({level, message, namespace}, () => {});
        }
    }
}

const mock = {
    init: jest.fn(),
    info: jest.fn().mockImplementation((msg) => callTransports('info', msg)),
    warning: jest.fn().mockImplementation((msg) => callTransports('warning', msg)),
    error: jest.fn().mockImplementation((msg) => callTransports('error', msg)),
    debug: jest.fn().mockImplementation((msg) => callTransports('debug', msg)),
    cleanup: jest.fn(),
    logOutput: jest.fn(),
    add: (transport) => transports.push(transport),
    addTransport: (transport) => transports.push(transport),
    removeTransport: (transport) => {
        transports = transports.filter((t) => t !== transport);
    },
    setLevel: (newLevel) => {level = newLevel},
    getLevel: () => level,
    setTransportsEnabled: (value) => {transportsEnabled = value},
    end: jest.fn(),
};

jest.mock('../../lib/util/logger', () => (mock));

module.exports = {...mock};
