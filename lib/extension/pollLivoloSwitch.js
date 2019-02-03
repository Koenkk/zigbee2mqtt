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
        if (err) {
            logger.error(this.cid + '.' + this.ctype, 'response error:', err);
            if (this.cid === 'toggle') {
                this.ext.configured[this.ieeeAddr] = 0;
            }
        } else {
            this.ext.configured[this.ieeeAddr] = 2; // sucessfully send command
            this.device.status = 'online';
        }
    }

    _handleCommandRespWithData(err, rsp) {
        if (err) {
            logger.info(this.cid + '.' + this.ctype, 'response error:', err);
        } else {
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
            .filter((d) => d.manufName && d.manufName.startsWith('LIVOLO')) // LIVOLO
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
                            this.configured[d.ieeeAddr] = 0;
                        }

                        if (!this.configured[d.ieeeAddr]) {
                            const cfg = {};
                            // logger.info('=====>Send toggle');
                            this.configured[d.ieeeAddr] = 1; // command sent, wait a result
                            ep.functional('genOnOff', 'toggle', [cfg], foundationCfg,
                                this._handleCommandRespSimple.bind({
                                    device: zdev,
                                    ieeeAddr: d.ieeeAddr,
                                    cid: 'genOnOff',
                                    ctype: 'toggle',
                                    ext: this,
                                }));
                        } else if (this.configured[d.ieeeAddr] === 2) {
                            ep.foundation('genOnOff', 'read', [{
                                attrId: 0, // onOff
                            }], this._handleCommandRespWithData.bind({
                                device: zdev,
                                ep: ep,
                                cid: 'genOnOff',
                                ctype: 'read',
                                ext: this,
                            }));
                        }
                    }
                }
            });
        return true;
    }
}

module.exports = PollLivoloSwitch;
