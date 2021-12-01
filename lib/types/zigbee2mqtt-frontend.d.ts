declare module 'zigbee2mqtt-frontend' {
    export function getPath(): string;
}

declare module 'connect-gzip-static' {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export type RequestHandler = (req: any, res: any) => void;
    export default function gzipStatic(root: string, options?: Record<string, unknown>): RequestHandler;
}
