const semver = require('semver');
const engines = require('./package.json').engines;
const fs = require('fs');
const os = require('os');
const path = require('path');
const {exec} = require('child_process');
require('source-map-support').install();

let controller;
let stopping = false;
let watchdog = process.env.Z2M_WATCHDOG != undefined;
let watchdogCount = 0;
let unsolicitedStop = false;
// csv in minutes, default: 1min, 5min, 15min, 30min, 60min
let watchdogDelays = [2000, 60000, 300000, 900000, 1800000, 3600000];

if (watchdog && process.env.Z2M_WATCHDOG !== 'default') {
    if (/^\d+(.\d+)?(,\d+(.\d+)?)*$/.test(process.env.Z2M_WATCHDOG)) {
        watchdogDelays = process.env.Z2M_WATCHDOG.split(',').map((v) => parseFloat(v) * 60000);
    } else {
        console.log(`Invalid watchdog delays (must use number-only CSV format representing minutes, example: 'Z2M_WATCHDOG=1,5,15,30,60'.`);
        process.exit(1);
    }
}

const hashFile = path.join(__dirname, 'dist', '.hash');

async function triggerWatchdog(code) {
    const delay = watchdogDelays[watchdogCount];
    watchdogCount += 1;

    if (delay) {
        // garbage collector
        controller = undefined;

        console.log(`WATCHDOG: Waiting ${delay / 60000}min before next start try.`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        await start();
    } else {
        process.exit(code);
    }
}

async function restart() {
    await stop(true);
    await start();
}

async function exit(code, restart = false) {
    if (!restart) {
        if (watchdog && unsolicitedStop) {
            await triggerWatchdog(code);
        } else {
            process.exit(code);
        }
    }
}

async function currentHash() {
    return await new Promise((resolve) => {
        exec('git rev-parse --short=8 HEAD', (error, stdout) => {
            const commitHash = stdout.trim();

            if (error || commitHash === '') {
                resolve('unknown');
            } else {
                resolve(commitHash);
            }
        });
    });
}

async function writeHash() {
    const hash = await currentHash();

    fs.writeFileSync(hashFile, hash);
}

async function build(reason) {
    process.stdout.write(`Building Zigbee2MQTT... (${reason})`);

    return await new Promise((resolve, reject) => {
        const env = {...process.env};
        const _600mb = 629145600;

        if (_600mb > os.totalmem() && !env.NODE_OPTIONS) {
            // Prevent OOM on tsc compile for system with low memory
            // https://github.com/Koenkk/zigbee2mqtt/issues/12034
            env.NODE_OPTIONS = '--max_old_space_size=256';
        }

        // clean build, prevent failures due to tsc incremental building
        exec('pnpm run prepack', {env, cwd: __dirname}, async (err, stdout, stderr) => {
            if (err) {
                process.stdout.write(', failed\n');

                if (err.code === 134) {
                    process.stderr.write('\n\nBuild failed; ran out-of-memory, free some memory (RAM) and start again\n\n');
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

    const distHash = fs.readFileSync(hashFile, 'utf8');
    const hash = await currentHash();

    if (hash !== 'unknown' && distHash !== hash) {
        await build('hash changed');
    }
}

async function start() {
    console.log(`Starting Zigbee2MQTT ${watchdog ? `with watchdog (${watchdogDelays})` : `without watchdog`}.`);
    await checkDist();

    // gc
    {
        const version = engines.node;

        if (!semver.satisfies(process.version, version)) {
            console.log(`\t\tZigbee2MQTT requires node version ${version}, you are running ${process.version}!\n`);
        }

        const {onboard} = require('./dist/util/onboarding');

        const success = await onboard();

        if (!success) {
            unsolicitedStop = false;

            return await exit(1);
        }
    }

    const {Controller} = require('./dist/controller');
    controller = new Controller(restart, exit);

    await controller.start();

    // consider next controller.stop() call as unsolicited, only after successful first start
    unsolicitedStop = true;
    watchdogCount = 0; // reset
}

async function stop(restart) {
    // `handleQuit` or `restart` never unsolicited
    unsolicitedStop = false;

    await controller.stop(restart);
}

async function handleQuit() {
    if (!stopping) {
        if (controller) {
            stopping = true;

            await stop(false);
        } else {
            process.exit(0);
        }
    }
}

if (require.main === module || require.main.filename.endsWith(path.sep + 'cli.js')) {
    if (process.argv.length === 3 && process.argv[2] === 'writehash') {
        writeHash();
    } else {
        process.on('SIGINT', handleQuit);
        process.on('SIGTERM', handleQuit);
        start();
    }
} else {
    process.on('SIGINT', handleQuit);
    process.on('SIGTERM', handleQuit);

    module.exports = {start};
}
