import Extension from './extension';
import logger from '../util/logger';
import equals from 'fast-deep-equal/es6';
import utils from '../util/utils';
import * as settings from '../util/settings';
import bind from 'bind-decorator';
import stringify from 'json-stable-stringify-without-jsonify';
import Device from '../model/device';
import Group from '../model/group';
import data from '../util/data';
import * as zhc from 'zigbee-herdsman-converters';

import path from 'path';
import {promises as fs} from 'fs';
import {pathToFileURL} from 'url';
import {ExecException, exec} from 'child_process';
import EventEmitter from 'events';

/* The extension bridge.ts doesn't export DefinitionPayload so we need to redefine it here */
type DefinitionPayload = {
    model: string, vendor: string, description: string, exposes: zhc.Expose[], supports_ota:
    boolean, icon: string, options: zhc.Expose[],
};


// Types, interfaces and classes needed to dinamically load Matterbridge and Matterbridge plugin

const enum LogLevel {
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    DEBUG = 'debug'
}

declare class AnsiLogger {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    debug: (...data: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    info: (...data: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    warn: (...data: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error: (...data: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    log: (level: LogLevel, message: string, ...parameters: any[]) => void;
}

interface MatterbridgeModule {
    Matterbridge: {
        loadInstance: () => Promise<Matterbridge>;
    };
}

interface PluginModule {
    default(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig): ZigbeePlatform;
    ZigbeeDevice: new (platform: ZigbeePlatform, device: BridgeDevice) => ZigbeeDevice;
    ZigbeeGroup: new (platform: ZigbeePlatform, group: BridgeGroup) => ZigbeeGroup;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Module = any;
type BridgeDevice = object;
type BridgeGroup = object;

// PlatformConfig types
type PlatformConfigValue = string | number | boolean | bigint | object | undefined | null;

type PlatformConfig = {
  [key: string]: PlatformConfigValue;
};

type PayloadValue = string | number | boolean | bigint | object | undefined | null;

type Payload = {
  [key: string]: PayloadValue;
};

declare class ZigbeeEntity extends EventEmitter {
    constructor(platform: ZigbeePlatform, entity: BridgeDevice | BridgeGroup);
    device: BridgeDevice | undefined;
    group: BridgeGroup | undefined;
    isDevice: boolean;
    isGroup: boolean;
    bridgedDevice: BridgedBaseDevice | undefined;
}

declare class ZigbeeDevice extends ZigbeeEntity {
    constructor(platform: ZigbeePlatform, device: BridgeDevice);
}

declare class ZigbeeGroup extends ZigbeeEntity {
    constructor(platform: ZigbeePlatform, group: BridgeGroup);
}

declare class BridgedBaseDevice extends MatterbridgeDevice {
}

declare class ZigbeePlatform {
    name: string;
    setPublishCallBack(onPublish: (entityName: string, topic: string, message: string) => Promise<void>): void;
    setPermitJoinCallBack(onPermitJoin: (entityName: string, permit: boolean) => Promise<void>): void;
    emit(eventName: string, data: Payload): void;
}

declare class MatterbridgeDevice {
    serialNumber: string | undefined;
    deviceName: string | undefined;
    uniqueId: string | undefined;
}

declare class Matterbridge {
    matterbridgeVersion: string;
    matterbridgeLatestVersion: string;
    log: AnsiLogger;
    startExtension(dataPath: string, debugEnabled: boolean, extensionVersion: string,
        port?: number): Promise<boolean>;
    stopExtension(): Promise<void>;
    isExtensionCommissioned(): boolean;
    addBridgedDevice(pluginName: string, device: MatterbridgeDevice): Promise<void>;
    removeBridgedDevice(pluginName: string, device: MatterbridgeDevice): Promise<void>;
    removeAllBridgedDevices(pluginName: string): Promise<void>;
}

/*
TO DECIDE:
- should I implement the installOnStart? (exec: npm -g install matterbridge matterbridge-zigbee2mqtt)
- should I implement the resetOnStart? Or the frontend can expose a button
    to reset the commissioning.
- should I implement the unregisterOnStop? (e.g. unregister all devices on stop?)
- qrCode and manual pairing code: can the frontend show the qrCode and manual pairing code?

TODO:
- Implement the switch_list, light_list, outlet_list, ignore_feature_list, ignore_device_feature_list
*/

export default class Matter extends Extension {
    private mqttBaseTopic = settings.get().mqtt.base_topic;
    private enabled = settings.get().matterbridge.enabled;
    private installOnStart = settings.get().matterbridge.install_on_start;
    private resetOnStart = settings.get().matterbridge.reset_on_start;
    private unregisterOnStop = settings.get().matterbridge.unregister_on_stop;
    private debugEnabled = settings.get().matterbridge.debug_level === 0;
    private whiteList = settings.get().matterbridge.white_list;
    private blackList = settings.get().matterbridge.black_list;

    private version = '1.0.0';
    private isLoaded = false;
    private globalNodeModulesDir = '';
    private loggerNamespace = 'Matter';
    private matterbridgeDirectory = '';
    private matterbridgeModule: MatterbridgeModule;
    private pluginModule: PluginModule;
    private matterbridge: Matterbridge | undefined;
    private platform: ZigbeePlatform | undefined;
    private platformConfig: PlatformConfig = {name: 'matterbridge-zigbee2mqtt', type: 'MatterbridgeExtension'};

    private startInterval: NodeJS.Timeout | undefined;
    private failsafeIntervalCounter = 0;
    private bridgedEntity: ZigbeeEntity[] = [];

    constructor(zigbee: Zigbee, mqtt: MQTT, state: State, publishEntityState: PublishEntityState,
        eventBus: EventBus, enableDisableExtension: (enable: boolean, name: string) => Promise<void>,
        restartCallback: () => void, addExtension: (extension: Extension) => Promise<void>) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);
        // Set events handlers.
        this.eventBus.onMQTTMessagePublished(this, this.onMQTTPublishMessage);
        // this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onStateChange(this, this.onStateChange);
        this.eventBus.onDeviceLeave(this, this.onDeviceLeave);
        this.eventBus.onDeviceJoined(this, this.onDeviceJoined);
        this.eventBus.onDeviceAnnounce(this, this.onDeviceAnnounce);
        this.eventBus.onDeviceRemoved(this, this.onDeviceRemoved);
        this.eventBus.onDeviceInterview(this, this.onDeviceInterview);
        this.eventBus.onPermitJoinChanged(this, this.onPermitJoinChanged);
    }

    override async start(): Promise<void> {
        if (!this.enabled) return;
        logger.info(`Starting Matterbridge extension v. ${this.version}`, this.loggerNamespace);

        // Dynamically load Matterbridge and Matterbridge plugin modules
        try {
            await this.mkDataDirectory();
            this.globalNodeModulesDir = await this.getGlobalNodeModulesDir();
            this.matterbridgeModule = await this.loadESModule('matterbridge') as MatterbridgeModule;
            this.pluginModule = await this.loadESModule('matterbridge-zigbee2mqtt') as PluginModule;
            if (this.matterbridgeModule && this.pluginModule) {
                this.matterbridge = await this.matterbridgeModule.Matterbridge.loadInstance();
                await this.matterbridge.startExtension(this.matterbridgeDirectory,
                    this.debugEnabled, this.version);
                this.platform = this.pluginModule.default(this.matterbridge, this.matterbridge.log,
                    this.platformConfig);
                this.platform.name = 'MatterbridgeExtension';
                this.platform.setPublishCallBack(this.onPublish);
                this.platform.setPermitJoinCallBack(this.onPermitJoin);
                this.isLoaded = true;
                logger.info(`Matterbridge v. ${this.matterbridge.matterbridgeVersion} `+
                    `loaded with platform ${this.platform.name}`, this.loggerNamespace);
            } else {
                logger.warning('Matterbridge extension not loaded', this.loggerNamespace);
                return;
            }
        } catch (err) {
            logger.warning('Matterbridge extension not loaded', this.loggerNamespace);
            return;
        }

        this.startInterval = setInterval(async () => {
            // The advertise for the commissioning server is active for 15 minutes
            this.failsafeIntervalCounter++;
            if (this.failsafeIntervalCounter >= 15 * 6) {
                clearInterval(this.startInterval);
                this.startInterval = undefined;
                logger.info('Pairing interval is expired!', this.loggerNamespace);
                return;
            }

            // Register devices and groups only if Matterbridge is commissioned.
            // This is to avoid to confirm 4/5 times for each device and group with the Home app!
            if (!this.matterbridge.isExtensionCommissioned()) {
                // logger.info('Matterbridge extension not commissioned', this.loggerNamespace);
                return;
            }

            // Clear the interval
            clearInterval(this.startInterval);
            this.startInterval = undefined;

            // Register devices
            await this.registerDevices();

            // Register groups
            await this.registerGroups();

            // Send initial state for all devices and groups
            for (const entity of [...this.zigbee.devices(false), ...this.zigbee.groups()]) {
                if (this.state.exists(entity)) {
                    logger.debug(`Sending initial state for ${entity.name}: `+
                        `${stringify(this.state.get(entity))}`, this.loggerNamespace);
                    this.platform.emit('MESSAGE-'+entity.name, this.state.get(entity));
                }
            }

            // Send initial state for coordinator
            this.platform.emit('MESSAGE-Coordinator',
                this.zigbee.getPermitJoin()?{'state': 'UNLOCK'}:{'state': 'LOCK'});
            // TODO: add the TI router state
        }, 10 * 1000);
    }

    @bind private onMQTTPublishMessage(data: eventdata.MQTTMessagePublished): void {
        if (!this.isLoaded) return;
        if (!data.topic.startsWith(`${this.mqttBaseTopic}/`)) return;
        const topicParts = data.topic.split('/');
        if (topicParts.length < 2) return;
        if (topicParts[1]===`bridge`) return;
        const entity = this.zigbee.resolveEntity(topicParts[1]);
        if (topicParts[2]===`availability`) {
            if (data.payload === utils.availabilityPayload('online', settings.get())) {
                logger.debug(`Received MQTT message with availability online for ${entity.name}: `+
                    `${data.payload}`, this.loggerNamespace);
                this.platform.emit('ONLINE-'+entity.name, {});
            }
            if (data.payload === utils.availabilityPayload('offline', settings.get())) {
                logger.debug(`Received MQTT message with availability offline for ${entity.name}: `+
                    `${data.payload}`, this.loggerNamespace);
                this.platform.emit('OFFLINE-'+entity.name, {});
            }
        }
    }

    @bind async onDeviceLeave(data: eventdata.DeviceLeave): Promise<void> {
        if (!this.isLoaded) return;
        // logger.warning(`Device ${data.name} left z2m`, this.loggerNamespace);
        const entity = this.bridgedEntity.find((d) => d.bridgedDevice.serialNumber.startsWith(data.ieeeAddr));
        if (entity) {
            await this.matterbridge.removeBridgedDevice('MatterbridgeExtension', entity.bridgedDevice);
            logger.warning(`Device ${data.name} removed from the bridge`, this.loggerNamespace);
            // Remove the entity from the bridgedEntity array
            this.bridgedEntity = this.bridgedEntity.filter((d) => d !== entity);
        }
    }

    @bind async onDeviceRemoved(data: eventdata.DeviceRemoved): Promise<void> {
        if (!this.isLoaded) return;
        // logger.warning(`Device ${data.name} removed from z2m`, this.loggerNamespace);
        const entity = this.bridgedEntity.find((d) => d.bridgedDevice.serialNumber.startsWith(data.ieeeAddr));
        if (entity) {
            await this.matterbridge.removeBridgedDevice('MatterbridgeExtension', entity.bridgedDevice);
            logger.warning(`Device ${data.name} removed from the bridge`, this.loggerNamespace);
            // Remove the entity from the bridgedEntity array
            this.bridgedEntity = this.bridgedEntity.filter((d) => d !== entity);
        }
    }

    @bind async onDeviceJoined(data: eventdata.DeviceJoined): Promise<void> {
        if (!this.isLoaded) return;
        logger.info(`Device ${data.device.name} joined`, this.loggerNamespace);
        // Nothing to do here... we wait for the interview to complete successfully
    }

    @bind async onDeviceAnnounce(data: eventdata.DeviceAnnounce): Promise<void> {
        if (!this.isLoaded) return;
        logger.info(`Device ${data.device.name} announce`, this.loggerNamespace);
        // TODO: Check if the device is already registered?
    }

    @bind async onDeviceInterview(data: eventdata.DeviceInterview): Promise<void> {
        if (!this.isLoaded) return;
        if (data.status === 'successful') {
            await this.registerDevice(data.device);
            this.platform.emit('ONLINE-'+data.device.name, {});
        }
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        if (!this.isLoaded) return;
        const topicParts = data.topic.split('/');
        const entity = this.zigbee.resolveEntity(topicParts[1]);
        const message = utils.parseJSON(data.message, data.message);
        logger.debug(`Received MQTT message for ${entity?.name}: `+
            `${data.topic} ${stringify(message)}`, this.loggerNamespace);
    }

    @bind async onStateChange(data: eventdata.StateChange): Promise<void> {
        if (!this.isLoaded) return;
        if (data.update && Object.keys(data.update).length && !equals(data.from, data.to)) {
            logger.debug(`Received state change for ${data.entity.name}: `+
                `${stringify(data.update)}`, this.loggerNamespace);
            this.platform.emit('MESSAGE-'+data.entity.name, data.update);
        }
    }

    @bind async onPermitJoinChanged(data: eventdata.PermitJoinChanged): Promise<void> {
        if (!this.isLoaded) return;
        this.platform.emit('MESSAGE-Coordinator',
            data.permitted?{'state': 'UNLOCK'}:{'state': 'LOCK'});
    }

    override async stop(): Promise<void> {
        await super.stop(); // Remove the listeners
        if (!this.isLoaded) return;

        // Clear the interval if it's still running
        if (this.startInterval) clearInterval(this.startInterval);
        this.startInterval = undefined;
        this.failsafeIntervalCounter = 0;

        // Close and clean up the Matterbridge extension
        if (this.matterbridge) await this.matterbridge.stopExtension();
        this.matterbridge = undefined;
        this.platform = undefined;
        this.isLoaded = false;
        logger.info('Stopped Matterbridge extension', this.loggerNamespace);
    }

    /**
     * Callback that handles the publish from platform for a specific entity.
     * @param {string} entityName - The name of the entity.
     * @param {string} topic - The topic of the message.
     * @param {string} message - The message payload.
     * @return {Promise<void>} A promise that resolves when the event is handled.
     */
    @bind async onPublish(entityName: string, topic: string, message: string): Promise<void> {
        logger.debug(`onPublish entity: ${entityName} topic: ${topic} message: ${message}`, this.loggerNamespace);
        const entity = this.zigbee.resolveEntity(entityName);
        if (entity) {
            if (topic === 'set') {
                this.mqtt.onMessage(`${this.mqttBaseTopic}/${entity.name}/set`, Buffer.from(message));
            }
        }
    }

    /**
     * Callback that handles the permit join functionality from platform for the coordinator or TI router entity.
     * e.g. "Siri open the coordinator"
     * @param {string} entityName - The name of the Zigbee entity.
     * @param {boolean} permit - A boolean value indicating whether to permit or deny join.
     * @return {Promise<void>} - A promise that resolves when the permit join operation is completed.
     */
    @bind async onPermitJoin(entityName: string, permit: boolean): Promise<void> {
        logger.debug(`onPermitJoin entity: ${entityName} permit: ${permit}`, this.loggerNamespace);
        const entity = this.zigbee.resolveEntity(entityName);
        if (entity && entity.isDevice) this.zigbee.permitJoin(permit, entity as Device);
        else this.zigbee.permitJoin(permit);
    }

    /**
     * Registers all the devices with the Matterbridge extension.
     *
     * @return {Promise<void>} A Promise that resolves when all devices are registered.
     */
    private async registerDevices(): Promise<void> {
        for (const device of this.zigbee.devices(true)) {
            await this.registerDevice(device);
        }
    }

    /**
     * Registers a device with the Matterbridge extension.
     *
     * @param {Device} device - The device to register.
     * @return {Promise<void>} - A promise that resolves when the device is registered.
     */
    private async registerDevice(device: Device): Promise<void> {
        const getDefinition = (device: Device): DefinitionPayload => {
            if (!device.definition) return null;
            return {
                model: device.definition.model,
                vendor: device.definition.vendor,
                description: device.definition.description,
                exposes: device.exposes(),
                supports_ota: !!device.definition.ota,
                options: device.definition.options,
                icon: undefined,
            };
        };
        const zigbeeDevice = {
            ieee_address: device.ieeeAddr,
            type: device.zh.type,
            network_address: device.zh.networkAddress,
            supported: device.isSupported,
            friendly_name: device.name,
            disabled: !!device.options.disabled,
            description: device.options.description,
            definition: getDefinition(device),
            power_source: device.zh.powerSource,
            software_build_id: device.zh.softwareBuildID,
            date_code: device.zh.dateCode,
            model_id: device.zh.modelID,
            interviewing: device.zh.interviewing,
            interview_completed: device.zh.interviewCompleted,
            manufacturer: device.zh.manufacturerName,
        };
        if (this.validateWhiteBlackList(zigbeeDevice.friendly_name) === false) return;
        logger.info(`Adding device: ${zigbeeDevice.friendly_name}`, this.loggerNamespace);
        const matterDevice: ZigbeeDevice = new this.pluginModule.ZigbeeDevice(this.platform, zigbeeDevice);
        if (matterDevice.bridgedDevice) {
            this.bridgedEntity.push(matterDevice);
            await this.matterbridge.addBridgedDevice('MatterbridgeExtension', matterDevice.bridgedDevice);
        } else {
            logger.warning(`Device: ${zigbeeDevice.friendly_name} not registered`, this.loggerNamespace);
        }
    }

    /**
     * Registers the groups with the Matterbridge extension.
     *
     * @return {Promise<void>} A Promise that resolves when all groups are registered.
     */
    private async registerGroups(): Promise<void> {
        for (const group of this.zigbee.groups()) {
            await this.registerGroup(group);
        }
    }

    /**
     * Registers a group with the Matterbridge extension..
     * @param {Group} group - The group to register.
     * @return {Promise<void>} A promise that resolves when the group is registered successfully.
     */
    private async registerGroup(group: Group): Promise<void> {
        const zigbeeGroup = {
            id: group.ID,
            friendly_name: group.ID === 901 ? 'default_bind_group' : group.name,
            description: group.options.description,
            scenes: utils.getScenes(group.zh),
            members: group.zh.members.map((e) => {
                return {ieee_address: e.getDevice().ieeeAddr, endpoint: e.ID};
            }),
        };
        if (this.validateWhiteBlackList(zigbeeGroup.friendly_name) === false) return;
        logger.info(`Adding group: ${zigbeeGroup.friendly_name}`, this.loggerNamespace);
        const matterGroup: ZigbeeGroup = new this.pluginModule.ZigbeeGroup(this.platform, zigbeeGroup);
        if (matterGroup.bridgedDevice) {
            this.bridgedEntity.push(matterGroup);
            await this.matterbridge.addBridgedDevice('MatterbridgeExtension', matterGroup.bridgedDevice);
        } else {
            logger.warning(`Group: ${zigbeeGroup.friendly_name} not registered`, this.loggerNamespace);
        }
    }

    /**
     * Validates whether the given entity name is allowed based on the white and black lists.
     * @param {string} entityName - The name of the entity to be validated.
     * @return {boolean} - Returns `true` if the entity is allowed, `false` otherwise.
     */
    public validateWhiteBlackList(entityName: string): boolean {
        if (this.whiteList && this.whiteList.length > 0 && !this.whiteList.find((name) => name === entityName)) {
            logger.info(`Skipping ${entityName} because not in whitelist`, this.loggerNamespace);
            return false;
        }
        if (this.blackList && this.blackList.length > 0 && this.blackList.find((name) => name === entityName)) {
            logger.info(`Skipping ${entityName} because in blacklist`, this.loggerNamespace);
            return false;
        }
        return true;
    }

    // Adapted from Matterbridge loadPlugin method

    /**
     * Loads an ES module dynamically from commonjs module (thanks typescript!!!).
     *
     * @param  {string} moduleName - The name of the module to load.
     * @return {Promise<Module>} A promise that resolves to the loaded module.
     * @throws If the module fails to load.
     */
    private async loadESModule(moduleName: string): Promise<Module> {
        const modulePath = path.join(this.globalNodeModulesDir, moduleName, 'package.json');
        logger.debug(`Loading ES module package: ${modulePath}`, this.loggerNamespace);
        try {
            // Load the package.json of the plugin
            const packageJson = JSON.parse(await fs.readFile(modulePath, 'utf8'));
            logger.debug(`Loading ES module name: ${packageJson.name} `+
                `version: ${packageJson.version}`, this.loggerNamespace);
            // Resolve the main module path relative to package.json
            const moduleMain = path.resolve(path.dirname(modulePath), packageJson.main);
            logger.debug(`Loading ES module main: ${moduleMain}`, this.loggerNamespace);
            // Get the file URL
            const moduleUrl = pathToFileURL(moduleMain);
            logger.debug(`Loading ES module url: ${moduleUrl.toString()}`, this.loggerNamespace);
            // Dynamically import the plugin
            const module: Module = await eval(`import('${moduleUrl}')`);
            logger.info(`Loaded ES module ${moduleName}`, this.loggerNamespace);
            return Promise.resolve(module);
        } catch (err) {
            logger.info(`Failed to load ES module ${moduleName} error: ${err}`, this.loggerNamespace);
            logger.info(`Try with: npm install -g matterbridge matterbridge-zigbee2mqtt`, this.loggerNamespace);
            return Promise.reject(new Error(`Failed to load ES module ${module} error: ${err}`));
        }
    }

    // From here simply copied from Matterbridge

    /**
     * Creates the data directory (all storages for Matter) for Matterbridge in the data directory.
     * @return {Promise<void>} A Promise that resolves when the data directory is created.
     */
    private async mkDataDirectory(): Promise<void> {
        // Create the data directory matterbridge in the data directory
        this.matterbridgeDirectory = path.join(data.getPath(), 'matterbridge');
        try {
            await fs.access(this.matterbridgeDirectory);
        } catch (err) {
            if (err instanceof Error) {
                const nodeErr = err as NodeJS.ErrnoException;
                if (nodeErr.code === 'ENOENT') {
                    try {
                        await fs.mkdir(this.matterbridgeDirectory, {recursive: true});
                        logger.debug(`Created Matterbridge data directory: `+
                            `${this.matterbridgeDirectory}`, this.loggerNamespace);
                    } catch (err) {
                        logger.error(`Error creating Matterbridge data directory: ${err}`, this.loggerNamespace);
                        return Promise.reject(err);
                    }
                } else {
                    logger.error(`Error accessing Matterbridge data directory: ${err}`);
                    return Promise.reject(err);
                }
            }
        }
        logger.debug(`Matterbridge data directory: ${this.matterbridgeDirectory}`, this.loggerNamespace);
        return Promise.resolve();
    }

    /**
    * Retrieves the path to the global Node.js modules directory.
    * @return {Promise<string>} A promise that resolves to the path of the global Node.js modules directory.
    */
    private async getGlobalNodeModulesDir(): Promise<string> {
        return new Promise((resolve, reject) => {
            exec('npm root -g', (error: ExecException | null, stdout: string) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    }
}

