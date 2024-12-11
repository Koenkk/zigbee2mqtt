import type * as zhc from 'zigbee-herdsman-converters';

import {addDefinition, removeExternalDefinitions} from 'zigbee-herdsman-converters';

import logger from '../util/logger';
import ExternalJSExtension from './externalJS';

type ModuleExports = zhc.Definition | zhc.Definition[];

export default class ExternalConverters extends ExternalJSExtension<ModuleExports> {
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
    protected async removeJS(name: string, module: ModuleExports): Promise<void> {
        removeExternalDefinitions(name);

        await this.zigbee.resolveDevicesDefinitions(true);
    }

    protected async loadJS(name: string, module: ModuleExports): Promise<void> {
        try {
            removeExternalDefinitions(name);

            for (const definition of this.getDefinitions(module)) {
                definition.externalConverterName = name;

                addDefinition(definition);
                logger.info(`Loaded external converter '${name}'.`);
            }

            await this.zigbee.resolveDevicesDefinitions(true);
        } catch (error) {
            logger.error(`Failed to load external converter '${name}'`);
            logger.error(`Check the code for syntax error and make sure it is up to date with the current Zigbee2MQTT version.`);
            logger.error(
                `External converters are not meant for long term usage, but for local testing after which a pull request should be created to add out-of-the-box support for the device`,
            );

            throw error;
        }
    }

    private getDefinitions(module: ModuleExports): zhc.Definition[] {
        return Array.isArray(module) ? module : [module];
    }
}
