import type Extension from './extension';

import logger from '../util/logger';
import * as settings from '../util/settings';
import ExternalJSExtension from './externalJS';

type TModule = new (...args: ConstructorParameters<typeof Extension>) => Extension;

export default class ExternalExtensions extends ExternalJSExtension<TModule> {
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
            'extension',
            'external_extensions',
        );
    }

    protected async removeJS(name: string, mod: TModule): Promise<void> {
        await this.enableDisableExtension(false, mod.name);
    }

    protected async loadJS(name: string, mod: TModule, newName?: string): Promise<void> {
        try {
            // stop if already started
            await this.enableDisableExtension(false, mod.name);
            await this.addExtension(
                new mod(
                    this.zigbee,
                    this.mqtt,
                    this.state,
                    this.publishEntityState,
                    this.eventBus,
                    this.enableDisableExtension,
                    this.restartCallback,
                    this.addExtension,
                    // @ts-expect-error additional params that don't fit the internal `Extension` type
                    settings,
                    logger,
                ),
            );

            /* v8 ignore start */
            logger.info(`Loaded external extension '${newName ?? name}'.`);
        } catch (error) {
            logger.error(
                /* v8 ignore next */
                `Failed to load external extension '${newName ?? name}'. Check the code for syntax error and make sure it is up to date with the current Zigbee2MQTT version.`,
            );

            throw error;
        }
        /* v8 ignore stop */
    }
}
