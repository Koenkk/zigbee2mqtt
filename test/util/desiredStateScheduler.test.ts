import "../mocks/data";
import "../mocks/logger";

import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import EventBus from "../../lib/eventBus";
import type Device from "../../lib/model/device";
import DesiredStateScheduler from "../../lib/util/desiredStateScheduler";
import * as settings from "../../lib/util/settings";
import * as data from "../mocks/data";
import {flushPromises} from "../mocks/utils";

describe("DesiredStateScheduler", () => {
    let eventBus: EventBus;
    let scheduler: DesiredStateScheduler;
    const device = {ieeeAddr: "0x1234", isDevice: () => true} as Device;

    beforeEach(() => {
        vi.useFakeTimers();
        data.writeDefaultConfiguration();
        settings.reRead();
        settings.set(["advanced", "desired_state", "enabled"], true);
        settings.set(["advanced", "desired_state", "max_attempts"], 2);
        settings.set(["advanced", "desired_state", "retry_cooldown"], 1);
        settings.set(["advanced", "desired_state", "deadline"], 5);
        eventBus = new EventBus();
        scheduler = new DesiredStateScheduler(eventBus);
        scheduler.start();
    });

    afterEach(() => {
        scheduler?.stop();
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    const runQueued = async (): Promise<void> => {
        await vi.advanceTimersByTimeAsync(0);
        await flushPromises();
    };

    it("Should complete one-shot sends without retrying", async () => {
        const send = vi.fn().mockResolvedValue(undefined);

        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, property: "state", value: "ON", send});
        await runQueued();
        await vi.advanceTimersByTimeAsync(1000);
        await flushPromises();

        expect(send).toHaveBeenCalledTimes(1);
    });

    it("Should retry failed sends until max attempts is reached", async () => {
        const send = vi.fn().mockRejectedValue(new Error("no route"));

        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, property: "state", value: "ON", send});
        await runQueued();
        await vi.advanceTimersByTimeAsync(1000);
        await flushPromises();
        await vi.advanceTimersByTimeAsync(1000);
        await flushPromises();

        expect(send).toHaveBeenCalledTimes(2);
    });

    it("Should ignore optimistic and non-device state changes", async () => {
        const send = vi.fn().mockResolvedValue({state: "ON"});
        const group = {ieeeAddr: "group", isDevice: () => false} as Device;

        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, property: "state", value: "ON", send});
        await runQueued();
        eventBus.emitStateChange({entity: device, from: {}, to: {state: "ON"}, reason: "publishOptimistic"});
        eventBus.emitStateChange({entity: group, from: {}, to: {state: "ON"}, reason: "publishDebounce"});
        eventBus.emitStateChange({entity: device, from: {}, to: {state: "OFF"}, reason: "publishDebounce"});
        await vi.advanceTimersByTimeAsync(1000);
        await runQueued();

        expect(send).toHaveBeenCalledTimes(2);
    });

    it("Should supersede different properties on the same endpoint", async () => {
        const stateSend = vi.fn().mockResolvedValue({state: "OPEN"});
        const positionSend = vi.fn().mockResolvedValue({position: 0});

        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, property: "state", value: "OPEN", send: stateSend});
        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, property: "position", value: 0, send: positionSend});
        await runQueued();
        await vi.advanceTimersByTimeAsync(1000);
        await runQueued();

        expect(stateSend).toHaveBeenCalledTimes(0);
        expect(positionSend).toHaveBeenCalledTimes(2);
    });

    it("Should keep different endpoints independent", async () => {
        const leftSend = vi.fn().mockResolvedValue({position_left: 100});
        const rightSend = vi.fn().mockResolvedValue({position_right: 0});

        scheduler.enqueue({entity: device, endpointName: "left", endpointID: 1, property: "position", value: 100, send: leftSend});
        scheduler.enqueue({entity: device, endpointName: "right", endpointID: 2, property: "position", value: 0, send: rightSend});
        await runQueued();
        await vi.advanceTimersByTimeAsync(1000);
        await runQueued();

        expect(leftSend).toHaveBeenCalledTimes(2);
        expect(rightSend).toHaveBeenCalledTimes(2);
    });

    it("Should order same-tick bursts by order hint", async () => {
        const firstSend = vi.fn().mockResolvedValue(undefined);
        const secondSend = vi.fn().mockResolvedValue(undefined);

        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, orderHint: 1, property: "state", value: "FIRST", send: firstSend});
        scheduler.enqueue({
            entity: device,
            endpointName: undefined,
            endpointID: 2,
            orderHint: 2,
            property: "state",
            value: "SECOND",
            send: secondSend,
        });
        await runQueued();

        expect(secondSend.mock.invocationCallOrder[0]).toBeLessThan(firstSend.mock.invocationCallOrder[0]);
    });

    it("Should update order hint when coalescing duplicate targets", async () => {
        const firstSend = vi.fn().mockResolvedValue(undefined);
        const secondSend = vi.fn().mockResolvedValue(undefined);

        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, orderHint: 0, property: "state", value: "ON", send: firstSend});
        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, orderHint: 2, property: "state", value: "ON", send: firstSend});
        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 2, orderHint: 1, property: "state", value: "OFF", send: secondSend});
        await runQueued();

        expect(firstSend.mock.invocationCallOrder[0]).toBeLessThan(secondSend.mock.invocationCallOrder[0]);
    });

    it("Should keep neutral order hint when coalescing duplicate targets without a hint", async () => {
        const firstSend = vi.fn().mockResolvedValue(undefined);
        const secondSend = vi.fn().mockResolvedValue(undefined);

        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, property: "state", value: "ON", send: firstSend});
        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, property: "state", value: "ON", send: firstSend});
        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 2, orderHint: 1, property: "state", value: "OFF", send: secondSend});
        await runQueued();

        expect(secondSend.mock.invocationCallOrder[0]).toBeLessThan(firstSend.mock.invocationCallOrder[0]);
    });

    it("Should report send failures", async () => {
        const onFailed = vi.fn();
        const send = vi.fn().mockRejectedValue(new Error("busy"));

        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, onFailed, property: "state", value: "ON", send});
        await runQueued();

        expect(onFailed).toHaveBeenCalledTimes(1);
    });

    it("Should not retry in a perfect network", async () => {
        const onApplied = vi.fn();
        const onFailed = vi.fn();
        const send = vi.fn().mockResolvedValue({state: "ON"});

        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, onApplied, onFailed, property: "state", value: "ON", send});
        await runQueued();
        await vi.advanceTimersByTimeAsync(100);
        eventBus.emitStateChange({entity: device, from: {}, to: {state: "ON"}, reason: "publishDebounce"});
        await vi.advanceTimersByTimeAsync(1000);
        await flushPromises();

        expect(send).toHaveBeenCalledTimes(1);
        expect(onApplied).toHaveBeenCalledWith(100);
        expect(onFailed).not.toHaveBeenCalled();
    });

    it("Should not let a superseded in-flight send re-arm itself", async () => {
        let resolveOldSend: (value: KeyValue) => void;
        const oldSend = vi.fn(
            () =>
                new Promise<KeyValue>((resolve) => {
                    resolveOldSend = resolve;
                }),
        );
        const newSend = vi.fn().mockResolvedValue({position: 0});

        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, property: "state", value: "OPEN", send: oldSend});
        await runQueued();
        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, property: "position", value: 0, send: newSend});
        await flushPromises();

        resolveOldSend!({state: "OPEN"});
        await flushPromises();
        await vi.advanceTimersByTimeAsync(1000);
        await runQueued();

        expect(oldSend).toHaveBeenCalledTimes(1);
        expect(newSend).toHaveBeenCalledTimes(2);
    });

    it("Should not re-arm a stopped in-flight send", async () => {
        let resolveSend: (value: KeyValue) => void;
        const send = vi.fn(
            () =>
                new Promise<KeyValue>((resolve) => {
                    resolveSend = resolve;
                }),
        );

        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, property: "state", value: "ON", send});
        await runQueued();
        eventBus.emitStateChange({entity: device, from: {}, to: {state: "ON"}, reason: "publishDebounce"});
        await flushPromises();
        scheduler.stop();
        resolveSend!({state: "ON"});
        await flushPromises();
        await vi.advanceTimersByTimeAsync(1000);
        await flushPromises();

        expect(send).toHaveBeenCalledTimes(1);
    });

    it("Should ignore enqueue while a run is already active", async () => {
        let resolveSend: (value: KeyValue | undefined) => void;
        const firstSend = vi.fn(
            () =>
                new Promise<KeyValue | undefined>((resolve) => {
                    resolveSend = resolve;
                }),
        );
        const secondSend = vi.fn().mockResolvedValue(undefined);

        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, property: "state", value: "ON", send: firstSend});
        await runQueued();
        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 2, property: "state", value: "OFF", send: secondSend});
        await flushPromises();
        expect(secondSend).toHaveBeenCalledTimes(0);

        resolveSend!(undefined);
        await flushPromises();

        expect(secondSend).toHaveBeenCalledTimes(1);
    });

    it("Should prefer older lower-failure candidates", async () => {
        let resolveBlockingSend: (value: KeyValue | undefined) => void;
        const failedSend = vi.fn().mockRejectedValue(new Error("busy"));
        const blockingSend = vi.fn(
            () =>
                new Promise<KeyValue | undefined>((resolve) => {
                    resolveBlockingSend = resolve;
                }),
        );
        const newerSend = vi.fn().mockResolvedValue(undefined);
        const olderSend = vi.fn().mockResolvedValue(undefined);

        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 1, property: "state", value: "ON", send: failedSend});
        await runQueued();
        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 2, property: "state", value: "BLOCK", send: blockingSend});
        await flushPromises();
        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 3, property: "state", value: "OLDER", send: olderSend});
        await flushPromises();
        scheduler.enqueue({entity: device, endpointName: undefined, endpointID: 4, property: "state", value: "NEWER", send: newerSend});
        await flushPromises();

        await vi.advanceTimersByTimeAsync(1000);
        resolveBlockingSend!(undefined);
        await flushPromises();

        expect(olderSend.mock.invocationCallOrder[0]).toBeLessThan(newerSend.mock.invocationCallOrder[0]);
        expect(newerSend.mock.invocationCallOrder[0]).toBeLessThan(failedSend.mock.invocationCallOrder[1]);
        expect(failedSend).toHaveBeenCalledTimes(2);
    });
});
