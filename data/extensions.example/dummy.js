const Extension = require('../../lib/extension/extension');

class MyDummyExtension extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, settings, logger) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        logger.info('Loaded MyDummyExtension');
    }
}

module.exports = MyDummyExtension;
