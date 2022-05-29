require('core-js/features/object/from-entries');
require('core-js/features/array/flat');
const semver = require('semver');
const engines = require('./package.json').engines;
const fs = require('fs');
const os = require('os');
const path = require('path');
const {exec} = require('child_process');
const rimraf = require('rimraf');
require('source-map-support').install();

let controller;
let stopping = false;

const hashFile = path.join(__dirname, 'dist', '.hash');

async function restart() {
    await stop(true);
    await start();
}

async function exit(code, restart) {
    if (!restart) {
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
        const env = {...process.env};
        const _600mb = 629145600;
        if (_600mb > os.totalmem() && !env.NODE_OPTIONS) {
            // Prevent OOM on tsc compile for system with low memory
            // https://github.com/Koenkk/zigbee2mqtt/issues/12034
            env.NODE_OPTIONS = '--max_old_space_size=256';
        }

        exec('npm run build', {env, cwd: __dirname}, async (err, stdout, stderr) => {
            if (err) {
                process.stdout.write(', failed\n');
                if (err.code === 134) {
                    process.stderr.write(
                        '\n\nBuild failed; ran out-of-memory, free some memory (RAM) and start again\n\n');
                }
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
        console.log(`\nIf you don't know how to solve this, read https://www.zigbee2mqtt.io/guide/configuration`); // eslint-disable-line
        console.log(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n\n`);
        exit(1);
    }

    const Controller = require('./dist/controller');
    controller = new Controller(restart, exit);
    await controller.start();
}

async function stop(restart) {
    await controller.stop(restart);
}

async function handleQuit() {
    if (!stopping && controller) {
        stopping = true;
        await stop(false);
    }
}

if (process.argv.length === 3 && process.argv[2] === 'writehash') {
    writeHash();
} else {
    process.on('SIGINT', handleQuit);
    process.on('SIGTERM', handleQuit);
    start();
}
