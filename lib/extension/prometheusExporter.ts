import type {IncomingMessage, Server, ServerResponse} from "node:http";
import {createServer} from "node:http";
import * as client from "prom-client";
import * as settings from "../util/settings";
import logger from "../util/logger";
import Extension from "./extension";
import Device from "../model/device";
import {getZigbee2MQTTVersion} from "../util/utils";

export class PrometheusExporter extends Extension {
    #server: Server | undefined;
    #registry!: client.Registry;

    // Counters
    #deviceMessagesReceived!: client.Counter;
    #deviceMessagesFailed!: client.Counter;
    #mqttPublished!: client.Counter;
    #mqttReceived!: client.Counter;
    #deviceJoins!: client.Counter;
    #deviceLeaves!: client.Counter;
    #deviceAnnounces!: client.Counter;
    #deviceNetworkAddressChanges!: client.Counter;

    // Gauges
    #buildInfo!: client.Gauge;
    #deviceLinkQuality!: client.Gauge;
    #deviceInfo!: client.Gauge;

    override async start(): Promise<void> {
        await super.start();

        this.#registry = new client.Registry();
        client.collectDefaultMetrics({register: this.#registry});

        this.#buildInfo = new client.Gauge({
            name: "zigbee2mqtt_build_info",
            help: "Build information; value is always 1",
            labelNames: ["version", "commit_hash"],
            registers: [this.#registry],
        });

        const {version, commitHash} = await getZigbee2MQTTVersion();
        this.#buildInfo.set({version, commit_hash: commitHash ?? "unknown"}, 1);

        this.#deviceMessagesReceived = new client.Counter({
            name: "zigbee2mqtt_device_messages_received_total",
            help: "Total number of Zigbee messages received from a device",
            labelNames: ["ieee_address", "friendly_name"],
            registers: [this.#registry],
        });

        this.#deviceMessagesFailed = new client.Counter({
            name: "zigbee2mqtt_device_messages_failed_total",
            help: "Total number of Zigbee messages that failed processing",
            labelNames: ["ieee_address", "friendly_name", "reason"],
            registers: [this.#registry],
        });

