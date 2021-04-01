const semver = require('semver');
const engines = require('./package.json').engines;
const indexJsRestart = 'indexjs.restart';

let controller;
let stopping = false;

async function restart() {
    await stop(indexJsRestart);
    await start();
}

async function exit(code, reason) {
    if (reason !== indexJsRestart) {
        process.exit(code);
    }
}

async function start() {
    const version = engines.node;
    if (!semver.satisfies(process.version, version)) {
        console.log(`\t\tZigbee2MQTT requires node version ${version}, you are running ${process.version}!\n`); // eslint-disable-line
    }

    // Validate settings
    const settings = require('./lib/util/settings');
    settings.reRead();
    const errors = settings.validate();
    if (errors.length > 0) {
        console.log(`\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
        console.log('            READ THIS CAREFULLY\n');
        console.log(`Refusing to start because configuration is not valid, found the following errors:`);
        for (const error of errors) {
            console.log(`- ${error}`);
        }
        console.log(`\nIf you don't know how to solve this, read https://www.zigbee2mqtt.io/information/configuration.html`); // eslint-disable-line
        console.log(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n\n`);
        exit(1);
    }

    const Controller = require('./lib/controller');
    controller = new Controller(restart, exit);
    await controller.start();
}

async function stop(reason=null) {
    await controller.stop(reason);
}

async function handleQuit() {
    if (!stopping && controller) {
        stopping = true;
        await stop();
    }
}

process.on('SIGINT', handleQuit);
process.on('SIGTERM', handleQuit);

start();
