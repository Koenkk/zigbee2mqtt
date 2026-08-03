import type { IncomingMessage, ServerResponse } from "node:http";
export type StaticFileServer = (request: IncomingMessage, response: ServerResponse) => void;
/** Terminal `404` handler for requests no file matched, mirroring the response `finalhandler` used to produce. */
export declare function sendNotFound(request: IncomingMessage, response: ServerResponse): void;
/**
 * Serves `dir` on top of a plain `node:http` server, preferring the precompressed `.br`/`.gz` variant of a file when the client accepts it.
 *
 * Requests that match no file are answered by {@link sendNotFound}.
 */
export declare function createStaticFileServer(dir: string, logError: (message: string) => void): StaticFileServer;
//# sourceMappingURL=staticFileServer.d.ts.map