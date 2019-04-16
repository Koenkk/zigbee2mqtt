const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const logger = require('../util/logger');
const CC2530Router = zigbeeShepherdConverters.devices.find((d) => d.model === 'CC2530.ROUTER');
const utils = require('../util/utils');

const candidates = {
    'genOnOff': {
        attrs: ['onOff'],
        reportIntervalMin: 3,
        reportIntervalMax: 300,
        reportableChange: 0,
    },
    'genLevelCtrl': {
        attrs: ['currentLevel'],
    },
    'lightingColorCtrl': {
        attrs: ['colorTemperature', 'currentX', 'currentY'],
    },
};

const reportInterval = {
    min: 3,
    max: 3600,
};

const reportableChange = 1;

class DeviceReport {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
    }

    setupReporting(mappedDevice, device) {
        let epId = null;

        if (mappedDevice === CC2530Router) {
            logger.debug('Not setting up reporting for CC2530 router');
            return;
        }

        // Check if this device uses a different epId.
        if (mappedDevice.hasOwnProperty('ep')) {
            const eps = mappedDevice.ep(device);
            epId = eps[''] || null;
        }

        const endpoint = this.zigbee.getEndpoint(device.ieeeAddr, epId);

        if (!endpoint) {
            logger.error(`Failed to setup reporting for ${device.ieeeAddr}, endpoint not found`);
            return;
        }

        logger.debug(`Setting up reporting for ${device.ieeeAddr}`);
        Object.values(endpoint.clusters).filter((c) => c).forEach((c) => {
            const cluster = c.attrs.cid;
            if (candidates[cluster]) {
                const candidate = candidates[cluster];
                let attributeNames = candidate.attrs.filter((a) => c.attrs.hasOwnProperty(a));

                // Sometimes a cluster has no attributes, in this case setup reporting for all attributes.
                attributeNames = attributeNames.length ? attributeNames : candidate.attrs;

                const attributes = attributeNames.map((attribute) => {
                    return {
                        attr: attribute,
                        min: candidate.hasOwnProperty('reportIntervalMin')?
                            candidate.reportIntervalMin:reportInterval.min,
                        max: candidate.hasOwnProperty('reportIntervalMax')?
                            candidate.reportIntervalMax:reportInterval.max,
                        change: candidate.hasOwnProperty('reportableChange')?
                            candidate.reportableChange:reportableChange,
                    };
                });

                if (attributes.length > 0) {
                    this.zigbee.report(endpoint, cluster, attributes);
                }
            }
        });
    }

    shouldSetupReporting(device) {
        return utils.isRouter(device) && !utils.isBatteryPowered(device);
    }

    onZigbeeStarted() {
        this.zigbee.getAllClients()
            .filter((d) => this.shouldSetupReporting(d))
            .forEach((device) => {
                const mappedDevice = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);

                if (mappedDevice) {
                    this.setupReporting(mappedDevice, device);
                }
            });
    }

    onZigbeeMessage(message, device, mappedDevice) {
        // Handle messages of type endDeviceAnnce and devIncoming.
        // This message is typically send when a device comes online after being powered off
        // Ikea TRADFRI tend to forget their reporting after powered off.
        // Re-setup reporting.
        // https://github.com/Koenkk/zigbee2mqtt/issues/966
        if (device && mappedDevice && ['endDeviceAnnce', 'devIncoming'].includes(message.type) &&
            this.shouldSetupReporting(device)) {
            this.setupReporting(mappedDevice, device);
        }
    }
}

module.exports = DeviceReport;
