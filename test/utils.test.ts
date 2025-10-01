import {exec} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {describe, expect, it, vi} from "vitest";
import utils, {assertString, formatTimestamp} from "../lib/util/utils";

// keep the implementations, just spy
vi.mock("node:child_process", {spy: true});

describe("Utils", () => {
    it("Object is empty", () => {
        expect(utils.objectIsEmpty({})).toBeTruthy();
        expect(utils.objectIsEmpty({a: 1})).toBeFalsy();
    });

    it("Object has properties", () => {
        expect(utils.objectHasProperties({a: 1, b: 2, c: 3}, ["a", "b"])).toBeTruthy();
        expect(utils.objectHasProperties({a: 1, b: 2, c: 3}, ["a", "b", "d"])).toBeFalsy();
    });

    it("get Z2M version", async () => {
        const readFileSyncSpy = vi.spyOn(fs, "readFileSync");
        const version = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version;

        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({commitHash: expect.stringMatching(/^(?!unknown)[a-z0-9]{8}$/), version});
        expect(exec).toHaveBeenCalledTimes(1);

        // @ts-expect-error mock spy
        exec.mockImplementationOnce((_cmd, cb) => {
            cb(null, "abcd1234");
        });
        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({commitHash: "abcd1234", version});

        // @ts-expect-error mock spy
        exec.mockImplementationOnce((_cmd, cb) => {
            cb(null, "");
        });
        // hash file may or may not be present during testing, don't failing matching if not
        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({commitHash: expect.stringMatching(/^(unknown|([a-z0-9]{8}))$/), version});

        readFileSyncSpy.mockImplementationOnce(() => {
            throw new Error("no hash file");
        });
        // @ts-expect-error mock spy
        exec.mockImplementationOnce((_cmd, cb) => {
            cb(null, "");
        });
        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({commitHash: "unknown", version});

        readFileSyncSpy.mockImplementationOnce(() => {
            throw new Error("no hash file");
        });
        // @ts-expect-error mock spy
        exec.mockImplementationOnce((_cmd, cb) => {
            cb(new Error("invalid"), "");
        });
        expect(await utils.getZigbee2MQTTVersion()).toStrictEqual({commitHash: "unknown", version});
        expect(exec).toHaveBeenCalledTimes(5);
    });

    it("Check dependency version", async () => {
        const versionHerdsman = JSON.parse(
            fs.readFileSync(path.join(__dirname, "..", "node_modules", "zigbee-herdsman", "package.json"), "utf8"),
        ).version;
        const versionHerdsmanConverters = JSON.parse(
            fs.readFileSync(path.join(__dirname, "..", "node_modules", "zigbee-herdsman-converters", "package.json"), "utf8"),
        ).version;
        expect(await utils.getDependencyVersion("zigbee-herdsman")).toStrictEqual({version: versionHerdsman});
        expect(await utils.getDependencyVersion("zigbee-herdsman-converters")).toStrictEqual({version: versionHerdsmanConverters});
    });

    it("To local iso string", () => {
        const date = new Date("August 19, 1975 23:15:30 UTC+00:00").getTime();
        const getTzOffsetSpy = vi.spyOn(Date.prototype, "getTimezoneOffset");
        getTzOffsetSpy.mockReturnValueOnce(60);
        expect(utils.formatDate(date, "ISO_8601_local").toString().endsWith("-01:00")).toBeTruthy();
        getTzOffsetSpy.mockReturnValueOnce(-60);
        expect(utils.formatDate(date, "ISO_8601_local").toString().endsWith("+01:00")).toBeTruthy();
    });

    it("Assert string", () => {
        assertString("test", "property");
        expect(() => assertString(1, "property")).toThrow("property is not a string, got number (1)");
    });

    it.each([
        [
            "formats full timestamp",
            new Date(2024, 0, 2, 3, 4, 5, 678), // 2024-01-02T03:04:05.678Z
            "YYYY-MM-DD HH:mm:ss.SSS",
            "2024-01-02 03:04:05.678",
        ],
        [
            "pads single digit values",
            new Date(2021, 0, 1, 1, 2, 3), // 2021-01-01T01:02:03Z
            "YYYY-MM-DD HH:mm:ss",
            "2021-01-01 01:02:03",
        ],
        [
            "handles custom format",
            new Date(2023, 9, 5, 14, 30, 45), // 2023-10-05T14:30:45Z
            "DD/MM/YYYY HH-mm",
            "05/10/2023 14-30",
        ],
        [
            "keeps unsupported tokens as-is",
            new Date(2023, 9, 5, 14, 30, 45), // 2023-10-05T14:30:45Z
            "DD/MM/YYYY HH-ii",
            "05/10/2023 14-ii",
        ],
    ])("formatTimestamp %s", (_desc, date, format, expected) => {
        expect(formatTimestamp(date, format)).toStrictEqual(expected);
    });

    it("Removes null properties from object", () => {
        const obj1 = {
            ab: 0,
            cd: false,
            ef: null,
            gh: "",
            homeassistant: {
                xyz: "mock",
                abcd: null,
            },
            nested: {
                homeassistant: {
                    abcd: true,
                    xyz: null,
                },
                abc: {},
                def: null,
            },
        };

        utils.removeNullPropertiesFromObject(obj1);
        expect(obj1).toStrictEqual({
            ab: 0,
            cd: false,
            gh: "",
            homeassistant: {
                xyz: "mock",
            },
            nested: {
                homeassistant: {
                    abcd: true,
                },
                abc: {},
            },
        });

        const obj2 = {
            ab: 0,
            cd: false,
            ef: null,
            gh: "",
            homeassistant: {
                xyz: "mock",
                abcd: null,
            },
            nested: {
                homeassistant: {
                    abcd: true,
                    xyz: null,
                },
                abc: {},
                def: null,
            },
        };
        utils.removeNullPropertiesFromObject(obj2, ["homeassistant"]);
        expect(obj2).toStrictEqual({
            ab: 0,
            cd: false,
            gh: "",
            homeassistant: {
                xyz: "mock",
                abcd: null,
            },
            nested: {
                homeassistant: {
                    abcd: true,
                    xyz: null,
                },
                abc: {},
            },
        });
    });
});
