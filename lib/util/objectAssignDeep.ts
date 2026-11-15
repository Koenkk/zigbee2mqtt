/** Anything mergeable: a plain-ish object, explicitly not an array or another iterable. */
export type UnknownRecord = Record<string | number, unknown> & {[Symbol.iterator]?: never};

function isUnknownRecord(value: unknown): value is UnknownRecord {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function cloneArray(input: readonly unknown[]): unknown[] {
    const len = input.length;
    const output: unknown[] = new Array(len);

    for (let i = 0; i < len; i++) {
        const val = input[i];
        output[i] = isUnknownRecord(val) ? cloneObject(val) : Array.isArray(val) ? cloneArray(val) : val;
    }

    return output;
}

function cloneObject(input: UnknownRecord): UnknownRecord {
    const output: UnknownRecord = {};

    for (const key of Object.keys(input)) {
        if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
            const val = input[key];
            output[key] = isUnknownRecord(val) ? cloneObject(val) : Array.isArray(val) ? cloneArray(val) : val;
        }
    }

    return output;
}

/**
 * Merge all sources into `target` recursively.
 *
 * Key behavior:
 * - ignore properties `__proto__`, `constructor` & `prototype`
 * - assumes no infinite circular possible (unhandled for perf)
 *
 * Pass empty object `{}` as `target` to return a new object without modifying any existing objects.
 */
export function objectAssignDeep<T extends UnknownRecord, S extends readonly UnknownRecord[]>(
    target: T,
    ...sources: S
): T & UnionToIntersection<S[number]> {
    for (const source of sources) {
        for (const key of Object.keys(source)) {
            if (key === "__proto__" || key === "constructor" || key === "prototype") {
                continue;
            }

            const value = source[key];

            if (isUnknownRecord(value)) {
                const existing = target[key];

                (target as UnknownRecord)[key] = isUnknownRecord(existing) ? objectAssignDeep({}, existing, value) : cloneObject(value);
            } else if (Array.isArray(value)) {
                (target as UnknownRecord)[key] = cloneArray(value);
            } else {
                (target as UnknownRecord)[key] = value;
            }
        }
    }

    return target as T & UnionToIntersection<S[number]>;
}
