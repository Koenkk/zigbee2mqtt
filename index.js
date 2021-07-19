const semver = require('semver');
const engines = require('./package.json').engines;
const indexJsRestart = 'indexjs.restart';
const fs = require('fs');
const path = require('path');

let controller;
let stopping = false;

const runningAsTsnode = !!process[Symbol.for('ts-node.register.instance')];
const modulePath = runningAsTsnode ? '.' : './dist';
const hashFile = path.join('dist', '.hash');

async function restart() {
    await stop(indexJsRestart);
    await start();
}

async function exit(code, reason) {
    if (reason !== indexJsRestart) {
        process.exit(code);
    }
}

async function writeCurrentHash() {
    const hash = await currentHash();
    fs.writeFileSync(hashFile, hash);
}

async function currentHash() {
    const git = require('git-last-commit');
    return new Promise((resolve) => {
        git.getLastCommit((err, commit) => {
            if (err) resolve('');
            else resolve(commit.shortHash);
        });
    });
}

async function checkDist() {
    if (!fs.existsSync('dist') || !fs.existsSync(hashFile)) {
        console.log(`You need to build Zigbee2MQTT first by running 'npm run build'`);
        exit(1);
    }

    const distHash = fs.readFileSync(hashFile, 'utf-8');
    const current = await currentHash();
    if (current && distHash !== current) {
        console.log(`Build is outdated, rebuild Zigbee2MQTT by running 'npm run build'`);
        exit(1);
    }
}

async function start() {
    if (!runningAsTsnode) {
        await checkDist();
    }

    const version = engines.node;
    if (!semver.satisfies(process.version, version)) {
        console.log(`\t\tZigbee2MQTT requires node version ${version}, you are running ${process.version}!\n`); // eslint-disable-line
    }

    // Validate settings
    const settings = require(modulePath + '/lib/util/settings');
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

    const Controller = require(modulePath + '/lib/controller');
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

if (process.argv.length >= 3 && process.argv[2] === 'writehash') {
    writeCurrentHash();
} else {
    process.on('SIGINT', handleQuit);
    process.on('SIGTERM', handleQuit);
    start();
}
