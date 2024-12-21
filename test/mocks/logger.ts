import type {LogLevel} from 'lib/util/settings';
import type Transport from 'winston-transport';

let level: LogLevel = 'info';
let debugNamespaceIgnore: string = '';
let namespacedLevels: Record<string, LogLevel> = {};
let transports: Transport[] = [];
let transportsEnabled: boolean = false;
const getMessage = (messageOrLambda: string | (() => string)): string => (messageOrLambda instanceof Function ? messageOrLambda() : messageOrLambda);

export const mockLogger = {
    log: vi.fn().mockImplementation((level, message, namespace = 'z2m') => {
        if (transportsEnabled) {
            for (const transport of transports) {
                transport.log!({level, message, namespace}, () => {});
            }
        }
    }),
    init: vi.fn(),
    info: vi.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mockLogger.log('info', getMessage(messageOrLambda), namespace)),
    warning: vi.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mockLogger.log('warning', getMessage(messageOrLambda), namespace)),
    error: vi.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mockLogger.log('error', getMessage(messageOrLambda), namespace)),
    debug: vi.fn().mockImplementation((messageOrLambda, namespace = 'z2m') => mockLogger.log('debug', getMessage(messageOrLambda), namespace)),
    cleanup: vi.fn(),
    logOutput: vi.fn(),
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
    end: vi.fn(),
};

vi.mock('../../lib/util/logger', () => ({
    default: mockLogger,
}));
