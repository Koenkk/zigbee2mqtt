/** Anything mergeable: a plain-ish object, explicitly not an array or another iterable. */
export type UnknownRecord = Record<string | number, unknown> & {
    [Symbol.iterator]?: never;
};
/**
 * Merge all sources into `target` recursively.
 *
 * Key behavior:
 * - ignore properties `__proto__`, `constructor` & `prototype`
 * - assumes no infinite circular possible (unhandled for perf)
 *
 * Pass empty object `{}` as `target` to return a new object without modifying any existing objects.
 */
export declare function objectAssignDeep<T extends UnknownRecord, S extends readonly UnknownRecord[]>(target: T, ...sources: S): T & UnionToIntersection<S[number]>;
//# sourceMappingURL=objectAssignDeep.d.ts.map