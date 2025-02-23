import {platform} from 'node:os';

import logger from './logger';

/**
 * Handle sd_notify protocol, @see https://www.freedesktop.org/software/systemd/man/latest/sd_notify.html
 * No-op if running on unsupported platforms or without Type=notify
 */
export async function initSdNotify(): Promise<{notifyStopping: () => void; stop: () => void} | undefined> {
    if (!process.env.NOTIFY_SOCKET) {
        return;
    }

    try {
        const {createSocket} = await import('unix-dgram');
        const socket = createSocket('unix_dgram');
        const sendToSystemd = (msg: string): void => {
            const buffer = Buffer.from(msg);

            socket.send(buffer, 0, buffer.byteLength, process.env.NOTIFY_SOCKET!, (err) => {
                if (err) {
                    logger.warning(`Failed to send "${msg}" to systemd: ${err.message}`);
                }
            });
        };
        const notifyStopping = (): void => sendToSystemd('STOPPING=1');

        sendToSystemd('READY=1');

        const wdUSec = process.env.WATCHDOG_USEC !== undefined ? Math.max(0, parseInt(process.env.WATCHDOG_USEC, 10)) : -1;

        if (wdUSec > 0) {
            // Convert us to ms, send twice as frequently as the timeout
            const watchdogInterval = setInterval(() => sendToSystemd('WATCHDOG=1'), wdUSec / 1000 / 2);

            return {
                notifyStopping,
                stop: (): void => clearInterval(watchdogInterval),
            };
        }

        if (wdUSec !== -1) {
            logger.warning(`WATCHDOG_USEC invalid: "${process.env.WATCHDOG_USEC}", parsed to "${wdUSec}"`);
        }

        return {
            notifyStopping,
            stop: (): void => {},
        };
    } catch (error) {
        // Ignore error on Windows if not running on WSL, as UNIX sockets don't exist on Windows.
        // Unlikely that NOTIFY_SOCKET is set anyways but better be safe.
        if (platform() !== 'win32' || process.env.WSL_DISTRO_NAME) {
            throw error;
        }
    }
}
