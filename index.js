const semver = require('semver');
const engines = require('./package.json').engines;
const indexJsRestart = 'indexjs.restart';
const fs = require('fs');
const path = require('path');
const {exec} = require('child_process');
const rimraf = require('rimraf');
require('source-map-support').install();

let controller;
let stopping = false;

const hashFile = path.join(__dirname, 'dist', '.hash');

async function restart() {
    await stop(indexJsRestart);
    await start();
}

async function exit(code, reason) {
    if (reason !== indexJsRestart) {
        process.exit(code);
    }
}

async function currentHash() {
    const git = require('git-last-commit');
    return new Promise((resolve) => {
        git.getLastCommit((err, commit) => {
            if (err) resolve('unknown');
            else resolve(commit.shortHash);
        });
    });
}

async function writeHash() {
    const hash = await currentHash();
    fs.writeFileSync(hashFile, hash);
}

async function build(reason) {
    return new Promise((resolve, reject) => {
        process.stdout.write(`Building Zigbee2MQTT... (${reason})`);
        rimraf.sync('dist');
        exec('npm run build', {cwd: __dirname}, async (err, stdout, stderr) => {
            if (err) {
                process.stdout.write(', failed\n');
                reject(err);
            } else {
                process.stdout.write(', finished\n');
                resolve();
            }
        });
    });
}

async function checkDist() {
    if (!fs.existsSync(hashFile)) {
        await build('initial build');
    }

    const distHash = fs.readFileSync(hashFile, 'utf-8');
    const hash = await currentHash();
    if (hash !== 'unknown' && distHash !== hash) {
        await build('hash changed');
    }
}

async function start() {
    await checkDist();

    const version = engines.node;
    if (!semver.satisfies(process.version, version)) {
        console.log(`\t\tZigbee2MQTT requires node version ${version}, you are running ${process.version}!\n`); // eslint-disable-line
    }

    // Validate settings
    const settings = require('./dist/util/settings');
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

    const Controller = require('./dist/controller');
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

if (process.argv.length === 3 && process.argv[2] === 'writehash') {
    writeHash();
} else {
    process.on('SIGINT', handleQuit);
    process.on('SIGTERM', handleQuit);
    start();
}
