const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const logger = require('../util/logger');
const CC2530Router = zigbeeHerdsmanConverters.devices.find((d) => d.model === 'CC2530.ROUTER');
const utils = require('../util/utils');
const settings = require('../util/settings');
const BaseExtension = require('./baseExtension');
const debounce = require('debounce');

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
        this.emulators = {};
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
        // Gledopto devices don't support reporting.
        if (mappedDevice === CC2530Router || mappedDevice.vendor === 'Gledopto') return false;
        return true;
    }


    shouldDoReportingEmulation(device) {
        if (device.type == "Coordinator") return false;

        const settingsDevice = settings.getDevice(device.ieeeAddr);
        return (settingsDevice && settingsDevice.hasOwnProperty("report_emulate") &&
                Array.isArray(settingsDevice.report_emulate));
    }

    async handleReportingEmulation(device, group) {
        const endpoints = new Set();

        // lookup endpoints bound to device
        for (const endpoint of device.endpoints) {
            for (const binding of endpoint.binds) {
                if (binding.target.hasOwnProperty('deviceID')) {
                    if (!endpoints.has(binding.target)) {
                        endpoints.add(binding.target);
                    }
                }
            }
        }

        // lookup endpoints part of group (if provided)
        if (group) {
            for (const endpoint of group.members) {
                if (!endpoints.has(endpoint)) {
                    endpoints.add(endpoint);
                }
            }
        }

        // lookup devices attached to endpoints
        if (endpoints.size) {
            for (const endpoint of endpoints) {
                try {
                    const endpointDevice = this.zigbee.getDeviceByIeeeAddr(endpoint.deviceIeeeAddress);
                    if (this.shouldDoReportingEmulation(endpointDevice)) {
                        // use debounce so we do not flood the network with
                        // requests to update
                        if (!this.emulators[endpoint.deviceIeeeAddress]) {
                            this.emulators[endpoint.deviceIeeeAddress] = debounce(() => {
                                const settingsDevice = settings.getDevice(endpoint.deviceIeeeAddress);
                                const model = zigbeeHerdsmanConverters.findByZigbeeModel(endpointDevice.modelID);
                                if (!model) {
                                    logger.warn(`Could not emulate reporting for ${endpointDevice.ieeeAddr}, unknown device modelID '${endpointDevice.modelID}'`);
                                    return;
                                }
                                logger.debug(`Emulating report for ${endpointDevice.ieeeAddr}`);

                                const converters = model.toZigbee;
                                const usedConverters = [];
                                for (const key of settingsDevice.report_emulate) {
                                    const converter = converters.find((c) => c.key.includes(key));

                                    if (converter && converter.convertGet) {
                                        if (usedConverters.includes(converter)) return;
                                        converter.convertGet(endpoint, key, {});
                                    } else {
                                        logger.error(`Cannot find converter to emulate reporting of '${key}' for '${endpointDevice.ieeeAddr}'`);
                                    }

                                    usedConverters.push(converter);
                                }
                            }, 1000);
                        }
                        this.emulators[endpointDevice.ieeeAddr].clear()
                        this.emulators[endpointDevice.ieeeAddr]()
                    }
                } catch (error) {
                    logger.error(
                        `Failed to emulate reporting for '${endpoint.deviceIeeeAddress}' - ${error.stack}`
                    );
                }
            }
        } else {
            logger.debug(`No devices endpoints discovered, no reporting emulation required`);
        }
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
        if (type == "message" && (data.type != "attributeReport" &&
                                  data.type != "readResponse" &&
                                  data.type != "raw")) {
            const group = data.groupID > 0 ? this.zigbee.getGroupByID(data.groupID) : null;
            this.handleReportingEmulation(data.device, group);
        }
    }
}

module.exports = DeviceReport;
