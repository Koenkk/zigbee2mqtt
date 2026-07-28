// `srvx` bundles the types of every runtime it supports into one shared chunk that all of its entrypoints pull in,
// including the Node-only ones this project uses. That chunk references `aws-lambda`, `bun`, `@cloudflare/workers-types`
// and the `Deno`/`FetchEvent`/`BodyInit` globals, none of which srvx ships to its consumers, so `tsc` fails on them.
// Declaring them as opaque keeps the rest of the dependency types checked instead of disabling `skipLibCheck` repo-wide.
// Upstream issue: https://github.com/h3js/srvx/issues/284

// biome-ignore-all lint/suspicious/noExplicitAny: opaque stand-ins for runtimes this project never targets

declare module "bun" {
    export namespace Serve {
        type Options<T = any> = any;
    }
    export type Server<T = any> = any;
}

declare module "@cloudflare/workers-types" {
    export type ExecutionContext = any;
    export type ExportedHandlerFetchHandler<T = any> = any;
}

declare module "cloudflare:workers" {
    export const env: any;
}

declare module "aws-lambda" {
    export type Context = any;
    export type APIGatewayProxyEvent = any;
    export type APIGatewayProxyEventV2 = any;
}

declare namespace Deno {
    type HttpServer = any;
    type NetAddr = any;
    type ServeHandlerInfo<T = any> = any;
    type ServeOptions = any;
    const serve: any;
}

type FetchEvent = any;
// provided by the DOM lib, which this project deliberately does not enable
type BodyInit = any;