        this.#mqttPublished = new client.Counter({
            name: "zigbee2mqtt_mqtt_messages_published_total",
            help: "Total number of MQTT messages published",
            registers: [this.#registry],
        });

        this.#mqttReceived = new client.Counter({
            name: "zigbee2mqtt_mqtt_messages_received_total",
            help: "Total number of MQTT messages received",
            registers: [this.#registry],
        });

        this.#deviceJoins = new client.Counter({
            name: "zigbee2mqtt_device_joins_total",
            help: "Total number of device join events",
            labelNames: ["ieee_address", "friendly_name"],
            registers: [this.#registry],
        });

        this.#deviceLeaves = new client.Counter({
            name: "zigbee2mqtt_device_leaves_total",
            help: "Total number of device leave events",
            labelNames: ["ieee_address", "friendly_name"],
            registers: [this.#registry],
        });

        this.#deviceAnnounces = new client.Counter({
            name: "zigbee2mqtt_device_announces_total",
            help: "Total number of device announce events",
            labelNames: ["ieee_address", "friendly_name"],
            registers: [this.#registry],
        });

        this.#deviceNetworkAddressChanges = new client.Counter({
            name: "zigbee2mqtt_device_network_address_changes_total",
            help: "Total number of device network address changes",
            labelNames: ["ieee_address", "friendly_name"],
            registers: [this.#registry],
        });

        this.#deviceLinkQuality = new client.Gauge({
            name: "zigbee2mqtt_device_link_quality",
            help: "Last known link quality indicator (LQI) for a device (0-255)",
            labelNames: ["ieee_address", "friendly_name"],
            registers: [this.#registry],
        });

        this.#deviceInfo = new client.Gauge({
            name: "zigbee2mqtt_device_info",
            help: "Static device metadata; value is always 1",
            labelNames: ["ieee_address", "friendly_name", "model_id", "vendor", "type", "power_source"],
            registers: [this.#registry],
        });

        // Pre-populate device_info for all known devices
        for (const device of this.zigbee.devicesIterator()) {
            this.#setDeviceInfo(device.ieeeAddr, device.name, device.zh.modelID, device.definition?.vendor, device.zh.type, device.zh.powerSource);
        }

        // Subscribe to events
        this.eventBus.onDeviceMessage(this, (data) => {
            const ieeeAddr = data.device.ieeeAddr;
            const friendlyName = data.device.name;

            this.#deviceMessagesReceived.inc({ieee_address: ieeeAddr, friendly_name: friendlyName});
            this.#deviceLinkQuality.set({ieee_address: ieeeAddr, friendly_name: friendlyName}, data.linkquality);
        });

        this.eventBus.onDeviceMessageFailed(this, (data) => {
            this.#deviceMessagesFailed.inc({
                ieee_address: data.device.ieeeAddr,
                friendly_name: data.device.name,
                reason: data.reason,
            });
        });

        this.eventBus.onMQTTMessagePublished(this, () => {
            this.#mqttPublished.inc();
        });

        this.eventBus.onMQTTMessage(this, () => {
            this.#mqttReceived.inc();
        });

        this.eventBus.onDeviceJoined(this, (data) => {
            const ieeeAddr = data.device.ieeeAddr;
            const friendlyName = data.device.name;
            this.#deviceJoins.inc({ieee_address: ieeeAddr, friendly_name: friendlyName});
            this.#setDeviceInfo(ieeeAddr, friendlyName, data.device.zh.modelID, data.device.definition?.vendor, data.device.zh.type, data.device.zh.powerSource);
        });

        this.eventBus.onDeviceLeave(this, (data) => {
            this.#deviceLeaves.inc({ieee_address: data.ieeeAddr, friendly_name: data.name});
        });

        this.eventBus.onDeviceAnnounce(this, (data) => {
            this.#deviceAnnounces.inc({ieee_address: data.device.ieeeAddr, friendly_name: data.device.name});
        });

        this.eventBus.onDeviceNetworkAddressChanged(this, (data) => {
            this.#deviceNetworkAddressChanges.inc({ieee_address: data.device.ieeeAddr, friendly_name: data.device.name});
        });

        this.eventBus.onEntityRemoved(this, (data) => {
            if (!data.entity.isDevice()) return;
            this.#removeDeviceMetrics(data.entity.ieeeAddr, data.name, data.entity);
        });

        // Start HTTP server
        const {port, host} = settings.get().prometheus_exporter;
        this.#server = createServer(this.#onRequest.bind(this));

        if (host) {
            this.#server.listen(port, host);
            logger.info(`Prometheus exporter listening on ${host}:${port}`);
        } else {
            this.#server.listen(port);
            logger.info(`Prometheus exporter listening on port ${port}`);
        }
    }

    override async stop(): Promise<void> {
        await new Promise((resolve) => (this.#server ? this.#server!.close(resolve) : resolve(undefined)));
        await super.stop();
    }

    #removeDeviceMetrics(ieeeAddr: string, friendlyName: string, entity: Device): void {
        const base = {ieee_address: ieeeAddr, friendly_name: friendlyName};
        this.#deviceMessagesReceived.remove(base);
        this.#deviceMessagesFailed.remove({...base, reason: "no_converter"});
        this.#deviceMessagesFailed.remove({...base, reason: "converter_error"});
        this.#deviceJoins.remove(base);
        this.#deviceLeaves.remove(base);
        this.#deviceAnnounces.remove(base);
        this.#deviceNetworkAddressChanges.remove(base);
        this.#deviceLinkQuality.remove(base);
        this.#deviceInfo.remove({
            ...base,
            model_id: entity.zh.modelID ?? "",
            vendor: entity.definition?.vendor ?? "",
            type: entity.zh.type,
            power_source: entity.zh.powerSource ?? "",
        });
    }

    #setDeviceInfo(ieeeAddr: string, friendlyName: string, modelId: string | undefined, vendor: string | undefined, type: string, powerSource: string | undefined): void {
        this.#deviceInfo.set(
            {
                ieee_address: ieeeAddr,
                friendly_name: friendlyName,
                model_id: modelId ?? "",
                vendor: vendor ?? "",
                type,
                power_source: powerSource ?? "",
            },
            1,
        );
    }

    async #onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const url = req.url ?? "/";

        if (url === "/metrics") {
            const metrics = await this.#registry.metrics();
            res.setHeader("Content-Type", this.#registry.contentType);
            res.end(metrics);
        } else {
            res.writeHead(200);
            res.end("zigbee2mqtt prometheus exporter");
        }
    }
}
