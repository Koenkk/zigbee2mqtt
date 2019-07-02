const settings = require('./settings');

const maxSimultaneouslyRunning = settings.get().queue.simultaneously;
const delay = settings.get().queue.delay;
const error17Retries = 3;
const logger = require('./logger');

class ZigbeeQueue {
    constructor() {
        this.queue = [];
        this.active = [];
        this.timer = null;
        this.running = false;
        this.ID = 0;
    }

    start() {
        this.running = true;
        this.resetTimer();
    }

    push(entityID, func) {
        this.ID++;
        this.queue.push({entityID, func, attempts: 0, ID: this.ID});
        this.log(`Added new job with ID ${this.ID} for ${entityID}`);
    }

    log(message) {
        logger.trace(`zigbeeQueue: ${message}`);
    }

    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    resetTimer() {
        this.stopTimer();

        this.timer = setInterval(() => {
            this.executeNext();
        }, delay);
    }

    stop() {
        this.stopTimer();
        this.running = false;
    }

    handleJobComplete(job, error) {
        this.log(`Completed job with ID ${job.ID} for ${job.entityID}${error ? ` with error ${error}` : ''}`);

        if (error && error.message === 'rsp error: 17' && job.attempts < error17Retries) {
            // Error 17 means that the buffer of the ZNP was full,
            // retry this for a maximum of 3 times.
            job.attempts++;
            this.active.splice(this.active.indexOf(job), 1);
        } else {
            this.active.splice(this.active.indexOf(job), 1);
            this.queue.splice(this.queue.indexOf(job), 1);
        }
    }

    executeNext() {
        if (!this.running) {
            return;
        }

        const next = this.getNext();

        if (next) {
            this.active.push(next);
            this.log(`Executing job with ID ${next.ID} for ${next.entityID}`);
            next.func((error) => this.handleJobComplete(next, error));
        }
    }

    getNext() {
        if (this.active.length > (maxSimultaneouslyRunning - 1)) {
            return null;
        }

        for (let i = 0; i < this.queue.length; i++) {
            const job = this.queue[i];
            const activeDeviceJob = this.active.find((j) => j.entityID === job.entityID);
            if (!activeDeviceJob) {
                return job;
            }
        }

        return null;
    }
}

module.exports = ZigbeeQueue;
