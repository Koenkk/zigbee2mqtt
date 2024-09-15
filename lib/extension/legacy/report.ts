import * as zhc from 'zigbee-herdsman-converters';

import logger from '../../util/logger';
import * as settings from '../../util/settings';
import utils from '../../util/utils';
import Extension from '../extension';

const defaultConfiguration = {
    minimumReportInterval: 3,
    maximumReportInterval: 300,
    reportableChange: 1,
};

const ZNLDP12LM = zhc.definitions.find((d) => d.model === 'ZNLDP12LM');

const devicesNotSupportingReporting = [
    zhc.definitions.find((d) => d.model === 'CC2530.ROUTER'),
    zhc.definitions.find((d) => d.model === 'BASICZBR3'),
    zhc.definitions.find((d) => d.model === 'ZM-CSW032-D'),
    zhc.definitions.find((d) => d.model === 'TS0001'),
    zhc.definitions.find((d) => d.model === 'TS0115'),
];

const reportKey = 1;

const getColorCapabilities = async (endpoint: zh.Endpoint): Promise<{colorTemperature: boolean; colorXY: boolean}> => {
    if (endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities') === undefined) {
        await endpoint.read('lightingColorCtrl', ['colorCapabilities']);
    }

    const value = endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities') as number;
    return {
        colorTemperature: (value & (1 << 4)) > 0,
        colorXY: (value & (1 << 3)) > 0,
    };
};

const clusters: {
    [s: string]: {
        attribute: string;
        minimumReportInterval: number;
        maximumReportInterval: number;
        reportableChange: number;
        condition?: (endpoint: zh.Endpoint) => Promise<boolean>;
    }[];
} = {
    genOnOff: [{attribute: 'onOff', ...defaultConfiguration, minimumReportInterval: 0, reportableChange: 0}],
    genLevelCtrl: [{attribute: 'currentLevel', ...defaultConfiguration}],
    lightingColorCtrl: [
        {
            attribute: 'colorTemperature',
            ...defaultConfiguration,
            condition: async (endpoint): Promise<boolean> => (await getColorCapabilities(endpoint)).colorTemperature,
        },
        {
            attribute: 'currentX',
            ...defaultConfiguration,
            condition: async (endpoint): Promise<boolean> => (await getColorCapabilities(endpoint)).colorXY,
        },
        {
            attribute: 'currentY',
            ...defaultConfiguration,
            condition: async (endpoint): Promise<boolean> => (await getColorCapabilities(endpoint)).colorXY,
        },
    ],
    closuresWindowCovering: [
        {attribute: 'currentPositionLiftPercentage', ...defaultConfiguration},
        {attribute: 'currentPositionTiltPercentage', ...defaultConfiguration},
    ],
};

export default class Report extends Extension {
    private queue: Set<string> = new Set();
    private failed: Set<string> = new Set();
    private enabled = settings.get().advanced.report;

    shouldIgnoreClusterForDevice(cluster: string, definition?: zhc.Definition): boolean {
        if (definition === ZNLDP12LM && cluster === 'closuresWindowCovering') {
            // Device announces it but doesn't support it
            // https://github.com/Koenkk/zigbee2mqtt/issues/2611
            return true;
        }

        return false;
    }

