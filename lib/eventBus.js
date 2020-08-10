const events = require('events');
const assert = require('assert');

const allowedEvents = [
    'deviceRemoved', // Device has been removed
    'deviceRenamed', // Device has been renamed
    'groupRenamed', // Group has been renamed
    'publishEntityState', // Entity state will be published
    'stateChange', // Entity changes its state
    'groupMembersChanged', // Members of a group has been changed
    'reportingDisabled', // Reporting is disabled for a device
];

class EventBus extends events.EventEmitter {
    constructor() {
        super();
        this.callbackByExtension = {};
    }

    emit(event, data) {
        assert(allowedEvents.includes(event), `Event '${event}' not supported`);
        super.emit(event, data);
    }

    on(event, callback, extension=null) {
        assert(allowedEvents.includes(event), `Event '${event}' not supported`);
        if (extension) {
            if (!this.callbackByExtension[extension]) this.callbackByExtension[extension] = [];
            this.callbackByExtension[extension].push({event, callback});
        }

        super.on(event, callback);
    }

    removeListenersExtension(extension) {
        for (const entry of this.callbackByExtension[extension] || []) {
            super.removeListener(entry.event, entry.callback);
        }
    }
}

module.exports = EventBus;
