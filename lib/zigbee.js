const ZShepherd = require('zigbee-shepherd');
const logger = require('./util/logger');
const settings = require('./util/settings');
const data = require('./util/data');
const utils = require('./util/utils');
const ZigbeeQueue = require('./util/zigbeeQueue');
const cieApp = require('./zapp/cie');
const objectAssignDeep = require('object-assign-deep');
const zclId = require('zcl-id');

const advancedSettings = settings.get().advanced;

if (advancedSettings.channel < 11 || advancedSettings.channel > 26) {
    throw new Error(`'${advancedSettings.channel}' is an invalid channel, use a channel between 11 - 26.`);
}

const shepherdSettings = {
    net: {
        panId: advancedSettings.pan_id,
        extPanId: advancedSettings.ext_pan_id,
        channelList: [advancedSettings.channel],
        precfgkey: settings.get().advanced.network_key,
    },
    dbPath: data.joinPath('database.db'),
    sp: {
        baudRate: advancedSettings.baudrate,
        rtscts: advancedSettings.rtscts,
    },
};

const defaultCfg = {
    manufSpec: 0,
    disDefaultRsp: 0,
};

// Don't print network key.
const shepherdSettingsLog = objectAssignDeep.noMutate(shepherdSettings);
shepherdSettingsLog.net.precfgkey = 'HIDDEN';
logger.debug(`Using zigbee-shepherd with settings: '${JSON.stringify(shepherdSettingsLog)}'`);

class Zigbee {
    constructor() {
        this.onReady = this.onReady.bind(this);
        this.onMessage = this.onMessage.bind(this);
        this.onError = this.onError.bind(this);
        this.messageHandler = null;

        this.queue = new ZigbeeQueue();
    }

    start(messageHandler, callback) {
        logger.info(`Starting zigbee-shepherd`);
        this.messageHandler = messageHandler;
        this.shepherd = new ZShepherd(settings.get().serial.port, shepherdSettings);

        this.shepherd.start((error) => {
            if (error) {
                logger.info('Error while starting zigbee-shepherd, attempting to fix... (takes 60 seconds)');
                this.shepherd.controller._znp.close((() => null));

                setTimeout(() => {
                    logger.info(`Starting zigbee-shepherd`);
                    this.shepherd.start((error) => {
                        if (error) {
                            logger.error('Error while starting zigbee-shepherd!');
                            logger.error(
                                'Press the reset button on the stick (the one closest to the USB) and start again'
                            );
                            callback(error);
                        } else {
                            this.logStartupInfo();
                            callback(null);
                        }
                    });
                }, utils.secondsToMilliseconds(60));
            } else {
                this.logStartupInfo();
                callback(null);
            }
        });

        // Register callbacks.
        this.shepherd.on('ready', this.onReady);
        this.shepherd.on('ind', this.onMessage);
        this.shepherd.on('error', this.onError);
    }

    logStartupInfo() {
        logger.info('zigbee-shepherd started');
        logger.info(`Coordinator firmware version: '${this.getFirmwareVersion()}'`);
        logger.debug(`zigbee-shepherd info: ${JSON.stringify(this.shepherd.info())}`);
    }

    getFirmwareVersion() {
        return this.shepherd.info().firmware.revision;
    }

    softReset(callback) {
        this.shepherd.reset('soft', callback);
    }

    stop(callback) {
        this.queue.stop();

        this.shepherd.stop((error) => {
            logger.info('zigbee-shepherd stopped');
            callback(error);
        });
    }

    onReady() {
        // Mount cieApp
        this.shepherd.mount(cieApp, (err, epId) => {
            if (!err) {
                logger.debug(`Mounted the cieApp (epId ${epId})`);
            } else {
                logger.error(`Failed to mount the cieApp`);
            }
        });

        // Check if we have to turn off the led
        if (settings.get().serial.disable_led) {
            this.shepherd.controller.request('UTIL', 'ledControl', {ledid: 3, mode: 0});
        }

        // Wait some time before we start the queue, many calls skip this queue which hangs the stick
        setTimeout(() => {
            this.queue.start();
        }, 2000);

        logger.info('zigbee-shepherd ready');
    }

