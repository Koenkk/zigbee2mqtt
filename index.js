const fs = require('fs');
const Controller = require('./lib/controller');
const data = require('./lib/util/data.js');

if (process.env.ZIGBEE2MQTT_DATA) {
  fs.copyFileSync('./data/configuration.yaml', data.joinPath('configuration.yaml'))
}

const controller = new Controller();
controller.start();

process.on('SIGINT', handleQuit);

function handleQuit() {
    controller.stop(() => process.exit());
}
