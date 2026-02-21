const fs = require("node:fs");
const path = require("node:path");
const {exec} = require("node:child_process");
require("source-map-support").install();

/** @type {import("./dist/controller").Controller | undefined} */
let controller;
let stopping = false;
let watchdogCount = 0;
let unsolicitedStop = false;
// csv in minutes, default: 1min, 5min, 15min, 30min, 60min
let watchdogDelays = [2000, 60000, 300000, 900000, 1800000, 3600000];

if (process.env.Z2M_WATCHDOG != null && process.env.Z2M_WATCHDOG !== "default") {
    if (/^\d+(.\d+)?(,\d+(.\d+)?)*$/.test(process.env.Z2M_WATCHDOG)) {
        watchdogDelays = process.env.Z2M_WATCHDOG.split(",").map((v) => Number.parseFloat(v) * 60000);
    } else {
        console.log(`Invalid watchdog delays (must use number-only CSV format representing minutes, example: 'Z2M_WATCHDOG=1,5,15,30,60'.`);
        process.exit(1);
    }
}

const hashFile = path.join(__dirname, "dist", ".hash");

/** @type {(code: number) => Promise<void>} */
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

/** @type {() => Promise<void>} */
async function restart() {
    await stop(true);
    await start();
}

/** @type {(code: number, restart?: boolean) => Promise<void>} */
async function exit(code, restart = false) {
    if (!restart) {
        if (process.env.Z2M_WATCHDOG != null && unsolicitedStop) {
            await triggerWatchdog(code);
        } else {
            process.exit(code);
        }
    }
}

/** @type {() => Promise<string>} */
async function currentHash() {
    return await new Promise((resolve) => {
        exec("git rev-parse --short=8 HEAD", (error, stdout) => {
            const commitHash = stdout.trim();

            if (error || commitHash === "") {
                resolve("unknown");
            } else {
                resolve(commitHash);
            }
        });
    });
}

/** @type {() => Promise<void>} */
async function writeHash() {
    const hash = await currentHash();

    fs.writeFileSync(hashFile, hash);
}

/** @type {(reason: "initial build" | "hash changed") => Promise<void>} */
async function build(reason) {
    process.stdout.write(`Building Zigbee2MQTT... (${reason})`);
    const {totalmem} = await import("node:os");

    return await new Promise((resolve, reject) => {
        const env = {...process.env};
        const mb600 = 629145600;

        if (mb600 > totalmem() && !env.NODE_OPTIONS) {
            // Prevent OOM on tsc compile for system with low memory
            // https://github.com/Koenkk/zigbee2mqtt/issues/12034
            env.NODE_OPTIONS = "--max_old_space_size=256";
        }

        // clean build, prevent failures due to tsc incremental building
        exec("pnpm run prepack", {env, cwd: __dirname}, (err) => {
            if (err) {
                process.stdout.write(", failed\n");

                if (err.code === 134) {
                    process.stderr.write("\n\nBuild failed; ran out-of-memory, free some memory (RAM) and start again\n\n");
                }

                reject(err);
            } else {
                process.stdout.write(", finished\n");
                resolve();
            }
        });
    });
}

/** @type {() => Promise<void>} */
async function checkDist() {
    if (!fs.existsSync(hashFile)) {
        await build("initial build");
    }

    const distHash = fs.readFileSync(hashFile, "utf8");
    const hash = await currentHash();

    if (hash !== "unknown" && distHash !== hash) {
        await build("hash changed");
    }
}

/** @type {() => Promise<void>} */
async function start() {
    console.log(`Starting Zigbee2MQTT ${process.env.Z2M_WATCHDOG != null ? `with watchdog (${watchdogDelays})` : "without watchdog"}.`);
    await checkDist();

    // gc
    {
        const packageJSON = (await import("./package.json", {with: {type: "json"}})).default;
        const version = packageJSON.engines.node;
        const {satisfies} = await import("semver");

        if (!satisfies(process.version, version)) {
            console.log(`\t\tZigbee2MQTT requires node version ${version}, you are running ${process.version}!\n`);
        }

        const {onboard} = await import("./dist/util/onboarding.js");
        const success = await onboard();

        if (!success) {
            unsolicitedStop = false;

            return await exit(1);
        }
    }

    const {Controller} = await import("./dist/controller.js");
    controller = new Controller(restart, exit);

    await controller.start();

    // consider next controller.stop() call as unsolicited, only after successful first start
    unsolicitedStop = true;
    watchdogCount = 0; // reset
}

/** @type {(restart: boolean, signal?: NodeJS.Signals) => Promise<void>} */
async function stop(restart, signal = undefined) {
    // `handleQuit` or `restart` never unsolicited
    unsolicitedStop = false;

    await controller?.stop(restart, undefined, signal);
}

/** @type {(signal: NodeJS.Signals) => Promise<void>} */
async function handleQuit(signal) {
    if (!stopping) {
        if (controller) {
            stopping = true;

            await stop(false, signal);
        } else {
            process.exit(0);
        }
    }
}

if (require.main === module || require.main?.filename.endsWith(`${path.sep}cli.js`)) {
    if (process.argv.length === 3 && process.argv[2] === "writehash") {
        void writeHash();
    } else {
        process.on("SIGINT", handleQuit);
        process.on("SIGTERM", handleQuit);
        void start();
    }
} else {
    process.on("SIGINT", handleQuit);
    process.on("SIGTERM", handleQuit);

    module.exports = {start};
}
