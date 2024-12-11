export type EventHandler = (...args: unknown[]) => unknown;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JestMockAny = jest.Mock<any, any, any>;

export function flushPromises(): Promise<void> {
    return new Promise(jest.requireActual('timers').setImmediate);
}

// https://github.com/jestjs/jest/issues/6028#issuecomment-567669082
export function defuseRejection<T>(promise: Promise<T>): Promise<T> {
    promise.catch(() => {});

    return promise;
}
