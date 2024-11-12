import type Extension from './extension';

import logger from '../util/logger';
import * as settings from '../util/settings';
import ExternalJSExtension from './externalJS';

type ModuleExports = typeof Extension;

export default class ExternalExtensions extends ExternalJSExtension<ModuleExports> {
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

    protected async removeJS(name: string, module: ModuleExports): Promise<void> {
        await this.enableDisableExtension(false, module.name);
    }

    protected async loadJS(name: string, module: ModuleExports): Promise<void> {
        // stop if already started
        await this.enableDisableExtension(false, module.name);
        await this.addExtension(
            // @ts-expect-error `module` is the interface, not the actual passed class
            new module(
                this.zigbee,
                this.mqtt,
                this.state,
                this.publishEntityState,
                this.eventBus,
                this.enableDisableExtension,
                this.restartCallback,
                this.addExtension,
                settings,
                logger,
            ),
        );

        logger.info(`Loaded external extension '${name}'.`);
    }
}
