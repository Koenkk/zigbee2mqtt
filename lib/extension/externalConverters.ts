import type {ExternalDefinitionWithExtend} from 'zigbee-herdsman-converters';

import {addExternalDefinition, removeExternalDefinitions} from 'zigbee-herdsman-converters';

import logger from '../util/logger';
import ExternalJSExtension from './externalJS';

type TModule = ExternalDefinitionWithExtend | ExternalDefinitionWithExtend[];

export default class ExternalConverters extends ExternalJSExtension<TModule> {
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
        super(
            zigbee,
            mqtt,
            state,
            publishEntityState,
            eventBus,
            enableDisableExtension,
            restartCallback,
            addExtension,
            'converter',
            'external_converters',
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async removeJS(name: string, mod: TModule): Promise<void> {
        removeExternalDefinitions(name);

        await this.zigbee.resolveDevicesDefinitions(true);
    }

    protected async loadJS(name: string, mod: TModule, newName?: string): Promise<void> {
        try {
            removeExternalDefinitions(name);

            const definitions = Array.isArray(mod) ? mod : [mod];

            for (const definition of definitions) {
                definition.externalConverterName = newName ?? name;

                addExternalDefinition(definition);
                logger.info(`Loaded external converter '${newName ?? name}'.`);
            }

            await this.zigbee.resolveDevicesDefinitions(true);
        } catch (error) {
            logger.error(
                /* v8 ignore next */
                `Failed to load external converter '${newName ?? name}'. Check the code for syntax error and make sure it is up to date with the current Zigbee2MQTT version.`,
            );
            logger.warning(
                `External converters are not meant for long term usage, but for local testing after which a pull request should be created to add out-of-the-box support for the device`,
            );

            throw error;
        }
    }
}
