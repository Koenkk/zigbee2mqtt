const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const settings = require('../util/settings');
const Extension = require('./extension');
const utils = require('../util/utils');

class ExternalConverters extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);

        for (const definition of utils.getExternalConvertersDefinitions(settings)) {
            const toAdd = {...definition};
            delete toAdd['homeassistant'];
            zigbeeHerdsmanConverters.addDeviceDefinition(toAdd);
        }
    }
}

module.exports = ExternalConverters;
