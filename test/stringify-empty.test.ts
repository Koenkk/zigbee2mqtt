import {describe, expect, it} from "vitest";

import {stringify} from "../lib/util/stringify";

describe("stringify", () => {
    it("emits valid JSON for an empty typed array carrying a property", () => {
        const data = Object.assign(new Uint8Array(0), {unit: "raw"});

        expect(stringify({data})).toStrictEqual(JSON.stringify({data: {unit: "raw"}}));
    });

    it("emits valid JSON for a bare empty typed array", () => {
        expect(stringify({data: new Uint8Array(0)})).toStrictEqual(JSON.stringify({data: {}}));
    });
});
