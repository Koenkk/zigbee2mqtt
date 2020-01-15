const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const logger = require('../util/logger');
const CC2530Router = zigbeeHerdsmanConverters.devices.find((d) => d.model === 'CC2530.ROUTER');
const ZNLDP12LM = zigbeeHerdsmanConverters.devices.find((d) => d.model === 'ZNLDP12LM');
const utils = require('../util/utils');
const BaseExtension = require('./baseExtension');
const debounce = require('debounce');
const ZigbeeHerdsman = require('zigbee-herdsman');

const defaultConfiguration = {
    minimumReportInterval: 3, maximumReportInterval: 300, reportableChange: 1,
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

const pollOnMessage = [
    {
        // Key is used this.pollDebouncers uniqueness
        key: 1,
        // On messages that have the cluster and type of below
        cluster: {
            manuSpecificPhilips: [
                {type: 'commandHueNotification', data: {button: 2}},
                {type: 'commandHueNotification', data: {button: 3}},
            ],
            genLevelCtrl: [
                {type: 'commandStep', data: {}},
                {type: 'commandStepWithOnOff', data: {}},
                {type: 'commandStop', data: {}},
                {type: 'commandMoveWithOnOff', data: {}},
                {type: 'commandStopWithOnOff', data: {}},
                {type: 'commandMove', data: {}},
            ],
        },
        // Read the following attributes
        read: {cluster: 'genLevelCtrl', attributes: ['currentLevel']},
        // When the bound devices/members of group have the following manufacturerID
        manufacturerID: ZigbeeHerdsman.Zcl.ManufacturerCode.Philips,
    },
];

class DeviceReport extends BaseExtension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.configuring = new Set();
        this.failed = new Set();
        this.pollDebouncers = {};
    }

    shouldIgnoreClusterForDevice(cluster, mappedDevice) {
        if (mappedDevice === ZNLDP12LM && cluster === 'closuresWindowCovering') {
            // Device announces it but doesn't support it
            // https://github.com/Koenkk/zigbee2mqtt/issues/2611
            return true;
        }

        return false;
    }

    async setupReporting(device, mappedDevice) {
        if (this.configuring.has(device.ieeeAddr) || this.failed.has(device.ieeeAddr)) return;
        this.configuring.add(device.ieeeAddr);

        try {
            for (const ep of device.endpoints) {
                for (const [cluster, configuration] of Object.entries(clusters)) {
                    if (ep.supportsInputCluster(cluster) && !this.shouldIgnoreClusterForDevice(cluster, mappedDevice)) {
                        logger.debug(`Setup reporting for '${device.ieeeAddr}' - ${ep.ID} - ${cluster}`);
                        await ep.bind(cluster, this.coordinatorEndpoint);
                        await ep.configureReporting(cluster, configuration);
                        logger.info(
                            `Successfully setup reporting for '${device.ieeeAddr}' - ${ep.ID} - ${cluster}`,
                        );
                    }
                }
            }

            // eslint-disable-next-line
            device.meta.reporting = reportKey;
        } catch (error) {
            logger.error(
                `Failed to setup reporting for '${device.ieeeAddr}' - ${error.stack}`,
            );

            this.failed.add(device.ieeeAddr);
        }

        device.save();
        this.configuring.delete(device.ieeeAddr);
    }

    shouldSetupReporting(mappedDevice, device, messageType) {
        if (!device || !mappedDevice) return false;

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

    async onZigbeeStarted() {
        this.coordinatorEndpoint = this.zigbee.getDevicesByType('Coordinator')[0].getEndpoint(1);

        for (const device of this.zigbee.getClients()) {
            const mappedDevice = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
            if (this.shouldSetupReporting(mappedDevice, device, null)) {
                this.setupReporting(device, mappedDevice);
            }
        }
    }

    onZigbeeEvent(type, data, mappedDevice, settingsDevice) {
        if (this.shouldSetupReporting(mappedDevice, data.device, type)) {
            this.setupReporting(data.device, mappedDevice);
        }

        if (type === 'message') {
            this.poll(data);
        }
    }

    poll(message) {
        /**
         * This method poll bound endpoints and group members for state changes.
         *
         * A use case is e.g. a Hue Dimmer switch bound to a Hue bulb.
         * Hue bulbs only report their on/off state.
         * When dimming the bulb via the dimmer switch the state is therefore not reported.
         * When we receive a message from a Hue dimmer we read the brightness from the bulb (if bound).
         */
        const polls = pollOnMessage.filter((p) =>
            p.cluster[message.cluster] && p.cluster[message.cluster].find((c) => c.type === message.type &&
            utils.equalsPartial(message.data, c.data)),
        );

        if (polls.length) {
            let toPoll = [];

            // Add bound devices
            toPoll = toPoll.concat([].concat(...message.device.endpoints.map((e) => e.binds.map((e) => e))));
            toPoll = toPoll.filter((e) => e.target.constructor.name === 'Endpoint');
            toPoll = toPoll.filter((e) => e.target.getDevice().type !== 'Coordinator');
            toPoll = toPoll.map((e) => e.target);

            // If message is published to a group, add members of the group
            const group = message.groupID !== 0 ? this.zigbee.getGroupByID(message.groupID) : null;
            if (group) {
                toPoll = toPoll.concat(group.members);
            }

            toPoll = new Set(toPoll);

            for (const endpoint of toPoll) {
                for (const poll of polls) {
                    if (poll.manufacturerID !== endpoint.getDevice().manufacturerID) {
                        continue;
                    }

                    const key = `${endpoint.deviceIeeeAddress}_${endpoint.ID}_${poll.key}`;
                    if (!this.pollDebouncers[key]) {
                        this.pollDebouncers[key] = debounce(async () => {
                            await endpoint.read(poll.read.cluster, poll.read.attributes);
                        }, 1000);
                    }

                    this.pollDebouncers[key]();
                }
            }
        }
    }
}

module.exports = DeviceReport;
