let level = 'info';
let debugNamespaceIgnore = '';
let namespacedLevels = {};

let transports = [];

let transportsEnabled = false;
const callTransports = (level, messageOrLambda, namespace) => {
    if (transportsEnabled) {
        const message = messageOrLambda instanceof Function ? messageOrLambda() : messageOrLambda;
        for (const transport of transports) {
            transport.log({level, message, namespace}, () => {});
        }
    }
};

const mock = {
    init: jest.fn(),
    info: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => callTransports('info', messageOrLambda, namespace)),
    warning: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => callTransports('warning', messageOrLambda, namespace)),
    error: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => callTransports('error', messageOrLambda, namespace)),
    debug: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => callTransports('debug', messageOrLambda, namespace)),
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
