import {execFileSync} from "node:child_process";
import {readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {externals} from "nf3/plugin";
import {minifySync} from "oxc-minify";
import {defineConfig} from "tsdown";

const OUT_DIR = ".output";
const DIST_DIR = path.join(OUT_DIR, "dist");

/**
 * Loaded through a runtime path a bundler cannot follow, so tracing cannot discover them on its own.
 *
 * - `@serialport/bindings-cpp` is resolved by `node-gyp-build`, which picks a `.node` file by platform at runtime.
 *   Note the Docker build deletes `prebuilds/` and rebuilds, moving the binary to `build/Release/`.
 * - `unix-dgram` and `winston-syslog` are optional and imported inside a guard (`lib/util/sd-notify.ts:19`,
 *   `lib/util/logger.ts:109`).
 * - The frontends are chosen by config at runtime (`lib/extension/frontend.ts:80`).
 * - `semver` is imported by `index.js:137`, which is copied rather than built, so it is absent from the module graph
 *   the plugin traces. Without it the artifact fails to start at all.
 */
const TRACE_INCLUDE = ["@serialport/bindings-cpp", "unix-dgram", "winston-syslog", "zigbee2mqtt-windfront", "zigbee2mqtt-frontend", "semver"];

/**
 * The output is CommonJS, so dependencies are reached through `require`. nf3 defaults to `["node", "import",
 * "default"]`, which for a dual package copies the ESM build and leaves the file `exports.require` points at behind --
 * `require("js-yaml")` then fails on a package that looks present.
 */
const CONDITIONS = ["node", "require", "default"];

/**
 * Copied whole rather than file-by-file, because static analysis provably cannot enumerate what they need.
 *
 * - `zigbee-herdsman-converters/dist/index.js:176` does `require(\`./devices/${moduleName}\`)` with the name read from
 *   `models-index.json` at runtime. Tracing sees no device file and would drop all ~400 of them, leaving Z2M unable to
 *   recognise any device.
 * - The frontends export a function returning a directory of static assets; tracing only ever sees their `index.js`.
 */
const FULL_TRACE_INCLUDE: [string, {glob: string}][] = [
    // narrowed to runtime files: an unqualified `dist/**` also drags in 7.8 MB of source maps and 0.6 MB of `.d.ts`,
    // which is most of this package. Tracing finds `models-index.json` on its own, but match it anyway.
    ["zigbee-herdsman-converters", {glob: "dist/**/*.{js,json}"}],
    // static assets, and no source maps or declarations shipped -- take everything
    ["zigbee2mqtt-windfront", {glob: "dist/**"}],
    ["zigbee2mqtt-frontend", {glob: "dist/**"}],
];

/**
 * Shrinks traced dependencies by ~40%. The frontends are excluded: their `dist/` is already a production build, so
 * re-minifying costs build time for nothing.
 *
 * `keepNames` is not optional. `zigbee-herdsman-converters` narrows types by class name --
 * `dist/lib/utils.js:705-714` does `obj.constructor.name.toLowerCase() === "endpoint" | "device" | "group"`, and
 * `dist/lib/philips.js:927` compares against `"Group"`. Those classes come from `zigbee-herdsman`, which is minified
 * too, so mangling them makes every one of those checks silently return false.
 */
const MINIFY_TRANSFORM = {
    filter: (id: string): boolean => /\.[cm]?js$/.test(id) && !id.includes("zigbee2mqtt-windfront") && !id.includes("zigbee2mqtt-frontend"),
    handler: (code: string, id: string): string | undefined => {
        const keepNames = {function: true, class: true};

        try {
            return minifySync(id, code, {compress: {keepNames}, mangle: {keepNames}}).code;
        } catch {
            // a dependency the parser chokes on is copied through untouched rather than failing the build
            return undefined;
        }
    },
};

function writeHash(): void {
    let hash = "unknown";

    try {
        hash = execFileSync("git", ["rev-parse", "--short=8", "HEAD"], {encoding: "utf8"}).trim() || "unknown";
    } catch {
        /* not a git checkout; "unknown" is what `index.js` would have recorded anyway */
    }

    writeFileSync(path.join(DIST_DIR, ".hash"), hash);
}

/**
 * Only `version` and `engines` are actually read at runtime -- by `lib/util/utils.ts:38` and `index.js:135`
 * respectively. `getDependencyVersion` reads each dependency's own `package.json`, never this one, so listing the
 * traced dependencies here would be decoration.
 */
function writeManifest(): void {
    const source = JSON.parse(readFileSync("package.json", "utf8"));

    writeFileSync(
        path.join(OUT_DIR, "package.json"),
        `${JSON.stringify(
            {
                name: source.name,
                version: source.version,
                description: source.description,
                license: source.license,
                engines: source.engines,
                main: "index.js",
                bin: source.bin,
            },
            undefined,
            2,
        )}\n`,
    );
}

export default defineConfig({
    entry: [
        "lib/controller.ts",
        "lib/util/onboarding.ts",
        "lib/extension/frontend.ts",
        "lib/extension/homeassistant.ts",
        "lib/util/settingsMigration.ts",
    ],
    root: "lib",
    outDir: DIST_DIR,
    format: "cjs",
    platform: "node",
    target: "node22",
    // mirrors `lib/` into `dist/` one-to-one. `lib/util/utils.ts`, `lib/util/data.ts` and `lib/extension/externalJS.ts`
    // each resolve `../..` from their own location; merging them into a shallower chunk repoints `dist/.hash`, the data
    // directory and `node_modules` outside the install
    unbundle: true,
    fixedExtension: false,
    dts: false,
    minify: false,
    sourcemap: false,
    clean: [OUT_DIR],
    outputOptions: {exports: "named"},
    copy: [
        // `cli.js` backs the `bin` entry the manifest declares; without it that entry dangles
        {from: "index.js", to: OUT_DIR},
        {from: "cli.js", to: OUT_DIR},
        {from: "LICENSE", to: OUT_DIR},
        {from: "data/configuration.example.yaml", to: OUT_DIR},
    ],
    plugins: [
        externals({
            traceInclude: TRACE_INCLUDE,
            conditions: CONDITIONS,
            trace: {
                fullTraceInclude: FULL_TRACE_INCLUDE,
                outDir: OUT_DIR,
                conditions: CONDITIONS,
                transform: [MINIFY_TRANSFORM],
            },
        }),
    ],
    hooks: {
        "build:done": () => {
            writeManifest();
            writeHash();
        },
    },
});
