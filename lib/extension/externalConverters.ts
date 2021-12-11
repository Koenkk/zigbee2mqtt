import zhc from 'zigbee-herdsman-converters';
import * as settings from '../util/settings';
import utils from '../util/utils';
import Extension from './extension';

export default class ExternalConverters extends Extension {
    constructor(zigbee: Zigbee, mqtt: MQTT, state: State, publishEntityState: PublishEntityState,
        eventBus: EventBus, enableDisableExtension: (enable: boolean, name: string) => Promise<void>,
        restartCallback: () => void, addExtension: (extension: Extension) => Promise<void>) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);

        for (const definition of utils.getExternalConvertersDefinitions(settings.get())) {
            const toAdd = {...definition};
            delete toAdd['homeassistant'];
            zhc.addDeviceDefinition(toAdd);
        }
    }
}
