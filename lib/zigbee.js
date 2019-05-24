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
    coordBackupPath: data.joinPath('coordinator_backup.json'),
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
        this.permitJoinTimer = null;

        this.queue = new ZigbeeQueue();
    }

    start(messageHandler, callback) {
        logger.info(`Starting zigbee-shepherd`);
        this.messageHandler = messageHandler;
        this.shepherd = new ZShepherd(settings.get().serial.port, shepherdSettings);

        this.shepherd.start((error) => {
            if (error) {
                logger.info(`Error while starting zigbee-shepherd, attempting to fix... (takes 60 seconds) (${error})`);
                this.shepherd.controller._znp.close((() => null));

                setTimeout(() => {
                    logger.info(`Starting zigbee-shepherd`);
                    this.shepherd.start((error) => {
                        if (error) {
                            logger.error(`Error while starting zigbee-shepherd! (${error})`);
                            logger.error(
                                'Press the reset button on the stick (the one closest to the USB) and start again'
                            );
                            callback(error);
                        } else {
                            this._handleStarted();
                            callback(null);
                        }
                    });
                }, utils.secondsToMilliseconds(60));
            } else {
                this._handleStarted();
                callback(null);
            }
        });

        // Register callbacks.
        this.shepherd.on('ready', this.onReady);
        this.shepherd.on('ind', this.onMessage);
        this.shepherd.on('error', this.onError);
        this._acceptDevIncoming = this._acceptDevIncoming.bind(this);
        this.shepherd.acceptDevIncoming = this._acceptDevIncoming;
    }

    _handleStarted() {
        this.logStartupInfo();

        this.getAllClients().forEach((device) => {
            if (settings.get().ban.includes(device.ieeeAddr)) {
                logger.warn(`Banned device is connected (${device.ieeeAddr}), removing...`);
                this.removeDevice(device.ieeeAddr, false, () => {});
            }
        });

        this.shepherd.backupCoordinator(() => {});
    }

    _acceptDevIncoming(devInfo, callback) {
        logger.debug(
            `Accept device incoming with ieeeAddr '${devInfo.ieeeAddr}' permit join is '${this.getPermitJoin()}'`
        );

        if (settings.get().ban.includes(devInfo.ieeeAddr)) {
            logger.info(`Banned device tried to connect (${devInfo.ieeeAddr})`);
            callback(null, false);
        } else {
            logger.debug(`Allowing device '${devInfo.ieeeAddr}' to join`);
            callback(null, true);
        }
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
        if (this.permitJoinTimer) {
            clearInterval(this.permitJoinTimer);
        }

        this.queue.stop();

        // Backup coordinator
        this.shepherd.backupCoordinator(() => {
            this.shepherd.stop((error) => {
                logger.info('zigbee-shepherd stopped');
                callback(error);
            });
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

        // In zigbee 3.0 a network automatically closes after 254 seconds.
        // As a workaround, we enable joining again.
        if (this.permitJoinTimer) {
            clearInterval(this.permitJoinTimer);
        }

        if (permit) {
            this.permitJoinTimer = setInterval(() => {
                this.shepherd.permitJoin(255, (error) => {
                    if (error) {
                        logger.error('Failed to reenable joining');
                    } else {
                        logger.info('Successfully reenabled joining');
                    }
                });
            }, utils.secondsToMilliseconds(160));
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
        if (ban) {
            settings.banDevice(deviceID);
        }

        const friendlyName = this.getDeviceFriendlyName(deviceID);

        this.shepherd.remove(deviceID, {reJoin: true}, (error) => {
            if (error) {
                logger.warn(`Failed to remove '${friendlyName}', trying force remove...`);
                this.forceRemove(deviceID, callback);
            } else {
                logger.info(`Removed ${friendlyName}`);
                callback(null);
            }
        });
    }

    forceRemove(deviceID, callback) {
        const device = this.shepherd._findDevByAddr(deviceID);

        if (device) {
            const friendlyName = this.getDeviceFriendlyName(deviceID);
            return this.shepherd._unregisterDev(device, (error) => {
                logger.info(`Force removed ${friendlyName}`);
                callback(error);
            });
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

    getDeviceFriendlyName(ieeeAddr) {
        const device = settings.getDevice(ieeeAddr);
        return device ? device.friendly_name || ieeeAddr : ieeeAddr;
    }

    getCoordinator() {
        const device = this.getDevices().find((d) => d.type === 'Coordinator');
        return this.shepherd.find(device.ieeeAddr, 1);
    }

    getScanable() {
        return this.getDevices().filter((d) => d.type != 'EndDevice');
    }

    getGroup(ID) {
        return this.shepherd.getGroup(ID);
    }

    getGroupFriendlyName(ID) {
        let friendlyName = null;
        friendlyName = settings.getGroup(ID).friendly_name;
        return (friendlyName ? friendlyName : ID);
    }

    networkScan(callback) {
        logger.info('Starting network scan...');

        Promise.delay = function(t, val) {
            return new Promise((resolve) => {
                setTimeout(resolve.bind(null, val), t);
            });
        };

        Promise.raceAll = function(promises, timeoutTime, timeoutVal) {
            return Promise.all(promises.map((p) => {
                return Promise.race([p, Promise.delay(timeoutTime, timeoutVal)]);
            }));
        };

        const processResponse = function(parent, shepherd) {
            logger.debug(`Scanning device: '${parent}'`);
            return function(data) {
                const linkSet = [];
                return new Promise((resolve) => {
                    logger.debug(`Processing scan for: '${parent}'`);
                    if (data) {
                        data.forEach(function(devinfo) {
                            const childDev = shepherd._findDevByAddr(devinfo.ieeeAddr);
                            devinfo.parent = parent;
                            devinfo.status = childDev ? childDev.status : 'offline';
                            linkSet.push(devinfo);
                        });
                    }
                    resolve(linkSet);
                    logger.debug(`Processed device: '${parent}', linkSet: %j`, linkSet);
                });
            };
        };

        const allScans = this.getScanable().map((dev) => {
            logger.debug(`Preparing asynch network scan for '${dev.ieeeAddr}'`);
            return this.shepherd.lqi(dev.ieeeAddr)
                .then(processResponse(dev.ieeeAddr, this.shepherd))
                .catch(() => {
                    return new Promise((resolve) => []);
                });
        }, this);
        logger.debug('All network map promises created');
        // Collect all lqi scan results but timeout after specified miliseconds if any haven't completed
        Promise.raceAll(allScans, 8000, []).then((linkSets) => {
            const linkMap = [].concat(...linkSets);
            logger.info('Network scan completed');
            logger.debug(`Link map: %j`, linkMap);
            callback(linkMap);
        })
            .catch(function(result) {
                logger.info(`Network scan failed: '${result}'`);
                callback([]);
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
        let friendlyName = null;
        if (entityType === 'device') {
            entity = this.getEndpoint(entityID, ep);
            friendlyName = this.getDeviceFriendlyName(entityID);
        } else if (entityType === 'group') {
            entity = this.getGroup(entityID);
            friendlyName = this.getGroupFriendlyName(entityID);
        }

        if (!entity) {
            logger.error(
                `Cannot publish message to ${entityType} because '${entityID}' is not known by zigbee-shepherd`
            );
            return;
        }

        this.queue.push(entityID, (queueCallback) => {
            logger.info(
                `Zigbee publish to ${entityType} '${friendlyName}', ${cid} - ${cmd} - ` +
                `${JSON.stringify(zclData)} - ${JSON.stringify(cfg)} - ${ep}`
            );

            const callback_ = (error, rsp) => {
                if (error) {
                    logger.error(
                        `Zigbee publish to ${entityType} '${friendlyName}', ${cid} ` +
                        `- ${cmd} - ${JSON.stringify(zclData)} ` +
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

    ping(ieeeAddr, errorLogLevel='error', cb, mechanism='default') {
        const friendlyName = this.getDeviceFriendlyName(ieeeAddr);
        const callback = (error) => {
            if (error) {
                logger[errorLogLevel](`Failed to ping '${friendlyName}'`);
            } else {
                logger.debug(`Successfully pinged '${friendlyName}'`);
            }

            if (cb) {
                cb(error);
            }
        };

        if (mechanism === 'default') {
            const device = this.shepherd._findDevByAddr(ieeeAddr);
            if (device) {
                logger.debug(`Ping ${ieeeAddr} (default)`);
                this.queue.push(ieeeAddr, (queueCallback) => {
                    this.shepherd.controller.checkOnline(device, (error) => {
                        callback(error);
                        queueCallback(error);
                    });
                });
            }
        } else if (mechanism === 'basic') {
            const endpoint = this.getEndpoint(ieeeAddr, null);
            if (endpoint) {
                logger.debug(`Ping ${ieeeAddr} (basic)`);
                this.queue.push(ieeeAddr, (queueCallback) => {
                    endpoint.foundation('genBasic', 'read', [{attrId: 0}], (error) => {
                        callback(error);
                        queueCallback(error);
                    });
                });
            }
        }
    }

    bind(ep, cluster, target, callback) {
        const friendlyName = this.getDeviceFriendlyName(ep.device.ieeeAddr);
        const log = ` '${friendlyName}' - ${cluster}`;
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
        const friendlyName = this.getDeviceFriendlyName(ep.device.ieeeAddr);
        const log = ` '${friendlyName}' - ${cluster}`;
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
        const friendlyName = this.getDeviceFriendlyName(ep.device.ieeeAddr);
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

        const log=`for '${friendlyName}' - ${cluster} - ${attributes.length}`;

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
