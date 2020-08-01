const semver = require('semver');
const engines = require('./package.json').engines;

const version = engines.node;
if (!semver.satisfies(process.version, version)) {
    console.log(`\t\tZigbee2MQTT requires node version ${version}, you are running ${process.version}!\n`); // eslint-disable-line
}

// Validate settings
const settings = require('./lib/util/settings');
const errors = settings.validate();
if (errors.length > 0) {
    console.log(`\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
    console.log('            READ THIS CAREFULLY\n');
    console.log(`Refusing to start because configuration is not valid, found the following errors:`);
    for (const error of errors) {
        console.log(`- ${error}`);
    }
    console.log(`\nIf you don't know how to solve this, read https://www.zigbee2mqtt.io/information/configuration.html`);
    console.log(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n\n`);
    process.exit(1);
}

const Controller = require('./lib/controller');
const controller = new Controller();
controller.start();

process.on('SIGINT', handleQuit);
process.on('SIGTERM', handleQuit);

let stopping = false;

function handleQuit() {
    if (!stopping) {
        stopping = true;
        controller.stop();
    }
}
