let level = 'info';
let debugNamespaceIgnore = '';
let namespacedLevels = {};

let transports = [];

let transportsEnabled = false;
const callTransports = (level, message, namespace) => {
    if (transportsEnabled) {
        for (const transport of transports) {
            transport.log({level, message, namespace}, () => {});
        }
    }
};

const mock = {
    init: jest.fn(),
    info: jest.fn().mockImplementation((msg, namespace = 'z2m') => callTransports('info', msg, namespace)),
    warning: jest.fn().mockImplementation((msg, namespace = 'z2m') => callTransports('warning', msg, namespace)),
    error: jest.fn().mockImplementation((msg, namespace = 'z2m') => callTransports('error', msg, namespace)),
    debug: jest.fn().mockImplementation((msg, namespace = 'z2m') => callTransports('debug', msg, namespace)),
    cleanup: jest.fn(),
    logOutput: jest.fn(),
    add: (transport) => transports.push(transport),
    addTransport: (transport) => transports.push(transport),
    removeTransport: (transport) => {
        transports = transports.filter((t) => t !== transport);
    },
    setLevel: (newLevel) => {
        level = newLevel;
    },
    getLevel: () => level,
    setNamespacedLevels: (nsLevels) => {
        namespacedLevels = nsLevels;
    },
    getNamespacedLevels: () => namespacedLevels,
    setDebugNamespaceIgnore: (newIgnore) => {
        debugNamespaceIgnore = newIgnore;
    },
    getDebugNamespaceIgnore: () => debugNamespaceIgnore,
    setTransportsEnabled: (value) => {
        transportsEnabled = value;
    },
    end: jest.fn(),
};

jest.mock('../../lib/util/logger', () => mock);

module.exports = {...mock};
