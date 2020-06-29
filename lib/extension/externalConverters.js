const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const settings = require('../util/settings');
const Extension = require('./extension');
const data = require('../util/data');

class ExternalConverters extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);

        const externalConverters = settings.get().external_converters;

        externalConverters.forEach((moduleName) => {
            let converterModule = moduleName;

            if (moduleName.endsWith('.js')) {
                converterModule = data.joinPath(moduleName.split('.')[0]);
            }

            const converter = require(converterModule);
            if (Array.isArray(converter)) {
                converter.forEach((mod) => {
                    zigbeeHerdsmanConverters.addDeviceDefinition(mod);
                });
            } else {
                zigbeeHerdsmanConverters.addDeviceDefinition(converter);
            }
        });
    }
}

module.exports = ExternalConverters;
