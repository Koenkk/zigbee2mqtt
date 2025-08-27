import {hrtime} from "node:process";
import type {bench} from "vitest";

export const BENCH_OPTIONS: NonNullable<Parameters<typeof bench>[2]> = {
    throws: true,
    warmupTime: 1000,
    now: () => Number(hrtime.bigint()) / 1e6,
    setup: (_task, mode) => {
        // Run the garbage collector before warmup at each cycle
        if (mode === "warmup" && typeof globalThis.gc === "function") {
            globalThis.gc();
        }
    },
};
