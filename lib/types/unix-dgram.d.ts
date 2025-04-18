declare module "unix-dgram" {
    import {EventEmitter} from "node:events";

    export class UnixDgramSocket extends EventEmitter {
        send(buf: Buffer, callback?: (err?: Error) => void): void;
        send(buf: Buffer, offset: number, length: number, path: string, callback?: (err?: Error) => void): void;
        bind(path: string): void;
        connect(remotePath: string): void;
        close(): void;
    }

    export function createSocket(type: "unix_dgram", listener?: (msg: Buffer) => void): UnixDgramSocket;
}
