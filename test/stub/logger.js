let level = 'info';
let debugNamespaceIgnore = '';
let namespacedLevels = {};
let transports = [];
let transportsEnabled = false;

const getMessage = (messageOrLambda) => (messageOrLambda instanceof Function ? messageOrLambda() : messageOrLambda);
const mock = {
    log: jest.fn().mockImplementation((level, message, namespace = 'z2m') => {
        if (transportsEnabled) {
            for (const transport of transports) {
                transport.log({level, message, namespace}, () => {});
            }
        }
    }),
    init: jest.fn(),
    info: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mock.log('info', getMessage(messageOrLambda), namespace)),
    warning: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mock.log('warning', getMessage(messageOrLambda), namespace)),
    error: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mock.log('error', getMessage(messageOrLambda), namespace)),
    debug: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mock.log('debug', getMessage(messageOrLambda), namespace)),
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
