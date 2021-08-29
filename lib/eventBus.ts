import events from 'events';

// Types are specified in types.ts
class EventBus implements eventbus.EventBus {
    private callbacksByExtension: {[s: string]: {event: string, callback: (data: eventbus.Data) => void}[]} = {};
    private emitter = new events.EventEmitter();

    public emit(event: string, data: eventbus.Data): boolean {
        return this.emitter.emit(event, data);
    }

    public on(event: string, callback: (data: eventbus.Data) => void, extension: string): void {
        if (!this.callbacksByExtension[extension]) this.callbacksByExtension[extension] = [];
        this.callbacksByExtension[extension].push({event, callback});
        this.emitter.on(event, callback);
    }

    public removeListeners(extension: string): void {
        this.callbacksByExtension[extension]?.forEach((e) => this.emitter.removeListener(e.event, e.callback));
    }
}

// TODO_finished: change class to export default
module.exports = EventBus;
