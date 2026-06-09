import path from "node:path";
import tmp from "tmp";
import {describe, expect, it} from "vitest";
import data from "../lib/util/data";

describe("Data", () => {
    describe("Get path", () => {
        it("Should return correct path", () => {
            const expected = path.normalize(path.join(__dirname, "..", "data"));
            const actual = data.getPath();
            expect(actual).toBe(expected);
        });

        it("Should return correct path when ZIGBEE2MQTT_DATA set", () => {
            const expected = tmp.dirSync().name;
            process.env.ZIGBEE2MQTT_DATA = expected;
            data._testReload();

            try {
                const actual = data.getPath();
                expect(actual).toBe(expected);
                expect(data.joinPath("test")).toStrictEqual(path.join(expected, "test"));
                expect(data.joinPath("/test")).toStrictEqual(path.resolve(expected, "/test"));
            } finally {
                delete process.env.ZIGBEE2MQTT_DATA;
                data._testReload();
            }
        });

        it("Should return data path when joinPath with empty string", () => {
            const expected = data.getPath();
            expect(data.joinPath("")).toStrictEqual(expected);
        });
    });
});