    onError(message) {
        // This event may appear if zigbee-shepherd cannot decode bad packets (invalid checksum).
        logger.error(message);
    }

    permitJoin(permit, callback) {
        if (permit) {
            logger.info('Zigbee: allowing new devices to join.');
        } else {
            logger.info('Zigbee: disabling joining new devices.');
        }

        this.shepherd.permitJoin(permit ? 255 : 0, (error) => {
            if (error) {
                logger.info(error);
            }

            if (callback) {
                callback();
            }
        });
    }

    getPermitJoin() {
        return this.shepherd.controller._permitJoinTime === 255;
    }

    getAllClients() {
        return this.getDevices().filter((device) => device.type !== 'Coordinator');
    }

    removeDevice(deviceID, ban, callback) {
        this.shepherd.remove(deviceID, {reJoin: !ban}, (error) => {
            if (error) {
                logger.warn(`Failed to remove '${deviceID}', trying force remove...`);
                this.forceRemove(deviceID, callback);
            } else {
                callback(null);
            }
        });
    }

    forceRemove(deviceID, callback) {
        const device = this.shepherd._findDevByAddr(deviceID);

        if (device) {
            return this.shepherd._unregisterDev(device, (error) => callback(error));
        } else {
            logger.warn(`Could not find ${deviceID} for force removal`);
            callback(true);
        }
    }

    onMessage(message) {
        if (this.messageHandler) {
            this.messageHandler(message);
        }
    }

    getDevices() {
        return this.shepherd.list();
    }

    getDevice(ieeeAddr) {
        return this.getDevices().find((d) => d.ieeeAddr === ieeeAddr);
    }

    getCoordinator() {
        const device = this.getDevices().find((d) => d.type === 'Coordinator');
        return this.shepherd.find(device.ieeeAddr, 1);
    }

    getGroup(ID) {
        return this.shepherd.getGroup(ID);
    }

    networkScan(callback) {
        logger.info('Starting network scan...');
        this.shepherd.lqiScan().then((result) => {
            logger.info('Network scan completed');
            callback(result);
        });
    }

    getEndpoint(ieeeAddr, ep) {
        // If no ep is given, the first endpoint will be returned
        // Find device in zigbee-shepherd
        const device = this.getDevice(ieeeAddr);
        if (!device || !device.epList || !device.epList.length) {
            logger.error(`Zigbee cannot determine endpoint for '${ieeeAddr}'`);
            return null;
        }

        ep = ep ? ep : device.epList[0];
        const endpoint = this.shepherd.find(ieeeAddr, ep);
        return endpoint;
    }

    publish(entityID, entityType, cid, cmd, cmdType, zclData, cfg=defaultCfg, ep, callback) {
        let entity = null;
        if (entityType === 'device') {
            entity = this.getEndpoint(entityID, ep);
        } else if (entityType === 'group') {
            entity = this.getGroup(entityID);
        }

        if (!entity) {
            logger.error(
                `Cannot publish message to ${entityType} because '${entityID}' is not known by zigbee-shepherd`
            );
            return;
        }

        this.queue.push(entityID, (queueCallback) => {
            logger.info(
                `Zigbee publish to ${entityType} '${entityID}', ${cid} - ${cmd} - ` +
                `${JSON.stringify(zclData)} - ${JSON.stringify(cfg)} - ${ep}`
            );

            const callback_ = (error, rsp) => {
                if (error) {
                    logger.error(
                        `Zigbee publish to ${entityType} '${entityID}', ${cid} - ${cmd} - ${JSON.stringify(zclData)} ` +
                        `- ${JSON.stringify(cfg)} - ${ep} ` +
                        `failed with error ${error}`);
                }

                if (callback) {
                    callback(error, rsp);
                }

                queueCallback(error);
            };

            if (cmdType === 'functional' && entity.functional) {
                entity.functional(cid, cmd, zclData, cfg, callback_);
            } else if (cmdType === 'foundation' && entity.foundation) {
                entity.foundation(cid, cmd, zclData, cfg, callback_);
            } else {
                logger.error(`Unknown zigbee publish cmdType ${cmdType}`);
            }
        });
    }

