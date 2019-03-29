const utils = require('../util/utils');
const interval = utils.secondsToMilliseconds(1);
const logger = require('../util/logger');

const foundationCfg = {manufSpec: 0, disDefaultRsp: 0};

/**
 * Extension required for Livolo device support.
 */
class Livolo {
    constructor(zigbee, mqtt, state, publishEntityState) {
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
        if (!device) {
            return;
        }

        if ((message.type == 'devInterview') ||
            (message.type == 'devIncoming') ||
            (message.type == 'endDeviceAnnce') ||
            (message.type == 'devStatus')) {
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

    _sendToggle(zdev, ieeeAddr, ep, retry) {
        this.zigbee.queue.push(ieeeAddr, (queueCallback) => {
            const cfg = {};
            logger.debug(`LIVOLO ${ieeeAddr}. Sending the 'toggle' command. Retry: ${retry}`);
            ep.functional('genOnOff', 'toggle', [cfg], foundationCfg,
                this._handleCommandRespSimple.bind({
                    device: zdev,
                    ieeeAddr,
                    cid: 'genOnOff',
                    ctype: 'toggle',
                    ext: this,
                }));

            queueCallback();
        });
    }

    _sendPoll(zdev, ieeeAddr, ep, retry) {
        this.zigbee.queue.push(ieeeAddr, (queueCallback) => {
            ep.foundation('genOnOff', 'read', [{
                attrId: 0, // onOff
            }], this._handleCommandRespWithData.bind({
                device: zdev,
                ieeeAddr,
                ep,
                cid: 'genOnOff',
                ctype: 'read',
                ext: this,
            }));

            queueCallback();
        });
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
                            this._resetDeviceState(d.ieeeAddr);
                        }

                        const state = this.configured[d.ieeeAddr];
                        if (state.waitresp) {
                            return;
                        }

                        if (state.retry < 3) {
                            if (state.stage === 0) {
                                state.retry += 1;
                                state.waitresp = true;
                                this._sendToggle(zdev, d.ieeeAddr, ep, state.retry);
                            } else if (state.stage === 1) {
                                state.retry += 1;
                                state.waitresp = true;
                                this._sendPoll(zdev, d.ieeeAddr, ep, state.retry);
                            }
                        }
                    }
                }
            });
        return true;
    }
}

module.exports = Livolo;
