const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const logger = require('../util/logger');
const CC2530Router = zigbeeHerdsmanConverters.devices.find((d) => d.model === 'CC2530.ROUTER');
const utils = require('../util/utils');
const BaseExtension = require('./baseExtension');

const defaultConfiguration = {
    minimumReportInterval: 3, maximumReportInterval: 300, reportableChange: 0,
};

const reportKey = 1;

const clusters = {
    'genOnOff': [
        {attribute: 'onOff', ...defaultConfiguration, minimumReportInterval: 0, reportableChange: 0},
    ],
    'genLevelCtrl': [
        {attribute: 'currentLevel', ...defaultConfiguration},
    ],
    'lightingColorCtrl': [
        {attribute: 'colorTemperature', ...defaultConfiguration},
        {attribute: 'currentX', ...defaultConfiguration},
        {attribute: 'currentY', ...defaultConfiguration},
    ],
    'closuresWindowCovering': [
        {attribute: 'currentPositionLiftPercentage', ...defaultConfiguration},
        {attribute: 'currentPositionTiltPercentage', ...defaultConfiguration},
    ],
};

class DeviceReport extends BaseExtension {
    constructor(zigbee, mqtt, state, publishEntityState) {
        super(zigbee, mqtt, state, publishEntityState);
        this.configuring = new Set();
        this.failed = new Set();
    }

    async setupReporting(device) {
        if (this.configuring.has(device.ieeeAddr) || this.failed.has(device.ieeeAddr)) return;
        this.configuring.add(device.ieeeAddr);

        try {
            for (const endpoint of device.endpoints) {
                for (const [cluster, configuration] of Object.entries(clusters)) {
                    if (endpoint.supportsInputCluster(cluster)) {
                        logger.debug(`Setup reporting for '${device.ieeeAddr}' - ${endpoint.ID} - ${cluster}`);
                        await endpoint.bind(cluster, this.coordinatorEndpoint);
                        await endpoint.configureReporting(cluster, configuration);
                        logger.info(
                            `Succesfully setup reporting for '${device.ieeeAddr}' - ${endpoint.ID} - ${cluster}`
                        );
                    }
                }
            }

            // eslint-disable-next-line
            device.meta.reporting = reportKey;
        } catch (error) {
            logger.error(
                `Failed to setup reporting for '${device.ieeeAddr}' - ${error.stack}`
            );

            this.failed.add(device.ieeeAddr);
        }

        device.save();
        this.configuring.delete(device.ieeeAddr);
    }

    shouldSetupReporting(mappedDevice, device, messageType) {
        if (!device) return false;

        // Handle messages of type endDeviceAnnce and devIncoming.
        // This message is typically send when a device comes online after being powered off
        // Ikea TRADFRI tend to forget their reporting after powered off.
        // Re-setup reporting.
        // https://github.com/Koenkk/zigbee2mqtt/issues/966
        if (messageType === 'deviceAnnounce' && utils.isIkeaTradfriDevice(device)) return true;

        if (device.meta.hasOwnProperty('reporting') && device.meta.reporting === reportKey) return false;
        if (!utils.isRouter(device) || utils.isBatteryPowered(device)) return false;
        if (mappedDevice === CC2530Router) return false;
        return true;
    }

    async onZigbeeStarted() {
        this.coordinatorEndpoint = this.zigbee.getDevicesByType('Coordinator')[0].endpoints[0];

        for (const device of this.zigbee.getClients()) {
            const mappedDevice = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
            if (this.shouldSetupReporting(mappedDevice, device, null)) {
                this.setupReporting(device);
            }
        }
    }

    onZigbeeEvent(type, data, mappedDevice, settingsDevice) {
        if (this.shouldSetupReporting(mappedDevice, data.device, type)) {
            this.setupReporting(data.device);
        }
    }
}

module.exports = DeviceReport;