    async setupReporting(device: Device): Promise<void> {
        if (this.queue.has(device.ieeeAddr) || this.failed.has(device.ieeeAddr)) return;
        this.queue.add(device.ieeeAddr);

        const term1 = this.enabled ? 'Setup' : 'Disable';
        const term2 = this.enabled ? 'setup' : 'disabled';

        try {
            for (const ep of device.zh.endpoints) {
                for (const [cluster, configuration] of Object.entries(clusters)) {
                    if (ep.supportsInputCluster(cluster) && !this.shouldIgnoreClusterForDevice(cluster, device.definition)) {
                        logger.debug(`${term1} reporting for '${device.ieeeAddr}' - ${ep.ID} - ${cluster}`);

                        const items = [];
                        for (const entry of configuration) {
                            if (entry.condition == undefined || (await entry.condition(ep))) {
                                const toAdd = {...entry};
                                if (!this.enabled) toAdd.maximumReportInterval = 0xffff;
                                items.push(toAdd);
                                delete items[items.length - 1].condition;
                            }
                        }

                        if (this.enabled) {
                            await ep.bind(cluster, this.zigbee.firstCoordinatorEndpoint());
                        } else {
                            await ep.unbind(cluster, this.zigbee.firstCoordinatorEndpoint());
                        }

                        await ep.configureReporting(cluster, items);
                        logger.info(`Successfully ${term2} reporting for '${device.ieeeAddr}' - ${ep.ID} - ${cluster}`);
                    }
                }
            }

            if (this.enabled) {
                device.zh.meta.reporting = reportKey;
            } else {
                delete device.zh.meta.reporting;
                this.eventBus.emitReconfigure({device});
            }

            this.eventBus.emitDevicesChanged();
        } catch (error) {
            logger.error(`Failed to ${term1.toLowerCase()} reporting for '${device.ieeeAddr}' - ${(error as Error).stack}`);

            this.failed.add(device.ieeeAddr);
        }

        device.zh.save();
        this.queue.delete(device.ieeeAddr);
    }

    shouldSetupReporting(device: Device, messageType?: string): boolean {
        if (!device || !device.zh || !device.definition) return false;

        // Handle messages of type endDeviceAnnce and devIncoming.
        // This message is typically send when a device comes online after being powered off
        // Ikea TRADFRI tend to forget their reporting after powered off.
        // Re-setup reporting.
        // Only resetup reporting if configuredReportings was not populated yet,
        // else reconfigure is done in zigbee-herdsman-converters ikea.js/bulbOnEvent
        // configuredReportings are saved since Zigbee2MQTT 1.17.0
        // https://github.com/Koenkk/zigbee2mqtt/issues/966
        if (
            this.enabled &&
            messageType === 'deviceAnnounce' &&
            device.isIkeaTradfri() &&
            device.zh.endpoints.filter((e) => e.configuredReportings.length === 0).length === device.zh.endpoints.length
        ) {
            return true;
        }

        // These do not support reporting.
        // https://github.com/Koenkk/zigbee-herdsman/issues/110
        if (
            device.zh.manufacturerName === 'Philips' &&
            /* istanbul ignore next */
            (device.zh.softwareBuildID === '5.127.1.26581' || device.zh.softwareBuildID === '5.130.1.30000')
        ) {
            return false;
        }

        if (device.zh.interviewing === true) return false;
        if (device.zh.type !== 'Router' || device.zh.powerSource === 'Battery') return false;
        // Gledopto devices don't support reporting.
        if (devicesNotSupportingReporting.includes(device.definition) || device.definition.vendor === 'Gledopto') return false;

        if (this.enabled && device.zh.meta.reporting !== undefined && device.zh.meta.reporting === reportKey) {
            return false;
        }

        if (!this.enabled && device.zh.meta.reporting === undefined) {
            return false;
        }

        return true;
    }

    override async start(): Promise<void> {
        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            if (this.shouldSetupReporting(device, undefined)) {
                await this.setupReporting(device);
            }
        }

        this.eventBus.onDeviceAnnounce(this, (data) => this.onZigbeeEvent_('deviceAnnounce', data.device));
        this.eventBus.onDeviceMessage(this, (data) => this.onZigbeeEvent_('dummy', data.device));
        this.eventBus.onDeviceJoined(this, (data) => this.onZigbeeEvent_('dummy', data.device));
        this.eventBus.onDeviceNetworkAddressChanged(this, (data) => this.onZigbeeEvent_('dummy', data.device));
    }

    async onZigbeeEvent_(type: string, device: Device): Promise<void> {
        if (this.shouldSetupReporting(device, type)) {
            await this.setupReporting(device);
        }
    }
}
