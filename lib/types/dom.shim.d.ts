// minimal required because of sub-deps in mqtt >= 5.14.0 to avoid requiring `dom` type
declare global {
    // map to node, doesn't really matter, just needs to be there, and the right "type vs value" to avoid lib check problems
    /** @deprecated DOM SHIM, DO NOT USE */
    type MessagePort = import("node:worker_threads").MessagePort;
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
}

export {};
