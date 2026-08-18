// minimal required because of sub-deps in mqtt >= 5.14.0 to avoid requiring `dom` type
declare global {
    /** @deprecated DOM SHIM, DO NOT USE */
    type Worker = import("node:worker_threads").Worker;
    /** @deprecated DOM SHIM, DO NOT USE */
    type Transferable = import("node:worker_threads").Transferable;
    /** @deprecated DOM SHIM, DO NOT USE */
    const addEventListener: import("node:events").EventEmitter["addListener"];
    /** @deprecated DOM SHIM, DO NOT USE */
    const removeEventListener: import("node:events").EventEmitter["removeListener"];
    /** @deprecated DOM SHIM, DO NOT USE */
    const postMessage: import("node:worker_threads").MessagePort["postMessage"];
    /**
     * Required by `srvx` <= 0.12.5, remove once a release including https://github.com/h3js/srvx/pull/288 is out.
     *
     * @deprecated DOM SHIM, DO NOT USE
     */
    type HeadersInit = string[][] | Record<string, string> | Headers;
}

export {};
