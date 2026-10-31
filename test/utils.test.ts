import {exec} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {describe, expect, it, vi} from "vitest";
import data from "../lib/util/data";
import {stringify} from "../lib/util/stringify";
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

    it("stable stringify", () => {
        expect(
            stringify({
                a: "a",
                b: 2,
                3: "c",
                d: Buffer.from([1, 2]),
                e: new Int16Array([0xfffd, 0xff11, 0x0001, 0x7fff]),
                beef: 0xfacen,
                zed: new BigUint64Array([1n, 0xffffffffn, 42n]),
                ris: [1, undefined, "b", 0xfeefn, Number.NaN, undefined],
                ls: undefined,
                // one and two elements, on both the number and the bigint branch
                one: new Uint8Array([7]),
                two: new Int16Array([0x0001, 0x7fff]),
                oneBig: new BigInt64Array([-9n]),
                twoBig: new BigUint64Array([1n, 42n]),
            }),
        ).toStrictEqual(
            `{"3":"c","a":"a","b":2,"beef":"64206","d":{"data":[1,2],"type":"Buffer"},"e":{"0":-3,"1":-239,"2":1,"3":32767},"one":{"0":7},"oneBig":{"0":"-9"},"ris":[1,null,"b","65263",null,null],"two":{"0":1,"1":32767},"twoBig":{"0":"1","1":"42"},"zed":{"0":"1","1":"4294967295","2":"42"}}`,
        );
        // @ts-expect-error intentional to reach code for coverage
        expect(stringify(undefined)).toStrictEqual("null");

        const circularObj: Record<string, unknown> = {a: 1, b: undefined};
        circularObj.b = circularObj;

        expect(stringify(circularObj)).toStrictEqual(`{"a":1,"b":"[Circular]"}`);

        const toJSONIsString = {a: 1, toJSON: () => `{"a":1}`};

        expect(stringify(toJSONIsString)).toStrictEqual(`"{\\"a\\":1}"`);

        const toJSONIsNull = {a: 1, toJSON: () => null};

        expect(stringify(toJSONIsNull)).toStrictEqual("null");

        const emptyTypedArrayWithProperty = Object.assign(new Uint8Array(0), {unit: "raw"});

        expect(stringify({data: emptyTypedArrayWithProperty})).toStrictEqual(JSON.stringify({data: {unit: "raw"}}));
        expect(stringify({data: new Uint8Array(0)})).toStrictEqual(JSON.stringify({data: {}}));
    });

    it("Accepts image data URLs with a known extension", () => {
        const pngData = "iVBORw0KGgoAAAANSUhEUgAAAJ";
        expect(utils.matchBase64File(`data:image/png;base64,${pngData}`)).toStrictEqual({extension: "png", data: pngData});
        expect(utils.matchBase64File("data:image/JPEG;base64,QUJDRA==")).toStrictEqual({extension: "jpeg", data: "QUJDRA=="});
        expect(utils.matchBase64File("data:image/jpg;base64,QUJDRA==")).toStrictEqual({extension: "jpg", data: "QUJDRA=="});
        expect(utils.matchBase64File("data:image/gif;base64,R0lGODlh")).toStrictEqual({extension: "gif", data: "R0lGODlh"});
        expect(utils.matchBase64File("data:image/webp;base64,UklGRg==")).toStrictEqual({extension: "webp", data: "UklGRg=="});
        expect(utils.matchBase64File("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDo")).toStrictEqual({
            extension: "svg+xml",
            data: "PHN2ZyB4bWxucz0iaHR0cDo",
        });
    });

    it("Ignores icon data URLs whose extension is not an allowlisted image type", () => {
        expect(utils.matchBase64File(undefined)).toBe(false);
        expect(utils.matchBase64File("some_icon.png")).toBe(false);
        expect(utils.matchBase64File("data:image/bmp;base64,QUJDRA==")).toBe(false);
        expect(utils.matchBase64File("data:image/png/../../external_extensions/pwn.js;base64,QUJDRA==")).toBe(false);
        expect(utils.matchBase64File("data:image/png\\..\\..\\external_extensions\\pwn.js;base64,QUJDRA==")).toBe(false);
    });

    it("Writes a device icon inside device_icons and refuses a path-like extension", () => {
        const pngData = "iVBORw0KGgoAAAANSUhEUgAAAJ";
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "z2m-icons-"));
        const previous = process.env.ZIGBEE2MQTT_DATA;
        process.env.ZIGBEE2MQTT_DATA = dataDir;
        data._testReload();

        try {
            const match = utils.matchBase64File(`data:image/png;base64,${pngData}`);
            expect(match).toStrictEqual({extension: "png", data: pngData});
            if (match === false) {
                throw new Error("expected a png data URL to match");
            }

            expect(utils.saveBase64DeviceIcon(match)).toBe("device_icons/effcad234beeb56ea7c457cf2d36d10b.png");
            const saved = path.join(dataDir, "device_icons", "effcad234beeb56ea7c457cf2d36d10b.png");
            expect(fs.readFileSync(saved)).toStrictEqual(Buffer.from(pngData, "base64"));

            const escapedData = Buffer.from("nope").toString("base64");
            const escapedExtension = "png/../../external_extensions/pwn.js";
            const escapedName = `${crypto.createHash("md5").update(escapedData).digest("hex")}.${escapedExtension}`;
            const escapedPath = path.resolve(path.join(dataDir, "device_icons", escapedName));
            expect(escapedPath).toBe(path.join(dataDir, "external_extensions", "pwn.js"));
            expect(() => utils.saveBase64DeviceIcon({extension: escapedExtension, data: escapedData})).toThrow(
                `Invalid device icon extension '${escapedExtension}'`,
            );
            expect(fs.existsSync(escapedPath)).toBe(false);

            const windowsExtension = "png\\..\\..\\outside.txt";
            expect(() => utils.saveBase64DeviceIcon({extension: windowsExtension, data: escapedData})).toThrow(
                `Invalid device icon extension '${windowsExtension}'`,
            );
        } finally {
            if (previous === undefined) {
                delete process.env.ZIGBEE2MQTT_DATA;
            } else {
                process.env.ZIGBEE2MQTT_DATA = previous;
            }

            data._testReload();
            fs.rmSync(dataDir, {recursive: true, force: true});
        }
    });
});
