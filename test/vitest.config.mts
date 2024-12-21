import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onConsoleLog(log: string, type: 'stdout' | 'stderr'): boolean | void {
            return false;
        },
        coverage: {
            enabled: false,
            provider: 'v8',
            include: ['lib/**'],
            extension: ['.ts'],
            // exclude: [],
            clean: true,
            cleanOnRerun: true,
            reportsDirectory: 'coverage',
            reporter: ['text', 'html'],
            reportOnFailure: false,
            thresholds: {
                100: true,
            },
        },
    },
});
