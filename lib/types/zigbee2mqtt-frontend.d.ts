declare module 'zigbee2mqtt-frontend' {
    export function getPath(): string;
}

declare module 'http' {
    interface IncomingMessage {
        originalUrl?: string;
    }
}

declare module 'connect-gzip-static' {
    import {IncomingMessage, ServerResponse} from 'http';
    export type RequestHandler = (req: IncomingMessage, res: ServerResponse, finalhandler: (err: unknown) => void) => void;
    export default function gzipStatic(root: string, options?: Record<string, unknown>): RequestHandler;
}
