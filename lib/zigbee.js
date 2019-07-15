const ZShepherd = require('zigbee-herdsman');
const logger = require('./util/logger');
const settings = require('./util/settings');
const data = require('./util/data');
const utils = require('./util/utils');
const ZigbeeQueue = require('./util/zigbeeQueue');
const cieApp = require('./zapp/cie');
const objectAssignDeep = require('object-assign-deep');
const zclId = require('zigbee-herdsman/dist/zcl-id');

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
        logger.debug(`Using zigbee-shepherd with settings: '${JSON.stringify(shepherdSettingsLog)}'`);

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
            // If set whitelist devices, all other device will be ban or reject to join the network
            if (settings.get().whitelist.size>0) {
                if (!settings.get().whitelist.includes(device.ieeeAddr)) {
                    logger.warn(`Blacklist device is connected (${device.ieeeAddr}), removing...`);
                    this.removeDevice(device.ieeeAddr, true, () => {});
                }
            } else {
                if (settings.get().ban.includes(device.ieeeAddr)) {
                    logger.warn(`Banned device is connected (${device.ieeeAddr}), removing...`);
                    this.removeDevice(device.ieeeAddr, false, () => {});
                }
            }
        });

        this.shepherd.backupCoordinator(() => {});
    }

    _acceptDevIncoming(devInfo, callback) {
        logger.debug(
            `Accept device incoming with ieeeAddr '${devInfo.ieeeAddr}' permit join is '${this.getPermitJoin()}'`
        );
        // If set whitelist devices, all other device will be ban or reject to join the network
        if (settings.get().whitelist.size>0) {
            if (settings.get().whitelist.includes(devInfo.ieeeAddr)) {
                logger.info(`whitelist device tried to connect (${devInfo.ieeeAddr})`);
                callback(null, true);
            } else {
                logger.debug(`Not allowing device '${devInfo.ieeeAddr}' to join`);
                callback(null, false);
            }
        } else {
            if (settings.get().ban.includes(devInfo.ieeeAddr)) {
                logger.info(`Banned device tried to connect (${devInfo.ieeeAddr})`);
                callback(null, false);
            } else {
                logger.debug(`Allowing device '${devInfo.ieeeAddr}' to join`);
                callback(null, true);
            }
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

    networkScan(includeRoutes, callback) {
        logger.info(`Starting network scan includeRoutes='${includeRoutes}'...`);
        const lqiScanList = new Set();
        const rtgScanList = new Set();
        const linkMap = [];
        const routeMap = [];

        // Gather the lqi and the route info into separate lists and only collate them when done.
        const collateMap = () => {
            linkMap.sort();
            logger.debug(`Link map: %j`, linkMap);
            logger.debug(`Route map: %j`, routeMap);
            // Merge the routes into the linkMap by matching on 'source|target' link short addresses
            linkMap.forEach((link) => {
                routeMap.filter((e) => e.key === link.key).forEach((e) => {
                    link.routes.push(e.destAddr);
                });
                link.routes.sort(function(a, b) {
                    return a-b;
                });
                delete link.key;
            });
            const networkMap = {nodes: [], links: linkMap};
            this.getDevices().forEach((device) => {
                const friendlyDevice = settings.getDevice(device.ieeeAddr);
                const friendlyName = friendlyDevice ? friendlyDevice.friendly_name : device.ieeeAddr;
                const deviceType = utils.correctDeviceType(device);
                const scanfailed = [];
                if (lqiScanList.has(device.ieeeAddr)) {
                    scanfailed.push('lqi');
                }
                if (rtgScanList.has(device.ieeeAddr)) {
                    scanfailed.push('rtg');
                }
                networkMap.nodes.push({ieeeAddr: device.ieeeAddr, friendlyName: friendlyName, type: deviceType,
                    nwkAddr: device.nwkAddr, manufName: device.manufName, modelId: device.modelId,
                    status: device.status, scanfailed: scanfailed});
            });
            // Clear remaining devices so they don't process when/if they eventually complete
            lqiScanList.clear();
            rtgScanList.clear();
            logger.debug(`Merged map: %j`, networkMap);
            callback(networkMap);
        };

        const processLqiResponse = (error, rsp, targetIeeeAddr, targetNwkAddr) => {
            if (error) {
                logger.warn(`Failed network lqi scan for device: '${targetIeeeAddr}' with error: '${error}'`);
            } else {
                if (lqiScanList.has(targetIeeeAddr)) {
                    // Haven't processed this one yet
                    if (rsp && rsp.status === 0 && rsp.neighborlqilist) {
                        logger.debug(`lqi scan: '${targetIeeeAddr}' with '${rsp.neighborlqilistcount}' neighbors`);
                        rsp.neighborlqilist.forEach(function(neighbor) {
                            // only include active relationships
                            if (neighbor.relationship <= 3) {
                                // lqi is measured at receiver so link is from neighbor (source) to scanned router
                                const key = neighbor.nwkAddr + '|' + targetNwkAddr;
                                linkMap.push({
                                    key: key, sourceIeeeAddr: neighbor.extAddr, targetIeeeAddr: targetIeeeAddr,
                                    sourceNwkAddr: neighbor.nwkAddr, lqi: neighbor.lqi, depth: neighbor.depth,
                                    relationship: neighbor.relationship, routes: []});
                            }
                        });
                        // Remove from scan list and if both lists are done return the completed network map
                        lqiScanList.delete(targetIeeeAddr);
                        if (lqiScanList.size === 0 && rtgScanList.size === 0) {
                            logger.info('Network scan completed');
                            collateMap();
                        } else {
                            logger.debug(`Outstanding network lqi scans for devices: '${[...lqiScanList].join(' ')}'`);
                            logger.debug(`Outstanding network rtg scans for devices: '${[...rtgScanList].join(' ')}'`);
                        }
                    } else {
                        logger.warn(`Empty network lqi scan result for: '${targetIeeeAddr}'`);
                    }
                } else {
                    // This target has already had timeout so don't add to result network map
                    logger.warn(`Ignoring late network lqi scan result for: '${targetIeeeAddr}'`);
                }
            }
        };

        const processRtgResponse = (error, rsp, sourceIeeeAddr, sourceNwkAddr) => {
            if (error) {
                logger.warn(`Failed network rtg scan for device: '${sourceIeeeAddr}' with error: '${error}'`);
            } else {
                if (rtgScanList.has(sourceIeeeAddr)) {
                    // Haven't processed this one yet
                    if (rsp && rsp.status === 0 && rsp.routingtablelist) {
                        logger.debug(`rtg scan: '${sourceIeeeAddr}' with '${rsp.routingtablelistcount}' entries`);
                        rsp.routingtablelist.forEach(function(route) {
                            if (route.routeStatus === 0) {
                                const key = sourceNwkAddr + '|' + route.nextHopNwkAddr;
                                routeMap.push({
                                    key: key, destAddr: route.destNwkAddr});
                            }
                        });
                        // Remove from scan list and if both lists are done return the completed network map
                        rtgScanList.delete(sourceIeeeAddr);
                        if (lqiScanList.size === 0 && rtgScanList.size === 0) {
                            logger.info('Network scan completed');
                            collateMap();
                        } else {
                            logger.debug(`Outstanding network lqi scans for devices: '${[...lqiScanList].join(' ')}'`);
                            logger.debug(`Outstanding network rtg scans for devices: '${[...rtgScanList].join(' ')}'`);
                        }
                    } else {
                        logger.warn(`Empty network rtg scan result for: '${sourceIeeeAddr}'`);
                    }
                } else {
                    // This source has already had timeout so don't add to result network map
                    logger.warn(`Ignoring late network rtg scan result for: '${sourceIeeeAddr}'`);
                }
            }
        };

        // Queue up an lqi scan and an rtg scan for coordinator and each router
        this.getScanable().forEach((dev) => {
            logger.debug(`Queing network scans for device: '${dev.ieeeAddr}'`);
            lqiScanList.add(dev.ieeeAddr);
            this.queue.push(dev.ieeeAddr, (queueCallback) => {
                this.shepherd.controller.request('ZDO', 'mgmtLqiReq', {dstaddr: dev.nwkAddr, startindex: 0},
                    (error, rsp, ieeeAddr, nwkAddr) => {
                        processLqiResponse(error, rsp, dev.ieeeAddr, dev.nwkAddr);
                        queueCallback(error);
                    });
            });
            if (includeRoutes) {
                rtgScanList.add(dev.ieeeAddr);
                this.queue.push(dev.ieeeAddr, (queueCallback) => {
                    this.shepherd.controller.request('ZDO', 'mgmtRtgReq', {dstaddr: dev.nwkAddr, startindex: 0},
                        (error, rsp, ieeeAddr, nwkAddr) => {
                            processRtgResponse(error, rsp, dev.ieeeAddr, dev.nwkAddr);
                            queueCallback(error);
                        });
                });
            }
        });

        // Wait for all device scans before forcing map with whatever results are already in
        setTimeout(() => {
            if (lqiScanList.size === 0 && rtgScanList.size === 0) {
                logger.info('Network scan timeout no outstanding requests');
            } else {
                logger.warn(`Network scan timeout, skipping outstanding lqi scans for '${[...lqiScanList].join(' ')}'`);
                logger.warn(`Network scan timeout, skipping outstanding rtg scans for '${[...rtgScanList].join(' ')}'`);
                collateMap();
            }
        }, lqiScanList.size * 1000);
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
                `${JSON.stringify(zclData)} - ${JSON.stringify(cfg)} - ${entity.epId}`
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
