const semver = require('semver');
const engines = require('./package.json').engines;

const version = engines.node;
if (!semver.satisfies(process.version, version)) {
    console.log(`\t\tZigbee2mqtt requires node version ${version}, you are running ${process.version}!\n`); // eslint-disable-line
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
        controller.stop(() => process.exit());
    }
}
