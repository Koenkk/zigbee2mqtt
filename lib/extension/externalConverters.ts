import {addDefinition, removeDefinition} from 'zigbee-herdsman-converters';

import logger from '../util/logger';
import ExternalJSExtension from './externalJS';

type ModuleExports = ExternalDefinition | ExternalDefinition[];

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

    protected async removeJS(name: string, module: ModuleExports): Promise<void> {
        for (const definition of this.getDefinitions(module)) {
            // TODO: implement in ZHC
            removeDefinition(definition);
        }
    }

    protected async loadJS(name: string, module: ModuleExports): Promise<void> {
        for (const definition of this.getDefinitions(module)) {
            try {
                // TODO: `updateDefinition` in ZHC instead? (add if not exist, replace if exist)
                removeDefinition(definition);
                addDefinition(definition);
                logger.info(`Loaded external converter '${name}'.`);
            } catch (error) {
                logger.error(`Failed to load external converter '${name}'`);
                logger.error(`Check the code for syntax error and make sure it is up to date with the current Zigbee2MQTT version.`);
                logger.error(
                    `External converters are not meant for long term usage, but for local testing after which a pull request should be created to add out-of-the-box support for the device`,
                );

                throw error;
            }
        }
    }

    private getDefinitions(module: ModuleExports): ExternalDefinition[] {
        return Array.isArray(module) ? module : [module];
    }
}
