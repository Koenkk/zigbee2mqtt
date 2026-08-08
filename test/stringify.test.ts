import {describe, expect, it} from "vitest";

import {stringify} from "../lib/util/stringify";

describe("stringify", () => {
    it("keeps every element of a typed array", () => {
        expect(stringify({data: new Uint8Array([10, 20, 30, 40])})).toStrictEqual(JSON.stringify({data: {0: 10, 1: 20, 2: 30, 3: 40}}));
    });

    it("keeps every element of a bigint typed array", () => {
        expect(stringify({data: new BigUint64Array([1n, 2n, 3n])})).toStrictEqual(JSON.stringify({data: {0: "1", 1: "2", 2: "3"}}));
    });

    it("keeps a typed array's own properties after its elements", () => {
        const data = Object.assign(new Uint8Array([7, 8]), {unit: "raw"});

        expect(stringify({data})).toStrictEqual(JSON.stringify({data: {0: 7, 1: 8, unit: "raw"}}));
    });
});
