import Extension from "./extension";
export default class Availability extends Extension {
    /** Mapped by IEEE address */
    private readonly timers;
    /** Mapped by IEEE address or Group ID */
    private readonly lastPublishedAvailabilities;
    /** Mapped by IEEE address */
    private readonly pingBackoffs;
    /** IEEE addresses, waiting for last seen changes to take them out of "availability sleep" */
    private readonly backoffPausedDevices;
    /** Mapped by IEEE address */
    private readonly retrieveStateDebouncers;
    private pingQueue;
    private pingQueueExecuting;
    private stopped;
    private getTimeout;
    private getMaxJitter;
    private getBackoff;
    private getPauseOnBackoffGt;
    private isActiveDevice;
    private isAvailable;
    private resetTimer;
    private clearTimer;
    private addToPingQueue;
    private removeFromPingQueue;
    private pingQueueExecuteNext;
    start(): Promise<void>;
    private publishAvailabilityForAllEntities;
    private publishAvailability;
    private onLastSeenChanged;
    stop(): Promise<void>;
    private retrieveState;
}
//# sourceMappingURL=availability.d.ts.map