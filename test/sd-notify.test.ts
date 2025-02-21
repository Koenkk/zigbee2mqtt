import {mockLogger} from './mocks/logger';

function expectMessage(nth: number, message: string): void {
    expect(sendMock).toHaveBeenNthCalledWith(nth, Buffer.from(message), 0, expect.any(Number), 'mocked', expect.any(Function));
}

const sendMock = vi.fn();

vi.mock('unix-dgram', () => {
    const mockUnixDgramSocket = {
        send: sendMock,
    };
    return {
        createSocket: vi.fn(() => mockUnixDgramSocket),
    };
});

async function runTest(): Promise<void> {
    const sd = await import('../lib/util/sd-notify');
    await sd.init();
    sd.started();
    vi.advanceTimersByTime(6000);
    sd.stopping();
    sd.stopped();
}

const mocksClear = [mockLogger.log, mockLogger.debug, mockLogger.info, mockLogger.warning, mockLogger.error, sendMock];

describe('sd-notify', () => {
    beforeAll(async () => {
        vi.useFakeTimers();
    });

    afterAll(async () => {
        vi.useRealTimers();
        delete process.env.NOTIFY_SOCKET;
        delete process.env.WATCHDOG_USEC;
    });

    beforeEach(() => {
        vi.resetModules();
        mocksClear.forEach((m) => m.mockClear());
    });

    it('No socket', async () => {
        delete process.env.NOTIFY_SOCKET;
        delete process.env.WATCHDOG_USEC;
        await runTest();
        expect(sendMock).toHaveBeenCalledTimes(0);
    });

    it('Socket only', async () => {
        process.env.NOTIFY_SOCKET = 'mocked';
        delete process.env.WATCHDOG_USEC;
        await runTest();
        expect(sendMock).toHaveBeenCalledTimes(2);
        expectMessage(1, 'READY=1');
        expectMessage(2, 'STOPPING=1');
    });

    it('Socket and watchdog', async () => {
        process.env.NOTIFY_SOCKET = 'mocked';
        process.env.WATCHDOG_USEC = '10000000';
        await runTest();
        expect(sendMock).toHaveBeenCalledTimes(3);
        expectMessage(1, 'READY=1');
        expectMessage(2, 'WATCHDOG=1');
        expectMessage(3, 'STOPPING=1');
    });

    it('Invalid watchdog timeout', async () => {
        process.env.NOTIFY_SOCKET = 'mocked';
        process.env.WATCHDOG_USEC = 'mocked';
        await runTest();
        expect(sendMock).toHaveBeenCalledTimes(2);
        expectMessage(1, 'READY=1');
        expectMessage(2, 'STOPPING=1');
    });
});
