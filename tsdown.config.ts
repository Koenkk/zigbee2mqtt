import {execFileSync} from "node:child_process";
import {readdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import path from "node:path";
import {brotliDecompressSync, gzipSync} from "node:zlib";
import {externals} from "nf3/plugin";
import {minifySync} from "oxc-minify";
import {defineConfig} from "tsdown";

const OUT_DIR = ".output";
const DIST_DIR = path.join(OUT_DIR, "dist");
const FRONTEND_DIR = path.join(OUT_DIR, "node_modules", "zigbee2mqtt-windfront");

/**
 * Reached through a path tracing cannot follow: a `.node` picked by platform, a guarded optional import, a package
 * named in the config, a require in the copied `index.js`, or an import of a file `FULL_TRACE_INCLUDE` copies without
 * tracing (`iconv-lite`, required by `zigbee-herdsman-converters/dist/devices/easyiot.js`).
 *
 * Only the default frontend ships, so `frontend.package: zigbee2mqtt-frontend` does not start here.
 */
const TRACE_INCLUDE = ["@serialport/bindings-cpp", "unix-dgram", "winston-syslog", "iconv-lite", "zigbee2mqtt-windfront", "semver"];

/**
 * The output is CommonJS. nf3 defaults to ESM-first, which for a dual package copies the build `exports.require` does
 * not point at -- `require("js-yaml")` then fails on a package that looks present.
 */
const CONDITIONS = ["node", "require", "default"];

/**
 * Copied whole because tracing cannot enumerate what they need: `zigbee-herdsman-converters` requires
 * `dist/devices/${name}.js` by a name read at runtime, the frontend serves its `dist/` as static assets. The glob
 * leaves behind 8.4 MB of source maps and `.d.ts`.
 */
const FULL_TRACE_INCLUDE: [string, {glob: string}][] = [
    ["zigbee-herdsman-converters", {glob: "dist/**/*.{js,json}"}],
    ["zigbee2mqtt-windfront", {glob: "dist/**"}],
];

/**
 * Shrinks traced dependencies by ~40%; the frontend is excluded, its `dist/` is already a production build.
 * `keepNames` is not optional: `zigbee-herdsman-converters` narrows types by class name (`dist/lib/utils.js:705-714`,
 * `dist/lib/philips.js:927`) against classes from the also-minified `zigbee-herdsman`.
 */
const MINIFY_TRANSFORM = {
    filter: (id: string): boolean => /\.[cm]?js$/.test(id) && !id.includes("zigbee2mqtt-windfront"),
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

/**
 * The frontend ships every asset twice, `app.js` beside `app.js.br` -- 4.5 MB of the artifact. Dropping the plain copy
 * and keeping only `.br` does not work: browsers offer brotli on secure origins only, and Z2M is normally served over
 * plain HTTP on a LAN address, where Chrome sends `Accept-Encoding: gzip, deflate` and every asset would 404. Repacked
 * as `.gz`, which every client accepts, one copy is enough and 4.3 MB goes away.
 *
 * `index.html` keeps both copies, at 1.5 kB: `express-static-gzip` turns a directory request into it by rewriting
 * `req.url`, but looks up compressed variants by `req.path`, which still reads `/`.
 */
function repackFrontendAssets(): void {
    for (const file of readdirSync(FRONTEND_DIR, {encoding: "utf8", recursive: true})) {
        if (!file.endsWith(".br") || file.endsWith("index.html.br")) {
            continue;
        }

        const source = path.join(FRONTEND_DIR, file.slice(0, -3));

        writeFileSync(`${source}.gz`, gzipSync(brotliDecompressSync(readFileSync(`${source}.br`)), {level: 9}));
        rmSync(`${source}.br`);
        rmSync(source, {force: true});
    }
}

/** Only `version` and `engines` are read at runtime, by `lib/util/utils.ts:38` and `index.js:135`. */
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
    // mirrors `lib/` into `dist/` one-to-one: `lib/util/utils.ts`, `lib/util/data.ts` and `lib/extension/externalJS.ts`
    // resolve `../..` from their own location, so a shallower chunk repoints `dist/.hash`, the data directory and
    // `node_modules` outside the install
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
            let hash = "unknown";

            try {
                hash = execFileSync("git", ["rev-parse", "--short=8", "HEAD"], {encoding: "utf8"}).trim() || "unknown";
            } catch {
                /* not a git checkout; "unknown" is what `index.js` would have recorded anyway */
            }

            writeFileSync(path.join(DIST_DIR, ".hash"), hash);
            writeManifest();
            repackFrontendAssets();
        },
    },
});
