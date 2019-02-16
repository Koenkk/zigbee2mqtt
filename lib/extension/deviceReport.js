const zigbeeShepherdConverters = require('zigbee-shepherd-converters');

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

const reportableChange = 0;

class Reporting {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
    }

    setupReporting(endpoint) {
        Object.values(endpoint.clusters).filter((c) => c).forEach((c) => {
            const cluster = c.attrs.cid;
            if (candidates[cluster]) {
                const candidate = candidates[cluster];
                const attributeNames = candidate.attrs.filter((a) => c.attrs.hasOwnProperty(a));
                const attributes = [];
                attributeNames.forEach((attribute) => {
                    attributes.push({
                        attr: attribute,
                        min: candidate.hasOwnProperty('reportIntervalMin')?
                            candidate.reportIntervalMin:reportInterval.min,
                        max: candidate.hasOwnProperty('reportIntervalMax')?
                            candidate.reportIntervalMax:reportInterval.max,
                        change: candidate.hasOwnProperty('reportableChange')?
                            candidate.reportableChange:reportableChange,
                    });
                });
                this.zigbee.report(endpoint, cluster, attributes);
            }
        });
    }

    onZigbeeStarted() {
        this.zigbee.getAllClients().forEach((device) => {
            const mappedDevice = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);

            if (mappedDevice && mappedDevice.report) {
                const endpoint = this.zigbee.getEndpoint(device.ieeeAddr);
                this.setupReporting(endpoint);
            }
        });
    }

    onZigbeeMessage(message, device, mappedDevice) {
        // Handle messages of type endDeviceAnnce.
        // This message is typically send when a device comes online after being powered off
        // Ikea TRADFRI tend to forget their reporting after powered off.
        // Re-setup reporting.
        // https://github.com/Koenkk/zigbee2mqtt/issues/966
        // The mappedDevice.report property is now used as boolean
        // the property might contain more information about how to
        // configure reporting. For instance the endpointIds to use.
        if (device && mappedDevice
            && (message.type=='endDeviceAnnce' || message.type=='devIncoming')
            && mappedDevice.report) {
            const endpoint = this.zigbee.getEndpoint(device.ieeeAddr);
            if (endpoint) {
                this.setupReporting(endpoint);
            }
        }
    }
}

module.exports = Reporting;