    ping(ieeeAddr, errorLogLevel='error', cb) {
        const device = this.shepherd._findDevByAddr(ieeeAddr);

        if (device) {
            this.queue.push(ieeeAddr, (queueCallback) => {
                logger.debug(`Ping ${ieeeAddr}`);
                this.shepherd.controller.checkOnline(device, (error) => {
                    if (error) {
                        logger[errorLogLevel](`Failed to ping ${ieeeAddr}`);
                    } else {
                        logger.debug(`Successfully pinged ${ieeeAddr}`);
                    }

                    if (cb) {
                        cb(error);
                    }

                    queueCallback(error);
                });
            });
        }
    }

    bind(ep, cluster, target, callback) {
        const log = ` ${ep.device.ieeeAddr} - ${cluster}`;
        target = !target ? this.getCoordinator() : target;

        this.queue.push(ep.device.ieeeAddr, (queueCallback) => {
            logger.debug(`Binding ${log}`);
            ep.bind(cluster, target, (error) => {
                if (error) {
                    logger.error(`Failed to bind ${log} - (${error})`);
                } else {
                    logger.debug(`Successfully bound ${log}`);
                }

                callback(error);
                queueCallback(error);
            });
        });
    }

    unbind(ep, cluster, target, callback) {
        const log = ` ${ep.device.ieeeAddr} - ${cluster}`;
        target = !target ? this.getCoordinator() : target;

        this.queue.push(ep.device.ieeeAddr, (queueCallback) => {
            logger.debug(`Unbinding ${log}`);
            ep.unbind(cluster, target, (error) => {
                if (error) {
                    logger.error(`Failed to unbind ${log} - (${error})`);
                } else {
                    logger.debug(`Successfully unbound ${log}`);
                }

                callback(error);
                queueCallback(error);
            });
        });
    }

    /*
     * Setup reporting.
     * Attributes is an array of attribute objects.
     * each attribute object should contain the following properties:
     *     attr    the attribute name,
     *     min     the minimal time between reports in seconds,
     *     max     the maximum time between reports in seconds,
     *     change  the minimum amount of change before sending a report
     */
    report(ep, cluster, attributes) {
        const cfgArr = attributes.map((attribute) => {
            const attrId = zclId.attr(cluster, attribute.attr).value;
            const dataType = zclId.attrType(cluster, attribute.attr).value;
            return {
                direction: 0,
                attrId,
                dataType,
                minRepIntval: attribute.min,
                maxRepIntval: attribute.max,
                repChange: attribute.change,
            };
        });

        const log=`for ${ep.device.ieeeAddr} - ${cluster} - ${attributes.length}`;

        const configReport = () => {
            this.queue.push(ep.device.ieeeAddr, (queueCallback) => {
                ep.foundation(cluster, 'configReport', cfgArr, defaultCfg, (error) => {
                    if (error) {
                        logger.error(`Failed to setup reporting ${log} - (${error})`);
                    } else {
                        logger.debug(`Successfully setup reporting ${log}`);
                    }

                    queueCallback(error);
                });
            });
        };

        this.queue.push(ep.device.ieeeAddr, (queueCallback) => {
            logger.debug(`Setup reporting ${log}`);

            ep.bind(cluster, this.getCoordinator(), (error) => {
                if (error) {
                    logger.error(`Failed to bind for reporting ${log} - (${error})`);
                } else {
                    // Only if binding succeeds, setting-up reporting makes sense.
                    configReport();
                }

                queueCallback(error);
            });
        });
    }
}

module.exports = Zigbee;
