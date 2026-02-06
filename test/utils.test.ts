import {exec} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {describe, expect, it, vi} from "vitest";
import utils, {assertString} from "../lib/util/utils";

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

    describe("normalizeHerdsmanError", () => {
        // Timeout detection tests
        it("detects timeout from standard timeout message", () => {
            const result = utils.normalizeHerdsmanError("Timeout - 0x1234 - 1 - 0 - 6 - 11 - 0 after 10000ms");
            expect(result.code).toBe("TIMEOUT");
            expect(result.message).toBe("Timeout - 0x1234 - 1 - 0 - 6 - 11 - 0 after 10000ms");
        });

        it("detects timeout from 'timed out' message", () => {
            const result = utils.normalizeHerdsmanError("Request timed out");
            expect(result.code).toBe("TIMEOUT");
            expect(result.message).toBe("Request timed out");
        });

        it("detects timeout from Error object", () => {
            const result = utils.normalizeHerdsmanError(new Error("Timeout waiting for response"));
            expect(result.code).toBe("TIMEOUT");
            expect(result.message).toBe("Timeout waiting for response");
        });

        it("detects timeout from ZCL status 148", () => {
            const result = utils.normalizeHerdsmanError("Command failed with status 148");
            expect(result.code).toBe("TIMEOUT");
            expect(result.message).toBe("Command failed with status 148");
        });

        it("detects timeout from ZDO status 133", () => {
            const result = utils.normalizeHerdsmanError("ZDO request failed status=133");
            expect(result.code).toBe("TIMEOUT");
            expect(result.message).toBe("ZDO request failed status=133");
        });

        // NO_ROUTE detection tests
        it("detects NO_ROUTE from NWK_NO_ROUTE", () => {
            const result = utils.normalizeHerdsmanError("NWK_NO_ROUTE");
            expect(result.code).toBe("NO_ROUTE");
            expect(result.message).toBe("NWK_NO_ROUTE");
        });

        it("detects NO_ROUTE from 'no network route'", () => {
            const result = utils.normalizeHerdsmanError("no network route");
            expect(result.code).toBe("NO_ROUTE");
            expect(result.message).toBe("no network route");
        });

        it("detects NO_ROUTE from ZIGBEE_DELIVERY_FAILED", () => {
            const result = utils.normalizeHerdsmanError("ZIGBEE_DELIVERY_FAILED");
            expect(result.code).toBe("NO_ROUTE");
            expect(result.message).toBe("ZIGBEE_DELIVERY_FAILED");
        });

        it("detects NO_ROUTE from MAC_NO_ACK", () => {
            const result = utils.normalizeHerdsmanError("MAC_NO_ACK");
            expect(result.code).toBe("NO_ROUTE");
            expect(result.message).toBe("MAC_NO_ACK");
        });

        it("detects NO_ROUTE from APS_NO_ACK", () => {
            const result = utils.normalizeHerdsmanError("APS_NO_ACK");
            expect(result.code).toBe("NO_ROUTE");
            expect(result.message).toBe("APS_NO_ACK");
        });

        // ZCL_ERROR detection tests
        it("detects ZCL_ERROR from Status name UNSUPPORTED_ATTRIBUTE", () => {
            const result = utils.normalizeHerdsmanError("Status 'UNSUPPORTED_ATTRIBUTE'");
            expect(result.code).toBe("ZCL_ERROR");
            expect(result.zcl_status).toBe(134);
            expect(result.message).toBe("Status 'UNSUPPORTED_ATTRIBUTE'");
        });

        it("detects ZCL_ERROR from Status name INVALID_VALUE", () => {
            const result = utils.normalizeHerdsmanError("Status 'INVALID_VALUE'");
            expect(result.code).toBe("ZCL_ERROR");
            expect(result.zcl_status).toBe(135);
            expect(result.message).toBe("Status 'INVALID_VALUE'");
        });

        it("detects ZCL_ERROR from numeric status pattern", () => {
            const result = utils.normalizeHerdsmanError("failed with status=134");
            expect(result.code).toBe("ZCL_ERROR");
            expect(result.zcl_status).toBe(134);
            expect(result.message).toBe("failed with status=134");
        });

        it("detects ZCL_ERROR from status: pattern", () => {
            const result = utils.normalizeHerdsmanError("Command failed status: 135");
            expect(result.code).toBe("ZCL_ERROR");
            expect(result.zcl_status).toBe(135);
            expect(result.message).toBe("Command failed status: 135");
        });

        it("detects ZCL_ERROR from ZclStatusError constructor", () => {
            // Create an error object that mimics ZclStatusError
            const zclError = new Error("ZCL status error") as Error & {code?: number};
            Object.defineProperty(zclError, "constructor", {value: {name: "ZclStatusError"}});
            zclError.code = 134;
            const result = utils.normalizeHerdsmanError(zclError);
            expect(result.code).toBe("ZCL_ERROR");
            expect(result.zcl_status).toBe(134);
        });

        it("detects ZCL_ERROR from unknown status name without numeric code", () => {
            const result = utils.normalizeHerdsmanError("Status 'SOME_UNKNOWN_STATUS'");
            expect(result.code).toBe("ZCL_ERROR");
            expect(result.zcl_status).toBeUndefined();
            expect(result.message).toBe("Status 'SOME_UNKNOWN_STATUS'");
        });

        // UNKNOWN fallback tests
        it("returns UNKNOWN for unrecognized error", () => {
            const result = utils.normalizeHerdsmanError("Some random error");
            expect(result.code).toBe("UNKNOWN");
            expect(result.message).toBe("Some random error");
        });

        it("returns UNKNOWN for empty string", () => {
            const result = utils.normalizeHerdsmanError("");
            expect(result.code).toBe("UNKNOWN");
            expect(result.message).toBe("");
        });

        // Message preservation tests
        it("preserves original message from Error object", () => {
            const originalMessage = "Device 0x1234 did not respond";
            const result = utils.normalizeHerdsmanError(new Error(originalMessage));
            expect(result.message).toBe(originalMessage);
        });

        it("preserves original message from string", () => {
            const originalMessage = "Custom error message";
            const result = utils.normalizeHerdsmanError(originalMessage);
            expect(result.message).toBe(originalMessage);
        });
    });
});
