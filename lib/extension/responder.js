const zclId = require('zigbee-herdsman/dist/zcl-id');

const OneJanuary2000 = new Date('January 01, 2000 00:00:00').getTime();

/**
 * This extensions is reponsible for respondig to device requests.
 */
class ExtensionResponder {
    constructor(zigbee, mqtt, state, publishEntityState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;

        this.onZclFoundation = this.onZclFoundation.bind(this);
        this.configured = [];
    }

    setupOnZclFoundation(device) {
        if (device && device.epList && !this.configured.includes(device.ieeeAddr)) {
            this.configured.push(device.ieeeAddr);

            device.epList.forEach((epID) => {
                const ep = this.zigbee.getEndpoint(device.ieeeAddr, epID);
                ep.onZclFoundation = this.onZclFoundation;
            });
        }
    }

    onZigbeeStarted() {
        this.zigbee.getAllClients().forEach((device) => this.setupOnZclFoundation(device));
    }

    onZigbeeMessage(message, device, mappedDevice) {
        this.setupOnZclFoundation(device);
    }

    readResponse(message, endpoint) {
        const clusterID = message.clusterid;
        const cluster = zclId.cluster(clusterID).key;
        const attributes = message.zclMsg.payload.map((p) => zclId.attr(message.clusterid, p.attrId));
        const response = [];

        attributes.forEach((attribute) => {
            if (cluster === 'genTime' && attribute.key === 'time') {
                const time = Math.round(((new Date()).getTime() - OneJanuary2000) / 1000);
                response.push(this.createReadResponseRec(clusterID, attribute.value, time));
            }
        });

        this.zigbee.publish(
            endpoint.device.ieeeAddr, 'device', cluster, 'readRsp', 'foundation', response,
            {direction: 1, seqNum: message.zclMsg.seqNum, disDefaultRsp: 1}, endpoint.epId,
        );
    }

    createReadResponseRec(cId, attrId, value) {
        return {
            attrId: attrId,
            status: 0,
            attrData: value,
            dataType: zclId.attrType(cId, attrId).value,
        };
    }

    onZclFoundation(message, endpoint) {
        const cmd = message.zclMsg.cmdId;

        if (cmd === 'read') {
            this.readResponse(message, endpoint);
        }
    }
}

module.exports = ExtensionResponder;
