// Deep merge helper, replacing the unmaintained `object-assign-deep` package while keeping its exact semantics:
// - only plain-ish values are recursed into: anything that is `typeof === "object"`, not `null` and not an array;
//   this means `Date`/`RegExp`/`Map`/class instances are treated as objects and end up as plain objects holding
//   their own enumerable properties (so an empty object for most of them),
// - arrays are always replaced (never concatenated) and cloned element by element,
// - `null` and `undefined` values overwrite whatever is already present,
// - all references are broken, including those of nested objects/arrays,
// - later sources always win.
// The only intentional deviation is that keys able to tamper with the prototype chain are never copied, see `UNSAFE_KEYS`.

type AnyRecord = Record<string, unknown>;

/** Keys that would allow tampering with the prototype chain, never copied since settings/state come from user input. */
const UNSAFE_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/** Everything `typeof === "object"` that is neither `null` nor an array is merged/cloned property by property. */
function isMergeable(value: unknown): value is AnyRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneValue(value: unknown): unknown {
    if (isMergeable(value)) {
        return cloneObject(value);
    }

    if (Array.isArray(value)) {
        return cloneArray(value);
    }

    return value;
}

function cloneArray(input: readonly unknown[]): unknown[] {
    return input.map((value) => cloneValue(value));
}

function cloneObject(input: AnyRecord): AnyRecord {
    const output: AnyRecord = {};

    for (const key of Object.keys(input)) {
        if (UNSAFE_KEYS.has(key)) {
            continue;
        }

        output[key] = cloneValue(input[key]);
    }

    return output;
}

function deepMerge(target: AnyRecord, sources: readonly unknown[]): AnyRecord {
    for (const source of sources) {
        if (!source) {
            continue;
        }

        for (const key of Object.keys(source as AnyRecord)) {
            if (UNSAFE_KEYS.has(key)) {
                continue;
            }

            const value = (source as AnyRecord)[key];

            if (isMergeable(value)) {
                const existing = target[key];

                // an existing non-object value (including `null`) is discarded, but never merged into
                target[key] = existing === undefined ? cloneObject(value) : deepMerge({}, [isMergeable(existing) ? existing : {}, value]);
            } else if (Array.isArray(value)) {
                target[key] = cloneArray(value);
            } else {
                target[key] = value;
            }
        }
    }

    return target;
}

/**
 * Merge all sources into `target`, breaking all references, including those of nested objects and arrays.
 * Unlike `Object.assign()` only `target` itself is mutated, its nested objects are replaced by fresh clones.
 */
export function objectAssignDeep<T extends object, U>(target: T, source: U): T & U;
export function objectAssignDeep<T extends object, U, V>(target: T, source1: U, source2: V): T & U & V;
export function objectAssignDeep(target: object | undefined, ...sources: readonly unknown[]): object {
    return deepMerge((target || {}) as AnyRecord, sources);
}

/** Same as {@link objectAssignDeep} except nothing is mutated, an entirely new object is returned. */
export function objectAssignDeepNoMutate<T, U>(source1: T, source2: U): T & U;
export function objectAssignDeepNoMutate<T, U, V>(source1: T, source2: U, source3: V): T & U & V;
export function objectAssignDeepNoMutate(...sources: readonly unknown[]): object {
    return deepMerge({}, sources);
}
