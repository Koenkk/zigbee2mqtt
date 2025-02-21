import type {UnixDgramSocket} from 'unix-dgram';

import logger from './logger';

// Handle sd_notify protocol, see https://www.freedesktop.org/software/systemd/man/latest/sd_notify.html
// All methods in here will be no-ops if run on unsupported platforms or without Type=notify

let socket: UnixDgramSocket | undefined;
let watchdog: NodeJS.Timeout | undefined;

function sendToSystemd(msg: string): void {
    if (!socket) return;
    const buffer = Buffer.from(msg);
    socket.send(buffer, 0, buffer.byteLength, process.env.NOTIFY_SOCKET!, (err: Error | undefined) => {
        /* v8 ignore start */
        if (err) {
            logger.warning(`Failed to send "${msg}" to systemd: ${err.message}`);
        }
        /* v8 ignore stop */
    });
}

export async function init(): Promise<void> {
    if (!process.env.NOTIFY_SOCKET) return;
    try {
        const {createSocket} = await import('unix-dgram');
        socket = createSocket('unix_dgram');
        /* v8 ignore start */
    } catch (error) {
        // Ignore error on Windows if not running on WSL, as UNIX sockets don't exist
        // on Windows. Unlikely that NOTIFY_SOCKET is set anyways but better be safe.
        if (process.platform === 'win32' && !process.env.WSL_DISTRO_NAME) return;
        // Otherwise, pass on exception, so main process can bail out immediately
        throw error;
    }
    /* v8 ignore start */
}

export function started(): void {
    sendToSystemd('READY=1');
    if (!socket || !process.env.WATCHDOG_USEC || watchdog) return;
    const num = Math.max(0, parseInt(process.env.WATCHDOG_USEC, 10));
    if (!num) {
        logger.warning(`WATCHDOG_USEC invalid: "${process.env.WATCHDOG_USEC}", parsed to "${num}"`);
        return;
    }
    // Convert us to ms, send twice as frequently as the timeout
    const interval = num / 1000 / 2;
    watchdog = setInterval(() => sendToSystemd('WATCHDOG=1'), interval);
}

export function stopping(): void {
    sendToSystemd('STOPPING=1');
}

export function stopped(): void {
    if (!watchdog) return;
    clearInterval(watchdog);
    watchdog = undefined;
}
