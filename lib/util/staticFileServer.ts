import type {IncomingMessage, ServerResponse} from "node:http";
import {NodeRequest, sendNodeResponse} from "srvx/node";
import {staticMiddleware} from "srvx/static";

export type StaticFileServer = (request: IncomingMessage, response: ServerResponse) => void;

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** Terminal `404` handler for requests no file matched, mirroring the response `finalhandler` used to produce. */
export function sendNotFound(request: IncomingMessage, response: ServerResponse): void {
    const method = request.method /* v8 ignore next */ ?? "GET";
    const url = request.url /* v8 ignore next */ ?? "/";
    const message = escapeHtml(`Cannot ${method} ${encodeURI(url)}`);
    const body = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>${message}</pre>\n</body>\n</html>\n`;

    response.setHeader("Content-Security-Policy", "default-src 'none'");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Content-Length", Buffer.byteLength(body));
    response.writeHead(404);
    response.end(body);
}

/**
 * Serves `dir` on top of a plain `node:http` server, preferring the precompressed `.br`/`.gz` variant of a file when the client accepts it.
 *
 * Requests that match no file are answered by {@link sendNotFound}.
 */
export function createStaticFileServer(dir: string, logError: (message: string) => void): StaticFileServer {
    // `compress: false` restricts serving to the precompressed variants shipped on disk, never compressing on the fly
    const serveDir = staticMiddleware({dir, encodings: true, compress: false});
    const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
        let matched = true;
        const staticResponse = await serveDir(new NodeRequest({req: request, res: response}), () => {
            matched = false;

            return new Response(null, {status: 404});
        });

        if (!matched) {
            sendNotFound(request, response);

            return;
        }

        // the HTML entry document must never be cached, so a newly installed frontend version is picked up right away
        if (staticResponse.headers.get("Content-Type")?.startsWith("text/html")) {
            staticResponse.headers.set("Cache-Control", "no-store");
        }

        await sendNodeResponse(response, staticResponse);
    };

    return (request, response) => {
        handle(request, response).catch((error) => {
            logError(`Failed to serve '${request.url}': ${(error as Error).message}`);

            if (!response.headersSent) {
                response.writeHead(500);
            }

            response.end();
        });
    };
}
