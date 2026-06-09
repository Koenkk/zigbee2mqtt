import stringify from "json-stable-stringify-without-jsonify";

import type Device from "../model/device";
import logger from "./logger";
import * as settings from "./settings";

type SendResult = KeyValue | undefined;

export interface DesiredStateRequest {
    entity: Device;
    endpointName: string | undefined;
    endpointID: string | number;
    orderHint?: number;
    onApplied?: (latencyMs: number) => void;
    onFailed?: () => void;
    property: string;
    value: unknown;
    send: () => Promise<SendResult>;
}

interface DesiredState extends DesiredStateRequest {
    attempts: number;
    createdAt: number;
    deadlineAt: number;
    failures: number;
    inFlight: boolean;
    nextEligibleAt: number;
    orderHint: number;
    sentAt: number | undefined;
    targetHash: string;
    targetState: KeyValue | undefined;
    timer: NodeJS.Timeout | undefined;
}

export default class DesiredStateScheduler {
    readonly #eventBus: EventBus;
    readonly #states = new Map<string, DesiredState>();
    #running = false;
    #runScheduled = false;

    constructor(eventBus: EventBus) {
        this.#eventBus = eventBus;
    }

    public start(): void {
        this.#eventBus.onStateChange(this, this.#onStateChange);
    }

    public stop(): void {
        for (const state of this.#states.values()) {
            this.#clearTimer(state);
        }

        this.#runScheduled = false;
        this.#states.clear();
        this.#eventBus.removeListeners(this);
    }

    public enabled(): boolean {
        return settings.get().advanced.desired_state.enabled;
    }

    public enqueue(request: DesiredStateRequest): void {
        const key = this.#key(request);
        const existing = this.#states.get(key);
        const targetHash = stringify(request.value);

        if (existing) {
            if (existing.targetHash === targetHash) {
                existing.orderHint = request.orderHint ?? 0;
                existing.onApplied = request.onApplied;
                existing.onFailed = request.onFailed;
                existing.send = request.send;
                logger.debug(`Coalesced desired state '${key}' target '${targetHash}'`);
                return;
            }

            this.#supersede(existing, key, targetHash);
        }

        const now = Date.now();
        const state: DesiredState = {
            ...request,
            attempts: 0,
            createdAt: now,
            deadlineAt: now + settings.get().advanced.desired_state.deadline * 1000,
            failures: 0,
            inFlight: false,
            nextEligibleAt: now,
            orderHint: request.orderHint ?? 0,
            sentAt: undefined,
            targetHash,
            targetState: undefined,
            timer: undefined,
        };

        this.#states.set(key, state);
        logger.debug(`Queued desired state '${key}' target '${targetHash}'`);
        this.#scheduleRun();
    }

    #scheduleRun(): void {
        if (this.#runScheduled) {
            return;
        }

        this.#runScheduled = true;
        queueMicrotask(() => {
            this.#runScheduled = false;
            void this.#run();
        });
    }

    #key(request: Pick<DesiredStateRequest, "entity" | "endpointID">): string {
        return `${request.entity.ieeeAddr}/${request.endpointID}`;
    }

    #supersede(state: DesiredState, key: string, newTargetHash: string): void {
        this.#clearTimer(state);
        this.#states.delete(key);
        logger.debug(`Superseded desired state '${key}' target '${state.targetHash}' with '${newTargetHash}'`);
    }

    #clearTimer(state: DesiredState): void {
        if (state.timer) {
            clearTimeout(state.timer);
            state.timer = undefined;
        }
    }

    #onStateChange = (data: eventdata.StateChange): void => {
        // Optimistic publishes mirror the requested payload immediately; they
        // are useful for UI feedback but are not proof that the device applied
        // the command. Only later, non-optimistic state changes can complete.
        if (data.reason === "publishOptimistic" || !data.entity.isDevice()) {
            return;
        }

        for (const [key, state] of this.#states) {
            if (state.entity.ieeeAddr !== data.entity.ieeeAddr || !state.targetState) {
                continue;
            }

            if (this.#isApplied(state.targetState, data.to)) {
                if (state.sentAt !== undefined) {
                    state.onApplied?.(Date.now() - state.sentAt);
                }

                this.#complete(key, state, "applied");
            }
        }

        this.#scheduleRun();
    };

    #complete(key: string, state: DesiredState, status: "applied" | "failed" | "one-shot"): void {
        this.#clearTimer(state);
        this.#states.delete(key);
        if (status === "failed") {
            state.onFailed?.();
        }

        logger.debug(`Desired state '${key}' ${status} after ${state.attempts} attempt(s)`);
    }

    #isApplied(targetState: KeyValue, current: KeyValue): boolean {
        for (const [key, value] of Object.entries(targetState)) {
            if (current[key] !== value) {
                return false;
            }
        }

        return true;
    }

    async #run(): Promise<void> {
        if (this.#running) {
            return;
        }

        this.#running = true;

        try {
            while (true) {
                const state = this.#nextEligible();

                if (!state) {
                    break;
                }

                await this.#send(state);
            }
        } finally {
            this.#running = false;
        }
    }

    #nextEligible(): DesiredState | undefined {
        const now = Date.now();
        const candidates = Array.from(this.#states.values()).filter((state) => !state.inFlight && state.nextEligibleAt <= now);

        candidates.sort((a, b) => {
            // If one target keeps failing, let other devices make progress
            // before returning to it. Among equally healthy targets, preserve
            // FIFO order.
            const failureDiff = a.failures - b.failures;
            if (failureDiff !== 0) return failureDiff;

            const orderHintDiff = b.orderHint - a.orderHint;
            if (orderHintDiff !== 0) return orderHintDiff;

            return a.createdAt - b.createdAt;
        });

        return candidates[0];
    }

    async #send(state: DesiredState): Promise<void> {
        const key = this.#key(state);
        const config = settings.get().advanced.desired_state;

        if (Date.now() >= state.deadlineAt || state.attempts >= config.max_attempts) {
            this.#complete(key, state, "failed");
            return;
        }

        state.inFlight = true;
        state.attempts += 1;
        state.sentAt = Date.now();

        try {
            logger.debug(`Sending desired state '${key}' attempt ${state.attempts}/${config.max_attempts}`);
            const targetState = await state.send();

            if (targetState && Object.keys(targetState).length) {
                state.targetState = targetState;
            } else {
                this.#complete(key, state, "one-shot");
                return;
            }
        } catch (error) {
            state.failures += 1;
            state.onFailed?.();
            logger.debug(`Desired state '${key}' send failed on attempt ${state.attempts}: '${error}'`);
        } finally {
            state.inFlight = false;
        }

        if (this.#states.get(key) !== state) {
            return;
        }

        state.nextEligibleAt = Date.now() + config.retry_cooldown * 1000;
        this.#clearTimer(state);
        state.timer = setTimeout(() => void this.#run(), Math.max(0, state.nextEligibleAt - Date.now()));
    }
}
