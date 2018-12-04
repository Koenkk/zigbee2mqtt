/**
 * This is a fake cie app which makes it possible for some iAS devices to join the network.
 * Based on: https://github.com/zigbeer/zapp-cie
 */

const Ziee = require('ziee');
const Zive = require('zive');
const cieClusters = new Ziee();

cieClusters.init('genBasic', 'dir', {value: 1}); // Server Side(Input)
cieClusters.init('ssIasAce', 'dir', {value: 1}); // Server Side(Input)
cieClusters.init('ssIasZone', 'dir', {value: 2}); // Client Side(Output)
cieClusters.init('ssIasWd', 'dir', {value: 2}); // Client Side(Output)
cieClusters.init('genIdentify', 'dir', {value: 3}); // Server and Client Side(Input/Output)

// Init Attributes Access Control
cieClusters.init('genBasic', 'acls', {
    zclVersion: 'R',
    hwVersion: 'R',
    manufacturerName: 'R',
    modelId: 'R',
    dateCode: 'R',
    powerSource: 'R',
    locationDesc: 'RW',
    physicalEnv: 'RW',
    deviceEnabled: 'RW',
});

cieClusters.init('genIdentify', 'acls', {
    identifyTime: 'RW',
});

// Init Attributes Value
cieClusters.init('genBasic', 'attrs', {
    zclVersion: 1,
    hwVersion: 1,
    manufacturerName: 'sivann inc.',
    modelId: 'hiver0001',
    dateCode: '20170407',
    powerSource: 1,
    locationDesc: '    ',
    physicalEnv: 0,
    deviceEnabled: 1,
});

cieClusters.init('genIdentify', 'attrs', {
    identifyTime: 0,
});

// Init Command Response Handler
cieClusters.init('ssIasZone', 'cmdRsps', {
    enrollReq: (zapp, argObj, cb) => {},
    statusChangeNotification: (zapp, argObj, cb) => {},
});

const cieApp = new Zive({profId: 0x0104, devId: 0x0400, discCmds: []}, cieClusters);
module.exports = cieApp;
