// Vendored and modified slightly from https://github.com/sindresorhus/throttleit/blob/main/index.js

export default function throttle<Args extends unknown[]>(fn: (...args: Args) => Promise<void>, wait: number): (...args: Args) => Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout>;
    let lastCallTime = 0;

    return (...args: Args) => {
        clearTimeout(timeoutId);
        const now = Date.now();
        const timeSinceLastCall = now - lastCallTime;
        const delayForNextCall = wait - timeSinceLastCall;

        if (delayForNextCall <= 0) {
            lastCallTime = now;
            return fn(...args);
        }

        return new Promise<void>((resolve) => {
            timeoutId = setTimeout(() => {
                lastCallTime = Date.now();
                resolve(fn(...args));
            }, delayForNextCall);
        });
    };
}
