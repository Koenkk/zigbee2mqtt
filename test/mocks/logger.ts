import type {LogLevel} from 'lib/util/settings';
import type Transport from 'winston-transport';

let level = 'info';
let debugNamespaceIgnore: string = '';
let namespacedLevels: Record<string, LogLevel> = {};
let transports: Transport[] = [];
let transportsEnabled: boolean = false;
const getMessage = (messageOrLambda: string | (() => string)): string => (messageOrLambda instanceof Function ? messageOrLambda() : messageOrLambda);

export const mockLogger = {
    log: jest.fn().mockImplementation((level, message, namespace = 'z2m') => {
        if (transportsEnabled) {
            for (const transport of transports) {
                transport.log!({level, message, namespace}, () => {});
            }
        }
    }),
    init: jest.fn(),
    info: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mockLogger.log('info', getMessage(messageOrLambda), namespace)),
    warning: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mockLogger.log('warning', getMessage(messageOrLambda), namespace)),
    error: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mockLogger.log('error', getMessage(messageOrLambda), namespace)),
    debug: jest.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mockLogger.log('debug', getMessage(messageOrLambda), namespace)),
    cleanup: jest.fn(),
    logOutput: jest.fn(),
    add: (transport: Transport): void => {
        transports.push(transport);
    },
    addTransport: (transport: Transport): void => {
        transports.push(transport);
    },
    removeTransport: (transport: Transport): void => {
        transports = transports.filter((t) => t !== transport);
    },
    setLevel: (newLevel: LogLevel): void => {
        level = newLevel;
    },
    getLevel: (): LogLevel => level,
    setNamespacedLevels: (nsLevels: Record<string, LogLevel>): void => {
        namespacedLevels = nsLevels;
    },
    getNamespacedLevels: (): Record<string, LogLevel> => namespacedLevels,
    setDebugNamespaceIgnore: (newIgnore: string): void => {
        debugNamespaceIgnore = newIgnore;
    },
    getDebugNamespaceIgnore: (): string => debugNamespaceIgnore,
    setTransportsEnabled: (value: boolean): void => {
        transportsEnabled = value;
    },
    end: jest.fn(),
};

jest.mock('../../lib/util/logger', () => mockLogger);
