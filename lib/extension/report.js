const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const logger = require('../util/logger');
const settings = require('../util/settings');
const ZNLDP12LM = zigbeeHerdsmanConverters.devices.find((d) => d.model === 'ZNLDP12LM');
const utils = require('../util/utils');
const Extension = require('./extension');
const debounce = require('debounce');
const ZigbeeHerdsman = require('zigbee-herdsman');

const defaultConfiguration = {
    minimumReportInterval: 3, maximumReportInterval: 300, reportableChange: 1,
};

const devicesNotSupportingReporting = [
    zigbeeHerdsmanConverters.devices.find((d) => d.model === 'CC2530.ROUTER'),
    zigbeeHerdsmanConverters.devices.find((d) => d.model === 'BASICZBR3'),
    zigbeeHerdsmanConverters.devices.find((d) => d.model === 'ZM-CSW032-D'),
    zigbeeHerdsmanConverters.devices.find((d) => d.model === 'TS0001'),
];

const reportKey = 1;

const getColorCapabilities = async (endpoint) => {
    if (endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities') === undefined) {
        await endpoint.read('lightingColorCtrl', ['colorCapabilities']);
    }

    const value = endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities');
    return {
        colorTemperature: (value & 1<<4) > 0,
        colorXY: (value & 1<<3) > 0,
    };
};

const clusters = {
    'genOnOff': [
        {attribute: 'onOff', ...defaultConfiguration, minimumReportInterval: 0, reportableChange: 0},
    ],
    'genLevelCtrl': [
        {attribute: 'currentLevel', ...defaultConfiguration},
    ],
    'lightingColorCtrl': [
        {
            attribute: 'colorTemperature', ...defaultConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorTemperature,
        },
        {
            attribute: 'currentX', ...defaultConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorXY,
        },
        {
            attribute: 'currentY', ...defaultConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorXY,
        },
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
    {
        key: 2,
        cluster: {
            genOnOff: [
                {type: 'commandOn', data: {}},
                {type: 'commandOff', data: {}},
                {type: 'commandOffWithEffect', data: {}},
            ],
            manuSpecificPhilips: [
                {type: 'commandHueNotification', data: {button: 1}},
                {type: 'commandHueNotification', data: {button: 4}},
            ],
        },
        read: {cluster: 'genOnOff', attributes: ['onOff']},
        manufacturerID: ZigbeeHerdsman.Zcl.ManufacturerCode.Philips,
    },
];

class Report extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
        this.queue = new Set();
        this.failed = new Set();
        this.pollDebouncers = {};
        this.enabled = settings.get().advanced.report;
    }

    shouldIgnoreClusterForDevice(cluster, definition) {
        if (definition === ZNLDP12LM && cluster === 'closuresWindowCovering') {
            // Device announces it but doesn't support it
            // https://github.com/Koenkk/zigbee2mqtt/issues/2611
            return true;
        }

        return false;
    }

    async setupReporting(resolvedEntity) {
        const {device, definition} = resolvedEntity;

        if (this.queue.has(device.ieeeAddr) || this.failed.has(device.ieeeAddr)) return;
        this.queue.add(device.ieeeAddr);

        const term1 = this.enabled ? 'Setup' : 'Disable';
        const term2 = this.enabled ? 'setup' : 'disabled';

        try {
            for (const ep of device.endpoints) {
                for (const [cluster, configuration] of Object.entries(clusters)) {
                    if (ep.supportsInputCluster(cluster) && !this.shouldIgnoreClusterForDevice(cluster, definition)) {
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
                            await ep.bind(cluster, this.coordinatorEndpoint) :
                            await ep.unbind(cluster, this.coordinatorEndpoint);

                        await ep.configureReporting(cluster, items);
                        logger.info(
                            `Successfully ${term2} reporting for '${device.ieeeAddr}' - ${ep.ID} - ${cluster}`,
                        );
                    }
                }
            }

            if (this.enabled) {
                device.meta.reporting = reportKey;
            } else {
                delete device.meta.reporting;
                this.eventBus.emit('reportingDisabled', {device});
            }
        } catch (error) {
            logger.error(
                `Failed to ${term1.toLowerCase()} reporting for '${device.ieeeAddr}' - ${error.stack}`,
            );

            this.failed.add(device.ieeeAddr);
        }

        device.save();
        this.queue.delete(device.ieeeAddr);
    }

    shouldSetupReporting(resolvedEntity, messageType) {
        if (!resolvedEntity || !resolvedEntity.device || !resolvedEntity.definition ||
            messageType === 'deviceLeave') return false;

        const {device, definition} = resolvedEntity;
        // Handle messages of type endDeviceAnnce and devIncoming.
        // This message is typically send when a device comes online after being powered off
        // Ikea TRADFRI tend to forget their reporting after powered off.
        // Re-setup reporting.
        // https://github.com/Koenkk/zigbee2mqtt/issues/966
        if (this.enabled && messageType === 'deviceAnnounce' && utils.isIkeaTradfriDevice(device)) return true;

        if (resolvedEntity.device.interviewing === true) return false;
        if (device.type !== 'Router' || device.powerSource === 'Battery') return false;
        // Gledopto devices don't support reporting.
        if (devicesNotSupportingReporting.includes(definition) || definition.vendor === 'Gledopto') return false;

        if (this.enabled && device.meta.hasOwnProperty('reporting') && device.meta.reporting === reportKey) {
            return false;
        }

        if (!this.enabled && !device.meta.hasOwnProperty('reporting')) {
            return false;
        }

        return true;
    }

    async onZigbeeStarted() {
        this.coordinatorEndpoint = this.zigbee.getDevicesByType('Coordinator')[0].getEndpoint(1);

        for (const device of this.zigbee.getClients()) {
            const resolvedEntity = this.zigbee.resolveEntity(device);
            if (this.shouldSetupReporting(resolvedEntity, null)) {
                await this.setupReporting(resolvedEntity);
            }
        }
    }

    async onZigbeeEvent(type, data, resolvedEntity) {
        if (this.shouldSetupReporting(resolvedEntity, type)) {
            await this.setupReporting(resolvedEntity);
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
            toPoll = toPoll.concat([].concat(...message.device.endpoints.map((e) =>
                e.binds.map((e) => e).filter((e) => e.target))));
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

module.exports = Report;
