import {vi} from "vitest";
import type {DefinitionWithExtend} from "zigbee-herdsman-converters";

export type EventHandler = (...args: unknown[]) => unknown;

export async function flushPromises(): Promise<void> {
    const nodeTimers = await vi.importActual<typeof import("node:timers")>("node:timers");

    return await new Promise(nodeTimers.setImmediate);
}

// https://github.com/jestjs/jest/issues/6028#issuecomment-567669082
export function defuseRejection<T>(promise: Promise<T>): Promise<T> {
    promise.catch(() => {});

    return promise;
}

export async function getZhcBaseDefinitions(): Promise<DefinitionWithExtend[]> {
    return (await import("zigbee-herdsman-converters/devices/index")).default;
}
