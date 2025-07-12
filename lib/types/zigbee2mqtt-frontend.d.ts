declare module "zigbee2mqtt-frontend" {
    const frontend: {
        getPath: () => string;
    };

    export default frontend;
}

declare module "http" {
    interface IncomingMessage {
        originalUrl?: string;
        path?: string;
    }
}
