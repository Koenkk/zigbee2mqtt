declare module 'zigbee2mqtt-frontend' {
    export function getPath(): string;
}

declare module 'connect-gzip-static' {
    export type RequestHandler = (req: any, res: any) => void;
    export default function gzipStatic(root: string, options?: {}): RequestHandler;
}
