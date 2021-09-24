// @ts-ignore
import zigbeeHerdsmanConverters from 'zigbee-herdsman-converters';
import logger from '../../util/logger';
import * as settings from '../../util/settings';
import * as utils from '../../util/utils';
import ExtensionTS from '../extensionts';

const defaultConfiguration = {
    minimumReportInterval: 3, maximumReportInterval: 300, reportableChange: 1,
};

const ZNLDP12LM = zigbeeHerdsmanConverters.devices.find((d: KeyValue) => d.model === 'ZNLDP12LM');

const devicesNotSupportingReporting = [
    zigbeeHerdsmanConverters.devices.find((d: KeyValue) => d.model === 'CC2530.ROUTER'),
    zigbeeHerdsmanConverters.devices.find((d: KeyValue) => d.model === 'BASICZBR3'),
    zigbeeHerdsmanConverters.devices.find((d: KeyValue) => d.model === 'ZM-CSW032-D'),
    zigbeeHerdsmanConverters.devices.find((d: KeyValue) => d.model === 'TS0001'),
    zigbeeHerdsmanConverters.devices.find((d: KeyValue) => d.model === 'TS0115'),
];

const reportKey = 1;

const getColorCapabilities = async (endpoint: ZHEndpoint): Promise<{colorTemperature: boolean, colorXY: boolean}> => {
    if (endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities') === undefined) {
        await endpoint.read('lightingColorCtrl', ['colorCapabilities']);
    }

    const value = endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities') as number;
    return {
        colorTemperature: (value & 1<<4) > 0,
        colorXY: (value & 1<<3) > 0,
    };
};

const clusters: {[s: string]:
    {attribute: string, minimumReportInterval: number, maximumReportInterval: number, reportableChange: number
        condition?: (endpoint: ZHEndpoint) => Promise<boolean>}[]} =
{
    'genOnOff': [
        {attribute: 'onOff', ...defaultConfiguration, minimumReportInterval: 0, reportableChange: 0},
    ],
    'genLevelCtrl': [
        {attribute: 'currentLevel', ...defaultConfiguration},
    ],
    'lightingColorCtrl': [
        {
            attribute: 'colorTemperature', ...defaultConfiguration,
            condition: async (endpoint): Promise<boolean> => (await getColorCapabilities(endpoint)).colorTemperature,
        },
        {
            attribute: 'currentX', ...defaultConfiguration,
            condition: async (endpoint): Promise<boolean> => (await getColorCapabilities(endpoint)).colorXY,
        },
        {
            attribute: 'currentY', ...defaultConfiguration,
            condition: async (endpoint): Promise<boolean> => (await getColorCapabilities(endpoint)).colorXY,
        },
    ],
    'closuresWindowCovering': [
        {attribute: 'currentPositionLiftPercentage', ...defaultConfiguration},
        {attribute: 'currentPositionTiltPercentage', ...defaultConfiguration},
    ],
};

class Report extends ExtensionTS {
    private queue: Set<string> = new Set();
    private failed: Set<string> = new Set();
    private enabled = settings.get().advanced.report;

    shouldIgnoreClusterForDevice(cluster: string, definition: Definition): boolean {
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
            for (const ep of device.endpoints) {
                for (const [cluster, configuration] of Object.entries(clusters)) {
                    if (ep.supportsInputCluster(cluster) &&
                        !this.shouldIgnoreClusterForDevice(cluster, device.definition)) {
                        logger.debug(`${term1} reporting for '${device.ieeeAddr}' - ${ep.ID} - ${cluster}`);

                        const items = [];
                        for (const entry of configuration) {
                            if (!entry.hasOwnProperty('condition') || (await entry.condition(ep))) {
                                const toAdd = {...entry};
                                if (!this.enabled) toAdd.maximumReportInterval = 0xFFFF;
                                items.push(toAdd);
                                delete items[items.length - 1].condition;
                            }
                        }

                        this.enabled ?
                            await ep.bind(cluster, this.zigbee.getFirstCoordinatorEndpoint()) :
                            await ep.unbind(cluster, this.zigbee.getFirstCoordinatorEndpoint());

                        await ep.configureReporting(cluster, items);
                        logger.info(
                            `Successfully ${term2} reporting for '${device.ieeeAddr}' - ${ep.ID} - ${cluster}`,
                        );
                    }
                }
            }

            if (this.enabled) {
                device.zhDevice.meta.reporting = reportKey;
            } else {
                delete device.zhDevice.meta.reporting;
                this.eventBus.emit('reportingDisabled', {device});
            }

            this.eventBus.emit(`devicesChanged`);
        } catch (error) {
            logger.error(
                `Failed to ${term1.toLowerCase()} reporting for '${device.ieeeAddr}' - ${error.stack}`,
            );

            this.failed.add(device.ieeeAddr);
        }

        device.zhDevice.save();
        this.queue.delete(device.ieeeAddr);
    }

    shouldSetupReporting(device: Device, messageType: string): boolean {
        if (!device || !device.zhDevice || !device.definition) return false;

        // Handle messages of type endDeviceAnnce and devIncoming.
        // This message is typically send when a device comes online after being powered off
        // Ikea TRADFRI tend to forget their reporting after powered off.
        // Re-setup reporting.
        // Only resetup reporting if configuredReportings was not populated yet,
        // else reconfigure is done in zigbee-herdsman-converters ikea.js/bulbOnEvent
        // configuredReportings are saved since Zigbee2MQTT 1.17.0
        // https://github.com/Koenkk/zigbee2mqtt/issues/966
        if (this.enabled && messageType === 'deviceAnnounce' && utils.isIkeaTradfriDevice(device.zhDevice) &&
            device.endpoints.filter((e) => e.configuredReportings.length === 0).length === device.endpoints.length) {
            return true;
        }

        // These do not support reproting.
        // https://github.com/Koenkk/zigbee-herdsman/issues/110
        const philipsIgnoreSw = ['5.127.1.26581', '5.130.1.30000'];
        if (device.manufacturerName === 'Philips' && philipsIgnoreSw.includes(device.softwareBuildID)) return false;

        if (device.zhDevice.interviewing === true) return false;
        if (device.type !== 'Router' || device.powerSource === 'Battery') return false;
        // Gledopto devices don't support reporting.
        if (devicesNotSupportingReporting.includes(device.definition) ||
            device.definition.vendor === 'Gledopto') return false;

        if (this.enabled && device.zhDevice.meta.hasOwnProperty('reporting') &&
            device.zhDevice.meta.reporting === reportKey) {
            return false;
        }

        if (!this.enabled && !device.zhDevice.meta.hasOwnProperty('reporting')) {
            return false;
        }

        return true;
    }

    override async start(): Promise<void> {
        for (const device of this.zigbee.getClients()) {
            if (this.shouldSetupReporting(device, null)) {
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

module.exports = Report;
