const Extension = require('./extension');
const vm = require('vm');

const SCRIPT = `
const logger = require('../util/logger');
//GLOBAL VARIABLES: zigbee, mqtt, state, publishEntityState

module.exports = {
    onPublishEntityState: function(data) {
        logger.info("hello from external onPublishEntityState");
    },
};
`;

const TODO_LOAD_SOMEHOW = {
    sensboard: [SCRIPT],
};

class Scripting extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);

        this.executionContext = {require, zigbee, mqtt, state, publishEntityState};
        this.eventBus.on('publishEntityState', (data) => this.onPublishEntityState(data));
        this.handlers = {};
        this.loadScripts();
    }

    loadScripts() {
        for (const [name, scripts] of Object.entries(TODO_LOAD_SOMEHOW)) {
            this.handlers[name] = scripts.map((script) => {
                const handlerModule = {};
                vm.runInNewContext(SCRIPT, {...this.executionContext, module: handlerModule});
                return handlerModule.exports;
            });
        }
    }

    async onPublishEntityState(data) {
        const {
            entity: {
                type,
                name,
            },
        } = data;

        if (type == 'device' && this.handlers[name]) {
            const deviceHandlers = this.handlers[name];
            deviceHandlers
                .filter((handlerModule) => !!handlerModule.onPublishEntityState)
                .forEach((handlerModule) => {
                    handlerModule.onPublishEntityState(data);
                });
        }
    }
}

module.exports = Scripting;
