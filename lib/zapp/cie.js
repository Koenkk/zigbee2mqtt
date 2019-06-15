/**
 * This is a fake cie app which makes it possible for some iAS devices to join the network.
 * Based on: https://github.com/zigbeer/zapp-cie
 */

const Ziee = require('zigbee-herdsman/dist/ziee');
const Zive = require('zigbee-herdsman/dist/zive');
const cieClusters = new Ziee();
// Direction-Value 1: input, 2: output, 3: input/output

// IasZone Cluster-Init Direction
cieClusters.init('ssIasZone', 'dir', {value: 2}); // Client Side(Output)

// Init Command Response Handler
cieClusters.init('ssIasZone', 'cmdRsps', {
    enrollReq: (zapp, argObj, cb) => {},
    statusChangeNotification: (zapp, argObj, cb) => {},
});

// Create Zive with profId: 0x0104 (Decimal: 260 / HA), devId: 0x0400 (Decimal: 1024 / iasControlIndicatingEquipment)
// Check the Values by https://github.com/zigbeer/zcl-id/wiki#5-table-of-identifiers
const cieApp = new Zive({profId: 0x0104, devId: 0x0400, discCmds: []}, cieClusters);
module.exports = cieApp;
