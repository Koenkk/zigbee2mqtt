declare module 'zigbee2mqtt-frontend' {
    export function getPath(): string;
}

declare module 'http' {
    interface IncomingMessage {
        originalUrl?: string;
        path?: string;
    }
}

declare module 'express-static-gzip' {
    import {IncomingMessage, ServerResponse} from 'node:http';
    export type RequestHandler = (req: IncomingMessage, res: ServerResponse, finalhandler: (err: unknown) => void) => void;
    export default function expressStaticGzip(root: string, options?: Record<string, unknown>): RequestHandler;
}
