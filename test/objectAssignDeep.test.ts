import {describe, expect, it} from "vitest";
import {objectAssignDeep} from "../lib/util/objectAssignDeep";

/** Creates an object with a real own `__proto__`/`constructor`/`prototype` property, like a parsed YAML/JSON payload can. */
const parse = (json: string): Record<string, unknown> => JSON.parse(json);

describe("objectAssignDeep", () => {
    it("Mutates and returns the target", () => {
        const target = {a: 1};
        const result = objectAssignDeep(target, {b: 2});

        expect(result).toBe(target);
        expect(result).toStrictEqual({a: 1, b: 2});
    });

    it("Applies sources in order, later ones win", () => {
        expect(objectAssignDeep({}, {a: 1, b: 1}, {b: 2, c: 2})).toStrictEqual({a: 1, b: 2, c: 2});
    });

    it("Copies keys missing from the target", () => {
        expect(objectAssignDeep({}, {nested: {deep: {value: 1}}})).toStrictEqual({nested: {deep: {value: 1}}});
    });

    it("Deep merges nested objects present in both", () => {
        const target = {mqtt: {base_topic: "zigbee2mqtt", server: "old"}, advanced: {channel: 11}};
        const result = objectAssignDeep(target, {mqtt: {server: "new"}});

        expect(result).toStrictEqual({mqtt: {base_topic: "zigbee2mqtt", server: "new"}, advanced: {channel: 11}});
    });

    it("Replaces nested objects of the target instead of mutating them", () => {
        const nested = {a: 1};
        const target = {nested};

        objectAssignDeep(target, {nested: {b: 2}});

        expect(nested).toStrictEqual({a: 1});
        expect(target.nested).not.toBe(nested);
        expect(target.nested).toStrictEqual({a: 1, b: 2});
    });

    it("Replaces an existing non-object value with a clone of the source object", () => {
        expect(objectAssignDeep({a: 5}, {a: {b: 1}})).toStrictEqual({a: {b: 1}});
        expect(objectAssignDeep({a: "str"}, {a: {b: 1}})).toStrictEqual({a: {b: 1}});
        expect(objectAssignDeep({a: [1, 2]}, {a: {b: 1}})).toStrictEqual({a: {b: 1}});
        // `null` is not `undefined`, so it takes the "existing value" path but is not merged into
        expect(objectAssignDeep({a: null}, {a: {b: 1}})).toStrictEqual({a: {b: 1}});
    });

    it("Overwrites with null and undefined", () => {
        expect(objectAssignDeep({a: {b: 1}, c: 1}, {a: null, c: null})).toStrictEqual({a: null, c: null});
        expect(objectAssignDeep({a: {b: 1}, c: 1}, {a: undefined, c: undefined})).toStrictEqual({a: undefined, c: undefined});
    });

    it("Replaces arrays instead of concatenating them", () => {
        expect(objectAssignDeep({a: [1, 2, 3]}, {a: [4]})).toStrictEqual({a: [4]});
        expect(objectAssignDeep({a: [1, 2, 3]}, {a: []})).toStrictEqual({a: []});
        // no existing array either
        expect(objectAssignDeep({a: 1}, {a: [4]})).toStrictEqual({a: [4]});
        expect(objectAssignDeep({}, {a: [4]})).toStrictEqual({a: [4]});
    });

    it("Clones arrays and the objects nested inside them", () => {
        const source = {a: [{b: 1}, [{c: 2}]]};
        const result = objectAssignDeep({}, source) as typeof source;

        expect(result).toStrictEqual(source);
        expect(result.a).not.toBe(source.a);
        expect(result.a[0]).not.toBe(source.a[0]);
        expect((result.a[1] as {c: number}[])[0]).not.toBe((source.a[1] as {c: number}[])[0]);
    });

    it("Breaks all references to the sources", () => {
        const source = {a: {b: {c: 1}}};
        const result = objectAssignDeep({}, source) as typeof source;

        source.a.b.c = 99;

        expect(result.a.b.c).toStrictEqual(1);
    });

    it("Does not mutate the sources", () => {
        const source = {a: {b: 1}};

        objectAssignDeep({a: {c: 2}}, source);

        expect(source).toStrictEqual({a: {b: 1}});
    });

    it("Copies functions and primitives by value/reference", () => {
        const fn = (): number => 1;
        const symbol = Symbol("s");
        const result = objectAssignDeep({}, {fn, symbol, big: 1n, nan: Number.NaN});

        expect(result.fn).toBe(fn);
        expect(result.symbol).toBe(symbol);
        expect(result.big).toStrictEqual(1n);
        expect(result.nan).toBeNaN();
    });

    it("Reduces non-plain objects to their own enumerable properties", () => {
        // documented (inherited) behaviour: only own enumerable properties survive, the prototype is lost
        expect(objectAssignDeep({}, {date: new Date(0)})).toStrictEqual({date: {}});
        expect(objectAssignDeep({}, {regexp: /abc/g})).toStrictEqual({regexp: {}});
        expect(objectAssignDeep({}, {map: new Map([["k", 1]])})).toStrictEqual({map: {}});
        expect(objectAssignDeep({}, {set: new Set([1])})).toStrictEqual({set: {}});

        class Device {
            id = 1;
            get computed(): number {
                return 2;
            }
        }

        const result = objectAssignDeep({}, {device: new Device()});

        expect(result.device).toStrictEqual({id: 1});
        expect(result.device).not.toBeInstanceOf(Device);
    });

    it("Merges deeply nested objects coming from multiple sources", () => {
        const result = objectAssignDeep({}, {a: {b: {c: 1}}}, {a: {b: {d: 2}, e: 3}});

        expect(result).toStrictEqual({a: {b: {c: 1, d: 2}, e: 3}});
    });

    it("Never copies keys that could tamper with the prototype chain", () => {
        const result = objectAssignDeep({}, parse('{"__proto__": {"polluted": "yes"}, "constructor": {"x": 1}, "prototype": {"y": 2}, "safe": 1}'));

        expect(result).toStrictEqual({safe: 1});
        expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
        expect(({} as {polluted?: string}).polluted).toBeUndefined();
    });

    it("Never copies unsafe keys nested inside cloned objects", () => {
        const result = objectAssignDeep({}, {nested: parse('{"__proto__": {"polluted": "yes"}, "constructor": 1, "prototype": 2, "safe": 1}')});

        expect(result).toStrictEqual({nested: {safe: 1}});
        expect(Object.getPrototypeOf(result.nested)).toBe(Object.prototype);
    });

    it("Never copies unsafe keys when merging into an existing object", () => {
        const result = objectAssignDeep({nested: {safe: 1}}, {nested: parse('{"__proto__": {"polluted": "yes"}, "other": 2}')});

        expect(result).toStrictEqual({nested: {safe: 1, other: 2}});
        expect(Object.getPrototypeOf(result.nested)).toBe(Object.prototype);
    });

    it("Leaves every source untouched when given an empty target", () => {
        const first = {a: {b: 1}};
        const second = {a: {c: 2}};
        const result = objectAssignDeep({}, first, second);

        expect(result).toStrictEqual({a: {b: 1, c: 2}});
        expect(result).not.toBe(first);
        expect(result).not.toBe(second);
        expect(result.a).not.toBe(first.a);
        expect(first).toStrictEqual({a: {b: 1}});
        expect(second).toStrictEqual({a: {c: 2}});
    });
});
