const settings = require('../util/settings');
const utils = require('../util/utils');

const candidates = {
    'genOnOff': ['onOff'],
    'genLevelCtrl': ['currentLevel'],
    'lightingColorCtrl': ['colorTemperature', 'currentX', 'currentY'],
};

const reportInterval = {
    min: 1,
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

    shouldReport(ieeeAddr) {
        const device = settings.getDevice(ieeeAddr);
        return device && device.report;
    }

    getEndpoints() {
        return this.zigbee.getAllClients()
            .filter((d) => this.shouldReport(d.ieeeAddr))
            .map((d) => this.zigbee.getEndpoint(d.ieeeAddr))
            .filter((e) => e);
    }

    setupReporting(endpoint) {
        Object.values(endpoint.clusters).filter((c) => c).forEach((c) => {
            const cluster = c.attrs.cid;
            if (candidates[cluster]) {
                const attributes = candidates[cluster].filter((a) => c.attrs.hasOwnProperty(a));
                attributes.forEach((attribute) => {
                    this.zigbee.report(
                        endpoint,
                        cluster,
                        attribute,
                        reportInterval.min,
                        reportInterval.max,
                        reportableChange);
                });
            }
        });
    }

    onZigbeeStarted() {
        const endpoints = this.getEndpoints();
        endpoints.forEach((e) => this.setupReporting(e));
    }

    onZigbeeMessage(message, device, mappedDevice) {
        // Handle messages of type endDeviceAnnce.
        // This message is typically send when a device comes online after being powered off
        // Ikea TRADFRI tend to forget their reporting after powered off.
        // Re-setup reporting.
        // https://github.com/Koenkk/zigbee2mqtt/issues/966
        if (device && message.type === 'endDeviceAnnce' && utils.isIkeaTradfriDevice(device) &&
            this.shouldReport(device.ieeeAddr)) {
            const endpoint = this.zigbee.getEndpoint(device.ieeeAddr);
            if (endpoint) {
                this.setupReporting(endpoint);
            }
        }
    }
}

module.exports = Reporting;
