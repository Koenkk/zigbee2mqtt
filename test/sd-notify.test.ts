import {mockLogger} from './mocks/logger';

import {initSdNotify} from '../lib/util/sd-notify';

const mockPlatform = vi.fn(() => 'linux');

vi.mock('node:os', () => ({
    platform: vi.fn(() => mockPlatform()),
}));

const mockUnixDgramSocket = {
    send: vi.fn(),
};
const mockCreateSocket = vi.fn(() => {
    if (mockPlatform() !== 'win32') {
        return mockUnixDgramSocket;
    }

    throw new Error('Unix datagrams not available on this platform');
});

vi.mock('unix-dgram', () => ({
    createSocket: mockCreateSocket,
}));

const mocksClear = [
    mockLogger.log,
    mockLogger.debug,
    mockLogger.info,
    mockLogger.warning,
    mockLogger.error,
    mockUnixDgramSocket.send,
    mockCreateSocket,
    mockPlatform,
];

describe('sd-notify', () => {
    const expectSocketNthSend = (nth: number, message: string): void => {
        expect(mockUnixDgramSocket.send).toHaveBeenNthCalledWith(nth, Buffer.from(message), 0, expect.any(Number), 'mocked', expect.any(Function));
    };

    beforeAll(async () => {
        vi.useFakeTimers();
    });

    afterAll(async () => {
        vi.useRealTimers();
    });

    beforeEach(() => {
        mocksClear.forEach((m) => m.mockClear());
        delete process.env.NOTIFY_SOCKET;
        delete process.env.WATCHDOG_USEC;
        delete process.env.WSL_DISTRO_NAME;
    });

    it('No socket', async () => {
        const res = await initSdNotify();

        expect(mockCreateSocket).toHaveBeenCalledTimes(0);
        expect(res).toBeUndefined();
        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(0);
    });

    it('Error on unsupported platform', async () => {
        // also called by `mockCreateSocket`
        mockPlatform.mockImplementationOnce(() => 'win32').mockImplementationOnce(() => 'win32');

        process.env.NOTIFY_SOCKET = 'mocked';
        const res = await initSdNotify();

        expect(mockCreateSocket).toHaveBeenCalledTimes(1);
        expect(res).toBeUndefined();
        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(0);
        expect(mockLogger.warning).toHaveBeenCalledWith(`NOTIFY_SOCKET env is set: Unix datagrams not available on this platform`);
    });

    it('Error on supported platform', async () => {
        // NOTE: `import('unix-dgram')` can also fail in similar way when bindings are missing (not compiled)
        mockCreateSocket.mockImplementationOnce(() => {
            throw new Error('Error create socket');
        });

        process.env.NOTIFY_SOCKET = 'mocked';
        const res = await initSdNotify();

        expect(mockCreateSocket).toHaveBeenCalledTimes(1);
        expect(res).toBeUndefined();
        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(0);
        expect(mockLogger.error).toHaveBeenCalledWith('Could not init sd_notify: Error create socket');
    });

    it('Socket only', async () => {
        process.env.NOTIFY_SOCKET = 'mocked';
        const res = await initSdNotify();

        expect(res).toStrictEqual({notifyStopping: expect.any(Function), stop: expect.any(Function)});
        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(1);
        expectSocketNthSend(1, 'READY=1');

        await vi.advanceTimersByTimeAsync(7500);

        res!.notifyStopping();
        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(2);
        expectSocketNthSend(2, 'STOPPING=1');

        res!.stop();
        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(2);
    });

    it('Invalid watchdog timeout - socket only', async () => {
        process.env.NOTIFY_SOCKET = 'mocked';
        process.env.WATCHDOG_USEC = 'mocked';
        const res = await initSdNotify();

        expect(res).toStrictEqual({notifyStopping: expect.any(Function), stop: expect.any(Function)});
        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(1);
        expectSocketNthSend(1, 'READY=1');

        await vi.advanceTimersByTimeAsync(7500);

        res!.notifyStopping();
        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(2);
        expectSocketNthSend(2, 'STOPPING=1');

        res!.stop();
        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(2);
    });

    it('Socket and watchdog', async () => {
        process.env.NOTIFY_SOCKET = 'mocked';
        process.env.WATCHDOG_USEC = '10000000';
        const res = await initSdNotify();

        expect(res).toStrictEqual({notifyStopping: expect.any(Function), stop: expect.any(Function)});
        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(1);
        expectSocketNthSend(1, 'READY=1');

        await vi.advanceTimersByTimeAsync(7500);
        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(2);
        expectSocketNthSend(2, 'WATCHDOG=1');

        res!.notifyStopping();
        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(3);
        expectSocketNthSend(3, 'STOPPING=1');

        await vi.advanceTimersByTimeAsync(6000);

        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(4);
        expectSocketNthSend(4, 'WATCHDOG=1');

        res!.stop();
        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(4);

        await vi.advanceTimersByTimeAsync(10000);
        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(4);
    });

    it('Fails to send', async () => {
        mockUnixDgramSocket.send.mockImplementationOnce(
            (buf: Buffer, offset: number, length: number, path: string, callback?: (err?: Error) => void) => {
                callback!(new Error('Failure'));
            },
        );

        process.env.NOTIFY_SOCKET = 'mocked';
        const res = await initSdNotify();

        expect(res).toStrictEqual({notifyStopping: expect.any(Function), stop: expect.any(Function)});
        expect(mockUnixDgramSocket.send).toHaveBeenCalledTimes(1);
        expectSocketNthSend(1, 'READY=1');

        expect(mockLogger.warning).toHaveBeenCalledWith(`Failed to send "READY=1" to systemd: Failure`);
    });
});
