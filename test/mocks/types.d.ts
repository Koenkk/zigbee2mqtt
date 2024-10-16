declare module 'json-stable-stringify-without-jsonify' {
    export default function (obj: unknown): string;
}

declare module 'tmp' {
    export function dirSync(): {
        name: string;
        removeCallback: (err: Error | undefined, name: string, fd: number, cleanupFn: () => void) => void;
    };
    export function fileSync(): {
        name: string;
        fd: number;
        removeCallback: (err: Error | undefined, name: string, fd: number, cleanupFn: () => void) => void;
    };
}
