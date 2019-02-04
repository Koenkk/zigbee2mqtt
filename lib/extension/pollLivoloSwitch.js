const utils = require('../util/utils');
const interval = utils.secondsToMilliseconds(1);
const logger = require('../util/logger');

const foundationCfg = {manufSpec: 0, disDefaultRsp: 0};

/**
 * Extension required for Livolo device support.
 */
class PollLivoloSwitch {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.timer = null;
        this.configured = {};
    }

    onZigbeeStarted() {
        this.startTimer();
    }

    _resetDeviceState(ieeeAddr) {
        this.configured[ieeeAddr] = {
            stage: 0,
            retry: 0,
            waitresp: false,
        };
    }

    onZigbeeMessage(message, device, mappedDevice) {
        // logger.debug(`LIVOLO message.type`, message, device);

        if (!device) {
            return;
        }

        if ((message.type == 'devInterview') ||
            (message.type == 'devIncoming') ||
            (message.type == 'endDeviceAnnce')) {
            if (this.configured.hasOwnProperty(device.ieeeAddr)) {
                logger.info(`LIVOLO ${device.ieeeAddr}. (Re)joins in the network (after power off?)`);
                this._resetDeviceState(device.ieeeAddr);
            }
            return;
        }
    }

    startTimer() {
        this.clearTimer();
        this.timer = setInterval(() => this.handleInterval(), interval);
    }

    clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    stop() {
        this.clearTimer();
    }

    _handleCommandRespSimple(err, rsp) {
        this.ext.configured[this.ieeeAddr].waitresp = false;

        if (err) {
            if (this.ctype === 'toggle') {
                logger.debug(`LIVOLO ${this.ieeeAddr}. Toggle command error:`, err.message);
            }
        } else {
            logger.debug(`LIVOLO ${this.ieeeAddr}. Sucessfully configured`, rsp);
            this.ext.configured[this.ieeeAddr].stage = 1; // sucessfully send command
            this.ext.configured[this.ieeeAddr].retry = 0;
            this.device.status = 'online';
        }
    }

    _handleCommandRespWithData(err, rsp) {
        this.ext.configured[this.ieeeAddr].waitresp = false;

        if (err) {
            logger.info(`LIVOLO ${this.ieeeAddr}. ${this.cid}.${this.ctype} response error:`, err.message);
            if (this.ext.configured[this.ieeeAddr].retry >= 3) {
                // errors in three sequental reads, stop polling, wait for a device message
                this.device.status = 'offline';
                logger.info(`LIVOLO ${this.ieeeAddr}. Stopped polling after 3 unsuccessful attempts`);
            }
        } else {
            this.ext.configured[this.ieeeAddr].retry = 0;
            this.device.status = 'online';
            if (this.ext.zigbee) {
                this.ext.zigbee.shepherd.emit('ind:reported', this.ep, this.cid, rsp, this.ep.last_af_msg);
            }
        }
    }

    // msg: { groupid, clusterid, srcaddr, srcendpoint, dstendpoint, wasbroadcast,
    //   linkquality, securityuse, timestamp, transseqnumber, len, data }
    _handleAfMessage(msg, ep) {
        ep.linkquality = msg.linkquality;
        ep.last_af_msg = msg;
    }

    handleInterval() {
        this.zigbee.getAllClients()
            .filter((d) => d.manufName.startsWith('LIVOLO')) // LIVOLO
            .filter((d) => d.type === 'EndDevice') // Filter end devices
            .filter((d) => d.powerSource && d.powerSource !== 'Battery') // Remove battery powered devices
            .forEach((d) => {
                const zdev = this.zigbee.shepherd._findDevByAddr(d.ieeeAddr);
                if (zdev && zdev.endpoints) {
                    const eplist = Object.keys(zdev.endpoints).filter((epId) => {
                        const ep2 = zdev.getEndpoint(epId);
                        const clist = ep2.getClusterList();
                        return clist && clist.includes(6); // 6 - genOnOff
                    });

                    if (eplist.length > 0) {
                        const ep = zdev.getEndpoint(eplist[0]);

                        ep.onAfIncomingMsg = this._handleAfMessage;

                        if (!this.configured.hasOwnProperty(d.ieeeAddr)) {
                            this._resetDeviceState(d.ieeeAddr);
                        }

                        const cfg = this.configured[d.ieeeAddr];
                        if (cfg.waitresp) {
                            return;
                        }

                        if (cfg.retry < 3) {
                            if (cfg.stage === 0) {
                                cfg.retry += 1;
                                cfg.waitresp = true;

                                logger.debug(`LIVOLO ${d.ieeeAddr}. Sending the 'toggle' command. Retry: ${cfg.retry}`);
                                ep.functional('genOnOff', 'toggle', [cfg], foundationCfg,
                                    this._handleCommandRespSimple.bind({
                                        device: zdev,
                                        ieeeAddr: d.ieeeAddr,
                                        cid: 'genOnOff',
                                        ctype: 'toggle',
                                        ext: this,
                                    }));
                            } else if (cfg.stage === 1) {
                                cfg.retry += 1;
                                cfg.waitresp = true;
                                ep.foundation('genOnOff', 'read', [{
                                    attrId: 0, // onOff
                                }], this._handleCommandRespWithData.bind({
                                    device: zdev,
                                    ieeeAddr: d.ieeeAddr,
                                    ep: ep,
                                    cid: 'genOnOff',
                                    ctype: 'read',
                                    ext: this,
                                }));
                            }
                        }
                    }
                }
            });
        return true;
    }
}

module.exports = PollLivoloSwitch;
