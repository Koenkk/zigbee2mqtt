import * as zhc from 'zigbee-herdsman-converters';

import logger from '../util/logger';
import * as settings from '../util/settings';
import {loadExternalConverter} from '../util/utils';
import Extension from './extension';

export default class ExternalConverters extends Extension {
    constructor(
        zigbee: Zigbee,
        mqtt: MQTT,
        state: State,
        publishEntityState: PublishEntityState,
        eventBus: EventBus,
        enableDisableExtension: (enable: boolean, name: string) => Promise<void>,
        restartCallback: () => Promise<void>,
        addExtension: (extension: Extension) => Promise<void>,
    ) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);

        for (const file of settings.get().external_converters) {
            try {
                for (const definition of loadExternalConverter(file)) {
                    const toAdd = {...definition};
                    delete toAdd['homeassistant'];
                    zhc.addDefinition(toAdd);
                }
                logger.info(`Loaded external converter '${file}'`);
            } catch (error) {
                logger.error(`Failed to load external converter file '${file}' (${(error as Error).message})`);
                logger.error(
                    `Probably there is a syntax error in the file or the external converter is not ` +
                        `compatible with the current Zigbee2MQTT version`,
                );
                logger.error(
                    `Note that external converters are not meant for long term usage, it's meant for local ` +
                        `testing after which a pull request should be created to add out-of-the-box support for the device`,
                );
            }
        }
    }
}
