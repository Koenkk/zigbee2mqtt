import {mkdirSync, writeFileSync} from "node:fs";
import {createServer, type Server} from "node:http";
import {type AddressInfo, connect} from "node:net";
import {join} from "node:path";
import {brotliCompressSync, gzipSync} from "node:zlib";
import tmp from "tmp";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {createStaticFileServer, type sendNotFound} from "../lib/util/staticFileServer";

const INDEX_HTML = "<!DOCTYPE html><html lang='en'><body>index</body></html>";
const APP_JS = `console.log("${"x".repeat(2048)}");`;
/** Written next to the served directory, never inside it, so a traversal that succeeds is actually observable. */
const SECRET = "topsecret-must-never-be-served";

const mockLogError = vi.fn<(message: string) => void>();

let dir: string;
let server: Server;
let baseUrl: string;

/** Starts a `node:http` server serving `dir`, mirroring how the frontend/onboarding extensions wire it up. */
function listen(handler: (request: Parameters<typeof sendNotFound>[0], response: Parameters<typeof sendNotFound>[1]) => void): Promise<void> {
    server = createServer(handler);

    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

            resolve();
        });
    });
}

/** Writes a request line verbatim, bypassing the path normalization `fetch` applies before sending. */
function rawRequest(target: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket = connect((server.address() as AddressInfo).port, "127.0.0.1", () => {
            socket.write(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
        });
        let received = "";

        socket.setEncoding("utf8");
        socket.on("data", (chunk) => {
            received += chunk;
        });
        socket.on("end", () => resolve(received));
        socket.on("error", reject);
    });
}

describe("StaticFileServer", () => {
    beforeAll(async () => {
        const root = tmp.dirSync().name;

        dir = join(root, "public");

        // outside the served directory: only a working traversal could reach it
        writeFileSync(join(root, "secret.txt"), SECRET);
        mkdirSync(join(dir, "sub"), {recursive: true});
        writeFileSync(join(dir, "index.html"), INDEX_HTML);
        writeFileSync(join(dir, "app.js"), APP_JS);
        // precompressed variants, as shipped by the frontend packages
        writeFileSync(join(dir, "app.js.gz"), gzipSync(APP_JS));
        writeFileSync(join(dir, "app.js.br"), brotliCompressSync(APP_JS));
        writeFileSync(join(dir, "sub", "icon.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

        await listen(createStaticFileServer(dir, mockLogError));
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    it("serves a file with its content type", async () => {
        const response = await fetch(`${baseUrl}/sub/icon.png`);

        expect(response.status).toStrictEqual(200);
        expect(response.headers.get("content-type")).toStrictEqual("image/png");
        expect(response.headers.get("content-encoding")).toBeNull();
    });

    it("serves index.html for the root, never cached", async () => {
        const response = await fetch(`${baseUrl}/`);

        expect(response.status).toStrictEqual(200);
        expect(response.headers.get("content-type")).toStrictEqual("text/html; charset=utf-8");
        expect(response.headers.get("cache-control")).toStrictEqual("no-store");
        await expect(response.text()).resolves.toStrictEqual(INDEX_HTML);
    });

    it("serves the precompressed brotli variant", async () => {
        const response = await fetch(`${baseUrl}/app.js`, {headers: {"Accept-Encoding": "br"}});

        expect(response.status).toStrictEqual(200);
        expect(response.headers.get("content-encoding")).toStrictEqual("br");
        expect(response.headers.get("content-type")).toStrictEqual("text/javascript; charset=utf-8");
        expect(response.headers.get("vary")).toStrictEqual("Accept-Encoding");
        // decoded by fetch, so the served bytes must be the brotli variant of the original file
        await expect(response.text()).resolves.toStrictEqual(APP_JS);
    });

    it("serves the precompressed gzip variant", async () => {
        const response = await fetch(`${baseUrl}/app.js`, {headers: {"Accept-Encoding": "gzip"}});

        expect(response.status).toStrictEqual(200);
        expect(response.headers.get("content-encoding")).toStrictEqual("gzip");
        await expect(response.text()).resolves.toStrictEqual(APP_JS);
    });

    it("serves the identity file when no encoding is accepted", async () => {
        const response = await fetch(`${baseUrl}/app.js`, {headers: {"Accept-Encoding": "identity"}});

        expect(response.status).toStrictEqual(200);
        expect(response.headers.get("content-encoding")).toBeNull();
        expect(response.headers.get("content-length")).toStrictEqual(String(Buffer.byteLength(APP_JS)));
        await expect(response.text()).resolves.toStrictEqual(APP_JS);
    });

    it("revalidates with an etag", async () => {
        const response = await fetch(`${baseUrl}/app.js`, {headers: {"Accept-Encoding": "identity"}});
        const etag = response.headers.get("etag");

        expect(etag).toBeTruthy();

        const revalidated = await fetch(`${baseUrl}/app.js`, {headers: {"Accept-Encoding": "identity", "If-None-Match": etag as string}});

        expect(revalidated.status).toStrictEqual(304);
    });

    it("returns 404 for an unknown file", async () => {
        const response = await fetch(`${baseUrl}/nope.js`);

        expect(response.status).toStrictEqual(404);
        expect(response.headers.get("content-type")).toStrictEqual("text/html; charset=utf-8");
        expect(response.headers.get("content-security-policy")).toStrictEqual("default-src 'none'");
        expect(response.headers.get("x-content-type-options")).toStrictEqual("nosniff");
        await expect(response.text()).resolves.toContain("Cannot GET /nope.js");
    });

    it("escapes the url in the 404 body", async () => {
        const response = await fetch(`${baseUrl}/%3Cscript%3E`);

        expect(response.status).toStrictEqual(404);
        await expect(response.text()).resolves.not.toContain("<script>");
    });

    it("does not serve files outside of the served directory", async () => {
        // `fetch` resolves `..` and `%2e%2e` segments away before they ever reach the server, so these have to go out raw
        for (const target of ["/../secret.txt", "/sub/../../secret.txt", "/%2e%2e/secret.txt", "/..%2fsecret.txt"]) {
            const response = await rawRequest(target);

            expect(response).toContain("404 Not Found");
            expect(response).not.toContain(SECRET);
        }
    });

    it("reports a failure to serve with a 500", async () => {
        const failing = createStaticFileServer(dir, mockLogError);
        const failingServer = createServer((request, response) => {
            const setHeader = response.setHeader.bind(response);

            response.setHeader = (name: string, value: number | string | readonly string[]): never => {
                if (name === "Content-Security-Policy") {
                    throw new Error("socket gone");
                }

                setHeader(name, value);

                return undefined as never;
            };

            failing(request, response);
        });

        await new Promise<void>((resolve) => failingServer.listen(0, "127.0.0.1", resolve));

        const port = (failingServer.address() as AddressInfo).port;
        const response = await fetch(`http://127.0.0.1:${port}/nope.js`);

        expect(response.status).toStrictEqual(500);
        expect(mockLogError).toHaveBeenCalledWith("Failed to serve '/nope.js': socket gone");

        await new Promise((resolve) => failingServer.close(resolve));
    });
});
