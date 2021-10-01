// @ts-ignore
import zhc from 'zigbee-herdsman-converters';
import * as settings from '../util/settings';
import * as utils from '../util/utils';
import ExtensionTS from './extensionts';

class ExternalConverters extends ExtensionTS {
    override async start(): Promise<void> {
        for (const definition of utils.getExternalConvertersDefinitions(settings)) {
            const toAdd = {...definition};
            delete toAdd['homeassistant'];
            zhc.addDeviceDefinition(toAdd);
        }
    }
}

module.exports = ExternalConverters;
