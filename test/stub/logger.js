let level = 'info';
let debugNamespaceIgnore = '';
let namespacedLevels = {};

let transports = [];

let transportsEnabled = false;

const mock = {
    callTransports:jest.fn().mockImplementation((level, message, namespace) => {
        if (transportsEnabled) {
            for (const transport of transports) {
                transport.log({level, message, namespace}, () => {});
            }
        }
    }),
    log: (level, messageOrLambda, namespace = 'z2m') => {
        const message = messageOrLambda instanceof Function ? messageOrLambda() : messageOrLambda;
        mock.callTransports(level, message, namespace)
    },
    init: jest.fn(),
    info: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mock.log('info', messageOrLambda, namespace)),
    warning: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mock.log('warning', messageOrLambda, namespace)),
    error: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mock.log('error', messageOrLambda, namespace)),
    debug: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mock.log('debug', messageOrLambda, namespace)),
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
